import { zipSync } from "fflate";
import type { ScoreDoc } from "../model/doc";
import { withVisibleParts } from "../model/parts";
import { ScorePainter, type StaffPaintRequest } from "../layout/painter";
import { saveBytes } from "../editor/fileio";
import { svgToBytes } from "../editor/export";
import type { ChoirLayout } from "./project";

/** All choir display/export consumers use this same request; the source remains untouched. */
export function choirPaintRequest(doc: ScoreDoc, layout: ChoirLayout, hidden: ReadonlySet<number> = new Set()): StaffPaintRequest {
  const visible = withVisibleParts(doc, hidden);
  if (!visible.songs[0]?.parts.length) throw new Error("No visible choir part");
  return { view: "mixed", doc: visible, page: { widthPt: 595.276, heightPt: 841.89 }, hideBarNumber: false,
    jianpuParts: visible.songs[0].parts.map((_, i) => i), choirLayout: { ...layout } };
}
export async function exportChoirPng(painter: ScorePainter, name: string): Promise<void> {
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < painter.pageCount; i++) files[`${name}-${i + 1}.png`] = await svgToBytes(painter.renderPage(i), 2);
  if (painter.pageCount === 1) await saveBytes(Object.values(files)[0], `${name}.png`, "image/png");
  else await saveBytes(zipSync(files, { level: 0 }), `${name}-PNG.zip`, "application/zip");
}
export async function exportChoirPdf(painter: ScorePainter, name: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const first = painter.pageSize(0);
  const pdf = new jsPDF({ unit: "pt", format: [first.w, first.h], compress: true });
  for (let i = 0; i < painter.pageCount; i++) {
    const { w, h } = painter.pageSize(i);
    if (i) pdf.addPage([w, h]);
    pdf.addImage(await svgToBytes(painter.renderPage(i), 2), "PNG", 0, 0, w, h, undefined, "FAST");
  }
  await saveBytes(new Uint8Array(pdf.output("arraybuffer")), `${name}.pdf`, "application/pdf");
}
