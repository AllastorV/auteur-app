import { describe, expect, it } from 'vitest';
import { compositeLayerCanvases } from '../src/render/layer-composite';

function fakeContext() {
  const calls: string[] = [];
  const context = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    drawImage(canvas: { id: string }) {
      calls.push(`${canvas.id}:${this.globalCompositeOperation}:${this.globalAlpha}`);
    },
  };
  return { context: context as unknown as CanvasRenderingContext2D, calls };
}

describe('Katmanlardan PNG bileşimi', () => {
  it('arka planı bir kez, görünen katmanları sırasıyla ve kendi karışımıyla çizer', () => {
    const { context, calls } = fakeContext();
    compositeLayerCanvases(context, { id: 'background' } as any, [
      { canvas: { id: 'lower' } as any, blendMode: 'normal', opacity: 1, visible: true },
      { canvas: { id: 'upper' } as any, blendMode: 'multiply', opacity: 0.4, visible: true },
      { canvas: { id: 'hidden' } as any, blendMode: 'screen', opacity: 1, visible: false },
      { canvas: { id: 'highlight' } as any, blendMode: 'screen', opacity: 1, visible: true },
    ], 320, 180);
    expect(calls).toEqual([
      'save', 'background:source-over:1', 'lower:source-over:1',
      'upper:multiply:0.4', 'highlight:screen:1', 'restore',
    ]);
  });

  it('saydam PNG için arka planı çizmez ve canvas durumunu hata halinde geri kurar', () => {
    const { context, calls } = fakeContext();
    compositeLayerCanvases(context, null, [
      { canvas: { id: 'upper' } as any, blendMode: 'overlay', opacity: 0.7, visible: true },
    ], 320, 180);
    expect(calls).toEqual(['save', 'upper:overlay:0.7', 'restore']);
    const throwing = {
      ...context,
      drawImage() { throw new Error('draw failed'); },
    } as CanvasRenderingContext2D;
    expect(() => compositeLayerCanvases(throwing, null, [
      { canvas: { id: 'upper' } as any, blendMode: 'normal', opacity: 1, visible: true },
    ], 320, 180)).toThrow('draw failed');
    expect(calls.at(-1)).toBe('restore');
  });
});
