import { loadScoreDoc } from "../model/fromxml";
import { enumerateLanes, chordSignature, projectChoir, ROLES, type ChoirMapping, type RoleBinding } from "./mapping";
import { DEFAULT_CHOIR_LAYOUT, sourceRevision, type ChoirProject } from "./project";

/** One editable source snapshot plus undoable choir-only settings. No audio/render cache lives here. */
export class ChoirSession {
  private history: ChoirProject[] = [];
  private future: ChoirProject[] = [];
  private generation = 0;
  private value: ChoirProject | null = null;
  get project(): ChoirProject | null { return this.value ? structuredClone(this.value) : null; }
  clear(): void { ++this.generation; this.value = null; this.history = []; this.future = []; }
  get canUndo(): boolean { return this.history.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get projection() {
    if (!this.value) return null;
    return projectChoir(loadScoreDoc(this.value.sourceXml), this.value.mapping, this.value.mapping.revision);
  }
  /** Reconcile by source content, never by parser IDs. Async stale completions cannot replace newer input. */
  async sync(xml: string, originalOmr?: Uint8Array): Promise<boolean> {
    const gen = ++this.generation;
    const revision = await sourceRevision(xml);
    if (gen !== this.generation) return false;
    if (revision === this.value?.mapping.revision) return true;
    const doc = loadScoreDoc(xml), previous = this.value;
    const lanes = enumerateLanes(doc);
    const bindings: RoleBinding[] = ROLES.map((role, i) => {
      const prior = previous?.mapping.bindings.find(b => b.role === role);
      const lane = prior ?? lanes[i] ?? { partId: "", staff: 1, voice: 1 };
      const next: RoleBinding = { ...structuredClone(lane), role, name: prior?.name ?? role, confirmed: false };
      if (prior && previous && laneFingerprint(previous.sourceXml, prior) === laneFingerprint(xml, prior)) next.confirmed = prior.confirmed;
      else delete next.notes;
      return next;
    });
    this.value = { version: 1, sourceXml: xml, mapping: { version: 1, revision, bindings }, layout: previous?.layout ?? { ...DEFAULT_CHOIR_LAYOUT }, originalOmr };
    // Old history belongs to another score revision and must never restore stale confirmation.
    this.history = []; this.future = [];
    return true;
  }
  restore(project: ChoirProject): void {
    ++this.generation;
    this.value = structuredClone(project); this.history = []; this.future = [];
  }
  edit(change: (project: ChoirProject) => void): void {
    if (!this.value) return;
    const next = structuredClone(this.value);
    change(next);
    if (JSON.stringify(next) === JSON.stringify(this.value)) return;
    this.history.push(this.value); this.value = next; this.future = [];
  }
  undo(): void {
    const prev = this.history.pop();
    if (prev && this.value) { this.future.push(this.value); this.value = prev; }
  }
  redo(): void {
    const next = this.future.pop();
    if (next && this.value) { this.history.push(this.value); this.value = next; }
  }
}

function laneFingerprint(xml: string, binding: RoleBinding): string {
  const song = loadScoreDoc(xml).songs[0], part = song.parts.find(p => p.id === binding.partId);
  if (!part) return "missing";
  // Global timing/sections also invalidate confirmation; unrelated voice edits do not.
  return JSON.stringify([song.key, song.time, song.tempos, song.tempoBeat, song.playOrder, song.sectionOrder,
    part.measures.map(m => [m.attrs, m.laterAttrs, m.barlines, m.directions, m.elements.flatMap((e, entry) =>
      e.kind === "chord" && e.staff === binding.staff && e.voice === binding.voice ? [[entry, chordSignature(e)]] : [])]),
    // IDs are intentionally replaced by structural positions for cross-element marks.
    song.marks.map(mark => {
      const locate = (id: number) => song.parts.flatMap(p => p.measures.flatMap((m, mi) => m.elements.flatMap((e, ei) => e.id === id ? [[p.id, mi, ei]] : [])))[0];
      return { ...mark, start: locate(mark.start), end: locate(mark.end), source: undefined, openSource: undefined, closeSource: undefined };
    }),
  ]);
}

export function setLane(binding: RoleBinding, lane: { partId: string; staff: number; voice: number }): void {
  Object.assign(binding, lane); binding.confirmed = false; delete binding.notes; delete binding.allowUnison;
}
export function sourceNoteChoices(xml: string, binding: RoleBinding) {
  const part = loadScoreDoc(xml).songs[0]?.parts.find(p => p.id === binding.partId);
  return (part?.measures ?? []).flatMap((m, measure) => m.elements.flatMap((e, entry) =>
    e.kind === "chord" && !e.rest && e.staff === binding.staff && e.voice === binding.voice && e.notes.length > 1
      ? [{ measure, entry, signature: chordSignature(e), notes: e.notes.map(n => n.pitch ? `${n.pitch.step}${n.pitch.alter > 0 ? "♯".repeat(n.pitch.alter) : "♭".repeat(-n.pitch.alter)}${n.pitch.octave}` : "?"), sourceId: e.srcId ?? e.id }]
      : []));
}
export function mappingIsConfirmed(mapping: ChoirMapping): boolean { return mapping.bindings.every(b => b.confirmed); }
