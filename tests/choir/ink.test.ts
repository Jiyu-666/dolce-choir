import { expect, test } from "vitest";
import { inkBounds } from "../../src/mixed/ink";
import { GraphicLine, Group } from "../../src/pagetree/pageitem";
import { Point } from "../../src/common/geom";

test("choir ink includes nested scaling, translation and stroke extents", () => {
  const root = new Group(), group = new Group(); root.add(group);
  group.matrix.setAffine([2, 0, 0, 3, 10, -20]);
  const line = new GraphicLine(); line.p0 = new Point(0,0); line.p1 = new Point(10,0); line.strokeWidth = 2; group.add(line);
  const b = inkBounds(root);
  expect([b.left,b.top,b.right,b.bottom]).toEqual([8,-23,32,-17]);
});
