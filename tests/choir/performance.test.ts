import { readFileSync } from "node:fs";
import { expect,it } from "vitest";
import { loadScoreDoc } from "../../src/model/fromxml";
import { compilePerformance } from "../../src/choir/performance";
const xml=readFileSync(new URL('./fixtures/satb.musicxml',import.meta.url),'utf8');
it('isolates actual bass pitch and applies explicitly requested octave and speed',()=>{
 const doc=loadScoreDoc(xml);const plan=compilePerformance(doc,'revision',{role:'B',octave:1,speed:.5});
 expect(plan.notes.map(n=>n.pitch)).toEqual([60]);expect(plan.durationSeconds).toBeCloseTo(16/3);expect(plan.revision).toBe('revision');
});
it('clips a range to the selected occurrence and keeps leading/trailing silence',()=>{
 const doc=loadScoreDoc(xml);for(const p of doc.songs[0].parts){const m=structuredClone(p.measures[0]);m.elements[0].onset=1;m.elements[0].duration.divisions=2;m.duration=4;p.measures.push(m);}
 const plan=compilePerformance(doc,'revision',{role:'S',fromOccurrence:1,toOccurrence:1});
 expect(plan.notes[0].startBeat).toBe(1);expect(plan.notes[0].endBeat).toBe(3);expect(plan.rests).toHaveLength(2);expect(plan.measures[0].measure).toBe(1);
 expect(()=>compilePerformance(doc,'revision',{role:'S',fromOccurrence:2})).toThrow();
});
