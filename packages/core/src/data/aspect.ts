import type { AspectRatioId } from '../model/types';

export interface AspectRatioDef {
  id: AspectRatioId;
  label: string;
  ratio: number;
  note: string;
}

export const ASPECT_RATIOS: AspectRatioDef[] = [
  { id: '2.39:1', label: '2.39:1', ratio: 2.39, note: 'Anamorfik sinemaskop' },
  { id: '1.85:1', label: '1.85:1', ratio: 1.85, note: 'Sinema geniş ekran' },
  { id: '16:9', label: '16:9', ratio: 16 / 9, note: 'HD / dijital standart' },
  { id: '4:3', label: '4:3', ratio: 4 / 3, note: 'Akademi / klasik TV' },
  { id: '1:1', label: '1:1', ratio: 1, note: 'Kare — sosyal medya' },
  { id: '9:16', label: '9:16', ratio: 9 / 16, note: 'Dikey — mobil' },
];

export function aspectRatio(id: AspectRatioId): number {
  return ASPECT_RATIOS.find((a) => a.id === id)?.ratio ?? 16 / 9;
}

/** Panelin iç canvas ölçüsü — 1080p uzun kenar temel alınır. */
export function panelSize(id: AspectRatioId): { width: number; height: number } {
  const r = aspectRatio(id);
  if (r >= 1) return { width: 1920, height: Math.round(1920 / r) };
  return { width: Math.round(1080 * r), height: 1080 };
}

export const EXPORT_RESOLUTIONS = [
  { id: '1080p', label: '1080p (Full HD)', longEdge: 1920 },
  { id: '2k', label: '2K', longEdge: 2560 },
  { id: '4k', label: '4K (UHD)', longEdge: 3840 },
] as const;

export type ExportResolutionId = (typeof EXPORT_RESOLUTIONS)[number]['id'];

export function exportSize(aspect: AspectRatioId, res: ExportResolutionId) {
  const longEdge = EXPORT_RESOLUTIONS.find((r) => r.id === res)?.longEdge ?? 1920;
  const r = aspectRatio(aspect);
  // H.264 çift sayı gerektirir
  const even = (n: number) => Math.round(n / 2) * 2;
  if (r >= 1) return { width: even(longEdge), height: even(longEdge / r) };
  return { width: even(longEdge * r), height: even(longEdge) };
}

/**
 * Bir çerçeveyi hedef tuvale sığdırır (kırpmadan, ortalayarak).
 *
 * Panelin en-boy oranı çıktı oranından farklı olabilir; yalnızca genişliğe
 * göre ölçeklemek içeriğin bir kısmını tuvalin dışında bırakıp sessizce kırpar.
 */
export function fitBox(
  frame: { width: number; height: number },
  target: { width: number; height: number },
): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(target.width / frame.width, target.height / frame.height);
  return {
    scale,
    offsetX: (target.width - frame.width * scale) / 2,
    offsetY: (target.height - frame.height * scale) / 2,
  };
}
