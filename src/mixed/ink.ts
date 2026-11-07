import { Rect } from "../common/geom";
import { GraphicLine, GraphicPath, Group, PageItem, SmuflText, TextFrame } from "../pagetree/pageitem";

/** Tight rendered ink, including nested affine transforms; never use Bravura's global em box. */
export function inkBounds(item: PageItem): Rect {
  let b = new Rect();
  if (item instanceof Group) {
    for (const child of item.children) b = b.union(inkBounds(child));
  } else if (item instanceof SmuflText) b = item.bound;
  else if (item instanceof TextFrame) {
    const chars = [...item.text];
    if (item.charXs) chars.forEach((ch, i) => {
      const t = item.font.charBound(ch);
      b = b.union(new Rect(t.left, t.top, t.right, t.bottom).offset(item.charXs![i] ?? 0, 0));
    });
    else { const t = item.font.charBound(item.text); b = new Rect(t.left, t.top, t.right, t.bottom); }
  } else if (item instanceof GraphicPath) {
    b = item.computeTightBounds();
    if (item.stroke) b = b.inset(-item.strokeWidth / 2, -item.strokeWidth / 2);
  } else if (item instanceof GraphicLine) {
    b = new Rect(Math.min(item.p0.x, item.p1.x), Math.min(item.p0.y, item.p1.y), Math.max(item.p0.x, item.p1.x), Math.max(item.p0.y, item.p1.y)).inset(-item.strokeWidth / 2, -item.strokeWidth / 2);
  }
  if (b.isEmpty) return b;
  const m = item.matrix.mat;
  const points = [[b.left, b.top], [b.right, b.top], [b.left, b.bottom], [b.right, b.bottom]].map(([x, y]) => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]]);
  return new Rect(Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1])));
}
