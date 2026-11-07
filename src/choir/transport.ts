import { TempoClock } from "../score/tempo";
import { loadPiano, RELEASE, schedulePianoNote, type PianoSamples } from "./piano";
import type { PerformancePlan } from "./performance";

export type PracticeState = "ready" | "loading" | "count-in" | "practicing" | "paused" | "completed" | "error";
export interface TransportSettings { piano: boolean; metronome: boolean; loop: boolean; captureTail?: number }
export interface PracticeCallbacks {
  prepare?: (context: AudioContext, signal: AbortSignal) => Promise<void>;
  state: (state: PracticeState, error?: unknown) => void;
  tick: (seconds: number, count: number | null) => void;
  attempt: (number: number) => void;
  rewind: (seconds: number, pausedAt: number, audioTime: number) => void;
}
export function countIn(plan: PerformancePlan, position: number): { count: number; step: number } {
  const measure = plan.measures.find(m => m.startSeconds <= position && m.endSeconds > position) ?? plan.measures[0];
  const time = measure.time, compound = time.beatType === 8 && time.beats > 3 && time.beats % 3 === 0;
  const count = compound ? time.beats / 3 : time.beats;
  let bpm = plan.tempos[0].bpm;
  for (const t of plan.tempos) if (t.t <= measure.startBeat) bpm = t.bpm;
  return { count, step: (compound ? 1.5 : 4 / time.beatType) * 60 / (bpm * plan.speed) };
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
/** AudioContext owns time; intervals feed scheduled audio and animation only presents it. */
export class PracticeTransport {
  state: PracticeState = "ready";
  private ctx: AudioContext | null = null;
  private value: PerformancePlan | null = null;
  private settings: TransportSettings = { piano: false, metronome: false, loop: false };
  private samples: PianoSamples | null = null;
  private controller: AbortController | null = null;
  private generation = 0;
  private attemptNumber = 0;
  private nodes = new Set<AudioScheduledSourceNode>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private raf = 0;
  private base = 0;
  private resumeAt = 0;
  private noteIndex = 0;
  private clickIndex = 0;
  private countStart = 0;
  private countStep = 0;
  private countTotal = 0;
  get plan(): PerformancePlan | null { return this.value; }
  get audioContext(): AudioContext | null { return this.ctx; }
  get seconds(): number { return this.ctx && ["count-in", "practicing"].includes(this.state) ? Math.min(this.value!.durationSeconds, Math.max(this.resumeAt, this.ctx.currentTime - this.base)) : this.resumeAt; }
  get activeFrom(): number { return this.resumeAt; }
  isPerformanceAudioTime(audioTime: number): boolean {
    return !!this.value && ["count-in","practicing"].includes(this.state) && audioTime >= this.base + this.resumeAt && audioTime < this.base + this.value.durationSeconds + (this.settings.captureTail ?? 0);
  }
  constructor(private callbacks: PracticeCallbacks) { document.addEventListener("visibilitychange", this.visibility);window.addEventListener("pagehide",this.pageHidden); }
  configure(plan: PerformancePlan, settings: TransportSettings): void {
    this.stop(); this.value = freeze(structuredClone(plan)); this.settings = { ...settings }; this.samples = null;
  }
  private setState(state: PracticeState, error?: unknown): void { this.state = state; this.callbacks.state(state, error); }
  private visibility = () => { if (document.hidden && ["loading", "count-in", "practicing"].includes(this.state)) this.pause(); };
  private pageHidden=()=>this.pause();
  private contextChanged = () => { if (this.ctx?.state !== "running" && ["count-in", "practicing"].includes(this.state)) this.pause(); };
  private track(node: AudioScheduledSourceNode | null): void {
    if (!node) return; this.nodes.add(node); node.addEventListener("ended", () => this.nodes.delete(node), { once: true });
  }
  private click(at: number, down: boolean): void {
    const ctx = this.ctx!, node = ctx.createOscillator(), gain = ctx.createGain();
    node.frequency.value = down ? 1320 : 880; gain.gain.setValueAtTime(.08, at); gain.gain.exponentialRampToValueAtTime(.001, at + .035);
    node.connect(gain); gain.connect(ctx.destination); node.start(at); node.stop(at + .04); this.track(node);
  }
  async start(): Promise<void> {
    if (!this.value || ["loading", "count-in", "practicing"].includes(this.state)) return;
    const resume = this.state === "paused", plan = this.value;
    this.clear(); const generation = ++this.generation, controller = new AbortController(); this.controller = controller;
    if (!resume) { this.resumeAt = 0; this.callbacks.attempt(++this.attemptNumber); }
    this.setState("loading");
    try {
      this.ctx ??= new AudioContext(); this.ctx.addEventListener("statechange", this.contextChanged);
      await this.ctx.resume();
      await this.callbacks.prepare?.(this.ctx, controller.signal);
      const first = plan.notes.find(n => n.endSeconds > this.resumeAt);
      const required = this.settings.piano ? plan.notes.map(n => n.pitch) : first ? [first.pitch] : [];
      const missing = required.filter(pitch => !this.samples?.has(pitch));
      if (missing.length || !this.samples) this.samples = new Map([...(this.samples ?? []), ...await loadPiano(missing, controller.signal)]);
      if (generation !== this.generation) return;
      const ctx = this.ctx, lead = ctx.currentTime + .05;
      let cueEnd = lead;
      if (first) {
        this.track(schedulePianoNote(ctx, ctx.destination, this.samples.get(first.pitch)!, { startSeconds: 0, endSeconds: .6, velocity: 100 }, 0, .6 + RELEASE, lead));
        cueEnd += .6 + RELEASE;
      }
      const count = countIn(plan, this.resumeAt); this.countStep = count.step; this.countTotal = count.count; this.countStart = cueEnd + .3;
      for (let i = 0; i < count.count; i++) this.click(this.countStart + i * count.step, i === 0);
      this.base = this.countStart + count.count * count.step - this.resumeAt;
      this.noteIndex = 0; this.clickIndex = 0;
      while (this.noteIndex < plan.notes.length && plan.notes[this.noteIndex].endSeconds <= this.resumeAt) this.noteIndex++;
      while (this.clickIndex < plan.clicks.length && plan.clicks[this.clickIndex].seconds < this.resumeAt - 1e-6) this.clickIndex++;
      this.setState("count-in");
      this.timer = setInterval(() => this.feed(), 40); this.feed(); this.animate();
    } catch (error) {
      if (generation === this.generation) { this.clear(); this.setState("error", error); }
    }
  }
  private feed(): void {
    const ctx = this.ctx!, plan = this.value!, horizon = ctx.currentTime + .2;
    if (this.state === "count-in" && ctx.currentTime >= this.base + this.resumeAt) this.setState("practicing");
    if (this.settings.piano) while (this.noteIndex < plan.notes.length && this.base + plan.notes[this.noteIndex].startSeconds < horizon) {
      const note = plan.notes[this.noteIndex++];
      this.track(schedulePianoNote(ctx, ctx.destination, this.samples!.get(note.pitch)!, note, this.resumeAt, plan.durationSeconds + RELEASE, this.base + this.resumeAt));
    }
    if (this.settings.metronome) while (this.clickIndex < plan.clicks.length && this.base + plan.clicks[this.clickIndex].seconds < horizon) {
      const click = plan.clicks[this.clickIndex++]; this.click(this.base + click.seconds, click.down);
    }
    if (ctx.currentTime >= this.base + plan.durationSeconds + (this.settings.captureTail ?? 0)) {
      this.resumeAt = plan.durationSeconds; this.callbacks.tick(this.resumeAt, null); this.clear(); this.setState("completed");
      if (this.settings.loop) void this.start();
    }
  }
  private animate = (): void => {
    if (!["count-in", "practicing"].includes(this.state) || !this.ctx) return;
    const now = this.ctx.currentTime;
    const count = now >= this.countStart && now < this.countStart + this.countTotal * this.countStep ? Math.floor((now - this.countStart) / this.countStep) + 1 : null;
    this.callbacks.tick(this.seconds, count); this.raf = requestAnimationFrame(this.animate);
  };
  pause(): void {
    if (!["loading", "count-in", "practicing"].includes(this.state) || !this.value) return;
    const position = this.seconds;
    this.resumeAt = [...this.value.measures].reverse().find(m => m.startSeconds <= position)?.startSeconds ?? 0;
    this.generation++; this.clear(); this.callbacks.rewind(this.resumeAt, position, this.ctx?.currentTime ?? 0); this.callbacks.tick(this.resumeAt, null); this.setState("paused");
  }
  stop(): void { this.generation++; this.clear(); this.resumeAt = 0; this.setState("ready"); }
  private clear(): void {
    this.controller?.abort(); this.controller = null; clearInterval(this.timer); this.timer = undefined; cancelAnimationFrame(this.raf);
    for (const node of this.nodes) { try { node.stop(); } catch { /* already ended */ } }
    this.nodes.clear();
  }
  dispose(): void {
    this.stop(); document.removeEventListener("visibilitychange", this.visibility);window.removeEventListener("pagehide",this.pageHidden);
    if (this.ctx) { this.ctx.removeEventListener("statechange", this.contextChanged); void this.ctx.close(); this.ctx = null; }
    this.samples = null;
  }
  /** Scoring and waveform timestamps use this clock, never message arrival time. */
  planSecondsAtAudioTime(audioTime: number): number { return audioTime - this.base; }
  quarterSecondsAt(position: number): number {
    const plan = this.value!;
    const beat = new TempoClock(plan.tempos, plan.speed).beatAt(position);
    let bpm = plan.tempos[0].bpm;
    for (const t of plan.tempos) if (t.t <= beat) bpm = t.bpm;
    return 60 / (bpm * plan.speed);
  }
}
