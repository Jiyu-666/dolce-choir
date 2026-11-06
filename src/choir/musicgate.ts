import type { Part, Song } from "../model/doc";
import { directionBeat } from "../model/playdoc";

/** Reject navigation the inherited lead-part repeat engine cannot interpret unambiguously. */
export function validateChoirControls(song: Song): void {
  function controls(part: Part): string[] {
    const result: string[]=[],segnos=new Map<string,string>(),codas=new Map<string,string>();
    const jumps:{kind:string;label:string}[]=[];
    let divisions=1;
    part.measures.forEach((m,mi)=>{
      if(m.attrs?.divisions)divisions=m.attrs.divisions;
      for(const b of m.barlines??[]){
        if(!b.repeat&&!b.ending&&!b.jump&&!b.alsoForward)continue;
        if(b.jump||b.location==="middle"||b.repeatTimes!==undefined&&b.repeatTimes!==2)throw new Error("Unresolved choir control: unsupported repeat/jump");
        result.push(JSON.stringify([mi,b.location,b.repeat,b.alsoForward,b.ending&&[b.ending.type,[...b.ending.numbers].sort()]]));
      }
      for(const d of m.directions??[]){
        const sound=d.sound,at=directionBeat(m,d,divisions).toString(),position=`${mi}:${at}`;
        if(!sound||![sound.segno,sound.coda,sound.dalsegno,sound.tocoda,sound.fine,sound.dacapo].some(Boolean))continue;
        result.push(JSON.stringify([mi,at,sound.segno,sound.coda,sound.dalsegno,sound.tocoda,sound.fine,sound.dacapo]));
        for(const [label,map]of [[sound.segno,segnos],[sound.coda,codas]] as const)if(label){
          if(map.has(label)&&map.get(label)!==position)throw new Error("Unresolved choir control: duplicate jump destination");map.set(label,position);
        }
        if(sound.dalsegno)jumps.push({kind:"segno",label:sound.dalsegno});if(sound.tocoda)jumps.push({kind:"coda",label:sound.tocoda});
      }
      for(const d of m.directions??[])if(d.type==="words"&&/\b(?:D\.?\s*[CS]\.?|To\s+Coda|Dal\s+Segno|Da\s+Capo)\b/i.test(d.text??"")){
        const at=directionBeat(m,d,divisions);
        if(!(m.directions??[]).some(other=>directionBeat(m,other,divisions).compareTo(at)===0&&other.sound&&(other.sound.dacapo||other.sound.dalsegno||other.sound.tocoda)))throw new Error("Unresolved choir control: navigation words have no sound instruction");
      }
    });
    for(const jump of jumps)if(!(jump.kind==="segno"?segnos:codas).has(jump.label))throw new Error("Unresolved choir control: missing jump destination");
    return result.sort();
  }
  const first=JSON.stringify(controls(song.parts[0]));
  for(const part of song.parts.slice(1)){
    const next=controls(part);
    // Omitted global marks are common; different explicit marks are not silently ignored.
    if(next.length&&JSON.stringify(next)!==first)throw new Error("Unresolved choir control: voice navigation conflicts with first part");
  }
}
