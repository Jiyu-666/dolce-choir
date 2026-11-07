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
 const mapping={version:1 as const,revision:'stale',bindings:enumerateLanes(loadScoreDoc(xml)).map((l,i)=>({...l,role:ROLES[i],name:ROLES[i],confirmed:true}))};
 await expect(unpackChoirProject(packChoirProject({version:1,sourceXml:xml,mapping,layout:DEFAULT_CHOIR_LAYOUT}))).rejects.toThrow('Stale');
});

it('rejects unknown entries before unpacking their payload',async()=>{
 const {zipSync,strToU8}=await import('fflate');
 await expect(unpackChoirProject(zipSync({'../escape':strToU8('x')}))).rejects.toThrow();
});
it('rejects malformed binding field types',async()=>{
 const mapping={version:1 as const,revision:await sourceRevision(xml),bindings:enumerateLanes(loadScoreDoc(xml)).map((l,i)=>({...l,role:ROLES[i],name:ROLES[i],confirmed:true}))};
 const {zipSync,strToU8}=await import('fflate');
 const manifest={version:1,mapping:{...mapping,bindings:mapping.bindings.map(b=>({...b,staff:'1'}))},layout:DEFAULT_CHOIR_LAYOUT};
 await expect(unpackChoirProject(zipSync({'manifest.json':strToU8(JSON.stringify(manifest)),'source.musicxml':strToU8(xml)}))).rejects.toThrow();
});
it('persists role/range/speed defaults and rejects malformed practice settings',async()=>{
 const mapping={version:1 as const,revision:await sourceRevision(xml),bindings:enumerateLanes(loadScoreDoc(xml)).map((l,i)=>({...l,role:ROLES[i],name:ROLES[i],confirmed:true}))};
 const practiceDefaults={role:'B' as const,speed:.75,octave:-1 as const,piano:false,metronome:true,loop:false,fromOccurrence:0,toOccurrence:0};
 const project={version:1 as const,sourceXml:xml,mapping,layout:DEFAULT_CHOIR_LAYOUT,practiceDefaults};
 expect((await unpackChoirProject(packChoirProject(project))).practiceDefaults).toEqual(practiceDefaults);
 await expect(unpackChoirProject(packChoirProject({...project,practiceDefaults:{...practiceDefaults,speed:0}}))).rejects.toThrow(/defaults/);
});
