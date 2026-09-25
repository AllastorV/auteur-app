import { useCallback } from 'react';
import { useProjectStore, projectActions } from '../store/project';
import { useUiStore } from '../store/ui';
import type { Panel, SBObject } from '../model/types';
import type { DropPayload } from '../components/dnd';
import { getCameraPreset, cameraLabel } from '../data/cameras';
import { getProp } from '../data/props';
import { getTemplate } from '../data/templates';
import { panelSize } from '../data/aspect';
import {
  createCameraOverlay,
  createImage,
  createPolygon,
} from '../model/objects';
import { uid } from '../util/id';
import { svgPathToPolylines } from '../render/svgPath';
import { tf } from '../dil/arayuz';

const IMAGE_TYPES = /^image\/(png|jpeg|jpg|gif|webp|svg\+xml)$/;

/** Dosya sisteminden bırakılan görselleri panele gömer. */
export function useImageDropHandler(panel: Panel, layerId: string) {
  const doc = useProjectStore((s) => s.doc);
  const setAssetUrl = useProjectStore((s) => s.setAssetUrl);

  return useCallback(
    async (files: FileList | File[], at: { x: number; y: number }) => {
      if (!layerId) return;
      const frame = panelSize(panel.guides.aspect);
      let index = 0;
      for (const file of Array.from(files)) {
        if (!IMAGE_TYPES.test(file.type)) continue;
        const dataUrl = await readAsDataUrl(file);
        const size = await imageSize(dataUrl);
        // Görsel panelin en fazla %70'ini kaplayacak şekilde ölçeklenir.
        const k = Math.min(1, (frame.width * 0.7) / size.width, (frame.height * 0.7) / size.height);
        const ext = file.name.match(/\.(png|jpe?g|gif|webp|svg)$/i)?.[1]?.toLowerCase() ?? 'png';
        const assetId = `${uid('img')}.${ext}`;
        setAssetUrl(assetId, dataUrl);

        const obj = createImage(
          { layerId, x: at.x + index * 24, y: at.y + index * 24, name: file.name },
          { assetId, width: size.width * k, height: size.height * k },
        );
        projectActions.addObject(doc, panel.id, obj);
        index++;
      }
    },
    [doc, panel.id, panel.guides.aspect, layerId, setAssetUrl],
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(tf('%s okunamadı.', file.name)));
    reader.readAsDataURL(file);
  });
}

function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 600 });
    img.onerror = () => resolve({ width: 800, height: 600 });
    img.src = dataUrl;
  });
}

/**
 * Kütüphaneden canvas'a sürükle-bırak.
 * Bırakılan öğeyi ilgili sahne objesine çevirir ve aktif panele ekler.
 */
export function useDropHandler(panel: Panel, layerId: string) {
  const doc = useProjectStore((s) => s.doc);

  return useCallback(
    (payload: DropPayload, at: { x: number; y: number }) => {
      if (!layerId) return;
      const frame = panelSize(panel.guides.aspect);
      const ui = useUiStore.getState();

      switch (payload.type) {

        case 'camera': {
          const preset = getCameraPreset(payload.presetId);
          if (!preset) return;
          const w = frame.width * 0.86;
          const h = w / (frame.width / frame.height);
          const obj = createCameraOverlay(
            { layerId, x: frame.width / 2, y: frame.height / 2 },
            {
              presetId: preset.id,
              label: cameraLabel(preset),
              width: w,
              height: h,
              showArrow: preset.category === 'hareket',
            },
          );
          projectActions.addObject(doc, panel.id, obj);
          // Kamera etiketi panel meta verisine otomatik yazılır.
          projectActions.updatePanelMeta(doc, panel.id, { cameraLabel: cameraLabel(preset) });
          projectActions.updatePanelGuides(doc, panel.id, {
            enabled: true,
          });
          useUiStore.setState({ selection: [obj.id], tool: 'select' });
          break;
        }

        case 'prop': {
          const prop = getProp(payload.propId);
          if (!prop) return;
          const polylines = svgPathToPolylines(prop.path);
          const scale = prop.height / 100;
          const objects: SBObject[] = polylines.map((pts, i) =>
            createPolygon(
              { layerId, x: at.x, y: at.y, name: `${prop.name} ${i + 1}` },
              {
                points: pts.flatMap((p) => [
                  (p.x - 50) * scale,
                  (p.y - 50) * scale,
                ]),
                closed: pts.length > 2,
                stroke: ui.strokeColor,
                strokeWidth: Math.max(2, ui.strokeWidth),
                fill: prop.filled ? ui.fillColor : null,
              },
            ),
          );
          if (!objects.length) return;
          projectActions.addObjects(doc, panel.id, objects);
          useUiStore.setState({ selection: objects.map((o) => o.id), tool: 'select' });
          break;
        }

        case 'template': {
          const template = getTemplate(payload.templateId);
          if (!template) return;
          const objects = template.build({ frame, layerId });
          projectActions.addObjects(doc, panel.id, objects);
          if (template.cameraPresetId) {
            const preset = getCameraPreset(template.cameraPresetId);
            if (preset) {
              projectActions.updatePanelMeta(doc, panel.id, { cameraLabel: cameraLabel(preset) });
            }
          }
          useUiStore.setState({ selection: [], tool: 'select' });
          break;
        }
      }
    },
    [doc, panel.id, panel.guides.aspect, layerId],
  );
}
