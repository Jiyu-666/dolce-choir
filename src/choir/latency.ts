import { MicrophoneInput } from "./microphone";
import type { CapturePeak } from "./pitch";

const median=(values:number[]):number=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
/** Only known emitted pulses are used; singing/score accuracy never adjusts latency. */
export function estimateLatency(peaks:readonly CapturePeak[],scheduled:readonly number[],noiseRms:number):{seconds:number;spread:number;matched:number} {
  const delays:number[]=[],threshold=Math.max(.008,noiseRms*6);
  for(const beat of scheduled){
    const candidates=peaks.filter(p=>p.audioTime>=beat-.02&&p.audioTime<=beat+.5&&p.amplitude>=threshold);
    const peak=candidates.sort((a,b)=>b.amplitude-a.amplitude)[0];if(peak)delays.push(peak.audioTime-beat);
  }
  if(delays.length<3)throw new Error("Calibration pulses not heard");
  const delay=median(delays),spread=median(delays.map(d=>Math.abs(d-delay)));
  const matched=delays.filter(d=>Math.abs(d-delay)<=.03).length;
  if(matched<3||spread>.03||delay<-.02||delay>.5)throw new Error("Inconsistent calibration pulses");
  return {seconds:Math.max(0,delay),spread,matched};
}
export async function calibrateLatency(signal:AbortSignal):Promise<{seconds:number;spread:number;matched:number;deviceKey:string}> {
  signal.throwIfAborted();
  const ctx=new AudioContext(),controller=new AbortController(),peaks:CapturePeak[]=[],nodes:OscillatorNode[]=[];
  const abort=()=>controller.abort(signal.reason);signal.addEventListener("abort",abort,{once:true});
  const input=new MicrophoneInput({frame:()=>{},gap:()=>{},peak:p=>peaks.push(p),error:e=>controller.abort(e)});
  try{
    await ctx.resume();const calibration=await input.start(ctx,controller.signal),scheduled=[0,1,2,3].map(i=>ctx.currentTime+.25+i*.7);
    for(const at of scheduled){
      const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.frequency.value=1320;
      gain.gain.setValueAtTime(.2,at);gain.gain.exponentialRampToValueAtTime(.001,at+.025);
      oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(at);oscillator.stop(at+.03);nodes.push(oscillator);
    }
    await new Promise<void>((resolve,reject)=>{
      const failed=()=>{clearTimeout(timer);reject(controller.signal.reason??new DOMException("Cancelled","AbortError"));};
      const timer=setTimeout(()=>{controller.signal.removeEventListener("abort",failed);resolve();},(scheduled[3]+.65-ctx.currentTime)*1000);
      controller.signal.addEventListener("abort",failed,{once:true});if(controller.signal.aborted)failed();
    });
    return {...estimateLatency(peaks,scheduled,calibration.noiseRms),deviceKey:input.deviceKey!};
  }finally{
    signal.removeEventListener("abort",abort);input.stop();for(const node of nodes){try{node.stop();}catch{/*ended*/}}await ctx.close();
  }
}
