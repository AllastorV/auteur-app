import type { BlendMode } from '../model/types';

const OPERATIONS: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  difference: 'difference',
};

/** Canvas 2D export and CSS preview must use the same layer-level operation. */
export function blendOperation(mode: BlendMode): GlobalCompositeOperation {
  return OPERATIONS[mode] ?? 'source-over';
}

export function blendCss(mode: BlendMode): string {
  return mode === 'normal' ? 'normal' : blendOperation(mode);
}

/** Apply compositing to the finished Konva layer canvas, never its objects. */
export function paintLayerCanvas(canvas: HTMLCanvasElement, mode: BlendMode, opacity: number, visible: boolean): void {
  canvas.style.mixBlendMode = blendCss(mode);
  canvas.style.opacity = String(Math.max(0, Math.min(1, opacity)));
  canvas.style.visibility = visible ? 'visible' : 'hidden';
}

export interface CompositeLayer {
  canvas: CanvasImageSource;
  blendMode: BlendMode;
  opacity: number;
  visible: boolean;
}

/** Stage.toDataURL ignores CSS; flatten finished layer canvases explicitly. */
export function compositeLayerCanvases(
  context: CanvasRenderingContext2D,
  background: CanvasImageSource | null,
  layers: readonly CompositeLayer[],
  width: number,
  height: number,
): void {
  context.save();
  try {
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    if (background) context.drawImage(background, 0, 0, width, height);
    for (const layer of layers) {
      if (!layer.visible) continue;
      context.globalCompositeOperation = blendOperation(layer.blendMode);
      context.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
      context.drawImage(layer.canvas, 0, 0, width, height);
    }
  } finally {
    context.restore();
  }
}
