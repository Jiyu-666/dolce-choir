import {test,expect} from "vitest";
import {readFileSync} from "node:fs";
import {loadScoreDoc} from "../../src/model/fromxml";
import {compilePerformance} from "../../src/choir/performance";
const fresh=()=>loadScoreDoc(readFileSync(new URL("./fixtures/satb.musicxml",import.meta.url),"utf8"));
test("unresolved jump targets cannot silently turn into a straight-through scoring target",()=>{
  const doc=fresh();doc.songs[0].parts[0].measures[0].directions=[{type:"sound",onset:4,sound:{dalsegno:"absent"}}];
  expect(()=>compilePerformance(doc,"r",{role:"S"})).toThrow(/control/i);
});
test("conflicting/out-of-lead controls and unsupported repeat counts require score correction",()=>{
  const doc=fresh();doc.songs[0].parts[1].measures[0].barlines=[{location:"right",repeat:"backward"}];
  expect(()=>compilePerformance(doc,"r",{role:"S"})).toThrow(/control/i);
  const triple=fresh();triple.songs[0].parts[0].measures[0].barlines=[{location:"right",repeat:"backward",repeatTimes:3}];
  expect(()=>compilePerformance(triple,"r",{role:"S"})).toThrow(/control/i);
});
