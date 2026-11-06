import assert from 'node:assert/strict';

export async function verifyMicrophone(browser) {
  const page=await browser.newPage();
  try {
    // Exercise an actually non-isolated page, as on GitHub Pages (no SharedArrayBuffer).
    await page.route('http://127.0.0.1:1420/',async route=>{
      const response=await route.fetch(),headers=response.headers();
      delete headers['cross-origin-opener-policy'];delete headers['cross-origin-embedder-policy'];
      await route.fulfill({response,headers});
    });
    await page.goto('http://127.0.0.1:1420/');await page.locator('#btn-start-sample').click();
    const result=await page.evaluate(async()=>{
      const {MicrophoneInput}=await import('/src/choir/microphone.ts');
      const ctx=new AudioContext({sampleRate:48000});await ctx.resume();
      const output=ctx.createMediaStreamDestination(),osc=ctx.createOscillator(),gain=ctx.createGain();
      gain.gain.value=0;osc.frequency.value=440;osc.connect(gain);gain.connect(output);osc.start();
      const original=navigator.mediaDevices.getUserMedia;let requested;
      navigator.mediaDevices.getUserMedia=async constraints=>{requested=constraints;return output.stream;};
      const frames=[],gaps=[],errors=[],lags=[];
      const input=new MicrophoneInput({frame:f=>{frames.push(f);lags.push(ctx.currentTime-f.audioTime);},gap:g=>gaps.push(g),error:e=>errors.push(String(e))});
      const controller=new AbortController();
      const wait=async check=>{const start=performance.now();while(!check()){if(performance.now()-start>6000)throw new Error('Capture did not produce frames');await new Promise(r=>setTimeout(r,20));}};
      try {
        const calibration=await input.start(ctx,controller.signal);
        gain.gain.setValueAtTime(.15,ctx.currentTime);
        await wait(()=>frames.filter(f=>f.state==='pitched').length>=8);
        const voiced=frames.filter(f=>f.state==='pitched');
        // Simulate main-thread congestion; sample positions expose the lost analysis interval.
        const busy=performance.now();while(performance.now()-busy<700){}
        await wait(()=>gaps.length>0);
        controller.abort();const stoppedAt=frames.length;await new Promise(r=>setTimeout(r,150));
        const stopped=frames.length===stoppedAt&&output.stream.getTracks().every(t=>t.readyState==='ended');
        navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};
        let denied=false;try{await input.start(ctx,new AbortController().signal);}catch(e){denied=e.name==='NotAllowedError';}
        return {isolated:crossOriginIsolated,calibration,requested,rate:input.settings.sampleRate,voiced:voiced.length,maxCents:Math.max(...voiced.map(f=>Math.abs(1200*Math.log2(f.frequency/440)))),
          medianLag:lags.sort((a,b)=>a-b)[Math.floor(lags.length/2)],gaps:gaps.length,stopped,denied,errors};
      } finally {input.stop();navigator.mediaDevices.getUserMedia=original;osc.stop();osc.disconnect();gain.disconnect();await ctx.close();}
    });
    assert(!result.isolated);assert.equal(result.requested.audio.channelCount,1);
    assert.equal(result.requested.audio.echoCancellation,false);assert.equal(result.requested.audio.autoGainControl,false);assert.equal(result.requested.audio.noiseSuppression,false);
    assert(result.voiced>=8&&result.maxCents<20&&result.stopped&&result.denied&&result.gaps>0);
    assert.deepEqual(result.errors,[]);
    console.log('PASS: non-isolated AudioWorklet→Worker synthetic stream, quiet calibration, frame timestamps/gaps, permission denial and full cleanup',JSON.stringify(result));
  } finally {await page.close();}
}
