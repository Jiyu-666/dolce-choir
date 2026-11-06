import { WindowedPitchAnalyzer } from "./pitch";

let analyzer: WindowedPitchAnalyzer | null = null;
let noise: number[] = [], tonalFrames = 0, calibrationStart: number | null = null;
let calibrated = false;
self.onmessage = (event: MessageEvent<{sampleRate?:number; samples?:Float32Array; firstFrame?:number; id:number}>) => {
  const data = event.data;
  try {
    if (data.sampleRate) { analyzer = new WindowedPitchAnalyzer(data.sampleRate); calibrated=false; noise=[]; tonalFrames=0; calibrationStart=null; }
    if (!analyzer || !data.samples || data.firstFrame === undefined) return;
    calibrationStart ??= data.firstFrame/analyzer.sampleRate;
    const {frames,gap} = analyzer.push(data.samples,data.firstFrame);
    let amplitude=0,index=0;
    for(let i=0;i<data.samples.length;i++)if(Math.abs(data.samples[i])>amplitude){amplitude=Math.abs(data.samples[i]);index=i;}
    const peak={audioTime:(data.firstFrame+index)/analyzer.sampleRate,amplitude};
    for (const frame of frames) if (!calibrated) {
      noise.push(frame.rms);
      if (frame.clarity >= .85 && frame.rms > .004) tonalFrames++;
      if (frame.audioTime-calibrationStart >= 1) {
        const sorted = [...noise].sort((a,b)=>a-b), rms = sorted[Math.floor(sorted.length/2)];
        analyzer.pitch.noiseRms = rms; calibrated=true;
        self.postMessage({calibration:{quiet:rms<.02 && tonalFrames<3,noiseRms:rms}});
      }
    }
    self.postMessage({id:data.id,frames:calibrated?frames:[],gap,peak});
  } catch(error) { self.postMessage({id:data.id,error:String(error)}); }
};
