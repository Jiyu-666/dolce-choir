import { expect, it } from "vitest";
import { packChoirProject, unpackChoirProject, sourceRevision, DEFAULT_CHOIR_LAYOUT } from "../../src/choir/project";
import { enumerateLanes, ROLES } from "../../src/choir/mapping";
import { loadScoreDoc } from "../../src/model/fromxml";
import { readFileSync } from "node:fs";
const xml=readFileSync(new URL('./fixtures/satb.musicxml',import.meta.url),'utf8');
it('roundtrips editable source, mapping, layout and local OMR bytes',async()=>{
 const mapping={version:1 as const,revision:await sourceRevision(xml),bindings:enumerateLanes(loadScoreDoc(xml)).map((l,i)=>({...l,role:ROLES[i],name:ROLES[i],confirmed:true}))};
 const project={version:1 as const,sourceXml:xml,mapping,layout:DEFAULT_CHOIR_LAYOUT,originalOmr:new Uint8Array([1,2,3])};
 expect(await unpackChoirProject(packChoirProject(project))).toEqual(project);
});
it('rejects a stale mapping instead of restoring it as confirmed',async()=>{
 const mapping={version:1 as const,revision:'stale',bindings:[]};
 await expect(unpackChoirProject(packChoirProject({version:1,sourceXml:xml,mapping,layout:DEFAULT_CHOIR_LAYOUT}))).rejects.toThrow('Stale');
});
