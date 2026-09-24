import { MAP_HEIGHT, MAP_WIDTH } from '../world-map-generator';

interface Edge { ax: number; ay: number; bx: number; by: number; direction: number }
interface Vertex { x: number; y: number }

const vertexKey = (x: number, y: number): number => y * 100000 + x;

/**
 * Traces cell-edge loops in the fixed export frame. A wrapping mask is cut at
 * the picture seam: a landmass there becomes two edge-local SVG paths, never
 * one closing line that crosses the entire image.
 */
function traceMask(mask: Uint8Array, width: number, height: number, wrapX: boolean, coastOnly: boolean): string[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      mask.length !== width * height) throw new Error('Invalid contour mask');
  const edges: Edge[] = [];
  const starts = new Map<number, number[]>();
  const add = (ax: number, ay: number, bx: number, by: number, direction: number) => {
    const index = edges.length;
    edges.push({ ax, ay, bx, by, direction });
    const key = vertexKey(ax, ay);
    const list = starts.get(key) ?? [];
    list.push(index);
    starts.set(key, list);
  };
  const filled = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x] !== 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) add(x, y, x + 1, y, 0);
      if (x === width - 1 ? !(wrapX && coastOnly) : !filled(x + 1, y))
        add(x + 1, y, x + 1, y + 1, 1);
      if (!filled(x, y + 1)) add(x + 1, y + 1, x, y + 1, 2);
      if (x === 0 ? !(wrapX && coastOnly) : !filled(x - 1, y))
        add(x, y + 1, x, y, 3);
    }
  }
  const used = new Uint8Array(edges.length);
  const incoming = new Set(edges.map((edge) => vertexKey(edge.bx, edge.by)));
  const startsFirst = edges.map((_, index) => index).filter((index) =>
    !incoming.has(vertexKey(edges[index].ax, edges[index].ay)));
  const traceOrder = [...startsFirst, ...edges.map((_, index) => index)];
  const paths: string[] = [];
  const px = (x: number) => (x * MAP_WIDTH / width).toFixed(2);
  const py = (y: number) => (y * MAP_HEIGHT / height).toFixed(2);
  for (const index of traceOrder) {
    if (used[index]) continue;
    const first = edges[index];
    const points: Vertex[] = [{ x: first.ax, y: first.ay }];
    let current = index;
    let closed = false;
    for (let step = 0; step <= edges.length; step++) {
      if (used[current]) break;
      used[current] = 1;
      const edge = edges[current];
      points.push({ x: edge.bx, y: edge.by });
      if (edge.bx === first.ax && edge.by === first.ay) { closed = true; break; }
      const candidates = (starts.get(vertexKey(edge.bx, edge.by)) ?? []).filter((next) => !used[next]);
      if (!candidates.length) break;
      const turnOrder = [1, 0, 3, 2];
      candidates.sort((a, b) =>
        turnOrder.indexOf((edges[a].direction - edge.direction + 4) % 4) -
        turnOrder.indexOf((edges[b].direction - edge.direction + 4) % 4));
      current = candidates[0];
    }
    if (points.length < 2) continue;
    if (closed) points.pop();
    // Coast strokes may be rounded; mask fills stay on exact shared cell edges
    // so independently colored neighbours can never leave hairline gaps.
    if (coastOnly && closed && points.length >= 3) {
      const last = points[points.length - 1];
      const start = points[0];
      const commands = [`M ${px((last.x + start.x) / 2)} ${py((last.y + start.y) / 2)}`];
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        commands.push(`Q ${px(a.x)} ${py(a.y)} ${px((a.x + b.x) / 2)} ${py((a.y + b.y) / 2)}`);
      }
      paths.push(`${commands.join(' ')} Z`);
    } else {
      paths.push(points.map((point, i) => `${i === 0 ? 'M' : 'L'} ${px(point.x)} ${py(point.y)}`).join(' ') +
        (closed ? ' Z' : ''));
    }
  }
  return paths;
}

/** Coast strokes omit the artificial frame-edge closure of a wrapping fill. */
export function coastlinePaths(mask: Uint8Array, width: number, height: number, wrapX: boolean): string[] {
  return traceMask(mask, width, height, wrapX, true);
}

/** Closed fill shapes are deliberately cut at the east/west picture seam. */
export function maskPaths(mask: Uint8Array, width: number, height: number, wrapX: boolean): string[] {
  return traceMask(mask, width, height, wrapX, false);
}
