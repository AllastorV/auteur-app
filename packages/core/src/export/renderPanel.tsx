import React from 'react';
import { createRoot } from 'react-dom/client';
import { Layer, Rect, Stage } from 'react-konva';
import type Konva from 'konva';
import type { Panel } from '../model/types';
import { fitBox, panelSize } from '../data/aspect';
import { ObjectNode } from '../components/canvas/ObjectNode';
import { useProjectStore } from '../store/project';
import { compositeLayerCanvases } from '../render/layer-composite';

export interface RenderPanelOptions {
  width: number;
  height: number;
  /** Şeffaf arka plan — panel zemini çizilmez */
  transparent?: boolean;
  /** Çerçeve rehberlerini dahil et (varsayılan: hayır) */
  includeGuides?: boolean;
  /** Görsellerin yüklenmesi için beklenecek ek süre (ms) */
  settleMs?: number;
}

function ExportStage({
  panel,
  width,
  height,
  scale,
  offsetX,
  offsetY,
  transparent,
  onReady,
}: {
  panel: Panel;
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  transparent: boolean;
  onReady: (stage: Konva.Stage) => void;
}) {
  const layers = [...panel.layers].sort((a, b) => a.order - b.order);
  const byLayer = new Map<string, typeof panel.objects>();
  for (const l of layers) byLayer.set(l.id, []);
  for (const o of panel.objects) byLayer.get(o.layerId)?.push(o);
  for (const list of byLayer.values()) list.sort((a, b) => a.z - b.z);

  return (
    <Stage
      width={width}
      height={height}
      scaleX={scale}
      scaleY={scale}
      x={offsetX}
      y={offsetY}
      listening={false}
      ref={(node) => {
        if (node) onReady(node);
      }}
    >
      <Layer listening={false}>
        {!transparent && (
          <Rect
            x={-offsetX / scale}
            y={-offsetY / scale}
            width={width / scale}
            height={height / scale}
            fill={panel.background}
          />
        )}
      </Layer>
      {layers.map((layer) => (
        <Layer key={layer.id} visible={layer.visible} listening={false}>
          {(byLayer.get(layer.id) ?? []).map((obj) => (
            <ObjectNode key={obj.id} object={obj} listening={false} />
          ))}
        </Layer>
      ))}
    </Stage>
  );
}

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Panelde kullanılan gömülü görsellerin kimlikleri. */
function assetIdsOf(panel: Panel): string[] {
  const ids: string[] = [];
  for (const obj of panel.objects) {
    if (obj.kind === 'image' && obj.assetId) ids.push(obj.assetId);
  }
  return ids;
}

/**
 * Panelin görsellerini çözümlenene kadar bekler.
 *
 * Sabit bir bekleme süresi (rAF + birkaç ms) büyük gömülü görsellerde
 * yetmiyor ve çıktıya boş kare olarak düşüyordu.
 */
async function preloadPanelAssets(panel: Panel): Promise<void> {
  const urls = useProjectStore.getState().assetUrls;
  const sources = assetIdsOf(panel)
    .map((id) => urls[id])
    .filter((url): url is string => Boolean(url));
  if (!sources.length) return;

  await Promise.all(
    sources.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          // Yüklenemeyen görsel dışa aktarmayı kilitlemez.
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = src;
          if (img.complete) resolve();
        }),
    ),
  );
}

/**
 * Bir paneli hedef çözünürlükte PNG dataURL'e çevirir.
 *
 * Canvas'ın kendisiyle aynı `ObjectNode` bileşenleri kullanıldığı için
 * dışa aktarılan görüntü ekranda görünenle birebir aynıdır.
 */
export async function renderPanelToDataURL(
  panel: Panel,
  opts: RenderPanelOptions,
): Promise<string> {
  const frame = panelSize(panel.guides.aspect);
  // Panelin kendi en-boy oranı proje oranından farklı olabilir (her panelin
  // kendi çerçeve rehberi vardır). Yalnızca genişliğe göre ölçeklemek, farklı
  // oranlı paneli çıktı tuvalinin dışına taşırıp sessizce kırpar; bu yüzden
  // her iki eksene sığdırılıp ortalanır — içerik kaybı olmaz.
  const { scale, offsetX, offsetY } = fitBox(frame, opts);

  await preloadPanelAssets(panel);

  const container = document.createElement('div');
  container.setAttribute('data-export-stage', panel.id);
  container.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
  document.body.appendChild(container);
  const root = createRoot(container);

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const stage = await new Promise<Konva.Stage>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Export stage did not mount')), 10_000);
      root.render(
        <ExportStage
          panel={panel}
          width={opts.width}
          height={opts.height}
          scale={scale}
          offsetX={offsetX}
          offsetY={offsetY}
          transparent={opts.transparent ?? false}
          onReady={(node) => { clearTimeout(timeout); resolve(node); }}
        />,
      );
    });

    await raf();
    await raf();
    await sleep(opts.settleMs ?? 60);

    const rendered = stage.getLayers();
    const layers = [...panel.layers].sort((a, b) => a.order - b.order);
    if (rendered.length !== layers.length + 1) throw new Error('Export layer count mismatch');
    const output = document.createElement('canvas');
    output.width = opts.width;
    output.height = opts.height;
    const context = output.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable');
    compositeLayerCanvases(
      context,
      opts.transparent ? null : rendered[0].getNativeCanvasElement(),
      layers.map((layer, index) => ({
        canvas: rendered[index + 1].getNativeCanvasElement(),
        blendMode: layer.blendMode,
        opacity: layer.opacity,
        visible: layer.visible,
      })),
      opts.width,
      opts.height,
    );
    return output.toDataURL('image/png');
  } finally {
    if (timeout) clearTimeout(timeout);
    root.unmount();
    container.remove();
  }
}
