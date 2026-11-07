import { zipSync, strToU8 } from "fflate";
import type { ScoreDoc } from "../model/doc";
import { asset } from "../common/asset";
import { soloPianoMidi } from "../score/midi";
import { ROLES, type ChoirRole } from "./mapping";
import { compilePerformance, type PerformancePlan } from "./performance";
import { loadPiano, pianoDuration, renderPianoBlock, SAMPLE_RATE, type PianoSamples } from "./piano";

export interface ExportProgress { role: ChoirRole; stage: "samples" | "peak" | "encode"; fraction: number }
/** Worker requests are acknowledged before the next PCM block is rendered (bounded memory). */
class Mp3Encoder {
  private worker = new Worker(new URL("./mp3.worker.ts", import.meta.url), { type: "module" });
  private id = 0;
  private pending = new Map<number, { resolve: (b?: Uint8Array) => void; reject: (e: unknown) => void }>();
  constructor(private signal: AbortSignal) {
    this.worker.onmessage = (e: MessageEvent<{ id: number; bytes?: Uint8Array; error?: string }>) => {
      const p = this.pending.get(e.data.id); this.pending.delete(e.data.id);
      if (e.data.error) p?.reject(new Error(e.data.error)); else p?.resolve(e.data.bytes);
    };
    this.worker.onerror = () => this.close(new Error("MP3 worker failed"));
    signal.addEventListener("abort", this.aborted, { once: true });
  }
  private aborted = () => this.close(this.signal.reason ?? new DOMException("Cancelled", "AbortError"));
  close(reason = new Error("MP3 encoder closed")): void {
    this.worker.terminate(); this.signal.removeEventListener("abort", this.aborted);
    for (const p of this.pending.values()) p.reject(reason); this.pending.clear();
  }
  async send(pcm?: Float32Array, gain?: number): Promise<Uint8Array | undefined> {
    this.signal.throwIfAborted();
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, pcm, gain, finish: !pcm }, pcm ? [pcm.buffer] : []);
    });
  }
}
export async function renderMp3(plan: PerformancePlan, samples: PianoSamples, signal: AbortSignal, progress: (stage: "peak" | "encode", fraction: number) => void = () => {}): Promise<Uint8Array> {
  signal.throwIfAborted();
  const total = Math.max(1, Math.ceil(pianoDuration(plan) * SAMPLE_RATE)), block = SAMPLE_RATE * 20;
  let peak = 0;
  for (let at = 0; at < total; at += block) {
    signal.throwIfAborted(); const pcm = await renderPianoBlock(plan, samples, at, Math.min(block, total - at));
    signal.throwIfAborted(); for (const x of pcm) peak = Math.max(peak, Math.abs(x));
    progress("peak", Math.min(1, (at + block) / total));
  }
  const gain = peak > .98 ? .98 / peak : 1, encoder = new Mp3Encoder(signal);
  try {
    for (let at = 0; at < total; at += block) {
      signal.throwIfAborted(); const pcm = await renderPianoBlock(plan, samples, at, Math.min(block, total - at));
      await encoder.send(pcm, gain); progress("encode", Math.min(1, (at + block) / total));
    }
    return (await encoder.send())!;
  } finally { encoder.close(); }
}
export function trackName(title: string, role: ChoirRole): string {
  const suffix = { S: "S女高", A: "A女低", T: "T男高", B: "B男低" }[role];
  return `${title.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 100) || "Choir"}－${suffix}`;
}
export async function exportTracks(doc: ScoreDoc, revision: string, title: string, signal: AbortSignal, progress: (p: ExportProgress) => void): Promise<Uint8Array> {
  // Immutable snapshot supplied by the setup session; source edits cancel the caller's controller.
  const files: Record<string, Uint8Array> = {};
  for (const role of ROLES) {
    signal.throwIfAborted(); const plan = compilePerformance(doc, revision, { role }), name = trackName(title, role);
    files[`${name}.mid`] = soloPianoMidi(plan, role);
    progress({ role, stage: "samples", fraction: 0 });
    const samples = await loadPiano(plan.notes.map(n => n.pitch), signal);
    files[`${name}.mp3`] = await renderMp3(plan, samples, signal, (stage, fraction) => progress({ role, stage, fraction }));
  }
  const attribution = await fetch(asset("redist/soundfont/LICENSE.txt"));
  if (!attribution.ok) throw new Error("Piano attribution unavailable");
  files["SOUND-LICENSE.txt"] = strToU8(await attribution.text());
  files["ENCODER-LICENSE.txt"] = strToU8("Encoded with lamejs1.2.1 (LGPL-3.0), https://github.com/zhuker/lamejs, https://lame.sourceforge.io/. No reverb. 44.1kHz mono128kbps. Piano: FluidR3 GM / Frank Wen, MIDI.js rendering Benjamin Gleitzman, CC BY3.0.\n");
  signal.throwIfAborted(); return zipSync(files, { level: 0 });
}
