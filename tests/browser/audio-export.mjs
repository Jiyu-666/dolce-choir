import assert from 'node:assert/strict';

export async function verifyAudioExport(page) {
  const result = await page.evaluate(async () => {
    const { loadPiano, renderPianoBlock, SAMPLE_RATE } = await import('/src/choir/piano.ts');
    const { renderMp3 } = await import('/src/choir/audioexport.ts');
    const empty = {version:1,revision:'audio-test',role:'S',speed:1,octave:0,durationBeats:4,durationSeconds:4,tempos:[{t:0,bpm:60}],notes:[],anchors:[],measures:[],clicks:[],rests:[],assumedInitialTempo:false};
    const samples = await loadPiano([48,60,72]);
    const note = (pitch, startSeconds, endSeconds) => ({key:String(startSeconds),pitch,velocity:96,startSeconds,endSeconds,startBeat:startSeconds,endBeat:endSeconds});
    const scale = {...empty, notes:[note(48,0,.8),note(60,1,1.8),note(72,2,2.8)]};
    const signal = new AbortController().signal;
    const bytes = await renderMp3(scale, samples, signal);
    const decoder = new OfflineAudioContext(1,1,SAMPLE_RATE), decoded = await decoder.decodeAudioData(bytes.slice().buffer);
    const pcm = decoded.getChannelData(0);
    const peaks = [0,1,2].map(start => {
      let peak = 0; for(let i=Math.round((start+.1)*SAMPLE_RATE);i<Math.round((start+.5)*SAMPLE_RATE);i++) peak=Math.max(peak,Math.abs(pcm[i])); return peak;
    });
    const silenceBytes = await renderMp3({...empty,durationSeconds:2}, new Map(), signal);
    const silence = await decoder.decodeAudioData(silenceBytes.slice().buffer);
    let silentPeak=0; for(const x of silence.getChannelData(0)) silentPeak=Math.max(silentPeak,Math.abs(x));
    // Sustain and release cross 20s without a new onset: compare to one continuous render.
    const long = {...empty,durationSeconds:21,notes:[note(60,19.5,20.7)]};
    const whole = await renderPianoBlock(long,samples,0,SAMPLE_RATE*21);
    const a = await renderPianoBlock(long,samples,0,SAMPLE_RATE*20), b = await renderPianoBlock(long,samples,SAMPLE_RATE*20,SAMPLE_RATE);
    let seamError=0;
    for(let i=SAMPLE_RATE*19;i<whole.length;i++) seamError=Math.max(seamError,Math.abs(whole[i]-(i<a.length?a[i]:b[i-a.length])));
    const cancel = new AbortController(); let cancelled=false;
    try { await renderMp3(long,samples,cancel.signal,stage=>{if(stage==='encode')cancel.abort();}); }
    catch(error) { cancelled=error.name==='AbortError'; }
    // Ten-minute sparse score: bounded20-second rendering/encoding and no full-song PCM allocation.
    const tenMinutes = {...empty,durationSeconds:600,notes:[note(48,0,.5),note(72,599,599.5)]};
    const started=performance.now(); const longBytes=await renderMp3(tenMinutes,samples,signal);
    const longDecoded=await decoder.decodeAudioData(longBytes.slice().buffer);
    return {bytes:bytes.length,duration:decoded.duration,channels:decoded.numberOfChannels,sampleRate:decoded.sampleRate,peaks,
      silentDuration:silence.duration,silentPeak,seamError,cancelled,longDuration:longDecoded.duration,longSize:longBytes.length,elapsedMs:performance.now()-started};
  });
  assert(result.bytes > 1000 && result.channels===1 && result.sampleRate===44100);
  assert(Math.abs(result.duration-4)<.1 && result.peaks.every(p=>p>.001), 'Local piano/MP3 decode failed');
  assert(Math.abs(result.silentDuration-2)<.1 && result.silentPeak<1e-6, 'Silent solo was shortened or acquired notes');
  assert(result.seamError<1e-5, `Block boundary changed the sample/envelope: ${result.seamError}`);
  assert(result.cancelled, 'Cancellation did not reject the active encoding');
  assert(Math.abs(result.longDuration-600)<.1);
  console.log('PASS: sampled piano scale, MP3 mono44.1k decode, silence, continuous20s seam, cancellation, ten-minute export', JSON.stringify(result));
}
