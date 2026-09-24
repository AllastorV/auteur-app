import type { Vec2 } from '../model/types';

/**
 * Basit SVG `d` ayrıştırıcı — kütüphane objelerinin yollarını çokgen
 * dizilerine çevirir. Yalnızca M/L/H/V/A/Z komutları desteklenir; yaylar
 * (a) daire yaklaşımı ile örneklenir. Objeler bu alt küme ile tanımlanmıştır.
 */
export function svgPathToPolylines(d: string, arcSegments = 16): Vec2[][] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const out: Vec2[][] = [];
  let current: Vec2[] = [];
  let cmd = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let i = 0;

  const num = () => parseFloat(tokens[i++]);
  const push = () => current.push({ x, y });
  const flush = () => {
    if (current.length > 1) out.push(current);
    current = [];
  };

  while (i < tokens.length) {
    const token = tokens[i];
    if (/[a-zA-Z]/.test(token)) {
      cmd = token;
      i++;
    }
    switch (cmd) {
      case 'M': flush(); x = num(); y = num(); startX = x; startY = y; push(); cmd = 'L'; break;
      case 'm': flush(); x += num(); y += num(); startX = x; startY = y; push(); cmd = 'l'; break;
      case 'L': x = num(); y = num(); push(); break;
      case 'l': x += num(); y += num(); push(); break;
      case 'H': x = num(); push(); break;
      case 'h': x += num(); push(); break;
      case 'V': y = num(); push(); break;
      case 'v': y += num(); push(); break;
      case 'C': { num(); num(); num(); num(); x = num(); y = num(); push(); break; }
      case 'c': { num(); num(); num(); num(); x += num(); y += num(); push(); break; }
      case 'A': case 'a': {
        const rx = num();
        const ry = num();
        num(); // x-axis-rotation
        num(); // large-arc
        const sweep = num();
        const ex = cmd === 'A' ? num() : x + num();
        const ey = cmd === 'A' ? num() : y + num();
        // Merkezi iki uç noktanın ortasından, dik yönde yarıçapla tahmin et.
        const mx = (x + ex) / 2;
        const my = (y + ey) / 2;
        const a0 = Math.atan2(y - my, x - mx);
        const a1 = Math.atan2(ey - my, ex - mx);
        const dir = sweep ? 1 : -1;
        let sweepAngle = a1 - a0;
        while (sweepAngle * dir < 0) sweepAngle += dir * Math.PI * 2;
        for (let s = 1; s <= arcSegments; s++) {
          const t = a0 + (sweepAngle * s) / arcSegments;
          current.push({ x: mx + Math.cos(t) * rx, y: my + Math.sin(t) * ry });
        }
        x = ex;
        y = ey;
        break;
      }
      case 'Z': case 'z':
        if (current.length) {
          current.push({ x: startX, y: startY });
          flush();
        }
        x = startX;
        y = startY;
        break;
      default:
        i++;
        break;
    }
  }
  flush();
  return out;
}
