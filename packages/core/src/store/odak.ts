import type { Project } from '../model/types';
import { scriptLinkIndex } from '../model/script';

/**
 * §7 — modlar arası ortak bağlam.
 *
 * Modlar bu durumu okur ve yazar; **birbirini tanımaz.** Bugün tanıyorlar:
 * `openPanelForBlock` hem panel seçiyor hem `viewMode`'u `'board'` yapıyor.
 * Odak sistemi bu bağı kesiyor — mod yalnız kendi eksenini yazar, öteki
 * eksenler BELGEDEN türetilir.
 *
 * ## Neden yazan mod ötekileri doldurmuyor
 *
 * Doldursaydı, senaryo modu "bir bloğun hangi panele bağlı olduğunu" bilmek
 * zorunda kalırdı — yani storyboard modunu tanırdı. Eşleme zaten BELGEDE
 * duruyor (`panel.scriptRefs`, `block.sceneId`); onu okumak bir moda başka
 * bir modu tanıtmaz.
 *
 * ## Çözücü UYDURMAZ
 *
 * Bir eksen türetilemiyorsa (bloğa bağlı panel yok, kimlik silinmiş)
 * `undefined` kalır. Rastgele bir panele atlamak, kullanıcıyı bağlamı
 * korunmuş sanarak yanlış yere götürürdü; okuyan mod türetilemeyen eksende
 * KENDİ son seçimini korur.
 */
export interface Odak {
  documentId: string;
  sceneId?: string;
  blockId?: string;
  /** Panel kimliği (storyboard ekseni). */
  boardId?: string;
  entityId?: string;
}

/** Odağı yazarken kullanılan eksen — yalnız BİRİ verilir. */
export type OdakEkseni =
  | { blockId: string }
  | { boardId: string }
  | { sceneId: string }
  | { entityId: string };

/**
 * Eksik eksenleri belgeden türetir.
 *
 * Türetme sırası SABİT ve döngüsüz: blok → sahne, blok → panel,
 * panel → blok, sahne → ilk blok. Her adım yalnız o an bilinenden okur.
 *
 * Bayat kimlikler DOĞRULANIR: silinmiş bir bloğun kimliği odakta kalmışsa
 * ondan panel türetmek, var olmayan bir panele işaret ederdi.
 */
export function odakCoz(odak: Odak, project: Project): Odak {
  const bloklar = project.script.blocks;
  const blokIndeksi = new Map(bloklar.map((b) => [b.id, b] as const));
  const panelVar = new Set(project.panels.map((p) => p.id));

  let blockId = odak.blockId && blokIndeksi.has(odak.blockId) ? odak.blockId : undefined;
  let boardId = odak.boardId && panelVar.has(odak.boardId) ? odak.boardId : undefined;
  let sceneId = odak.sceneId;

  /* Panelden bloğa: panelin İLK geçerli bağı. Panel birden çok satıra
     bağlanabilir; sıra belge sırasıdır, yani deterministik. */
  if (!blockId && boardId) {
    const panel = project.panels.find((p) => p.id === boardId);
    blockId = panel?.scriptRefs?.find((id) => blokIndeksi.has(id));
  }

  /* Sahneden bloğa: sahnenin belgedeki ilk bloğu. */
  if (!blockId && sceneId) {
    blockId = bloklar.find((b) => b.sceneId === sceneId)?.id;
  }

  // Bloktan sahneye — sahne kimliği blokta zaten yaşıyor.
  if (blockId) {
    const b = blokIndeksi.get(blockId);
    if (b?.sceneId) sceneId = b.sceneId;
  }

  /* Bloktan panele: o bloğa bağlı İLK panel, belge sırasında. Ters indeks
     `scriptLinkIndex`'ten geliyor — ikinci bir eşleme kopyası yazmak
     Karar 2 ihlali olurdu. */
  if (!boardId && blockId) {
    const bagli = scriptLinkIndex(project.panels).get(blockId);
    if (bagli?.length) {
      const sira = new Map(project.panels.map((p, i) => [p.id, i] as const));
      boardId = [...bagli].sort((a, b) => (sira.get(a) ?? 0) - (sira.get(b) ?? 0))[0];
    }
  }

  // Sahne kimliği de bayat olabilir: hiçbir blok taşımıyorsa düşer.
  if (sceneId && !bloklar.some((b) => b.sceneId === sceneId)) sceneId = undefined;

  return {
    documentId: odak.documentId,
    ...(sceneId ? { sceneId } : {}),
    ...(blockId ? { blockId } : {}),
    ...(boardId ? { boardId } : {}),
    ...(odak.entityId ? { entityId: odak.entityId } : {}),
  };
}

/**
 * Yeni odak kurar: verilen eksen YAZILIR, ötekiler DÜŞER ve çözücü onları
 * yeniden türetir.
 *
 * Eksenleri biriktirmek öncelik bulmacası doğururdu ("kullanıcı en son
 * hangisini seçti?"). Düşürüp yeniden türetmek o soruyu ortadan kaldırıyor:
 * yazılan eksen her zaman en yenisidir.
 */
export function odakKur(documentId: string, eksen: OdakEkseni, project: Project): Odak {
  return odakCoz({ documentId, ...eksen }, project);
}
