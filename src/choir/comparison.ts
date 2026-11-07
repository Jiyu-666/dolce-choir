import type { PerformancePlan } from "./performance";
import { PITCH_WINDOW, type PitchFrame, type AnalysisGap } from "./pitch";

export type PitchStatus = "correct" | "sharp" | "flat" | "octave-high" | "octave-low" | "silent" | "uncertain" | "unjudgeable" | "transition" | "rest-voice";
export const frequencyOfMidi = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
export const pitchCents = (actual: number, midi: number): number => 1200 * Math.log2(actual / frequencyOfMidi(midi));
export function centsStatus(cents: number): PitchStatus {
  if (Math.abs(cents) <= 50) return "correct";
  if (Math.abs(cents-1200) <= 50) return "octave-high";
  if (Math.abs(cents+1200) <= 50) return "octave-low";
  return cents > 0 ? "sharp" : "flat";
}
function core(note: PerformancePlan["notes"][number], sampleRate: number): { start: number; end: number; eligible: number } {
  const duration = note.endSeconds-note.startSeconds, trim = Math.min(.08,duration*.15);
  return { start:note.startSeconds+trim,end:note.endSeconds-trim,eligible:duration < PITCH_WINDOW/sampleRate ? 0 : duration-2*trim };
}
export function liveComparison(plan: PerformancePlan, frame: PitchFrame, seconds: number, sampleRate: number): { state: PitchStatus; cents?: number; key?: string } {
  if (frame.state !== "pitched" || frame.frequency === null) return {state:frame.state === "silent" ? "silent" : "uncertain"};
  const note=plan.notes.find(n=>n.startSeconds<=seconds&&n.endSeconds>seconds);
  if (!note) return {state:"rest-voice"};
  const c=core(note,sampleRate);
  if (!c.eligible) return {state:"unjudgeable",key:note.key};
  if(seconds<c.start||seconds>c.end)return {state:"transition",key:note.key};
  const cents=pitchCents(frame.frequency,note.pitch);return {state:centsStatus(cents),cents,key:note.key};
}
interface Evidence { start: number; end: number; frequency: number | null; state: PitchFrame["state"] }
interface Onset { seconds: number; midi: number }
export interface NoteResult {
  key: string; elementId?: number; eligibleSeconds: number; judgedSeconds: number; correctSeconds: number;
  silenceSeconds: number; uncertainSeconds: number; gapSeconds: number; meanCents: number | null; status: PitchStatus;
  onsetOffsetSeconds: number | null; onsetToleranceSeconds: number; onsetWithinTolerance: boolean | null;
}
export interface PracticeResult {
  version: 1; fingerprint: string; role: PerformancePlan["role"]; speed: number; octave: number; attempt: number;
  range: {measure:number;occurrence:number}[];
  notes: NoteResult[]; coverage: number; pitchAccuracy: number | null; pitchConclusion: number | null;
  eligibleSeconds: number; judgedSeconds: number; restVoicingSeconds: number;
  rhythm: { judged: number; withinTolerance: number; meanAbsoluteOffsetSeconds: number | null; estimated: boolean };
  gaps: AnalysisGap[]; pauses: {atSeconds:number;rewoundTo:number;fromAudioTime:number;toAudioTime:number|null}[];
  problemMeasures: number[]; latency: {seconds:number;calibrated:boolean};
}
/** Session-only feature evidence. Missing samples never become correct notes or disappear from coverage. */
export class PracticeComparison {
  private evidence: Evidence[]=[];
  private onsets: Onset[]=[];
  private gaps: AnalysisGap[]=[];
  private pauses: PracticeResult["pauses"]=[];
  private lastMidi: number | null=null;
  private silence=false;
  private candidate: {seconds:number;midi:number;frames:number;active:boolean}|null=null;
  constructor(readonly plan: PerformancePlan, private fingerprint: string, private attempt: number, readonly sampleRate: number, readonly latency: {seconds:number;calibrated:boolean}) {}
  add(frame: PitchFrame, planSeconds: number, active: boolean, floor=0): void {
    const t=planSeconds-this.latency.seconds;
    if(frame.state==="pitched"&&frame.frequency){
      const midi=69+12*Math.log2(frame.frequency/440);
      const changed=this.lastMidi!==null&&Math.abs(midi-this.lastMidi)>.8;
      if(this.candidate&&Math.abs(midi-this.candidate.midi)<.4)this.candidate.frames++;
      else if(this.silence||changed)this.candidate={seconds:t,midi,frames:1,active};
      else this.candidate=null;
      if(this.candidate&&this.candidate.frames>=2){
        if(this.candidate.active&&this.candidate.seconds>=floor&&this.candidate.seconds>=0)this.onsets.push({seconds:this.candidate.seconds,midi:this.candidate.midi});
        this.candidate=null;this.silence=false;
      }
      this.lastMidi=midi;
    }else{this.lastMidi=null;this.candidate=null;this.silence=frame.state==="silent";}
    if(!active)return;
    const start=Math.max(floor,0,t-frame.duration/2),end=Math.min(this.plan.durationSeconds,t+frame.duration/2);
    if(end>start)this.evidence.push({start,end,frequency:frame.frequency,state:frame.state});
  }
  gap(gap:AnalysisGap):void {const from=Math.max(0,gap.from-this.latency.seconds),to=Math.min(this.plan.durationSeconds,gap.to-this.latency.seconds);if(to>from)this.gaps.push({from,to});this.lastMidi=null;this.silence=false;this.candidate=null;}
  rewind(to:number,at:number,audioTime:number):void {
    this.evidence=this.evidence.filter(f=>f.start<to).map(f=>({...f,end:Math.min(f.end,to)}));
    this.onsets=this.onsets.filter(o=>o.seconds<to);this.gaps=this.gaps.filter(g=>g.from<to).map(g=>({...g,to:Math.min(g.to,to)}));
    this.pauses.push({atSeconds:at,rewoundTo:to,fromAudioTime:audioTime,toAudioTime:null});
    this.lastMidi=null;this.silence=false;this.candidate=null;
  }
  resume(audioTime:number):void {const p=this.pauses[this.pauses.length-1];if(p&&p.toAudioTime===null)p.toAudioTime=audioTime;}
  result():PracticeResult {
    // Deduplicate/clip overlapping frame intervals so retries and delivery order cannot inflate time.
    let cursor=0;
    let evidence=this.evidence.slice().sort((a,b)=>a.start-b.start).flatMap(f=>{
      const start=Math.max(cursor,f.start);cursor=Math.max(cursor,f.end);return f.end>start?[{...f,start}]:[];
    });
    for(const gap of this.gaps)evidence=evidence.flatMap(f=>{
      if(f.end<=gap.from||f.start>=gap.to)return [f];
      return [f.start<gap.from?{...f,end:gap.from}:null,f.end>gap.to?{...f,start:gap.to}:null].filter((x):x is Evidence=>x!==null);
    });
    const observedOnsets=this.onsets.filter(o=>!this.gaps.some(g=>o.seconds>=g.from&&o.seconds<g.to));
    const used=new Set<number>();
    const notes:NoteResult[]=this.plan.notes.map(note=>{
      const c=core(note,this.sampleRate),buckets=new Map<PitchStatus,number>();
      let judged=0,correct=0,silent=0,uncertain=0,sumCents=0;
      if(c.eligible)for(const f of evidence){
        if(f.start>=c.end)break;if(f.end<=c.start)continue;
        const weight=Math.max(0,Math.min(c.end,f.end)-Math.max(c.start,f.start));
        let state:PitchStatus=f.state==="silent"?"silent":"uncertain";
        if(f.state==="pitched"&&f.frequency){const cents=pitchCents(f.frequency,note.pitch);state=centsStatus(cents);judged+=weight;sumCents+=cents*weight;if(state==="correct")correct+=weight;}
        else if(state==="silent")silent+=weight;else uncertain+=weight;
        buckets.set(state,(buckets.get(state)??0)+weight);
      }
      const gap=Math.max(0,c.eligible-judged-silent-uncertain);
      let bpm=this.plan.tempos[0].bpm;for(const tempo of this.plan.tempos)if(tempo.t<=note.startBeat)bpm=tempo.bpm;
      const tolerance=Math.max(.12,.2*60/(bpm*this.plan.speed)),limit=Math.min(.5,Math.max(.24,tolerance*2));
      const ni=this.plan.notes.indexOf(note),previous=this.plan.notes[ni-1],next=this.plan.notes[ni+1];
      const low=Math.max(0,note.startSeconds-limit,previous?(previous.startSeconds+note.startSeconds)/2:0);
      const high=Math.min(note.startSeconds+limit,next?(note.startSeconds+next.startSeconds)/2:Infinity);
      let onset:number|null=null,best=Infinity;
      if(c.eligible)for(const [i,o]of observedOnsets.entries())if(!used.has(i)&&o.seconds>=low&&o.seconds<=high&&Math.abs(o.seconds-note.startSeconds)<best){onset=i;best=Math.abs(o.seconds-note.startSeconds);}
      if(onset!==null)used.add(onset);
      const offset=onset===null?null:observedOnsets[onset].seconds-note.startSeconds;
      const dominant=[...buckets].sort((a,b)=>b[1]-a[1])[0]?.[0]??"uncertain";
      const status:PitchStatus=!c.eligible?"unjudgeable":judged/c.eligible<.5?(silent>uncertain+gap?"silent":"uncertain"):dominant;
      return {key:note.key,elementId:note.elementId,eligibleSeconds:c.eligible,judgedSeconds:judged,correctSeconds:correct,silenceSeconds:silent,uncertainSeconds:uncertain,gapSeconds:gap,meanCents:judged?sumCents/judged:null,status,
        onsetOffsetSeconds:offset,onsetToleranceSeconds:tolerance,onsetWithinTolerance:offset===null?null:Math.abs(offset)<=tolerance};
    });
    // The score's fixed timeline also determines rests. No free time warping or pitch-search rescue.
    let restVoicingSeconds=0;
    for(const rest of this.plan.rests)for(const f of evidence)if(f.state==="pitched"&&f.frequency)restVoicingSeconds+=Math.max(0,Math.min(rest.endSeconds,f.end)-Math.max(rest.startSeconds,f.start));
    const eligibleSeconds=notes.reduce((a,n)=>a+n.eligibleSeconds,0),judgedSeconds=notes.reduce((a,n)=>a+n.judgedSeconds,0),correctSeconds=notes.reduce((a,n)=>a+n.correctSeconds,0);
    const coverage=eligibleSeconds?Math.min(1,judgedSeconds/eligibleSeconds):0,accuracy=judgedSeconds?correctSeconds/judgedSeconds:null;
    const onsets=notes.filter(n=>n.onsetOffsetSeconds!==null),problems=new Set<number>();
    for(const [i,n]of notes.entries())if(n.eligibleSeconds&&(n.judgedSeconds/n.eligibleSeconds<.9||n.judgedSeconds&&n.correctSeconds/n.judgedSeconds<.8||n.onsetWithinTolerance===false)){
      const target=this.plan.notes[i];this.plan.measures.forEach((m,k)=>{if(m.startSeconds<target.endSeconds&&m.endSeconds>target.startSeconds)problems.add(k);});
    }
    if(restVoicingSeconds>.05)this.plan.measures.forEach((m,k)=>{
      if(this.plan.rests.some(r=>evidence.some(f=>f.state==="pitched"&&Math.min(m.endSeconds,r.endSeconds,f.end)-Math.max(m.startSeconds,r.startSeconds,f.start)>.05)))problems.add(k);
    });
    return {version:1,fingerprint:this.fingerprint,role:this.plan.role,speed:this.plan.speed,octave:this.plan.octave,attempt:this.attempt,
      range:this.plan.measures.map(m=>({measure:m.measure,occurrence:m.occurrence})),notes,coverage,pitchAccuracy:accuracy,pitchConclusion:coverage>=.5?accuracy:null,eligibleSeconds,judgedSeconds,restVoicingSeconds,
      rhythm:{judged:onsets.length,withinTolerance:onsets.filter(n=>n.onsetWithinTolerance).length,meanAbsoluteOffsetSeconds:onsets.length?onsets.reduce((sum,n)=>sum+Math.abs(n.onsetOffsetSeconds!),0)/onsets.length:null,estimated:!this.latency.calibrated},
      gaps:structuredClone(this.gaps),pauses:structuredClone(this.pauses),problemMeasures:[...problems].sort((a,b)=>a-b),latency:{...this.latency}};
  }
}
