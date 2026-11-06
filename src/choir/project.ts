import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { loadScoreDoc } from "../model/fromxml";
import { ROLES, type ChoirMapping } from "./mapping";
import { projectChoir } from "./mapping";

export interface ChoirLayout {
  staffMm: number; jianpuPt: number; layerGapMm: number; groupGapMm: number;
}
export const DEFAULT_CHOIR_LAYOUT: ChoirLayout = { staffMm: 7, jianpuPt: 12, layerGapMm: 2, groupGapMm: 4 };
export interface ChoirProject {
  version: 1;
  sourceXml: string;
  editorSource?: { format: "musicxml" | "abc" | "123" | "jpwabc" | "fanqie" | "jcx" | "jly"; text: string };
  mapping: ChoirMapping;
  layout: ChoirLayout;
  /** Optional original .dolce bytes; never included in a shared practice package. */
  originalOmr?: Uint8Array;
}
export async function sourceRevision(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
export function packChoirProject(project: ChoirProject): Uint8Array {
  const { sourceXml, originalOmr, ...manifest } = project;
  const entries: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(manifest)), "source.musicxml": strToU8(sourceXml),
  };
  if (originalOmr) entries["original.dolce"] = originalOmr;
  return zipSync(entries);
}
export async function unpackChoirProject(bytes: Uint8Array): Promise<ChoirProject> {
  if (bytes.byteLength > 100 * 1024 * 1024) throw new Error("Choir project exceeds 100 MiB");
  let expanded = 0;
  const seen = new Set<string>();
  const files = unzipSync(bytes, { filter(file) {
    if (!["manifest.json", "source.musicxml", "original.dolce"].includes(file.name) || seen.has(file.name)) throw new Error("Invalid choir project entries");
    seen.add(file.name); expanded += file.originalSize;
    if (expanded > 200 * 1024 * 1024) throw new Error("Expanded choir project exceeds 200 MiB");
    return true;
  } });
  if (!files["manifest.json"] || !files["source.musicxml"] || Object.keys(files).some(k => !["manifest.json", "source.musicxml", "original.dolce"].includes(k))) throw new Error("Invalid choir project entries");
  const data = JSON.parse(strFromU8(files["manifest.json"])) as Partial<ChoirProject>;
  if (data.version !== 1 || !data.mapping || !Array.isArray(data.mapping.bindings) || !data.layout) throw new Error("Unsupported choir project");
  const bindings = data.mapping.bindings;
  if (bindings.length !== 4 || ROLES.some(role => bindings.filter(b => b?.role === role).length !== 1) || bindings.some(b =>
    typeof b?.partId !== "string" || typeof b.name !== "string" || b.name.length > 200 || typeof b.confirmed !== "boolean" ||
    !Number.isInteger(b.staff) || b.staff < 1 || !Number.isInteger(b.voice) || b.voice < 1 ||
    (b.allowUnison !== undefined && typeof b.allowUnison !== "boolean") ||
    (b.notes !== undefined && (!Array.isArray(b.notes) || b.notes.some(n => !n || ![n.measure, n.entry, n.noteIndex].every(v => Number.isInteger(v) && v >= 0) || typeof n.signature !== "string")))
  )) throw new Error("Invalid choir mapping schema");
  if (data.editorSource && (!["musicxml", "abc", "123", "jpwabc", "fanqie", "jcx", "jly"].includes(data.editorSource.format) || typeof data.editorSource.text !== "string")) throw new Error("Invalid editor source");
  const l = data.layout;
  if (![l.staffMm, l.jianpuPt, l.layerGapMm, l.groupGapMm].every(v => Number.isFinite(v) && v >= 0) || l.staffMm < 3 || l.staffMm > 15 || l.jianpuPt < 6 || l.jianpuPt > 40 || l.layerGapMm > 30 || l.groupGapMm > 50) throw new Error("Invalid choir layout");
  const sourceXml = strFromU8(files["source.musicxml"]), revision = await sourceRevision(sourceXml);
  // A saved editor project can be unconfirmed, but structural/schema failures cannot be restored.
  if (data.mapping.version !== 1 || data.mapping.revision !== revision) throw new Error("Stale choir project mapping");
  const result = projectChoir(loadScoreDoc(sourceXml), data.mapping, revision);
  if (result.issues.some(i => ["roles", "revision"].includes(i.code))) throw new Error("Invalid choir project mapping");
  return { version: 1, sourceXml, mapping: data.mapping, layout: l, ...(data.editorSource ? { editorSource: data.editorSource } : {}), originalOmr: files["original.dolce"] };
}
