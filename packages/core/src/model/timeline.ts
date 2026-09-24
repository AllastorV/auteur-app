import type { Panel, Project, TransitionKind } from './types';

/**
 * Zaman çizelgesi hesapları.
 *
 * Kural: bir panelin *tutma süresi* `meta.duration`, ondan sonraki geçişin
 * süresi ise `transitionDuration`. Toplam süre ikisinin toplamıdır.
 * Son panelin geçişi yalnızca `fadeOut` ise süreye eklenir (kararma finali).
 */

export interface TimelineSegment {
  panelId: string;
  index: number;
  /** Panel tutma başlangıcı (sn) */
  start: number;
  /** Panel tutma süresi (sn) */
  hold: number;
  /** Geçiş başlangıcı (sn) */
  transitionStart: number;
  transition: TransitionKind;
  transitionDuration: number;
  /** Segmentin toplam bitişi (geçiş dahil) */
  end: number;
}

export function effectiveTransitionDuration(
  panel: Panel,
  isLast: boolean,
): number {
  if (panel.transition === 'cut') return 0;
  if (isLast && panel.transition !== 'fadeOut') return 0;
  return Math.max(0, panel.transitionDuration);
}

export function buildTimeline(panels: Panel[]): TimelineSegment[] {
  const out: TimelineSegment[] = [];
  let t = 0;
  panels.forEach((panel, i) => {
    const hold = Math.max(0, panel.meta.duration);
    const isLast = i === panels.length - 1;
    const td = effectiveTransitionDuration(panel, isLast);
    out.push({
      panelId: panel.id,
      index: i,
      start: t,
      hold,
      transitionStart: t + hold,
      transition: panel.transition,
      transitionDuration: td,
      end: t + hold + td,
    });
    t += hold + td;
  });
  return out;
}

export function totalDuration(panels: Panel[]): number {
  const segs = buildTimeline(panels);
  return segs.length ? segs[segs.length - 1].end : 0;
}

export function projectDuration(project: Project): number {
  return totalDuration(project.panels);
}

/** Zaman noktasındaki aktif segment. */
export function segmentAt(segments: TimelineSegment[], time: number): TimelineSegment | undefined {
  if (!segments.length) return undefined;
  // Zaman çizelgesinin başından önce ilk segment geçerlidir; son segmente
  // düşmek oynatma kafası geri sarıldığında yanlış paneli gösteriyordu.
  if (time < segments[0].start) return segments[0];
  for (const s of segments) {
    if (time >= s.start && time < s.end) return s;
  }
  return segments[segments.length - 1];
}

/** Scrolled timeline viewport coordinates use the same scale as segments and the playhead. */
export function timelineSecondsAt(clientX: number, trackLeft: number, scrollLeft: number, total: number, pixelsPerSecond: number): number {
  return Math.max(0, Math.min(total, (clientX - trackLeft + scrollLeft) / pixelsPerSecond));
}

export function timelineRulerTicks(total: number): number[] {
  if (total <= 0) return [0];
  const rough = Math.max(1, total / 120);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((n) => n * magnitude).find((n) => n >= rough) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let time = 0; time <= total; time += step) ticks.push(time);
  if (ticks.at(-1) !== total) ticks.push(total);
  return ticks;
}

/** Visible insertion gap before/after the segment under the pointer. */
export function timelineGapAt(segments: TimelineSegment[], time: number): number {
  const index = segments.findIndex((seg) => time < seg.start + (seg.end - seg.start) / 2);
  return index < 0 ? segments.length : index;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const cs = Math.round((total - Math.floor(total)) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** Kare sayısı — dışa aktarma süresinin timeline ile eşleşmesi buna dayanır. */
export function frameCount(seconds: number, fps: number): number {
  return Math.max(1, Math.round(seconds * fps));
}
