import type { ScoreDoc } from "../model/doc";
import { playSourceOfDoc } from "../model/playdoc";
import { buildTimeline, playTempo } from "../score/timeline";
import { TempoClock, type TempoPoint } from "../score/tempo";
import { ROLES, type ChoirRole } from "./mapping";
import { validateChoirControls } from "./musicgate";

export interface PerformanceOptions {
  role: ChoirRole;
  speed?: number;
  octave?: -1 | 0 | 1;
  /** Inclusive indices in the expanded measure-occurrence list; omitted means whole song. */
  fromOccurrence?: number;
  toOccurrence?: number;
}
export interface PerformancePlan {
  version: 1; revision: string; role: ChoirRole; speed: number; octave: number;
  durationBeats: number; durationSeconds: number; tempos: TempoPoint[];
  notes: { key: string; elementId: number | undefined; pitch: number; velocity: number; startBeat: number; endBeat: number; startSeconds: number; endSeconds: number }[];
  anchors: { elementId: number | undefined; pass: number; occurrence: number; seconds: number }[];
  measures: { measure: number; occurrence: number; pass: number; startBeat: number; endBeat: number; time: { beats: number; beatType: number }; startSeconds: number; endSeconds: number }[];
  clicks: { seconds: number; down: boolean }[];
  rests: { startSeconds: number; endSeconds: number }[];
  assumedInitialTempo: boolean;
}
/** Shared timeline is the sole source of repeats, ties, positions and numeric tempi. */
export function compilePerformance(doc: ScoreDoc, revision: string, options: PerformanceOptions): PerformancePlan {
  const part = ROLES.indexOf(options.role), song = doc.songs[0];
  if (!song || doc.songs.length !== 1 || part < 0 || song.parts.length !== 4) throw new Error("Expected normalized SATB score");
  const speed = options.speed ?? 1, octave = options.octave ?? 0;
  if (!Number.isFinite(speed) || speed < .25 || speed > 3 || ![-1,0,1].includes(octave)) throw new Error("Invalid practice settings");
  validateChoirControls(song);
  const src = playSourceOfDoc(song), tl = buildTimeline(src);
  const first = options.fromOccurrence ?? 0, last = options.toOccurrence ?? tl.occurrences.length-1;
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first || !tl.occurrences[last]) throw new Error("Invalid practice measure range");
  const from = tl.occurrences[first].t0, to = tl.occurrences[last].t1;
  const clock = new TempoClock(tl.tempos,speed), origin = clock.secondsAt(from);
  const sec = (beat: number): number => clock.secondsAt(beat)-origin;
  let initial = playTempo(src);
  for (const t of tl.tempos) if (t.t <= from) initial = t.bpm;
  const tempos = [{t:0,bpm:initial},...tl.tempos.filter(t=>t.t>from && t.t<to).map(t=>({t:t.t-from,bpm:t.bpm}))];
  const notes = tl.notes.flatMap((n,i) => n.part === part && n.t1 > from && n.t0 < to ? [{
    key:`${revision}:${options.role}:${n.chord.id ?? "rest"}:${i}`, elementId:n.chord.id,
    pitch:n.pitch+octave*12, velocity:n.velocity, startBeat:Math.max(n.t0,from)-from, endBeat:Math.min(n.t1,to)-from,
    startSeconds:sec(Math.max(n.t0,from)), endSeconds:sec(Math.min(n.t1,to)),
  }] : []).sort((a,b)=>a.startSeconds-b.startSeconds);
  const durationSeconds=sec(to), rests: PerformancePlan["rests"]=[];
  let end=0;
  for (const n of notes) { if(n.startSeconds>end) rests.push({startSeconds:end,endSeconds:n.startSeconds}); end=Math.max(end,n.endSeconds); }
  if(end<durationSeconds) rests.push({startSeconds:end,endSeconds:durationSeconds});
  const ids = new Set(song.parts[part].measures.flatMap(m=>m.elements.map(e=>e.id)));
  return {version:1,revision,role:options.role,speed,octave,durationBeats:to-from,durationSeconds,tempos,notes,rests,
    anchors:tl.allAnchors.filter(a=>a.t0>=from && a.t0<to && a.chord.id!==undefined && ids.has(a.chord.id)).map(a=>({elementId:a.chord.id,pass:a.pass,occurrence:a.occ??0,seconds:sec(a.t0)})),
    measures:tl.occurrences.slice(first,last+1).map(m=>({measure:m.measure,occurrence:m.occurrence,pass:m.pass,startBeat:m.t0-from,endBeat:m.t1-from,time:{...src.parts[part].measures[m.measure]!.time},startSeconds:sec(m.t0),endSeconds:sec(m.t1)})),
    clicks:tl.clicks.filter(c=>c.t>=from&&c.t<to).map(c=>({seconds:sec(c.t),down:c.down})),
    assumedInitialTempo:!src.tempoEvents?.some(t=>t.measure<tl.occurrences[first].measure||t.measure===tl.occurrences[first].measure&&t.beat<=tl.occurrences[first].sourceFrom),
  };
}
