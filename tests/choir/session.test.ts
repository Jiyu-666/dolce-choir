import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { ChoirSession, setLane } from "../../src/choir/session";
const xml=readFileSync(new URL('./fixtures/satb.musicxml',import.meta.url),'utf8');
it('requires confirmation and supports undo/redo without mutating snapshots',async()=>{
 const s=new ChoirSession();await s.sync(xml);expect(s.projection!.doc).toBeNull();
 s.edit(p=>p.mapping.bindings.forEach(b=>b.confirmed=true));expect(s.projection!.issues).toEqual([]);
 const snapshot=s.project!;snapshot.mapping.bindings[0].name='external';expect(s.project!.mapping.bindings[0].name).toBe('S');
 s.undo();expect(s.projection!.doc).toBeNull();s.redo();expect(s.projection!.doc).not.toBeNull();
});
it('invalidates only the changed melody and resets stale undo history',async()=>{
 const s=new ChoirSession();await s.sync(xml);s.edit(p=>p.mapping.bindings.forEach(b=>b.confirmed=true));
 await s.sync(xml.replace('<octave>5</octave>','<octave>6</octave>'));
 expect(s.project!.mapping.bindings.map(b=>b.confirmed)).toEqual([false,true,true,true]);expect(s.canUndo).toBe(false);
});
it('retains confirmation for a title-only edit and invalidates a lane selection',async()=>{
 const s=new ChoirSession();await s.sync(xml);s.edit(p=>p.mapping.bindings.forEach(b=>b.confirmed=true));
 await s.sync(xml.replace('Choir test','New title'));expect(s.project!.mapping.bindings.every(b=>b.confirmed)).toBe(true);
 s.edit(p=>setLane(p.mapping.bindings[0],p.mapping.bindings[1]));expect(s.project!.mapping.bindings[0].confirmed).toBe(false);
});
it('does not commit stale asynchronous source updates',async()=>{
 const s=new ChoirSession();await Promise.all([s.sync(xml),s.sync(xml.replace('Choir test','Latest'))]);expect(s.project!.sourceXml).toContain('Latest');
});
