import { test, expect } from "vitest";
import { PitchAnalyzer, WindowedPitchAnalyzer, PITCH_HOP, PITCH_WINDOW } from "../../src/choir/pitch";

function tone(frequency:number, rate:number, offset=0, harmonic=.3):Float32Array {
  return Float32Array.from({length:PITCH_WINDOW},(_,i)=>.15*Math.sin(2*Math.PI*frequency*(i+offset)/rate)+.15*harmonic*Math.sin(4*Math.PI*frequency*(i+offset)/rate));
}
test("known stable sine/harmonic signals cover bass to soprano at actual44.1/48kHz",()=>{
  let valid=0,accurate=0,total=0,maxCents=0;
  for(const rate of [44100,48000])for(const frequency of [65.4064,82.4069,110,220,440,880,1396.913])for(const harmonic of [0,.3,.6]){
    const analyzer=new PitchAnalyzer(rate);
    for(let frame=0;frame<12;frame++){
      const result=analyzer.analyze(tone(frequency,rate,frame*PITCH_HOP,harmonic),frame*PITCH_HOP);total++;
      if(result.frequency){valid++;const cents=Math.abs(1200*Math.log2(result.frequency/frequency));maxCents=Math.max(maxCents,cents);if(cents<=20)accurate++;}
    }
  }
  expect(valid/total).toBeGreaterThanOrEqual(.95);expect(accurate/valid).toBeGreaterThanOrEqual(.95);
  console.info("Synthetic pitch quality",{total,valid,accurate,maxCents});
});
test("silence/noise/isolated impact cannot sustain a valid sung note or hold last pitch",()=>{
  const analyzer=new PitchAnalyzer(48000);expect(analyzer.analyze(tone(220,48000),0).state).toBe("pitched");
  const silent=analyzer.analyze(new Float32Array(PITCH_WINDOW),PITCH_HOP);expect(silent.frequency).toBeNull();expect(silent.state).toBe("silent");
  let seed=1234, voiced=0;
  for(let k=0;k<30;k++){
    const noise=Float32Array.from({length:PITCH_WINDOW},()=>{seed=(1664525*seed+1013904223)>>>0;return((seed/2**32)*2-1)*.2;});
    if(analyzer.analyze(noise,k*PITCH_HOP).state==="pitched")voiced++;
  }
  expect(voiced).toBe(0);
  const impulse=new Float32Array(PITCH_WINDOW);impulse[1024]=.8;
  expect(analyzer.analyze(impulse,0).frequency).toBeNull();
});
test("relative environment gate rejects sound below3x noise RMS",()=>{
  const analyzer=new PitchAnalyzer(44100);analyzer.noiseRms=.05;
  const result=analyzer.analyze(tone(440,44100),0);expect(result.frequency).toBeNull();expect(result.state).toBe("silent");
});
test("window-center timestamps and missing input are independent of delivery time",()=>{
  const analyzer=new WindowedPitchAnalyzer(48000), block=new Float32Array(PITCH_HOP);
  for(let i=0;i<3;i++)expect(analyzer.push(block,48000+i*PITCH_HOP).frames).toHaveLength(0);
  const result=analyzer.push(block,48000+3*PITCH_HOP);
  expect(result.frames[0].audioTime).toBeCloseTo(1+2048/48000);expect(result.frames[0].duration).toBeCloseTo(1024/48000);
  const missing=analyzer.push(block,48000+6*PITCH_HOP);
  expect(missing.gap).toEqual({from:(48000+4*1024)/48000,to:(48000+6*1024)/48000});expect(missing.frames).toHaveLength(0);
});
test("strong second harmonic records the actual octave ambiguity without target-dependent folding",()=>{
  const errors:number[]=[];
  for(const frequency of [65.4064,110,220,440]){
    const analyzer=new PitchAnalyzer(48000), samples=tone(frequency,48000,0,8).map(x=>x*.1);
    const result=analyzer.analyze(samples,0);expect(result.frequency).not.toBeNull();
    expect(result.frequency).toBe(result.rawFrequency);
    errors.push(1200*Math.log2(result.frequency!/frequency));
  }
  console.info("Strong2nd harmonic raw cents (known ambiguity; no target correction)",errors);
});
