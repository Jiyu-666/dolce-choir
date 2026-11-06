import {test,expect} from "vitest";
import {loadScoreDoc} from "../../src/model/fromxml";
import {phrasePartOfDoc} from "../../src/model/phrasedoc";
import {playDataOfDoc,playSourceOfDoc} from "../../src/model/playdoc";
import {buildTimeline} from "../../src/score/timeline";
import {TempoClock} from "../../src/score/tempo";

const score=(bars:string)=>`<score-partwise><part-list><score-part id="P"><part-name>S</part-name></score-part></part-list><part id="P">${bars}</part></score-partwise>`;
const attributes='<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>';
const note=(step:string)=>`<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>`;
test("changed divisions, forward gaps and direction offsets agree in phrase/jump/playback inputs",()=>{
  const song=loadScoreDoc(score(`<measure number="1">${attributes}${note("C")}</measure><measure number="2"><attributes><divisions>2</divisions><time><beats>5</beats><beat-type>4</beat-type></time></attributes><forward><duration>2</duration></forward><note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>half</type></note><direction><direction-type><segno/></direction-type><offset>2</offset><sound segno="S"/></direction><forward><duration>4</duration></forward></measure><measure number="3"><attributes><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>E</step><octave>4</octave></pitch><duration>8</duration><type>whole</type></note></measure>`)).songs[0];
  const view=phrasePartOfDoc(song).part;
  expect(view.measures[1].entries[0].position.toFloat()).toBe(1);expect(view.measures[1].entries[0].duration.toFloat()).toBe(2);
  expect(view.measures[1].duration.toFloat()).toBe(5);expect(view.measures[2].position.toFloat()).toBe(9);
  expect(playDataOfDoc(song).segno.get("S")?.offset.toFloat()).toBe(4);
  const tl=buildTimeline(playSourceOfDoc(song));expect(tl.notes.map(n=>[n.pitch,n.t0,n.t1])).toEqual([[60,0,4],[62,5,7],[64,9,13]]);
});
test("pickup and tie sustain keep separate score anchors without retriggering",()=>{
  const tl=buildTimeline(playSourceOfDoc(loadScoreDoc(score(`<measure number="0" implicit="yes">${attributes}<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="start"/><type>half</type></note></measure><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="stop"/><type>half</type></note><note><rest/><duration>2</duration><type>half</type></note></measure>`)).songs[0]));
  expect(tl.duration).toBe(6);expect(tl.notes.map(n=>[n.pitch,n.t0,n.t1])).toEqual([[60,0,4]]);expect(tl.allAnchors.map(a=>a.t0)).toEqual([0,2]); // both written tied notes; rests are not sung-onset anchors
});
test("first/second endings have hand-specified note and tempo occurrence order",()=>{
  const tl=buildTimeline(playSourceOfDoc(loadScoreDoc(score(`<measure number="1">${attributes}<barline location="left"><repeat direction="forward"/></barline><sound tempo="60"/>${note("C")}</measure><measure number="2"><barline location="left"><ending number="1" type="start"/></barline><sound tempo="120"/>${note("D")}<barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline></measure><measure number="3"><barline location="left"><ending number="2" type="start"/></barline><sound tempo="90"/>${note("E")}<barline location="right"><ending number="2" type="discontinue"/></barline></measure><measure number="4"><sound tempo="60"/>${note("F")}</measure>`)).songs[0]));
  expect(tl.notes.map(n=>n.pitch)).toEqual([60,62,60,64,65]);expect(tl.occurrences.map(m=>m.measure)).toEqual([0,1,0,2,3]);
  expect(new TempoClock(tl.tempos).secondsAt(tl.duration)).toBeCloseTo(4+2+4+8/3+4);
});
test("D.C.alFine and D.S.alCoda reuse the existing jump expansion",()=>{
  const fine=buildTimeline(playSourceOfDoc(loadScoreDoc(score(`<measure number="1">${attributes}${note("C")}<sound fine="yes"/></measure><measure number="2">${note("D")}<sound dacapo="yes"/></measure>`)).songs[0]));
  expect(fine.notes.map(n=>n.pitch)).toEqual([60,62,60]);
  const coda=buildTimeline(playSourceOfDoc(loadScoreDoc(score(`<measure number="1">${attributes}<sound segno="S"/>${note("C")}</measure><measure number="2">${note("D")}<sound tocoda="C"/></measure><measure number="3">${note("E")}<sound dalsegno="S"/></measure><measure number="4"><sound coda="C"/>${note("F")}</measure><measure number="5">${note("G")}</measure>`)).songs[0]));
  expect(coda.notes.map(n=>n.pitch)).toEqual([60,62,64,60,62,65,67]);
});
