// Original four-bar exercise; arrays are authored musical content, not parser-derived expectations.
import {createServer} from 'vite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const roles=['S','A','T','B'];
const melodies=[['C5','D5','E5','G5','F5','E5','D5','C5','D5','E5','F5','D5','C5'],['G4','A4','C5','C5','A4','G4','G4','E4','F4','G4','A4','F4','E4'],['E4','F4','G4','E4','C4','C4','B3','C4','A3','C4','D4','B3','G3'],['C3','F3','C3','C3','F3','C3','G2','C3','D3','C3','D3','G2','C3']];
const xml=`<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>四声部练习曲 · SATB warm-up</work-title></work><identification><creator type="composer">Dolce Choir original exercise (CC0)</creator></identification><part-list>${roles.map(r=>`<score-part id="${r}"><part-name>${r}</part-name></score-part>`).join('')}</part-list>${roles.map((r,pi)=>`<part id="${r}">${Array.from({length:4},(_,bar)=>`<measure number="${bar+1}">${bar?'':'<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>'+ (r==='B'?'F':'G') +'</sign><line>'+ (r==='B'?4:2) +'</line></clef></attributes>'}${bar===0?'<sound tempo="90"/>':bar===2?'<sound tempo="72"/>':''}${(bar===3?[melodies[pi][12]]:melodies[pi].slice(bar*4,bar*4+4)).map(p=>`<note><pitch><step>${p[0]}</step><octave>${p[1]}</octave></pitch><duration>${bar===3?4:1}</duration><voice>1</voice><type>${bar===3?'whole':'quarter'}</type></note>`).join('')}</measure>`).join('')}</part>`).join('')}</score-partwise>`;
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
  const [{loadScoreDoc},{enumerateLanes},{sourceRevision,DEFAULT_CHOIR_LAYOUT,packChoirProject},{buildPracticePackage}]=await Promise.all([
    server.ssrLoadModule('/src/model/fromxml.ts'),server.ssrLoadModule('/src/choir/mapping.ts'),server.ssrLoadModule('/src/choir/project.ts'),server.ssrLoadModule('/src/choir/package.ts')]);
  const revision=await sourceRevision(xml),doc=loadScoreDoc(xml);
  const project={version:1,sourceXml:xml,mapping:{version:1,revision,bindings:enumerateLanes(doc).map((lane,i)=>({...lane,role:roles[i],name:roles[i],confirmed:true}))},layout:{...DEFAULT_CHOIR_LAYOUT}};
  await mkdir('public/choir',{recursive:true});await mkdir('out/choir-example',{recursive:true});
  await writeFile('public/choir/demo.musicxml',xml);
  await writeFile('public/choir/demo.dolcepractice',await buildPracticePackage(project,JSON.parse(await readFile('package.json','utf8')).version));
  await writeFile('out/choir-example/demo.dolcechoir',packChoirProject(project));
  console.log('Generated original four-bar SATB project and immutable practice package.');
}finally{await server.close();}
