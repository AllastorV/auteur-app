import type { StrokeObject, Vec2 } from '../model/types';

/**
 * Basınç duyarlı kalem darbesi.
 *
 * Konva `Line` sabit kalınlıkta çizer; basınca göre incelip kalınlaşan bir
 * darbe için darbenin dış hattı çokgen olarak üretilir. Basınç sabitse
 * (fare ile çizim) klasik çizgi yolu kullanılır — daha ucuzdur.
 */

export interface StrokePoint extends Vec2 {
  pressure: number;
}

export function readStrokePoints(points: number[]): StrokePoint[] {
  const out: StrokePoint[] = [];
  if (points.length % 3 === 0) {
    for (let i = 0; i < points.length; i += 3) {
      out.push({ x: points[i], y: points[i + 1], pressure: points[i + 2] });
    }
  } else {
    for (let i = 0; i < points.length; i += 2) {
      out.push({ x: points[i], y: points[i + 1], pressure: 0.5 });
    }
  }
  return out;
}

/** Darbede anlamlı bir basınç değişimi var mı? */
export function hasPressureVariation(points: StrokePoint[], threshold = 0.12): boolean {
  if (points.length < 3) return false;
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (p.pressure < min) min = p.pressure;
    if (p.pressure > max) max = p.pressure;
  }
  return max - min > threshold;
}

/** Basit hareketli ortalama — el titremesini yumuşatır. */
export function smoothPoints(points: StrokePoint[], amount: number): StrokePoint[] {
  if (amount <= 0 || points.length < 3) return points;
  const window = Math.max(1, Math.round(amount * 2));
  const out: StrokePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    let sx = 0;
    let sy = 0;
    let sp = 0;
    let n = 0;
    for (let k = -window; k <= window; k++) {
      const p = points[i + k];
      if (!p) continue;
      sx += p.x;
      sy += p.y;
      sp += p.pressure;
      n++;
    }
    out.push({ x: sx / n, y: sy / n, pressure: sp / n });
  }
  return out;
}

/**
 * Darbenin dış hattını üretir: ileri yönde bir kenar, geri dönüşte diğer kenar.
 * Sonuç `closed` bir Konva `Line` ile doldurulur.
 */
export function strokeOutline(points: StrokePoint[], baseWidth: number): number[] {
  if (points.length < 2) return [];
  const left: Vec2[] = [];
  const right: Vec2[] = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      dx = 1;
      dy = 0;
    } else {
      dx /= len;
      dy /= len;
    }
    // Uçlarda darbeyi sivrilt — kalem kaldırma hissi.
    const taper = Math.min(1, Math.min(i, points.length - 1 - i) / 2 + 0.35);
    const half = (baseWidth * Math.max(0.12, points[i].pressure) * taper) / 2;
    left.push({ x: points[i].x - dy * half, y: points[i].y + dx * half });
    right.push({ x: points[i].x + dy * half, y: points[i].y - dx * half });
  }

  const flat: number[] = [];
  for (const p of left) flat.push(p.x, p.y);
  for (let i = right.length - 1; i >= 0; i--) flat.push(right[i].x, right[i].y);
  return flat;
}

/** Konva `Line` için düz [x,y,...] dizisi. */
export function strokeCenterline(points: StrokePoint[]): number[] {
  const flat: number[] = [];
  for (const p of points) flat.push(p.x, p.y);
  return flat;
}

export interface StrokeGeometry {
  /** true ise `points` kapalı bir çokgendir (fill ile çizilir) */
  filled: boolean;
  points: number[];
}

export function strokeGeometry(obj: Pick<StrokeObject, 'points' | 'width' | 'smoothing' | 'eraser' | 'brush' | 'geometryVersion'>): StrokeGeometry {
  const raw = readStrokePoints(obj.points);
  if (obj.geometryVersion === 2) {
    // Pen/eraser use a crisp constant-width centerline even with stylus data.
    if (!obj.brush || obj.eraser) return { filled: false, points: strokeCenterline(raw) };
    // A mouse reports constant pressure. Sample spacing stands in for speed:
    // nearby (slow) samples make a broader mark; stylus pressure multiplies it.
    const smoothed = smoothPoints(raw, Math.max(0, obj.smoothing));
    const shaped = smoothed.map((point, index) => {
      const prev = raw[Math.max(0, index - 1)];
      const next = raw[Math.min(raw.length - 1, index + 1)];
      const spacing = Math.hypot(next.x - prev.x, next.y - prev.y) / (index === 0 || index === raw.length - 1 ? 1 : 2);
      const speed = Math.min(1, spacing / Math.max(1, obj.width * 2));
      return { ...point, pressure: Math.max(0.12, raw[index].pressure) * 2 * (1.2 - speed * 0.45) };
    });
    return { filled: true, points: strokeOutline(shaped, obj.width) };
  }
  // Legacy documents have no geometryVersion; preserve their previous look.
  // Basınç değişimi ham veriden okunur — yumuşatma kısa darbelerde basınç
  // farkını silebilir ve darbe yanlışlıkla sabit kalınlığa düşerdi.
  const variable = !obj.eraser && hasPressureVariation(raw);
  const points = obj.smoothing > 0 ? smoothPoints(raw, obj.smoothing) : raw;
  if (variable) {
    // Konum yumuşatılır, basınç ham değerinde korunur.
    const merged = points.map((p, i) => ({ ...p, pressure: raw[i].pressure }));
    return { filled: true, points: strokeOutline(merged, obj.width) };
  }
  return { filled: false, points: strokeCenterline(points) };
}
