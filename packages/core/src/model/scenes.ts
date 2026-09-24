/**
 * Sahne türetimi — senaryo bloklarından sahne listesi.
 *
 * Sahne, bloklardan bağımsız bir varlık değildir: blokların taşıdığı
 * `sceneId` üzerinden gruplanan bir görünümdür.
 */

import type { ScriptBlock } from './script';

export interface ScriptScene {
  /** Kalıcı sahne kimliği — bloklardan gelir, burada üretilmez. */
  id: string;
  /** Kullanıcıya görünen sahne numarası. Değişebilir. */
  number: string;
  /** Sahne başlığı metni. Başlıksız açılış bloğu için boş dizedir. */
  heading: string;
  /** Sahnenin blokları, başlık dahil, senaryodaki sırayla. */
  blockIds: string[];
  /** Kaba uzunluk ölçüsü — sahne ritmi grafiğinin girdisi. */
  length: number;
}

/**
 * Blok dizisinden sahne listesi türetir.
 *
 * Sahne kimliği bloklarda zaten yaşar (`ScriptBlock.sceneId`); bu fonksiyon
 * yalnızca gruplar. Kimlik üretmez — üretseydi her türetmede değişir ve
 * panel bağı kopardı.
 */
export function deriveScenes(blocks: ScriptBlock[]): ScriptScene[] {
  const sira: string[] = [];
  const harita = new Map<string, ScriptScene>();

  for (const b of blocks) {
    let sahne = harita.get(b.sceneId);
    if (!sahne) {
      sahne = { id: b.sceneId, number: b.scene, heading: '', blockIds: [], length: 0 };
      harita.set(b.sceneId, sahne);
      sira.push(b.sceneId);
    }
    if (b.type === 'scene' && !sahne.heading) {
      sahne.heading = b.text;
      sahne.number = b.scene;
    }
    sahne.blockIds.push(b.id);
    sahne.length += b.text.length;
  }

  return sira.map((id) => harita.get(id)!);
}
