import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadScoreDoc } from "../../src/model/fromxml";
import { scoreDocToMusicXml } from "../../src/model/toxml";
import { buildTimeline } from "../../src/score/timeline";
import { playSourceOfDoc } from "../../src/model/playdoc";
import { enumerateLanes, projectChoir, ROLES } from "../../src/choir/mapping";
import type { Chord } from "../../src/model/doc";
const xml=readFileSync(new URL('./fixtures/satb.musicxml',import.meta.url),'utf8');
for(const [beats,beatType,length] of [[3,4,3],[4,4,4],[6,8,3]]) it(`roundtrips ${beats}/${beatType} pitches and nominal durations through the real XML writer`,()=>{
 const doc=loadScoreDoc(xml);
 for(const p of doc.songs[0].parts){
  const m=p.measures[0];m.attrs!.time={beats,beatType};
  const c=m.elements[0] as Chord;c.duration.divisions=length;c.duration.type=beats===6?'half':'quarter';
 }
 const mapping={version:1 as const,revision:'r',bindings:enumerateLanes(doc).map((l,i)=>({...l,role:ROLES[i],name:ROLES[i],confirmed:true}))};
 const r=projectChoir(doc,mapping,'r');expect(r.issues).toEqual([]);
 const reopened=loadScoreDoc(scoreDocToMusicXml(r.doc!));
 const tl=buildTimeline(playSourceOfDoc(reopened.songs[0]));
 expect(tl.duration).toBe(length);
 expect(tl.notes.map(n=>[n.part,n.pitch,n.t0,n.t1])).toEqual([[0,72,0,length],[1,69,0,length],[2,64,0,length],[3,48,0,length]]);
});
it('preserves source section anchors with newly allocated derived IDs',()=>{
 const doc=loadScoreDoc(xml), first=doc.songs[0].parts[0].measures[0].elements[0];
 first.id=999;doc.songs[0].sectionMarks=[{name:'A',before:999}];
 const mapping={version:1 as const,revision:'r',bindings:enumerateLanes(doc).map((l,i)=>({...l,role:ROLES[i],name:ROLES[i],confirmed:true}))};
 const r=projectChoir(doc,mapping,'r');expect(r.issues).toEqual([]);
 expect(r.doc!.songs[0].sectionMarks![0].before).toBe(r.links.find(l=>l.sourceId===999)!.derivedId);
});
