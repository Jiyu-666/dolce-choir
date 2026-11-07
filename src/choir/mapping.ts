import type { Chord, Measure, ScoreDoc } from "../model/doc";
import { SIMPLE_DIVISIONS } from "../model/doc";
import { assignDegrees } from "../model/jianpu";

export const ROLES = ["S", "A", "T", "B"] as const;
export type ChoirRole = typeof ROLES[number];
export interface Lane { partId: string; staff: number; voice: number }
export interface NoteChoice { measure: number; entry: number; signature: string; noteIndex: number }
export interface RoleBinding extends Lane {
  role: ChoirRole;
  name: string;
  confirmed: boolean;
  notes?: NoteChoice[];
  /** Explicit permission to share the same source note with another role. */
  allowUnison?: boolean;
}
export interface ChoirMapping { version: 1; revision: string; bindings: RoleBinding[] }
export interface MappingIssue {
  code: "revision" | "roles" | "missing-lane" | "unconfirmed" | "polyphony" | "choice" | "overlap" | "duplicate" | "mark" | "unsupported" | "unassigned";
  role?: ChoirRole;
  measure?: number;
  entry?: number;
}
export interface SourceLink {
  role: ChoirRole; derivedId: number; sourceId: number; noteIndex: number;
  measure: number; entry: number; signature: string; revision: string;
}
export interface ChoirProjection { doc: ScoreDoc | null; issues: MappingIssue[]; links: SourceLink[] }

export function enumerateLanes(doc: ScoreDoc): Lane[] {
  const found = new Map<string, Lane>();
  for (const p of doc.songs[0]?.parts ?? []) for (const m of p.measures) for (const e of m.elements) {
    if (e.kind !== "chord") continue;
    const lane = { partId: p.id, staff: e.staff, voice: e.voice };
    found.set(JSON.stringify(lane), lane);
  }
  return [...found.values()];
}

/** Content check for a structural locator, deliberately independent of parser-assigned IDs. */
export function chordSignature(c: Chord): string {
  return JSON.stringify([c.voice, c.staff, c.onset ?? null, c.duration, c.rest ?? null,
    c.notes.map(n => [n.pitch ?? null, n.degree ?? null, n.tie ?? null])]);
}

function positions(m: Measure): number[] {
  const ends = new Map<number, number>();
  return m.elements.map(e => {
    const at = e.onset ?? ends.get(e.voice) ?? 0;
    ends.set(e.voice, at + (e.kind === "chord" && e.grace ? 0 : e.duration?.divisions ?? 0));
    return at;
  });
}

/** Fail-closed projection. Invalid mappings never produce a publishable ScoreDoc. */
export function projectChoir(source: ScoreDoc, mapping: ChoirMapping, revision: string): ChoirProjection {
  const issues: MappingIssue[] = [], links: SourceLink[] = [];
  if (mapping.revision !== revision) issues.push({ code: "revision" });
  if (mapping.version !== 1 || mapping.bindings.length !== 4 || ROLES.some(r => mapping.bindings.filter(b => b.role === r).length !== 1)) {
    return { doc: null, issues: [...issues, { code: "roles" }], links };
  }
  const song = source.songs[0];
  if (!song || source.songs.length !== 1 || source.sourceFormat !== "musicxml") {
    return { doc: null, issues: [...issues, { code: "unsupported" }], links };
  }
  // ScoreDoc's semantic data is plain data. XML layout side tables intentionally do not carry over.
  const doc: ScoreDoc = structuredClone(source);
  const out = doc.songs[0];
  out.parts = []; out.marks = []; delete out.partGroups;
  let nextId = 1;
  const owners = new Map<string, RoleBinding>();
  const mapByRole = new Map<ChoirRole, Map<number, { id: number; noteIndex: number }>>();
  for (const role of ROLES) {
    const binding = mapping.bindings.find(b => b.role === role)!;
    if (!binding.confirmed) issues.push({ code: "unconfirmed", role });
    const original = song.parts.find(p => p.id === binding.partId);
    if (!original || !enumerateLanes(source).some(l => l.partId === binding.partId && l.staff === binding.staff && l.voice === binding.voice)) {
      issues.push({ code: "missing-lane", role }); continue;
    }
    const part = structuredClone(original);
    part.id = `choir-${role}`; part.name = binding.name; part.abbrev = role;
    delete part.staffOf; part.staffCount = 1;
    for (const choice of binding.notes ?? []) {
      const c = original.measures[choice.measure]?.elements[choice.entry];
      if (!c || c.kind !== "chord" || c.staff !== binding.staff || c.voice !== binding.voice ||
          c.rest || choice.signature !== chordSignature(c) || !Number.isInteger(choice.noteIndex) || !c.notes[choice.noteIndex] ||
          binding.notes!.filter(n => n.measure === choice.measure && n.entry === choice.entry).length !== 1) {
        issues.push({ code: "choice", role, measure: choice.measure, entry: choice.entry });
      }
    }
    const idMap = new Map<number, { id: number; noteIndex: number }>();
    mapByRole.set(role, idMap);
    let divisions = SIMPLE_DIVISIONS;
    let time = song.time ?? { beats: 4, beatType: 4 };
    part.measures = original.measures.map((m, mi) => {
      if (m.attrs?.divisions) divisions = m.attrs.divisions;
      if (m.attrs?.time) time = m.attrs.time;
      const nm = structuredClone(m), starts = positions(m);
      nm.elements = [];
      nm.duration = Math.max(m.duration ?? 0, ...m.elements.map((e, i) => starts[i] + (e.kind === "chord" && e.grace ? 0 : e.duration?.divisions ?? 0)));
      const attrs = (a: NonNullable<Measure["attrs"]>) => {
        delete a.staves;
        a.clefs = a.clefs?.filter(c => (c.staff ?? 1) === binding.staff).map(c => ({ ...c, staff: 1 }));
      };
      if (nm.attrs) attrs(nm.attrs);
      nm.laterAttrs?.forEach(a => attrs(a.attrs));
      // Resolve direction anchors before filtering notes; divisions remain unchanged.
      nm.directions = (m.directions ?? []).filter(d => (d.staff === undefined || d.staff === binding.staff) && (d.voice === undefined || d.voice === binding.voice)).map(d => {
        const k = d.afterElements ?? 0, prev = k > 0 ? m.elements[k - 1] : undefined;
        const at = d.onset ?? (prev ? starts[k - 1] + (prev.kind === "chord" && prev.grace ? 0 : prev.duration?.divisions ?? 0) : 0);
        return { ...structuredClone(d), staff: 1, voice: 1, onset: at, afterElements: 0 };
      });
      const anchorTime = (after: number | undefined, onset: number | undefined): number => {
        if (onset !== undefined) return onset;
        const k = after ?? 0, prev = k > 0 ? m.elements[k - 1] : undefined;
        return prev ? starts[k - 1] + (prev.kind === "chord" && prev.grace ? 0 : prev.duration?.divisions ?? 0) : 0;
      };
      nm.laterAttrs = nm.laterAttrs?.map(a => ({ ...a, afterElements: 0, onset: anchorTime(a.afterElements, a.onset) }));
      // Middle barlines only have an element-count anchor. Relocate after notes are selected below.
      let end = 0;
      m.elements.forEach((e, ei) => {
        if (e.staff !== binding.staff || e.voice !== binding.voice) return;
        if (e.kind !== "chord") { issues.push({ code: "unsupported", role, measure: mi, entry: ei }); return; }
        if (e.sustains?.length) issues.push({ code: "unsupported", role, measure: mi, entry: ei });
        let ni = 0;
        if (!e.rest && e.notes.length !== 1) {
          const choice = binding.notes?.find(n => n.measure === mi && n.entry === ei);
          if (!choice) { issues.push({ code: "polyphony", role, measure: mi, entry: ei }); return; }
          if (choice.signature !== chordSignature(e) || !Number.isInteger(choice.noteIndex) || !e.notes[choice.noteIndex]) {
            issues.push({ code: "choice", role, measure: mi, entry: ei }); return;
          }
          ni = choice.noteIndex;
        }
        const c = structuredClone(e);
        c.id = nextId++; c.srcId = e.id; c.staff = 1; c.voice = 1; c.onset = starts[ei];
        if (!e.rest) {
          if (starts[ei] < end && !e.grace) issues.push({ code: "overlap", role, measure: mi, entry: ei });
          const key = `${original.id}/${mi}/${ei}/${ni}`, owner = owners.get(key);
          if (owner && !(owner.allowUnison && binding.allowUnison)) issues.push({ code: "duplicate", role, measure: mi, entry: ei });
          owners.set(key, binding); c.notes = [c.notes[ni]];
          if (!c.notes[0]?.pitch) issues.push({ code: "unsupported", role, measure: mi, entry: ei });
        }
        if (!e.grace) end = Math.max(end, starts[ei] + e.duration.divisions);
        idMap.set(e.id, { id: c.id, noteIndex: ni });
        links.push({ role, derivedId: c.id, sourceId: e.id, noteIndex: ni, measure: mi, entry: ei, signature: chordSignature(e), revision });
        nm.elements.push(c);
      });
      nm.barlines = nm.barlines?.map(b => {
        if (b.location !== "middle") return b;
        const at = anchorTime(b.afterElements, undefined);
        const after = nm.elements.findIndex(c => (c.onset ?? 0) + (c.kind === "chord" && c.grace ? 0 : c.duration?.divisions ?? 0) === at);
        if (at !== 0 && after < 0) issues.push({ code: "unsupported", role, measure: mi });
        return { ...b, afterElements: at === 0 ? 0 : after + 1 };
      });
      if (!nm.elements.length) {
        const duration = nm.duration || divisions * time.beats * 4 / time.beatType;
        nm.elements.push({ kind: "chord", id: nextId++, staff: 1, voice: 1, onset: 0, notes: [], rest: { measure: true }, printObject: false,
          duration: { divisions: duration, type: "whole", dots: 0 } });
      }
      return nm;
    });
    assignDegrees(part, song.key ?? { fifths: 0 });
    out.parts.push(part);
  }
  for (const role of ROLES) {
    const ids = mapByRole.get(role);
    if (!ids) continue;
    for (const mark of song.marks) {
      const a = ids.get(mark.start), b = ids.get(mark.end);
      if (!a && !b) continue;
      if (!a || !b) { issues.push({ code: "mark", role }); continue; }
      const ownsStart = (mark.startNote ?? 0) === a.noteIndex, ownsEnd = (mark.endNote ?? 0) === b.noteIndex;
      if (!ownsStart && !ownsEnd) continue;
      if (!ownsStart || !ownsEnd) {
        issues.push({ code: "mark", role }); continue;
      }
      out.marks.push({ ...structuredClone(mark), start: a.id, end: b.id, startNote: 0, endNote: 0 });
    }
  }
  // Every note in a selected lane must be accounted for. Other instrumental lanes may be excluded.
  for (const p of song.parts) p.measures.forEach((m, mi) => m.elements.forEach((e, ei) => {
    if (e.kind !== "chord" || e.rest || !mapping.bindings.some(b => b.partId === p.id && b.staff === e.staff && b.voice === e.voice)) return;
    e.notes.forEach((_, ni) => { if (!owners.has(`${p.id}/${mi}/${ei}/${ni}`)) issues.push({ code: "unassigned", measure: mi, entry: ei }); });
  }));
  // Global play/section references use the first selected role containing each source anchor.
  const remap = (id: number | undefined): number | undefined => {
    if (id === undefined) return undefined;
    for (const ids of mapByRole.values()) { const e = ids.get(id); if (e) return e.id; }
    issues.push({ code: "unsupported" }); return undefined;
  };
  out.sectionMarks = song.sectionMarks?.map(s => ({ ...s, before: remap(s.before)! }));
  out.playOrder = song.playOrder?.map(p => ({ ...p, fromElement: remap(p.fromElement), toElement: remap(p.toElement), fromAnchor: remap(p.fromAnchor), toAnchor: remap(p.toAnchor) }));
  return { doc: issues.length ? null : doc, issues, links };
}
