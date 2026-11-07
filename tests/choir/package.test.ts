import {test,expect} from "vitest";
import {readFileSync} from "node:fs";
import {strFromU8,strToU8,unzipSync,zipSync} from "fflate";
import {buildPracticePackage,readPracticePackage,practiceFingerprint,type PracticePackageV1} from "../../src/choir/package";
import {DEFAULT_CHOIR_LAYOUT,sourceRevision,type ChoirProject} from "../../src/choir/project";
import {loadScoreDoc} from "../../src/model/fromxml";
import {enumerateLanes,ROLES} from "../../src/choir/mapping";

async function project():Promise<ChoirProject>{
  const sourceXml=readFileSync(new URL("./fixtures/satb.musicxml",import.meta.url),"utf8");
  return {version:1,sourceXml,mapping:{version:1,revision:await sourceRevision(sourceXml),bindings:enumerateLanes(loadScoreDoc(sourceXml)).map((lane,i)=>({...lane,role:ROLES[i],name:ROLES[i],confirmed:true}))},layout:{...DEFAULT_CHOIR_LAYOUT},originalOmr:new Uint8Array([1,2,3]),editorSource:{format:"musicxml",text:"private editing text"}};
}
async function change(bytes:Uint8Array,edit:(data:PracticePackageV1)=>void,resign=true):Promise<Uint8Array>{
  const data=JSON.parse(strFromU8(unzipSync(bytes)["practice.json"])) as PracticePackageV1;edit(data);if(resign)data.fingerprint=await practiceFingerprint(data);
  return zipSync({"practice.json":strToU8(JSON.stringify(data))});
}
test("confirmed package is versioned plain music/timelines without OMR/editor credentials",async()=>{
  const bytes=await buildPracticePackage(await project(),"test"),loaded=await readPracticePackage(bytes);
  expect(Object.keys(unzipSync(bytes))).toEqual(["practice.json"]);expect(loaded.package.voices.map(v=>v.role)).toEqual(ROLES);
  expect(ROLES.map(r=>loaded.plans[r].notes.map(n=>n.pitch))).toEqual([[72],[69],[64],[48]]);
  expect(JSON.stringify(loaded.package)).not.toMatch(/originalOmr|editorSource|private editing/);
  expect(loaded.package.scoreXml).not.toMatch(/DOCTYPE/);expect(loaded.plans.B.durationSeconds).toBeCloseTo(8/3);
});
test("persisted numeric IDs are structurally rebound instead of trusted after reparsing",async()=>{
  const bytes=await change(await buildPracticePackage(await project(),"test"),data=>{
    for(const location of data.locations)location.id+=9000;
    for(const plan of Object.values(data.plans)){for(const note of plan.notes)note.elementId!+=9000;for(const anchor of plan.anchors)anchor.elementId!+=9000;}
  });
  const loaded=await readPracticePackage(bytes);
  expect(loaded.plans.S.notes[0].elementId).toBe(loaded.doc.songs[0].parts[0].measures[0].elements[0].id);
  expect(loaded.plans.S.notes[0].elementId).toBeLessThan(9000);
});
test("unconfirmed, stale, modified and unsupported packages fail closed",async()=>{
  const p=await project();p.mapping.bindings[0].confirmed=false;await expect(buildPracticePackage(p,"test")).rejects.toThrow();
  p.mapping.bindings[0].confirmed=true;p.sourceXml+=" ";await expect(buildPracticePackage(p,"test")).rejects.toThrow();
  const bytes=await buildPracticePackage(await project(),"test");
  await expect(readPracticePackage(await change(bytes,d=>{d.title="changed";},false))).rejects.toThrow(/fingerprint/);
  await expect(readPracticePackage(await change(bytes,d=>{d.voices[0].confirmed=false as true;}))).rejects.toThrow(/Unconfirmed/);
  await expect(readPracticePackage(await change(bytes,d=>{d.plans.S.notes[0].pitch=48;}))).rejects.toThrow(/note/);
});
test("unknown paths, external XML and malicious timeline fields are rejected",async()=>{
  const bytes=await buildPracticePackage(await project(),"test");
  await expect(readPracticePackage(zipSync({"../practice.json":strToU8("{}")}))).rejects.toThrow();
  await expect(readPracticePackage(await change(bytes,d=>{d.scoreXml=d.scoreXml.replace("<score-partwise",'<!DOCTYPE score-partwise [<!ENTITY a "bad">]><score-partwise');}))).rejects.toThrow(/XML/);
  await expect(readPracticePackage(await change(bytes,d=>{d.scoreXml=d.scoreXml.replace("<part-list>",'<part-list><link href="https://example.invalid"/>');}))).rejects.toThrow(/external/);
  await expect(readPracticePackage(await change(bytes,d=>{d.plans.S.notes[0].startSeconds=1e100;}))).rejects.toThrow();
  await expect(readPracticePackage(await change(bytes,d=>{d.plans.S.notes[0].elementId=d.plans.B.notes[0].elementId;}))).rejects.toThrow(/locator/);
});
test("actual expanded bytes are bounded even when the ZIP advertises a false tiny size",async()=>{
  const bytes=zipSync({"practice.json":new Uint8Array(50*1024*1024+1)},{level:9}),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  view.setUint32(22,1,true); // local header uncompressed-size lie
  for(let i=30;i<bytes.length-28;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,1,true);break;}
  await expect(readPracticePackage(bytes)).rejects.toThrow(/exceeds50MiB/);
});
