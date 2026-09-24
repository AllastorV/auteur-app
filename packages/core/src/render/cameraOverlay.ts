import type { MovementArrow } from '../data/cameras';

export interface ArrowOverlay {
  /** Konva Arrow için nokta dizileri */
  segments: number[][];
  /** Zoom halkaları: [x, y, r] */
  circles: [number, number, number][];
}

/**
 * Kamera hareketi preset'ini canvas üzerine çizilecek yön okuna çevirir.
 * Koordinatlar overlay çerçevesinin (0,0)-(w,h) alanı içindedir.
 */
export function movementArrowPoints(
  arrow: MovementArrow,
  w: number,
  h: number,
): ArrowOverlay {
  const cx = w / 2;
  const cy = h / 2;
  const mx = w * 0.3;
  const my = h * 0.3;
  const empty: ArrowOverlay = { segments: [], circles: [] };

  switch (arrow) {
    case 'panRight':
    case 'trackRight':
      return { segments: [[cx - mx, cy, cx + mx, cy]], circles: [] };
    case 'panLeft':
    case 'trackLeft':
      return { segments: [[cx + mx, cy, cx - mx, cy]], circles: [] };
    case 'tiltUp':
    case 'craneUp':
      return { segments: [[cx, cy + my, cx, cy - my]], circles: [] };
    case 'tiltDown':
    case 'craneDown':
      return { segments: [[cx, cy - my, cx, cy + my]], circles: [] };
    case 'dollyIn':
      return {
        segments: [
          [cx - mx, cy - my, cx - mx * 0.35, cy - my * 0.35],
          [cx + mx, cy - my, cx + mx * 0.35, cy - my * 0.35],
          [cx - mx, cy + my, cx - mx * 0.35, cy + my * 0.35],
          [cx + mx, cy + my, cx + mx * 0.35, cy + my * 0.35],
        ],
        circles: [],
      };
    case 'dollyOut':
      return {
        segments: [
          [cx - mx * 0.35, cy - my * 0.35, cx - mx, cy - my],
          [cx + mx * 0.35, cy - my * 0.35, cx + mx, cy - my],
          [cx - mx * 0.35, cy + my * 0.35, cx - mx, cy + my],
          [cx + mx * 0.35, cy + my * 0.35, cx + mx, cy + my],
        ],
        circles: [],
      };
    case 'zoomIn':
      return {
        segments: [[cx, cy - my, cx, cy - my * 0.4]],
        circles: [
          [cx, cy, Math.min(w, h) * 0.34],
          [cx, cy, Math.min(w, h) * 0.18],
        ],
      };
    case 'zoomOut':
      return {
        segments: [[cx, cy - my * 0.4, cx, cy - my]],
        circles: [
          [cx, cy, Math.min(w, h) * 0.18],
          [cx, cy, Math.min(w, h) * 0.34],
        ],
      };
    case 'handheld': {
      // Titrek çizgi — elde çekim
      const pts: number[] = [];
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        pts.push(cx - mx + t * mx * 2, cy + Math.sin(t * Math.PI * 4) * h * 0.06);
      }
      return { segments: [pts], circles: [] };
    }
    default:
      return empty;
  }
}
