import { asset } from "../common/asset";
import type { PerformancePlan } from "./performance";

export const SAMPLE_RATE = 44100;
export const RELEASE = .18;
const ATTACK = .005;
const LEVEL = .45;
export type PianoSamples = ReadonlyMap<number, AudioBuffer>;
let encoded: Promise<Record<string, string>> | undefined;

/** Parse the shipped MIDI.js data object without evaluating script. */
async function sampleData(): Promise<Record<string, string>> {
  if (!encoded) encoded = (async () => {
    const response = await fetch(asset("redist/soundfont/acoustic_grand_piano-mp3.js"));
    if (!response.ok) throw new Error("Piano samples unavailable");
    const text = await response.text(), marker = "MIDI.Soundfont.acoustic_grand_piano = ";
    const start = text.indexOf(marker);
    if (start < 0) throw new Error("Invalid bundled piano");
    const object = text.slice(start + marker.length).trim().replace(/,\s*}$/, "}");
    return JSON.parse(object) as Record<string, string>;
  })().catch(error => { encoded = undefined; throw error; });
  return encoded;
}
const NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
export async function loadPiano(pitches: readonly number[], signal?: AbortSignal): Promise<PianoSamples> {
  const data = await sampleData(), result = new Map<number, AudioBuffer>();
  const decoder = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  for (const pitch of new Set(pitches)) {
    signal?.throwIfAborted();
    const name = `${NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`, url = data[name];
    if (!url?.startsWith("data:audio/mp3;base64,")) throw new Error(`Piano pitch unavailable: ${pitch}`);
    const bin = atob(url.slice(url.indexOf(",") + 1)), bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    result.set(pitch, await decoder.decodeAudioData(bytes.buffer));
  }
  signal?.throwIfAborted();
  return result;
}
export function pianoDuration(plan: PerformancePlan): number {
  return plan.notes.reduce((end, n) => Math.max(end, n.endSeconds + RELEASE), plan.durationSeconds);
}
function envelope(age: number, duration: number): number {
  return Math.max(0, Math.min(1, age / ATTACK, (duration + RELEASE - age) / RELEASE));
}
/** Shared sampled-note scheduler. Offset preserves original sample position and envelope across blocks. */
export function schedulePianoNote(ctx: BaseAudioContext, destination: AudioNode, buffer: AudioBuffer, note: { startSeconds: number; endSeconds: number; velocity: number }, from: number, to: number, timeBase = 0): AudioBufferSourceNode | null {
  const start = Math.max(from, note.startSeconds), end = Math.min(to, note.endSeconds + RELEASE, note.startSeconds + buffer.duration);
  if (end <= start) return null;
  const src = ctx.createBufferSource(), amp = ctx.createGain(); src.buffer = buffer; src.connect(amp); amp.connect(destination);
  const age = start - note.startSeconds, duration = note.endSeconds - note.startSeconds, gain = LEVEL * note.velocity / 127;
  amp.gain.setValueAtTime(envelope(age, duration) * gain, timeBase + start - from);
  if (age < Math.min(ATTACK, duration)) amp.gain.linearRampToValueAtTime(gain * envelope(Math.min(ATTACK, duration), duration), note.startSeconds + Math.min(ATTACK, duration) - from + timeBase);
  if (note.endSeconds > start && note.endSeconds < to) amp.gain.setValueAtTime(gain, note.endSeconds - from + timeBase);
  if (note.endSeconds + RELEASE > start && note.endSeconds + RELEASE <= to) amp.gain.linearRampToValueAtTime(0, note.endSeconds + RELEASE - from + timeBase);
  else if (end > note.endSeconds) amp.gain.linearRampToValueAtTime(envelope(end - note.startSeconds, duration) * gain, end - from + timeBase);
  src.start(timeBase + start - from, age, end - start);
  return src;
}
/** Frame-aligned independent blocks with continuous sample age and release envelopes. */
export async function renderPianoBlock(plan: PerformancePlan, samples: PianoSamples, startFrame: number, frameCount: number): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, frameCount, SAMPLE_RATE);
  const from = startFrame / SAMPLE_RATE, to = (startFrame + frameCount) / SAMPLE_RATE;
  for (const note of plan.notes) {
    if (note.startSeconds >= to || note.endSeconds + RELEASE <= from) continue;
    const buffer = samples.get(note.pitch); if (!buffer) throw new Error("Piano sample missing");
    schedulePianoNote(ctx, ctx.destination, buffer, note, from, to);
  }
  const result = await ctx.startRendering();
  return result.getChannelData(0);
}
