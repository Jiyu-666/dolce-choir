import {expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {loadScoreDoc} from "../../src/model/fromxml";
import {scoreDocToMusicXml} from "../../src/model/toxml";
import {tempoConflictsOfDoc,tempoEventsOfDoc} from "../../src/model/playdoc";
import {chooseSourceTempo} from "../../src/choir/tempos";
const xml=readFileSync(new URL("./fixtures/satb.musicxml",import.meta.url),"utf8");
it("chooses an explicit source tempo using the authoritative beat/unit calculation and preserves other positions",()=>{
  const doc=loadScoreDoc(xml),song=doc.songs[0],notes=JSON.stringify(song.parts.map(p=>p.measures[0].elements));
  song.parts[0].measures[0].directions=[{type:"metronome",onset:1,tempo:{beatUnit:"quarter",perMinute:60}},{type:"sound",onset:3,sound:{tempo:90}}];
  song.parts[1].measures[0].directions=[{type:"metronome",onset:1,tempo:{beatUnit:"quarter",beatUnitDot:true,perMinute:80},sound:{tempo:120}}];
  expect(tempoConflictsOfDoc(song).map(g=>g.map(c=>[c.measure,c.beat,c.bpm]))).toEqual([[[0,1,60],[0,1,120]]]);
  chooseSourceTempo(song,0,1,60);
  expect(song.parts[1].measures[0].directions[0].tempo).toMatchObject({beatUnit:"quarter",beatUnitDot:true,perMinute:40});
  expect(tempoConflictsOfDoc(song)).toEqual([]);expect(tempoEventsOfDoc(song)).toEqual([{measure:0,beat:1,bpm:60},{measure:0,beat:3,bpm:90}]);
  expect(tempoEventsOfDoc(loadScoreDoc(scoreDocToMusicXml(doc)).songs[0])).toEqual(tempoEventsOfDoc(song));
  expect(JSON.stringify(song.parts.map(p=>p.measures[0].elements))).toBe(notes);
});
it("resolves header conflicts in the source and rejects stale/unoffered choices before mutation",()=>{
  const song=loadScoreDoc(xml).songs[0];song.tempos=["Andante",40];song.tempoBeat={num:3,den:8};
  song.parts[0].measures[0].directions=[{type:"sound",sound:{tempo:120}}];
  const before=JSON.stringify(song);expect(()=>chooseSourceTempo(song,0,0,100)).toThrow();expect(JSON.stringify(song)).toBe(before);
  chooseSourceTempo(song,0,0,120);expect(song.tempos).toEqual(["Andante",80]);expect(tempoEventsOfDoc(song)).toEqual([{measure:0,beat:0,bpm:120}]);
  expect(()=>chooseSourceTempo(song,0,0,60)).toThrow();
});
