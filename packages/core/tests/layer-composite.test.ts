import { describe, expect, it } from 'vitest';
import { BLEND_MODES } from '../src/model/types';
import { blendCss, blendOperation, paintLayerCanvas } from '../src/render/layer-composite';

describe('Bütün katman karışım sözleşmesi', () => {
  it.each(BLEND_MODES)('$value CSS ve Canvas çıktısını eşler', ({ value }) => {
    expect(blendOperation(value)).toBe(value === 'normal' ? 'source-over' : value);
    expect(blendCss(value)).toBe(value === 'normal' ? 'normal' : value);
  });

  it('katman opaklığı canvas yüzeyinde bir kez uygulanır', () => {
    const canvas = { style: { mixBlendMode: '', opacity: '', visibility: '' } } as unknown as HTMLCanvasElement;
    paintLayerCanvas(canvas, 'multiply', 0.35, true);
    expect(canvas.style.mixBlendMode).toBe('multiply');
    expect(canvas.style.opacity).toBe('0.35');
    expect(canvas.style.visibility).toBe('visible');
    paintLayerCanvas(canvas, 'screen', 0.8, false);
    expect(canvas.style.mixBlendMode).toBe('screen');
    expect(canvas.style.visibility).toBe('hidden');
  });
});
