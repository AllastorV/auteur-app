import type { Layer } from './types';

/**
 * Varsayılan çizim katmanı.
 *
 * Düzenleme yetkisi olan kullanıcılar en üstteki ANA katmana çizer —
 * işaretleme katmanı yorum içindir ve yanlışlıkla içerik oraya düşmemelidir.
 * Yalnızca yorum yetkisi olan kullanıcılar için işaretleme katmanı seçilir.
 */
export function defaultDrawLayerId(
  layers: Pick<Layer, 'id' | 'kind' | 'locked' | 'visible'>[],
  canEditMain: boolean,
): string {
  const drawable = layers.filter((l) => !l.locked && l.visible);
  if (canEditMain) {
    const main = drawable.filter((l) => l.kind === 'main');
    if (main.length) return main[main.length - 1].id;
  }
  const annotation = drawable.filter((l) => l.kind === 'annotation');
  if (annotation.length) return annotation[annotation.length - 1].id;
  return drawable[drawable.length - 1]?.id ?? layers[0]?.id ?? '';
}

/** Katmanları çizim sırasına göre (alttan üste) sıralar. */
export function sortedLayers<T extends Pick<Layer, 'order'>>(layers: T[]): T[] {
  return [...layers].sort((a, b) => a.order - b.order);
}
