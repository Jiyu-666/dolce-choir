import { PitchDetector } from "pitchy";

export const PITCH_WINDOW = 4096;
export const PITCH_HOP = 1024;
export interface PitchFrame {
  audioTime: number; duration: number; frequency: number | null; rawFrequency: number;
  clarity: number; rms: number; state: "pitched" | "silent" | "uncertain";
}
export interface AnalysisGap { from: number; to: number }
export class PitchAnalyzer {
  private detector = PitchDetector.forFloat32Array(PITCH_WINDOW);
  private recent: number[] = [];
  noiseRms = 0;
  constructor(readonly sampleRate: number) {
    if (!Number.isFinite(sampleRate) || sampleRate < 8000) throw new Error("Invalid audio sample rate");
  }
  analyze(samples: Float32Array, firstFrame: number): PitchFrame {
    if (samples.length !== PITCH_WINDOW) throw new Error("Pitch window size mismatch");
    let squares = 0; for (const x of samples) squares += x*x;
    const rms = Math.sqrt(squares/samples.length), [rawFrequency, clarity] = this.detector.findPitch(samples, this.sampleRate);
    const gate = Math.max(.0015, this.noiseRms * 3);
    const state = rms < gate ? "silent" : clarity < .85 || rawFrequency < 60 || rawFrequency > 1500 || !Number.isFinite(rawFrequency) ? "uncertain" : "pitched";
    let frequency: number | null = null;
    if (state === "pitched") {
      this.recent.push(rawFrequency); if (this.recent.length > 3) this.recent.shift();
      const sorted = [...this.recent].sort((a,b)=>a-b); frequency = sorted[Math.floor(sorted.length/2)];
    } else this.recent = []; // invalid input must never hold the previous valid pitch
    return {audioTime:(firstFrame+PITCH_WINDOW/2)/this.sampleRate,duration:PITCH_HOP/this.sampleRate,frequency,rawFrequency,clarity,rms,state};
  }
  reset(): void { this.recent = []; }
}
/** Buffer continuity is established from sample-frame positions, independent of message delivery. */
export class WindowedPitchAnalyzer {
  readonly pitch: PitchAnalyzer;
  private window = new Float32Array(PITCH_WINDOW);
  private filled = 0;
  private first = 0;
  private expected: number | null = null;
  constructor(readonly sampleRate: number) { this.pitch = new PitchAnalyzer(sampleRate); }
  push(block: Float32Array, firstFrame: number): { frames: PitchFrame[]; gap?: AnalysisGap } {
    if (block.length !== PITCH_HOP || !Number.isInteger(firstFrame) || firstFrame < 0) throw new Error("Invalid capture block");
    let gap: AnalysisGap | undefined;
    if (this.expected !== null && firstFrame !== this.expected) {
      gap = {from:this.expected/this.sampleRate,to:firstFrame/this.sampleRate};
      this.filled = 0; this.pitch.reset();
    }
    if (!this.filled) this.first = firstFrame;
    this.expected = firstFrame+block.length;
    this.window.set(block,this.filled); this.filled+=block.length;
    const frames: PitchFrame[] = [];
    if (this.filled === PITCH_WINDOW) {
      frames.push(this.pitch.analyze(this.window,this.first));
      this.window.copyWithin(0,PITCH_HOP); this.filled-=PITCH_HOP; this.first+=PITCH_HOP;
    }
    return {frames,gap};
  }
}
