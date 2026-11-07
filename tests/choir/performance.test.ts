import { readFileSync } from "node:fs";
import { expect,it } from "vitest";
import { loadScoreDoc } from "../../src/model/fromxml";
import { compilePerformance,selectPerformance } from "../../src/choir/performance";
const xml=readFileSync(new URL('./fixtures/satb.musicxml',import.meta.url),'utf8');
it('isolates actual bass pitch and applies explicitly requested octave and speed',()=>{
 const doc=loadScoreDoc(xml);const plan=compilePerformance(doc,'revision',{role:'B',octave:1,speed:.5});
 expect(plan.notes.map(n=>n.pitch)).toEqual([60]);expect(plan.durationSeconds).toBeCloseTo(16/3);expect(plan.revision).toBe('revision');
});
it('derives range/rate/octave from stored targets without modifying or recomputing them',()=>{
 const doc=loadScoreDoc(xml);for(const p of doc.songs[0].parts){const m=structuredClone(p.measures[0]);m.elements[0].onset=1;m.elements[0].duration.divisions=2;m.duration=4;p.measures.push(m);}
 const base=compilePerformance(doc,'r',{role:'B'}),before=JSON.stringify(base);
 const selected=selectPerformance(base,{role:'B',fromOccurrence:1,toOccurrence:1,speed:.5,octave:1});
 expect(selected.notes.map(n=>n.pitch)).toEqual([60]);expect(selected.notes[0].startBeat).toBe(1);expect(selected.notes[0].endBeat).toBe(3);
 expect(selected.notes[0].startSeconds).toBeCloseTo(4/3);expect(selected.durationSeconds).toBeCloseTo(16/3);expect(selected.rests).toHaveLength(2);
 expect(selected.assumedInitialTempo).toBe(true);expect(JSON.stringify(base)).toBe(before);
});
it('clips a range to the selected occurrence and keeps leading/trailing silence',()=>{
 const doc=loadScoreDoc(xml);for(const p of doc.songs[0].parts){const m=structuredClone(p.measures[0]);m.elements[0].onset=1;m.elements[0].duration.divisions=2;m.duration=4;p.measures.push(m);}
 const plan=compilePerformance(doc,'revision',{role:'S',fromOccurrence:1,toOccurrence:1});
 expect(plan.notes[0].startBeat).toBe(1);expect(plan.notes[0].endBeat).toBe(3);expect(plan.rests).toHaveLength(2);expect(plan.measures[0].measure).toBe(1);
 expect(()=>compilePerformance(doc,'revision',{role:'S',fromOccurrence:2})).toThrow();
});
