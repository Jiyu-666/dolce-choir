import { strFromU8, strToU8, Unzip, UnzipInflate, zipSync } from "fflate";
import type { ScoreDoc } from "../model/doc";
import { loadScoreDoc } from "../model/fromxml";
import { scoreDocToMusicXml } from "../model/toxml";
import { parseXml, serializeXml } from "../score/xmltree";
import { attrsAt, midiPitch } from "../model/jianpu";
import { TempoClock } from "../score/tempo";
import { chordSignature, projectChoir, ROLES, type ChoirRole } from "./mapping";
import { compilePerformance, type PerformancePlan } from "./performance";
import { DEFAULT_PRACTICE,validatePracticeDefaults,sourceRevision, type ChoirLayout, type ChoirProject,type PracticeDefaults } from "./project";

interface Location { id:number;role:ChoirRole;measure:number;entry:number;signature:string }
export interface PracticePackageV1 {
  version:1;generatorVersion:string;title:string;fingerprint:string;scoreXml:string;
  voices:{role:ChoirRole;name:string;confirmed:true}[];
  layout:ChoirLayout;
  defaults:PracticeDefaults;
  locations:Location[];plans:Record<ChoirRole,PerformancePlan>;
}
export interface LoadedPractice {package:PracticePackageV1;doc:ScoreDoc;plans:Record<ChoirRole,PerformancePlan>}
const MIB=1024*1024;
function canonical(value:unknown):string {
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  const object=value as Record<string,unknown>;
  return `{${Object.keys(object).filter(k=>object[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonical(object[k])}`).join(",")}}`;
}
export async function practiceFingerprint(data:PracticePackageV1):Promise<string>{const {fingerprint:_,...content}=data;return sourceRevision(canonical(content));}
function safeXml(xml:string):ScoreDoc {
  // Reject declarations before the existing parser expands internal entities. This is not an XML parser replacement.
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)||/<\?(?!xml\s)/i.test(xml))throw new Error("External/entity XML is not a practice score");
  const tree=parseXml(xml);if(tree.documentElement.tagName!=="score-partwise")throw new Error("Invalid practice MusicXML");
  const stack=[{node:tree.documentElement,depth:0}];let count=0;
  while(stack.length){
    const {node,depth}=stack.pop()!;if(++count>300000||depth>64)throw new Error("Practice XML structure exceeds limits");
    if(["script","style","image","credit-image","link","opus","foreignObject"].includes(node.tagName)||node.attributes.some(a=>["href","xlink:href","src","source"].includes(a.name)))throw new Error("Practice XML external resource");
    for(const child of node.children)stack.push({node:child,depth:depth+1});
  }
  const doc=loadScoreDoc(xml);
  if(doc.songs.length!==1||doc.songs[0].parts.length!==4)throw new Error("Practice package requires four parts");
  for(const p of doc.songs[0].parts)for(const m of p.measures)for(const e of m.elements)if(e.kind!=="chord"||e.staff!==1||e.voice!==1||e.notes.length>1||!e.rest&&!e.notes[0]?.pitch)throw new Error("Practice part is not normalized monophonic music");
  return doc;
}
export async function buildPracticePackage(project:ChoirProject,generatorVersion:string):Promise<Uint8Array>{
  const revision=await sourceRevision(project.sourceXml);
  const projection=projectChoir(loadScoreDoc(project.sourceXml),project.mapping,revision);
  if(!projection.doc)throw new Error("Unconfirmed choir mapping");
  const xml=parseXml(scoreDocToMusicXml(projection.doc,{sourceIds:true}));xml.prolog='<?xml version="1.0" encoding="UTF-8"?>\n';xml.epilog="";
  const scoreXml=serializeXml(xml),doc=safeXml(scoreXml),scoreRevision=await sourceRevision(scoreXml);
  const locations:Location[]=doc.songs[0].parts.flatMap((p,pi)=>p.measures.flatMap((m,measure)=>m.elements.flatMap((e,entry)=>e.kind==="chord"?[{id:e.id,role:ROLES[pi],measure,entry,signature:chordSignature(e)}]:[])));
  const data:PracticePackageV1={version:1,generatorVersion,title:doc.songs[0].work.title??"Choir",fingerprint:"",scoreXml,
    voices:ROLES.map((role,i)=>({role,name:doc.songs[0].parts[i].name??role,confirmed:true})),layout:{...project.layout},
    defaults:{...DEFAULT_PRACTICE,...project.practiceDefaults},locations,
    plans:Object.fromEntries(ROLES.map(role=>[role,compilePerformance(doc,scoreRevision,{role})])) as Record<ChoirRole,PerformancePlan>};
  validatePracticeDefaults(data.defaults);
  data.fingerprint=await practiceFingerprint(data);
  const payload=strToU8(JSON.stringify(data));if(payload.length>50*MIB)throw new Error("Expanded practice package exceeds50MiB");
  const bytes=zipSync({"practice.json":payload});
  if(bytes.length>10*MIB)throw new Error("Practice package exceeds10MiB");return bytes;
}
/** Streaming bounds apply to actual output, even if a ZIP lies about uncompressed size. */
function unzipPractice(bytes:Uint8Array):string {
  if(bytes.length>10*MIB)throw new Error("Practice package exceeds10MiB");
  let seen=false,finished=false,size=0;const chunks:Uint8Array[]=[];
  const unzip=new Unzip(file=>{
    if(seen||file.name!=="practice.json"||(file.originalSize??0)>50*MIB)throw new Error("Invalid practice package files");seen=true;
    file.ondata=(error,chunk,final)=>{if(error)throw error;size+=chunk.length;if(size>50*MIB){file.terminate();throw new Error("Expanded practice package exceeds50MiB");}chunks.push(chunk);if(final)finished=true;};file.start();
  });unzip.register(UnzipInflate);
  // Small input chunks bound a single inflate emission as well as the cumulative output.
  for(let at=0;at<bytes.length;at+=2048)unzip.push(bytes.subarray(at,at+2048),at+2048>=bytes.length);
  if(!seen||!finished)throw new Error("Incomplete practice package");
  const output=new Uint8Array(size);let at=0;for(const chunk of chunks){output.set(chunk,at);at+=chunk.length;}return strFromU8(output);
}
function record(value:unknown,keys:readonly string[]):asserts value is Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw new Error("Invalid practice package schema");
}
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
const integer=(v:unknown):v is number=>finite(v)&&Number.isSafeInteger(v)&&v>=0;
function validatePlan(plan:PerformancePlan,role:ChoirRole,ids:Map<number,number>,pitches:Map<number,number>):void{
  record(plan,["version","revision","role","speed","octave","durationBeats","durationSeconds","tempos","notes","anchors","measures","clicks","rests","assumedInitialTempo"]);
  if(plan.version!==1||plan.role!==role||plan.speed!==1||plan.octave!==0||typeof plan.revision!=="string"||typeof plan.assumedInitialTempo!=="boolean"||!finite(plan.durationBeats)||plan.durationBeats<=0||!finite(plan.durationSeconds)||plan.durationSeconds<=0)throw new Error("Invalid practice plan");
  const interval=(item:{startSeconds:number;endSeconds:number})=>{if(!finite(item.startSeconds)||!finite(item.endSeconds)||item.startSeconds<0||item.endSeconds<=item.startSeconds||item.endSeconds>plan.durationSeconds+1e-6)throw new Error("Invalid practice interval");};
  const id=(value:unknown):void=>{if(!integer(value)||!ids.has(value))throw new Error("Unknown practice note locator");};
  if(![plan.tempos,plan.notes,plan.anchors,plan.measures,plan.clicks,plan.rests].every(Array.isArray)||!plan.tempos.length||!plan.measures.length)throw new Error("Missing practice timeline");
  for(const t of plan.tempos){record(t,["t","bpm"]);if(!finite(t.t)||t.t<0||!finite(t.bpm)||t.bpm<=0)throw new Error("Invalid tempo");}
  if(plan.tempos[0].t!==0)throw new Error("Missing initial tempo");
  if(plan.tempos.some((t,i)=>i>0&&t.t<=plan.tempos[i-1].t))throw new Error("Unordered tempo map");
  const clock=new TempoClock(plan.tempos);
  if(Math.abs(clock.secondsAt(plan.durationBeats)-plan.durationSeconds)>1e-5)throw new Error("Practice timing disagrees with tempo map");
  for(const n of plan.notes){record(n,["key","elementId","pitch","velocity","startBeat","endBeat","startSeconds","endSeconds"]);interval(n);id(n.elementId);if(typeof n.key!=="string"||n.key.length>256||!integer(n.pitch)||n.pitch>127||n.pitch!==pitches.get(n.elementId!)||!integer(n.velocity)||n.velocity<1||n.velocity>127||!finite(n.startBeat)||!finite(n.endBeat)||n.startBeat<0||n.endBeat<=n.startBeat||n.endBeat>plan.durationBeats+1e-6||Math.abs(clock.secondsAt(n.startBeat)-n.startSeconds)>1e-5||Math.abs(clock.secondsAt(n.endBeat)-n.endSeconds)>1e-5)throw new Error("Invalid practice note");}
  if(plan.notes.some((n,i)=>i>0&&n.startSeconds<plan.notes[i-1].endSeconds-1e-6))throw new Error("Polyphonic practice target");
  for(const a of plan.anchors){record(a,["elementId","pass","occurrence","seconds"]);id(a.elementId);if(!finite(a.seconds)||a.seconds<0||a.seconds>plan.durationSeconds||!integer(a.pass)||!integer(a.occurrence))throw new Error("Invalid practice anchor");}
  for(const m of plan.measures){record(m,["measure","occurrence","pass","startBeat","endBeat","time","startSeconds","endSeconds","assumedTempo"]);interval(m);record(m.time,["beats","beatType"]);if(!integer(m.measure)||!integer(m.occurrence)||m.occurrence<1||!integer(m.pass)||!finite(m.startBeat)||!finite(m.endBeat)||m.startBeat<0||m.endBeat<=m.startBeat||m.endBeat>plan.durationBeats+1e-6||Math.abs(clock.secondsAt(m.startBeat)-m.startSeconds)>1e-5||Math.abs(clock.secondsAt(m.endBeat)-m.endSeconds)>1e-5||!integer(m.time.beats)||m.time.beats<1||!integer(m.time.beatType)||m.time.beatType<1||m.assumedTempo!==undefined&&typeof m.assumedTempo!=="boolean")throw new Error("Invalid practice measure");}
  for(const c of plan.clicks){record(c,["seconds","down"]);if(!finite(c.seconds)||c.seconds<0||c.seconds>plan.durationSeconds||typeof c.down!=="boolean")throw new Error("Invalid practice click");}
  for(const r of plan.rests){record(r,["startSeconds","endSeconds"]);interval(r);}
  if(plan.measures[0].startSeconds!==0||Math.abs(plan.measures[plan.measures.length-1].endSeconds-plan.durationSeconds)>1e-6||plan.measures.some((m,i)=>i>0&&Math.abs(m.startSeconds-plan.measures[i-1].endSeconds)>1e-6))throw new Error("Invalid measure occurrences");
}
export async function readPracticePackage(bytes:Uint8Array):Promise<LoadedPractice>{
  const raw:unknown=JSON.parse(unzipPractice(bytes));
  record(raw,["version","generatorVersion","title","fingerprint","scoreXml","voices","layout","defaults","locations","plans"]);
  if(raw.version!==1||typeof raw.generatorVersion!=="string"||raw.generatorVersion.length>128||typeof raw.title!=="string"||raw.title.length>500||typeof raw.fingerprint!=="string"||typeof raw.scoreXml!=="string"||!Array.isArray(raw.voices)||raw.voices.length!==4||!Array.isArray(raw.locations))throw new Error("Unsupported practice package");
  const data=raw as unknown as PracticePackageV1;
  if(await practiceFingerprint(data)!==data.fingerprint)throw new Error("Practice fingerprint mismatch");
  const doc=safeXml(data.scoreXml),ids=new Map<number,number>(),roleIds=new Map<ChoirRole,Map<number,number>>(),pitches=new Map<number,number>(),seen=new Set<number>();
  for(const role of ROLES)roleIds.set(role,new Map());
  record(data.layout,["staffMm","jianpuPt","layerGapMm","groupGapMm"]);
  for(const [key,min,max]of [["staffMm",3,15],["jianpuPt",6,40],["layerGapMm",0,30],["groupGapMm",0,50]] as const)if(!finite(data.layout[key])||data.layout[key]<min||data.layout[key]>max)throw new Error("Invalid practice layout");
  validatePracticeDefaults(data.defaults);
  data.voices.forEach((v,i)=>{record(v,["role","name","confirmed"]);if(v.role!==ROLES[i]||v.confirmed!==true||typeof v.name!=="string"||v.name.length>200||v.name!==doc.songs[0].parts[i].name)throw new Error("Unconfirmed practice voice");});
  for(const location of data.locations){
    record(location,["id","role","measure","entry","signature"]);
    if(!integer(location.id)||ids.has(location.id)||!ROLES.includes(location.role)||!integer(location.measure)||!integer(location.entry)||typeof location.signature!=="string")throw new Error("Invalid practice locator");
    const e=doc.songs[0].parts[ROLES.indexOf(location.role)]?.measures[location.measure]?.elements[location.entry];
    if(e?.kind!=="chord"||seen.has(e.id)||chordSignature(e)!==location.signature)throw new Error("Practice locator content changed");ids.set(location.id,e.id);seen.add(e.id);roleIds.get(location.role)!.set(location.id,e.id);
    if(e.notes[0]?.pitch){const tr=attrsAt(doc.songs[0].parts[ROLES.indexOf(location.role)],1,location.measure).transpose;pitches.set(location.id,midiPitch(e.notes[0].pitch)+(tr?tr.chromatic+12*(tr.octaveChange??0):0));}
  }
  if(seen.size!==doc.songs[0].parts.reduce((sum,p)=>sum+p.measures.reduce((n,m)=>n+m.elements.length,0),0))throw new Error("Incomplete practice locators");
  record(data.plans,ROLES);
  for(const role of ROLES)validatePlan(data.plans[role],role,roleIds.get(role)!,pitches);
  if((data.defaults.fromOccurrence??0)>=data.plans.S.measures.length||(data.defaults.toOccurrence??0)>=data.plans.S.measures.length)throw new Error("Invalid default practice range");
  // Rebind runtime IDs by verified structural locators; never assume reparsing retains numeric IDs.
  const plans=structuredClone(data.plans);
  for(const plan of Object.values(plans)){for(const n of plan.notes)n.elementId=ids.get(n.elementId!);for(const a of plan.anchors)a.elementId=ids.get(a.elementId!);}
  return {package:data,doc,plans};
}
