import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadScoreDoc } from "../../src/model/fromxml";
import { compilePerformance } from "../../src/choir/performance";
import { countIn } from "../../src/choir/transport";

test("count-in uses local numeric tempo, playback multiplier and compound beat unit", () => {
  const doc = loadScoreDoc(readFileSync(new URL("./fixtures/satb.musicxml", import.meta.url), "utf8"));
  const plan = compilePerformance(doc, "test", {role:"S",speed:.5});
  expect(countIn(plan,0)).toEqual({count:4,step:4/3}); // fallback90*0.5BPM
  plan.measures[0].time = {beats:6,beatType:8}; plan.tempos[0].bpm=120;
  expect(countIn(plan,0)).toEqual({count:2,step:1.5}); // dotted quarters, actual60BPM
});
test("resume count-in reads the resumed bar's meter and effective tempo", () => {
  const doc = loadScoreDoc(readFileSync(new URL("./fixtures/satb.musicxml", import.meta.url), "utf8"));
  const plan = compilePerformance(doc,"test",{role:"S"});
  plan.measures.push({...plan.measures[0],startBeat:4,endBeat:7,startSeconds:4,endSeconds:7,time:{beats:3,beatType:4}});
  plan.tempos=[{t:0,bpm:60},{t:4,bpm:120}];
  expect(countIn(plan,4.5)).toEqual({count:3,step:.5});
});
