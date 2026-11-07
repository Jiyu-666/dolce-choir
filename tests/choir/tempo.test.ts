import { expect, it } from "vitest";
import { Fraction } from "../../src/common/fraction";
import { PlayData } from "../../src/score/playorder";
import { buildTimeline, type PlaySource } from "../../src/score/timeline";
import { TempoClock } from "../../src/score/tempo";
import { loadScoreDoc } from "../../src/model/fromxml";
import { playSourceOfDoc } from "../../src/model/playdoc";
import { readFileSync } from "node:fs";
function source(): PlaySource {
 const playData=new PlayData();playData.tempo=60;
 return {playData,parts:[{name:'S',measures:[0,1].map(i=>({time:{beats:4,beatType:4},duration:new Fraction(4),entries:[{id:i+1,rest:false,position:new Fraction(0),duration:new Fraction(4),notes:[{pitch:60}]}]}))}],tempoEvents:[{measure:0,beat:0,bpm:60},{measure:1,beat:0,bpm:120}]};
}
it('integrates each tempo segment and reverses seconds to beats',()=>{
 const tl=buildTimeline(source()), clock=new TempoClock(tl.tempos);
 expect(clock.secondsAt(4)).toBe(4);expect(clock.secondsAt(8)).toBe(6);
 expect(clock.beatAt(5)).toBe(6);expect(new TempoClock(tl.tempos,0.5).secondsAt(8)).toBe(12);
 expect(tl.occurrences.map(m=>[m.measure,m.t0,m.t1])).toEqual([[0,0,4],[1,4,8]]);
});
it('reinstates source-position tempo on repeated sections',()=>{
 const src=source();src.playData.measures=[{mid:0,end:2,offset:new Fraction(0),pass:1,limit:-1},{mid:0,end:2,offset:new Fraction(0),pass:2,limit:-1}];
 const tl=buildTimeline(src);expect(tl.tempos.map(t=>[t.t,t.bpm])).toEqual([[0,60],[4,120],[8,60],[12,120]]);
 expect(new TempoClock(tl.tempos).secondsAt(tl.duration)).toBe(12);
 expect(tl.occurrences.map(m=>m.occurrence)).toEqual([1,1,2,2]);
});
it('uses initial default rather than the first future tempo; converts dotted metronome units',()=>{
 const xml=readFileSync(new URL('./fixtures/satb.musicxml',import.meta.url),'utf8');
 const doc=loadScoreDoc(xml);doc.songs[0].parts[0].measures[0].directions=[{type:'metronome',onset:2,tempo:{beatUnit:'quarter',beatUnitDot:true,perMinute:80}}];
 const src=playSourceOfDoc(doc.songs[0]),tl=buildTimeline(src);
 expect(src.playData.tempo).toBe(0);expect(tl.tempos.map(t=>[t.t,t.bpm])).toEqual([[0,90],[2,120]]);
 expect(new TempoClock(tl.tempos).secondsAt(4)).toBeCloseTo(7/3);
});
it('rejects conflicting same-position numeric tempi across parts',()=>{
 const xml=readFileSync(new URL('./fixtures/satb.musicxml',import.meta.url),'utf8'), doc=loadScoreDoc(xml);
 doc.songs[0].parts[0].measures[0].directions=[{type:'sound',sound:{tempo:60}}];
 doc.songs[0].parts[1].measures[0].directions=[{type:'sound',sound:{tempo:120}}];
 expect(()=>playSourceOfDoc(doc.songs[0])).toThrow(/tempo/i);
});

it('uses the same clock for playback anchors and spans',async()=>{
 const { timelineSeconds, anchorSeconds, spanSeconds }=await import('../../src/editor/player');
 const {tl,clock}=timelineSeconds(source());
 expect(anchorSeconds(tl,clock,{id:2,pass:1})).toBe(4);
 expect(spanSeconds(tl,clock,{id:1,pass:1},{id:2,pass:1})).toEqual({from:0,to:6});
});
it('writes every tempo event to MIDI and truly excludes other parts',async()=>{
 const {toMidi}=await import('../../src/score/midi');const src=source();
 const bytes=toMidi({...src,parts:[...src.parts,{...src.parts[0],name:'A'}]},{selectedParts:[1]});
 expect((bytes[10]<<8)|bytes[11]).toBe(2);
 const hex=Buffer.from(bytes).toString('hex');expect(hex).toContain('ff51030f4240');expect(hex).toContain('ff510307a120');
 expect([...bytes].filter(b=>b===0x90)).toHaveLength(0);expect([...bytes].filter(b=>b===0x91)).toHaveLength(2);
});
it('honors changed divisions and trailing forward silence in playback',()=>{
 const xml=readFileSync(new URL('./fixtures/satb.musicxml',import.meta.url),'utf8'),doc=loadScoreDoc(xml);
 for(const p of doc.songs[0].parts){const m=structuredClone(p.measures[0]);m.attrs!.divisions=2;m.elements[0].duration.divisions=4;m.duration=8;p.measures.push(m);}
 const tl=buildTimeline(playSourceOfDoc(doc.songs[0]));expect(tl.duration).toBe(8);expect(tl.notes.filter(n=>n.t0===4).every(n=>n.t1===6)).toBe(true);
});
it('retains whole-track silent duration in MIDI instead of ending at the last note',async()=>{
 const {toMidi}=await import('../../src/score/midi');const src=source();
 const bytes=toMidi({...src,parts:src.parts.map(p=>({...p,measures:p.measures.map(m=>({...m!,entries:[]}))}))});
 expect(Buffer.from(bytes).toString('hex')).toContain('9e00ff510307a1209e00ff2f00'); // 4 beats to the tempo change, then 4 beats to EOT
});
it('reads actual XML repeat barlines and reinstates the earlier source tempo',()=>{
 const xml=`<score-partwise><part-list><score-part id="P"><part-name>S</part-name></score-part></part-list><part id="P"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><barline location="left"><repeat direction="forward"/></barline><sound tempo="60"/><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure><measure number="2"><sound tempo="120"/><note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note><barline location="right"><repeat direction="backward"/></barline></measure></part></score-partwise>`;
 const tl=buildTimeline(playSourceOfDoc(loadScoreDoc(xml).songs[0]));
 expect(tl.notes.map(n=>n.pitch)).toEqual([60,62,60,62]);expect(new TempoClock(tl.tempos).secondsAt(tl.duration)).toBe(12);
});
