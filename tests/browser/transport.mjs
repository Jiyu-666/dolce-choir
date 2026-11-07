import assert from 'node:assert/strict';

export async function verifyTransport(page, xml) {
  const result = await page.evaluate(async text => {
    const { loadScoreDoc } = await import('/src/model/fromxml.ts');
    const { compilePerformance } = await import('/src/choir/performance.ts');
    const { PracticeTransport } = await import('/src/choir/transport.ts');
    const doc = loadScoreDoc(text);
    for (const part of doc.songs[0].parts) {
      const bar = structuredClone(part.measures[0]);
      for (const element of bar.elements) { element.id+=10000; if(element.kind==='chord') for(const note of element.notes) if(note.pitch) note.pitch.step='D'; }
      part.measures.push(bar);
    }
    const plan = compilePerformance(doc,'transport-test',{role:'S',speed:3});
    let attempt=0, rewound=-1;
    const transport = new PracticeTransport({state:()=>{},tick:()=>{},attempt:n=>attempt=n,rewind:s=>rewound=s});
    const wait = async check => { const start=performance.now(); while(!check()) { if(performance.now()-start>10000)throw new Error('Transport did not advance'); await new Promise(r=>setTimeout(r,20)); } };
    try {
      transport.configure(plan,{piano:false,metronome:false,loop:false});
      const originalPitch=plan.notes[0].pitch; plan.notes[0].pitch=1;
      const frozen=Object.isFrozen(transport.plan.notes[0]) && transport.plan.notes[0].pitch===originalPitch;
      await transport.start(); await transport.start(); // duplicate start cannot create another attempt
      await wait(()=>transport.state==='practicing' && transport.seconds>plan.measures[1].startSeconds+.1);
      transport.pause(); const paused=transport.state;
      const target=plan.measures[1].startSeconds;
      await transport.start();
      await wait(()=>transport.state==='completed');
      const context=transport.audioContext; transport.dispose();
      await wait(()=>context.state==='closed');
      return {frozen,rewound,target,paused,attempt,closed:context.state==='closed'};
    } finally { transport.dispose(); }
  }, xml);
  assert(result.frozen && result.closed); assert.equal(result.paused,'paused');
  assert(Math.abs(result.rewound-result.target)<.001); assert.equal(result.attempt,1);
  console.log('PASS: frozen attempt, duplicate-start protection, actual second-bar rewind/new-pitch cue and context cleanup');
}
