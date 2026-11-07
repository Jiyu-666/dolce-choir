import { test, expect } from "vitest";
import { PracticeComparison, frequencyOfMidi, liveComparison } from "../../src/choir/comparison";
import type { PerformancePlan } from "../../src/choir/performance";
import type { PitchFrame } from "../../src/choir/pitch";

function plan():PerformancePlan {
  return {version:1,revision:"handmade",role:"S",speed:1,octave:0,durationBeats:4,durationSeconds:4,tempos:[{t:0,bpm:60}],assumedInitialTempo:false,
    notes:[{key:"n1",elementId:1,pitch:69,velocity:90,startBeat:.5,endBeat:1.5,startSeconds:.5,endSeconds:1.5},{key:"n2",elementId:2,pitch:71,velocity:90,startBeat:2,endBeat:3,startSeconds:2,endSeconds:3}],
    anchors:[],clicks:[],rests:[{startSeconds:0,endSeconds:.5},{startSeconds:1.5,endSeconds:2},{startSeconds:3,endSeconds:4}],
    measures:[{measure:0,occurrence:1,pass:1,startBeat:0,endBeat:2,startSeconds:0,endSeconds:2,time:{beats:2,beatType:4}},{measure:1,occurrence:1,pass:1,startBeat:2,endBeat:4,startSeconds:2,endSeconds:4,time:{beats:2,beatType:4}}]};
}
function frame(t:number,midi:number|null,state:PitchFrame["state"]=midi===null?"silent":"pitched",duration=.02):PitchFrame {
  return {audioTime:t,duration,frequency:midi===null?null:frequencyOfMidi(midi),rawFrequency:midi===null?0:frequencyOfMidi(midi),state,clarity:midi===null?0:1,rms:midi===null?0:.1};
}
function sing(p:PerformancePlan, source:(t:number)=>number|null|"uncertain", latency=0) {
  const engine=new PracticeComparison(p,"fingerprint",1,48000,{seconds:latency,calibrated:false});
  for(let i=0;i<200;i++){const t=i*.02+.01,midi=source(t);engine.add(frame(t+latency,midi==="uncertain"?null:midi,midi==="uncertain"?"uncertain":midi===null?"silent":"pitched"),t+latency,true);}
  return engine;
}
const expected=(t:number)=>t>=.5&&t<1.5?69:t>=2&&t<3?71:null;
test("fixed targets produce full coverage and two evidenced onsets for a correct melody",()=>{
  const result=sing(plan(),expected).result();expect(result.coverage).toBeCloseTo(1);expect(result.pitchAccuracy).toBeCloseTo(1);expect(result.pitchConclusion).toBeCloseTo(1);
  expect(result.notes.map(n=>n.status)).toEqual(["correct","correct"]);expect(result.rhythm.judged).toBe(2);expect(result.rhythm.withinTolerance).toBe(2);
});
test.each([[1,"sharp"],[-1,"flat"],[12,"octave-high"],[-12,"octave-low"]] as const)("strict pitch difference %s is never folded into correct singing",(shift,status)=>{
  const r=sing(plan(),t=>{const midi=expected(t);return midi===null?null:midi+shift;}).result();
  expect(r.coverage).toBeCloseTo(1);expect(r.pitchAccuracy).toBe(0);expect(r.notes.map(n=>n.status)).toEqual([status,status]);
});
test("silence, unclear audio and a few correct notes cannot receive a whole-song pitch conclusion",()=>{
  const silent=sing(plan(),()=>null).result(),unclear=sing(plan(),()=>"uncertain").result();
  expect(silent.coverage).toBe(0);expect(silent.pitchConclusion).toBeNull();expect(silent.notes.every(n=>n.status==="silent")).toBe(true);
  expect(unclear.coverage).toBe(0);expect(unclear.notes.every(n=>n.status==="uncertain"&&n.silenceSeconds===0)).toBe(true);
  const sparse=sing(plan(),t=>t>.6&&t<.7?69:null).result();expect(sparse.pitchAccuracy).toBeCloseTo(1);expect(sparse.coverage).toBeLessThan(.1);expect(sparse.pitchConclusion).toBeNull();
});
test("late and early entries have bounded onset evidence and rest singing is separate",()=>{
  const late=sing(plan(),t=>t>=.7&&t<1.5?69:t>=2.2&&t<3?71:null).result();
  expect(late.rhythm.judged).toBe(2);expect(late.rhythm.withinTolerance).toBe(0);expect(late.notes[0].onsetOffsetSeconds).toBeCloseTo(.21);
  const early=sing(plan(),t=>t>=.3&&t<1.5?69:t>=1.8&&t<3?71:null).result();expect(early.notes[0].onsetOffsetSeconds).toBeCloseTo(-.19);expect(early.restVoicingSeconds).toBeCloseTo(.4);
});
test("continuous repeated pitches do not invent attacks at the score's note boundaries",()=>{
  const p=plan();p.notes[1]={...p.notes[1],pitch:69,startSeconds:1.5,startBeat:1.5,endSeconds:2.5,endBeat:2.5};p.rests=[{startSeconds:0,endSeconds:.5},{startSeconds:2.5,endSeconds:4}];
  const r=sing(p,t=>t>=.5&&t<2.5?69:null).result();expect(r.pitchAccuracy).toBeCloseTo(1);expect(r.rhythm.judged).toBe(1);expect(r.notes[1].onsetOffsetSeconds).toBeNull();
});
test("missing notes and delayed correct pitches are not rescued by unlimited matching",()=>{
  const r=sing(plan(),t=>t>=1.3&&t<2.3?69:null).result();
  expect(r.notes[0].onsetOffsetSeconds).toBeNull();expect(r.coverage).toBeLessThan(.3);expect(r.pitchConclusion).toBeNull();expect(r.notes[1].correctSeconds).toBe(0);
});
test("too-short notes are unjudgeable, and evidence is weighted by time rather than frame count",()=>{
  const p=plan();p.notes[0].endSeconds=.54;p.notes[0].endBeat=.54;
  const short=sing(p,expected).result();expect(short.notes[0].eligibleSeconds).toBe(0);expect(short.notes[0].status).toBe("unjudgeable");
  const e=new PracticeComparison(plan(),"f",1,48000,{seconds:0,calibrated:false});
  e.add(frame(.7,69,"pitched",.01),.7,true);e.add(frame(1,70,"pitched",.2),1,true);
  expect(e.result().pitchAccuracy).toBeCloseTo(.01/.21);
});
test("duplicate and out-of-order frames cannot inflate coverage",()=>{
  const e=sing(plan(),expected);for(let i=199;i>=0;i--){const t=i*.02+.01;e.add(frame(t,expected(t)),t,true);}
  expect(e.result().coverage).toBeCloseTo(1);expect(e.result().pitchAccuracy).toBeCloseTo(1);
});
test("long-note interruption and reported analysis gaps remain missing coverage",()=>{
  const interrupted=sing(plan(),t=>t>=.8&&t<1.2?null:expected(t)).result();
  expect(interrupted.pitchAccuracy).toBeCloseTo(1);expect(interrupted.coverage).toBeCloseTo(1-.4/1.68);expect(interrupted.notes[0].silenceSeconds).toBeCloseTo(.4);expect(interrupted.problemMeasures).toContain(0);
  const missing=sing(plan(),expected);missing.gap({from:.8,to:1.2});
  const result=missing.result();expect(result.coverage).toBeCloseTo(1-.4/1.68);expect(result.notes[0].gapSeconds).toBeCloseTo(.4);
});
test("latency uses an explicit path correction; rewind removes the incomplete bar",()=>{
  const corrected=sing(plan(),expected,.1).result();expect(corrected.pitchAccuracy).toBeCloseTo(1);expect(corrected.notes[0].onsetOffsetSeconds).toBeCloseTo(.01);expect(corrected.rhythm.estimated).toBe(true);
  const e=sing(plan(),t=>{const midi=expected(t);return midi===null?null:t>=2?midi+1:midi;});
  e.rewind(2,2.8,10);e.resume(12);
  for(let i=100;i<200;i++){const t=i*.02+.01;e.add(frame(t,expected(t)),t,true,2);}
  const result=e.result();expect(result.pitchAccuracy).toBeCloseTo(1);expect(result.pauses).toEqual([{atSeconds:2.8,rewoundTo:2,fromAudioTime:10,toAudioTime:12}]);
});
test("live feedback clears a correct note on silence and labels transitions/rests explicitly",()=>{
  const p=plan();expect(liveComparison(p,frame(1,69),1,48000).state).toBe("correct");
  expect(liveComparison(p,frame(1,null),1,48000).state).toBe("silent");expect(liveComparison(p,frame(.51,69),.51,48000).state).toBe("transition");expect(liveComparison(p,frame(.1,69),.1,48000).state).toBe("rest-voice");
});
