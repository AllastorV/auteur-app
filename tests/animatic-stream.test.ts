import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildAnimatic, planAnimatic, segmentsDuration } from '@storyboard/core/export/animatic';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { totalDuration } from '@storyboard/core/model/timeline';
import type { Panel, Project, TransitionKind } from '@storyboard/core/model/types';

/**
 * Test ortamı `node`; `buildAnimatic` canvas ve Image kullanır.
 * Burada ilgilendiğimiz şey piksel çıktısı değil akış sözleşmesi:
 * hangi kare ne zaman üretiliyor, bellekte ne tutuluyor.
 */
let composited = 0;

function installFakeDom() {
  const ctx = new Proxy(
    {},
    {
      get: () => () => {
        /* tüm çizim çağrıları yok sayılır */
      },
      set: () => true,
    },
  );
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toDataURL: () => `data:image/png;base64,GECIS_${composited++}`,
  };
  (globalThis as any).document = { createElement: () => canvas };
  (globalThis as any).Image = class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  };
}

beforeAll(installFakeDom);
afterAll(() => {
  delete (globalThis as any).document;
  delete (globalThis as any).Image;
});

function panel(duration: number, transition: TransitionKind = 'cut', td = 0.5): Panel {
  const p = createPanel();
  p.meta.duration = duration;
  p.transition = transition;
  p.transitionDuration = td;
  return p;
}

function project(panels: Panel[]): Project {
  return createProject({ panels });
}

describe('Animatik kare akışı', () => {
  it('her kareyi üretildiği sırada aktarır ve bellekte tutmaz', async () => {
    const p = project([panel(1, 'dissolve', 0.5), panel(1, 'cut')]);
    const plan = planAnimatic(p.panels, 24);

    const streamed: { index: number; duration: number; dataUrl: string }[] = [];
    const segments = await buildAnimatic(p, {
      fps: 24,
      width: 32,
      height: 18,
      renderPanel: async (panelArg) => `data:image/png;base64,PANEL_${p.panels.indexOf(panelArg)}`,
      onSegment: (segment, index) => {
        streamed.push({ index, duration: segment.duration, dataUrl: segment.dataUrl });
      },
    });

    // Plandaki her adım için bir kare, sırayla.
    expect(streamed).toHaveLength(plan.length);
    expect(streamed.map((s) => s.index)).toEqual(plan.map((_, i) => i));
    expect(streamed.every((s) => s.dataUrl.length > 0)).toBe(true);

    // Dönen listede yalnızca süre bilgisi kalır — kare verisi bellekte tutulmaz.
    expect(segments).toHaveLength(plan.length);
    expect(segments.every((s) => s.dataUrl === '')).toBe(true);
    expect(segmentsDuration(segments)).toBeCloseTo(totalDuration(p.panels), 6);
  });

  it('kayan pencere her paneli yalnızca bir kez üretir', async () => {
    const p = project([
      panel(1, 'dissolve', 0.5),
      panel(1, 'dissolve', 0.5),
      panel(1, 'dissolve', 0.5),
      panel(1, 'cut'),
    ]);

    const renderCounts = new Map<string, number>();
    await buildAnimatic(p, {
      fps: 24,
      width: 32,
      height: 18,
      renderPanel: async (panelArg) => {
        renderCounts.set(panelArg.id, (renderCounts.get(panelArg.id) ?? 0) + 1);
        return `data:image/png;base64,PANEL_${panelArg.id}`;
      },
      onSegment: () => {},
    });

    expect([...renderCounts.values()]).toEqual([1, 1, 1, 1]);
  });

  it('akış kapalıyken kare verisi listede kalır (eski davranış)', async () => {
    const p = project([panel(1, 'cut'), panel(1, 'cut')]);
    const segments = await buildAnimatic(p, {
      fps: 24,
      width: 32,
      height: 18,
      renderPanel: async () => 'data:image/png;base64,PANEL',
    });
    expect(segments).toHaveLength(2);
    expect(segments.every((s) => s.dataUrl.startsWith('data:image/png'))).toBe(true);
  });

  it('iptal edildiğinde kare üretmeyi bırakır', async () => {
    const p = project([panel(1, 'cut'), panel(1, 'cut'), panel(1, 'cut')]);
    const signal = { cancelled: false };
    let sent = 0;

    const segments = await buildAnimatic(p, {
      fps: 24,
      width: 32,
      height: 18,
      renderPanel: async () => 'data:image/png;base64,PANEL',
      signal,
      onSegment: () => {
        sent++;
        if (sent === 2) signal.cancelled = true;
      },
    });

    expect(segments).toEqual([]);
    expect(sent).toBe(2);
  });

  it('toplam süre zaman çizelgesiyle eşleşir', async () => {
    const p = project([panel(2, 'dissolve', 0.5), panel(1.5, 'cut'), panel(0.75, 'fadeOut', 0.5)]);
    const segments = await buildAnimatic(p, {
      fps: 24,
      width: 32,
      height: 18,
      renderPanel: async () => 'data:image/png;base64,PANEL',
      onSegment: () => {},
    });
    expect(segmentsDuration(segments)).toBeCloseTo(totalDuration(p.panels), 6);
  });
});
