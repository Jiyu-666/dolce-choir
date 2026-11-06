import workletUrl from "./capture.worklet.ts?worker&url";
import type { AnalysisGap, PitchFrame } from "./pitch";

export interface MicrophoneSettings { sampleRate: number; channelCount?: number; autoGainControl?: boolean; noiseSuppression?: boolean; echoCancellation?: boolean }
export interface MicrophoneCallbacks {
  frame: (frame: PitchFrame) => void;
  gap: (gap: AnalysisGap) => void;
  error: (error: unknown) => void;
}
/** No recording storage or monitor path. PCM is transferred and discarded after local analysis. */
export class MicrophoneInput {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private worker: Worker | null = null;
  private pending = new Set<number>();
  private generation = 0;
  private id = 0;
  private rejectCalibration: ((error: unknown) => void) | null = null;
  private removeAbort: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  settings: MicrophoneSettings | null = null;
  constructor(private callbacks: MicrophoneCallbacks) {}
  static supported(): boolean { return !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== "undefined" && typeof Worker !== "undefined"; }
  async start(ctx: AudioContext, signal: AbortSignal): Promise<{ noiseRms: number }> {
    this.stop(); signal.throwIfAborted();
    if (!MicrophoneInput.supported() || !ctx.audioWorklet) throw new Error("Microphone analysis unsupported");
    const generation = this.generation;
    const abort = () => this.stop(); signal.addEventListener("abort",abort,{once:true}); this.removeAbort=()=>signal.removeEventListener("abort",abort);
    try {
      await ctx.audioWorklet.addModule(workletUrl); signal.throwIfAborted();
      if (generation !== this.generation) throw new DOMException("Cancelled","AbortError");
      const stream = await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,autoGainControl:false,noiseSuppression:false,echoCancellation:false},video:false});
      if (signal.aborted || generation !== this.generation) { for (const track of stream.getTracks()) track.stop(); throw new DOMException("Cancelled","AbortError"); }
      this.stream = stream;
      const track = stream.getAudioTracks()[0]; if (!track) throw new Error("No microphone track");
      const actual = track.getSettings();
      this.settings={sampleRate:ctx.sampleRate,channelCount:actual.channelCount,autoGainControl:actual.autoGainControl,noiseSuppression:actual.noiseSuppression,echoCancellation:actual.echoCancellation};
      track.addEventListener("ended",()=>{if(generation===this.generation){this.stop();this.callbacks.error(new Error("Microphone disconnected"));}},{once:true});
      const worker = new Worker(new URL("./pitch.worker.ts",import.meta.url),{type:"module"}); this.worker=worker;
      worker.postMessage({id:0,sampleRate:ctx.sampleRate});
      const calibration = new Promise<{noiseRms:number}>((resolve,reject)=>{
        this.rejectCalibration=reject;
        worker.onmessage=(event:MessageEvent<{id?:number;frames?:PitchFrame[];gap?:AnalysisGap;error?:string;calibration?:{quiet:boolean;noiseRms:number}}>)=>{
          if(generation!==this.generation)return;
          const data=event.data; if(data.id!==undefined)this.pending.delete(data.id);
          if(data.error){this.stop();this.callbacks.error(new Error(data.error));return;}
          if(data.calibration){
            clearTimeout(this.timer);this.rejectCalibration=null;
            if(data.calibration.quiet)resolve({noiseRms:data.calibration.noiseRms});
            else reject(new Error("Quiet environment needed"));
          }
          if(data.gap)this.callbacks.gap(data.gap);
          for(const frame of data.frames??[])this.callbacks.frame(frame);
        };
        worker.onerror=()=>{this.stop();this.callbacks.error(new Error("Pitch analysis worker failed"));};
        this.timer=setTimeout(()=>reject(new Error("Microphone received no audio")),5000);
      });
      // A node-construction failure must also observe the cancelled calibration promise.
      void calibration.catch(()=>{});
      const node = new AudioWorkletNode(ctx,"choir-capture",{numberOfInputs:1,numberOfOutputs:0,channelCount:1,channelCountMode:"explicit"}); this.node=node;
      node.port.onmessage=(event:MessageEvent<{samples:Float32Array;firstFrame:number}>)=>{
        if(generation!==this.generation)return;
        const {samples,firstFrame}=event.data, end=(firstFrame+samples.length)/ctx.sampleRate;
        // Bound both queue length and stale main-thread deliveries; gaps are explicit evidence.
        if(this.pending.size>=4||ctx.currentTime-end>.5){this.callbacks.gap({from:firstFrame/ctx.sampleRate,to:end});return;}
        const id=++this.id;this.pending.add(id);worker.postMessage({id,samples,firstFrame},[samples.buffer]);
      };
      node.onprocessorerror=()=>{this.stop();this.callbacks.error(new Error("Microphone capture failed"));};
      this.source=ctx.createMediaStreamSource(stream);this.source.connect(node);
      const result=await calibration; signal.throwIfAborted(); return result;
    } catch(error) { if(generation===this.generation)this.stop(); throw error; }
  }
  stop(): void {
    this.generation++;this.removeAbort?.();this.removeAbort=null;clearTimeout(this.timer);
    this.rejectCalibration?.(new DOMException("Cancelled","AbortError"));this.rejectCalibration=null;
    this.source?.disconnect();this.source=null;
    if(this.node){this.node.port.postMessage("stop");this.node.disconnect();this.node.port.close();this.node=null;}
    this.worker?.terminate();this.worker=null;this.pending.clear();
    for(const track of this.stream?.getTracks()??[])track.stop();this.stream=null;
  }
}
