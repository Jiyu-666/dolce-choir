import { describe, expect, it } from "vitest";
import { loadScoreDoc } from "../../src/model/fromxml";
import { chordSignature, enumerateLanes, projectChoir, ROLES, type ChoirMapping } from "../../src/choir/mapping";
import type { Chord } from "../../src/model/doc";

// Handmade fixture: explicit C5 / A4 / E4 / C3; sparse voice numbers are intentional.
const note = (step: string, oct: number, voice: number, staff = 1) => `<note><pitch><step>${step}</step><octave>${oct}</octave></pitch><duration>4</duration><voice>${voice}</voice><type>whole</type><staff>${staff}</staff></note>`;
const attrs = '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
function fixture(compact = false) {
  const parts = compact ? [note('C',5,2)+'<backup><duration>4</duration></backup>'+note('A',4,7),note('E',4,5)+'<backup><duration>4</duration></backup>'+note('C',3,9)] : [note('C',5,2),note('A',4,7),note('E',4,5),note('C',3,9)];
  return loadScoreDoc(`<score-partwise version="4.0"><part-list>${parts.map((_,i)=>`<score-part id="P${i}"><part-name>${ROLES[i]}</part-name></score-part>`).join('')}</part-list>${parts.map((p,i)=>`<part id="P${i}"><measure number="1">${attrs}${p}</measure></part>`).join('')}</score-partwise>`);
}
function setup(compact = false) {
  const doc = fixture(compact);
  const mapping: ChoirMapping = { version: 1, revision: 'r1', bindings: enumerateLanes(doc).map((l,i)=>({...l,role:ROLES[i],name:ROLES[i],confirmed:true})) };
  return { doc, mapping };
}
describe('SATB normalization', () => {
  for (const compact of [false,true]) it(`extracts four explicit lanes (${compact ? 'closed' : 'open'} score) without touching source`, () => {
    const {doc,mapping}=setup(compact), before=structuredClone(doc);
    const result=projectChoir(doc,mapping,'r1');
    expect(result.issues).toEqual([]);
    expect(doc).toEqual(before);
    expect(result.doc!.songs[0].parts.map(p=>p.measures[0].elements.filter((e):e is Chord=>e.kind==='chord').map(c=>c.notes[0].pitch))).toEqual([
      [{step:'C',octave:5,alter:0}],[{step:'A',octave:4,alter:0}],[{step:'E',octave:4,alter:0}],[{step:'C',octave:3,alter:0}]
    ]);
    expect(new Set(result.links.map(l=>l.derivedId)).size).toBe(4);
    expect(result.links.every(l=>l.revision==='r1')).toBe(true);
  });
  it('blocks stale revision and unconfirmed choices',()=>{
    const {doc,mapping}=setup();mapping.bindings[0].confirmed=false;
    expect(projectChoir(doc,mapping,'r2').issues.map(x=>x.code)).toEqual(expect.arrayContaining(['revision','unconfirmed']));
    expect(projectChoir(doc,mapping,'r2').doc).toBeNull();
  });
  it('does not silently select the highest chord note',()=>{
    const {doc,mapping}=setup(); const c=doc.songs[0].parts[0].measures[0].elements[0] as Chord;
    c.notes.push({pitch:{step:'E',octave:5,alter:0}});
    expect(projectChoir(doc,mapping,'r1').issues.map(x=>x.code)).toContain('polyphony');
    mapping.bindings[0].notes=[{measure:0,entry:0,signature:chordSignature(c),noteIndex:0}];
    expect(projectChoir(doc,mapping,'r1').issues.map(x=>x.code)).toContain('unassigned');
    c.notes[0].pitch!.octave=6;
    expect(projectChoir(doc,mapping,'r1').issues.map(x=>x.code)).toContain('choice');
  });
  it('requires explicit permission from both owners for unison reuse',()=>{
    const {doc,mapping}=setup();Object.assign(mapping.bindings[1],enumerateLanes(doc)[0]);
    expect(projectChoir(doc,mapping,'r1').issues.map(x=>x.code)).toContain('duplicate');
    mapping.bindings[0].allowUnison=true;mapping.bindings[1].allowUnison=true;
    expect(projectChoir(doc,mapping,'r1').issues).toEqual([]);
  });
  it('rejects a missing branch rather than replacing it with another melody',()=>{
    const {doc,mapping}=setup();mapping.bindings[2].voice=999;
    expect(projectChoir(doc,mapping,'r1').doc).toBeNull();
  });
});

describe('normalization edge cases',()=>{
  it('extracts four lanes on two staves inside one part',()=>{
    const doc=loadScoreDoc(`<score-partwise><part-list><score-part id="P"><part-name>SATB</part-name></score-part></part-list><part id="P"><measure number="1">${attrs.replace('</attributes>','<staves>2</staves><clef number="2"><sign>F</sign><line>4</line></clef></attributes>')}${note('C',5,2)}<backup><duration>4</duration></backup>${note('A',4,7)}<backup><duration>4</duration></backup>${note('E',4,5,2)}<backup><duration>4</duration></backup>${note('C',3,9,2)}</measure></part></score-partwise>`);
    const lanes=enumerateLanes(doc);
    const mapping: ChoirMapping={version:1,revision:'x',bindings:lanes.map((l,i)=>({...l,role:ROLES[i],name:ROLES[i],confirmed:true}))};
    const r=projectChoir(doc,mapping,'x');expect(r.issues).toEqual([]);
    expect(r.doc!.songs[0].parts.map(p=>p.measures[0].attrs?.clefs?.[0].sign)).toEqual(['G','G','F','F']);
    expect(r.doc!.songs[0].parts.every(p=>p.measures[0].elements.every(e=>e.voice===1&&e.staff===1))).toBe(true);
  });
  it('retains explicit gaps, duration, key, lyrics and numerical directions',()=>{
    const {doc,mapping}=setup();const m=doc.songs[0].parts[0].measures[0], c=m.elements[0] as Chord;
    c.onset=1;c.duration.divisions=3;c.lyrics=[{number:1,text:'la'}];
    m.directions=[{type:'sound',sound:{tempo:72},afterElements:1}];
    m.attrs!.key={fifths:2};
    const r=projectChoir(doc,mapping,'r1');expect(r.issues).toEqual([]);
    const out=r.doc!.songs[0].parts[0].measures[0];
    expect(out.elements[0].onset).toBe(1);expect(out.duration).toBe(4);
    expect((out.elements[0] as Chord).lyrics?.[0].text).toBe('la');
    expect(out.attrs?.key?.fifths).toBe(2);expect(out.directions?.[0].onset).toBe(4);
  });
  it('preserves octave clefs without changing absolute pitch',()=>{
    const {doc,mapping}=setup();doc.songs[0].parts[2].measures[0].attrs!.clefs=[{sign:'G',line:2,octaveChange:-1}];
    const r=projectChoir(doc,mapping,'r1');expect(r.issues).toEqual([]);
    expect((r.doc!.songs[0].parts[2].measures[0].elements[0] as Chord).notes[0].pitch!.octave).toBe(4);
    expect(r.doc!.songs[0].parts[2].measures[0].attrs!.clefs![0].octaveChange).toBe(-1);
  });
  it('preserves explicit crossing voices instead of sorting by pitch',()=>{
    const {doc,mapping}=setup(true);
    (doc.songs[0].parts[0].measures[0].elements[0] as Chord).notes[0].pitch!.octave=3;
    const r=projectChoir(doc,mapping,'r1');expect(r.issues).toEqual([]);
    expect((r.doc!.songs[0].parts[0].measures[0].elements[0] as Chord).notes[0].pitch!.octave).toBe(3);
  });
  it('remaps slur endpoints and refuses a cross-lane span',()=>{
    const {doc,mapping}=setup();const p=doc.songs[0].parts[0], c=p.measures[0].elements[0] as Chord;
    const second=structuredClone(c);second.id=100;second.onset=2;c.duration.divisions=2;second.duration.divisions=2;p.measures[0].elements.push(second);
    doc.songs[0].marks=[{type:'slur',start:c.id,end:100}];
    const r=projectChoir(doc,mapping,'r1');expect(r.issues).toEqual([]);
    expect(r.doc!.songs[0].marks[0].end).toBe(r.links.find(l=>l.sourceId===100)!.derivedId);
    doc.songs[0].marks[0].end=doc.songs[0].parts[1].measures[0].elements[0].id;
    expect(projectChoir(doc,mapping,'r1').issues.map(i=>i.code)).toContain('mark');
  });
  it('rejects overlapping events and incomplete chord allocation',()=>{
    const {doc,mapping}=setup();const m=doc.songs[0].parts[0].measures[0], c=m.elements[0] as Chord;
    const c2=structuredClone(c);c2.id=99;c2.onset=1;m.elements.push(c2);
    expect(projectChoir(doc,mapping,'r1').issues.map(i=>i.code)).toContain('overlap');
  });
});

it('preserves a two-note chord only after both tones are explicitly allocated',()=>{
  const {doc,mapping}=setup();const c=doc.songs[0].parts[0].measures[0].elements[0] as Chord;
  c.notes.push({pitch:{step:'A',octave:4,alter:0}});
  Object.assign(mapping.bindings[1],enumerateLanes(doc)[0]);
  mapping.bindings[0].notes=[{measure:0,entry:0,signature:chordSignature(c),noteIndex:0}];
  mapping.bindings[1].notes=[{measure:0,entry:0,signature:chordSignature(c),noteIndex:1}];
  expect(projectChoir(doc,mapping,'r1').issues).toEqual([]);
});

it('does not attach one chord tone’s slur to the other allocated melody',()=>{
 const {doc,mapping}=setup();const m=doc.songs[0].parts[0].measures[0], c=m.elements[0] as Chord;
 c.duration.divisions=2;c.notes.push({pitch:{step:'A',octave:4,alter:0}});
 const second=structuredClone(c);second.id=100;second.onset=2;m.elements.push(second);
 Object.assign(mapping.bindings[1],enumerateLanes(doc)[0]);
 for(const [i,b] of mapping.bindings.entries()) if(i<2) b.notes=[c,second].map((n,entry)=>({measure:0,entry,signature:chordSignature(n),noteIndex:i}));
 doc.songs[0].marks=[{type:'slur',start:c.id,end:100,startNote:0,endNote:0}];
 const r=projectChoir(doc,mapping,'r1');expect(r.issues).toEqual([]);expect(r.doc!.songs[0].marks).toHaveLength(1);
});
it('rejects unpitched parts as vocal melodies',()=>{
 const {doc,mapping}=setup();const c=doc.songs[0].parts[0].measures[0].elements[0] as Chord;
 delete c.notes[0].pitch;delete c.notes[0].degree;
 expect(projectChoir(doc,mapping,'r1').issues.map(i=>i.code)).toContain('unsupported');
});
