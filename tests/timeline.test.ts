import { describe, expect, it } from 'vitest';
import { buildTimeline, totalDuration, formatDuration, segmentAt, timelineSecondsAt, timelineRulerTicks, timelineGapAt } from '@storyboard/core/model/timeline';
import {
  MAX_TRANSFER_BYTES,
  planAnimatic,
  planDuration,
  segmentsByteSize,
} from '@storyboard/core/export/animatic';
import { createPanel } from '@storyboard/core/model/factory';
import type { Panel, TransitionKind } from '@storyboard/core/model/types';

function panel(duration: number, transition: TransitionKind = 'cut', td = 0.5): Panel {
  const p = createPanel();
  p.meta.duration = duration;
  p.transition = transition;
  p.transitionDuration = td;
  return p;
}

describe('Zaman çizelgesi', () => {
  it('kesme geçişinde toplam süre panel sürelerinin toplamıdır', () => {
    const panels = [panel(2), panel(3), panel(1.5)];
    expect(totalDuration(panels)).toBeCloseTo(6.5, 6);
  });

  it('geçiş süreleri toplama eklenir', () => {
    const panels = [panel(2, 'dissolve', 0.5), panel(3, 'wipe', 1), panel(1)];
    // 2 + 0.5 + 3 + 1 + 1 = 7.5 (son panel cut olduğu için geçiş yok)
    expect(totalDuration(panels)).toBeCloseTo(7.5, 6);
  });

  it('son paneldeki fadeOut süreye dahil edilir', () => {
    const panels = [panel(2), panel(3, 'fadeOut', 1)];
    expect(totalDuration(panels)).toBeCloseTo(6, 6);
  });

  it('son paneldeki dissolve yok sayılır (birleşecek panel yok)', () => {
    const panels = [panel(2), panel(3, 'dissolve', 1)];
    expect(totalDuration(panels)).toBeCloseTo(5, 6);
  });

  it('segment başlangıçları ardışıktır', () => {
    const segments = buildTimeline([panel(2, 'dissolve', 0.5), panel(3), panel(1)]);
    expect(segments[0].start).toBe(0);
    expect(segments[1].start).toBeCloseTo(2.5, 6);
    expect(segments[2].start).toBeCloseTo(5.5, 6);
  });

  it('süre biçimlendirmesi mm:ss.cc', () => {
    expect(formatDuration(65.25)).toBe('01:05.25');
  });
});

describe('Animatik kare planı', () => {
  for (const fps of [24, 25, 30] as const) {
    it(`${fps} fps: plan süresi zaman çizelgesiyle ±100 ms içinde eşleşir`, () => {
      const panels = [
        panel(2.4, 'dissolve', 0.42),
        panel(1.1, 'wipe', 0.333),
        panel(3.7, 'fadeIn', 0.9),
        panel(0.5, 'cut'),
        panel(2, 'fadeOut', 1.25),
      ];
      const expected = totalDuration(panels);
      const plan = planAnimatic(panels, fps);
      const actual = planDuration(plan);
      expect(Math.abs(actual - expected)).toBeLessThan(0.1);
    });
  }

  it('100 panellik projede de süre korunur', () => {
    const panels = Array.from({ length: 100 }, (_, i) =>
      panel(1 + (i % 5) * 0.37, i % 3 === 0 ? 'dissolve' : 'cut', 0.4),
    );
    const expected = totalDuration(panels);
    const actual = planDuration(planAnimatic(panels, 24));
    expect(Math.abs(actual - expected)).toBeLessThan(0.1);
  });

  it('her geçiş için en az bir kare üretir', () => {
    const plan = planAnimatic([panel(1, 'dissolve', 0.01), panel(1)], 24);
    expect(plan.filter((p) => p.kind === 'transition').length).toBeGreaterThanOrEqual(1);
  });
});

describe('Kare aktarım boyutu', () => {
  it('paylaşılan kareyi bir kez sayar', () => {
    const shared = 'data:image/png;base64,' + 'A'.repeat(1000);
    const segments = [
      { dataUrl: shared, duration: 3 },
      { dataUrl: shared, duration: 2 },
      { dataUrl: 'data:image/png;base64,' + 'B'.repeat(500), duration: 1 },
    ];
    expect(segmentsByteSize(segments)).toBe(shared.length + 'data:image/png;base64,'.length + 500);
  });

  it('sınır makul bir üst değerde', () => {
    expect(MAX_TRANSFER_BYTES).toBeGreaterThan(64 * 1024 * 1024);
  });
});

describe('segmentAt sınır durumları', () => {
  it('çizelge başından önceki zaman ilk segmenti verir', () => {
    const panels = [createPanel({ meta: { duration: 2 } }), createPanel({ meta: { duration: 3 } })];
    const segs = buildTimeline(panels);
    expect(segmentAt(segs, -1)?.index).toBe(0);
    expect(segmentAt(segs, 0)?.index).toBe(0);
    expect(segmentAt(segs, 2.5)?.index).toBe(1);
    expect(segmentAt([], 0)).toBeUndefined();
  });
});

describe('Etkileşimli zaman çizelgesi', () => {
  it('kaydırma uzaklığı dahil işaretçi konumunu zamana çevirir ve sınırlar', () => {
    expect(timelineSecondsAt(156, 100, 0, 12, 56)).toBe(1);
    expect(timelineSecondsAt(156, 100, 112, 12, 56)).toBe(3);
    expect(timelineSecondsAt(50, 100, 0, 12, 56)).toBe(0);
    expect(timelineSecondsAt(1000, 100, 0, 12, 56)).toBe(12);
  });

  it('geçiş sınırında etkin paneli aynı zaman noktasından belirler', () => {
    const segs = buildTimeline([panel(2, 'dissolve', 0.5), panel(3)]);
    expect(segmentAt(segs, 2.49)?.index).toBe(0);
    expect(segmentAt(segs, 2.5)?.index).toBe(1);
  });

  it('uzun çizelgede cetvel işaretlerini seyrekleştirir ve sonu gösterir', () => {
    expect(timelineRulerTicks(3)).toEqual([0, 1, 2, 3]);
    const long = timelineRulerTicks(300);
    expect(long[0]).toBe(0);
    expect(long.at(-1)).toBe(300);
    expect(long.length).toBeLessThan(130);
  });

  it('bırakma yerini geçişler dahil panel orta noktalarından bulur', () => {
    const segs = buildTimeline([panel(2, 'dissolve', 0.5), panel(3)]);
    expect(timelineGapAt(segs, 0.1)).toBe(0);
    expect(timelineGapAt(segs, 1.5)).toBe(1);
    expect(timelineGapAt(segs, 2.4)).toBe(1);
    expect(timelineGapAt(segs, 4.5)).toBe(2);
  });
});
