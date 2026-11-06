import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { loadScoreDoc } from "../model/fromxml";
import type { ChoirMapping } from "./mapping";
import { projectChoir } from "./mapping";

export interface ChoirLayout {
  staffMm: number; jianpuPt: number; layerGapMm: number; groupGapMm: number;
}
export const DEFAULT_CHOIR_LAYOUT: ChoirLayout = { staffMm: 7, jianpuPt: 12, layerGapMm: 2, groupGapMm: 4 };
export interface ChoirProject {
  version: 1;
  sourceXml: string;
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
  const files = unzipSync(bytes);
  if (!files["manifest.json"] || !files["source.musicxml"] || Object.keys(files).some(k => !["manifest.json", "source.musicxml", "original.dolce"].includes(k))) throw new Error("Invalid choir project entries");
  const data = JSON.parse(strFromU8(files["manifest.json"])) as Partial<ChoirProject>;
  if (data.version !== 1 || !data.mapping || !Array.isArray(data.mapping.bindings) || !data.layout) throw new Error("Unsupported choir project");
  const l = data.layout;
  if (![l.staffMm, l.jianpuPt, l.layerGapMm, l.groupGapMm].every(v => Number.isFinite(v) && v >= 0) || l.staffMm < 3 || l.staffMm > 15 || l.jianpuPt < 6 || l.jianpuPt > 40 || l.layerGapMm > 30 || l.groupGapMm > 50) throw new Error("Invalid choir layout");
  const sourceXml = strFromU8(files["source.musicxml"]), revision = await sourceRevision(sourceXml);
  // A saved editor project can be unconfirmed, but structural/schema failures cannot be restored.
  if (data.mapping.version !== 1 || data.mapping.revision !== revision) throw new Error("Stale choir project mapping");
  const result = projectChoir(loadScoreDoc(sourceXml), data.mapping, revision);
  if (result.issues.some(i => ["roles", "missing-lane", "choice", "revision", "unsupported"].includes(i.code))) throw new Error("Invalid choir project mapping");
  return { version: 1, sourceXml, mapping: data.mapping, layout: l, originalOmr: files["original.dolce"] };
}
