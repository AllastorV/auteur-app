export const PHI = (1 + Math.sqrt(5)) / 2;

interface Point { x: number; y: number }
interface Rect { x: number; y: number; width: number; height: number }
export interface SpiralArc { start: Point; end: Point; radius: number }

/** Golden-rectangle square subdivision fitted wholly inside the frame. */
export function goldenSpiralGeometry(width: number, height: number, turns = 8): {
  rect: Rect;
  arcs: SpiralArc[];
  path: string;
} {
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  const rectWidth = Math.min(safeWidth, safeHeight * PHI);
  const rectHeight = rectWidth / PHI;
  const rect = { x: (safeWidth - rectWidth) / 2, y: (safeHeight - rectHeight) / 2, width: rectWidth, height: rectHeight };
  let { x, y, width: w, height: h } = rect;
  const arcs: SpiralArc[] = [];
  for (let i = 0; i < turns && w > 1e-6 && h > 1e-6; i++) {
    const side = i % 4;
    const size = side % 2 === 0 ? h : w;
    let sx = x;
    let sy = y;
    if (side === 0) { x += size; w -= size; }
    else if (side === 1) { y += size; h -= size; }
    else if (side === 2) { sx = x + w - size; w -= size; }
    else { sy = y + h - size; h -= size; }
    const corners = [
      [{ x: sx, y: sy + size }, { x: sx + size, y: sy }],
      [{ x: sx, y: sy }, { x: sx + size, y: sy + size }],
      [{ x: sx + size, y: sy }, { x: sx, y: sy + size }],
      [{ x: sx + size, y: sy + size }, { x: sx, y: sy }],
    ];
    arcs.push({ start: corners[side][0], end: corners[side][1], radius: size });
  }
  const first = arcs[0];
  const path = first
    ? `M ${first.start.x} ${first.start.y}` + arcs.map((arc) => ` A ${arc.radius} ${arc.radius} 0 0 0 ${arc.end.x} ${arc.end.y}`).join('')
    : '';
  return { rect, arcs, path };
}
