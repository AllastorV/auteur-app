import type { EditorState } from 'prosemirror-state';
import { sozlukAnahtari } from '../dil/sozluk';
import type { ScriptBlockType } from '../model/script';

/**
 * YAZARKEN ÖNERİ — belgede daha önce geçen adları ve başlıkları tamamlar.
 *
 * Kullanıcı isteği (2026-08-26): "projede daha önce yazılmış isim, sahne
 * başlığı varsa imlecin orada dropdown öneri kısmı açılsın, hızlı yazmak
 * için ok tuşlarıyla önerilerde gezilebilsin."
 *
 * ## Kaynak BELGENİN KENDİSİ, sabit bir sözlük değil
 *
 * Senaryoda tekrarlanan iki şey var: karakter adları ve mekânlar. İkisi de
 * yazarın kendi uydurduğu sözcükler — hiçbir sözlükte yoklar. Sabit bir liste
 * bu yüzden işe yaramazdı; öneri ancak yazarın DAHA ÖNCE YAZDIĞINDAN gelirse
 * doğru olur. Bu aynı zamanda tutarlılığı da koruyor: `AYŞE` yazmış biri
 * ikinci sahnede `Ayşe` yazarsa iki ayrı karakter olurdu.
 *
 * ## Öneri TİPE göre
 *
 * Karakter satırında karakter adları, sahne başlığında daha önce geçen sahne
 * başlıkları önerilir. Hepsini her yerde önermek listeyi kullanılamaz kılar
 * ve yanlış öneriyi kabul etmek metni bozar.
 *
 * ## Türkçe katlama
 *
 * Eşleşme `sozlukAnahtari` ile — `İ`/`ı` tuzağı orada zaten çözülmüş ve bu
 * projede TEK ev orası (Karar 2). Kendi katlamamı yazmak, `IŞIK` yazan birine
 * `ışık` önermemek demekti.
 */

/** Önerinin geçerli olduğu blok tipleri ve hangi tipten beslendikleri. */
const ONERI_KAYNAGI: Partial<Record<ScriptBlockType, ScriptBlockType>> = {
  character: 'character',
  scene: 'scene',
  /* Çizgi romanda balon konuşanı da karakter satırından besleniyor. */
  balon: 'character',
};

export interface Oneri {
  metin: string;
  /** Belgede kaç kez geçtiği — sık kullanılan önce gelir. */
  sayi: number;
}

/**
 * İmleçteki blok için öneriler.
 *
 * Boş dizi = öneri yok; çağıran hiçbir şey göstermez. `null` DÖNMÜYOR:
 * "öneri yok" ile "öneri sorulmamalı" arasındaki ayrım çağıranın işi değil,
 * ikisi de aynı şeye varıyor.
 */
export function onerileriBul(
  state: EditorState,
  enCok = 8,
): { oneriler: Oneri[]; onek: string; blokBasi: number } {
  const { from, to } = state.selection;
  if (from !== to) return { oneriler: [], onek: '', blokBasi: -1 };

  let blok: { tip: ScriptBlockType; metin: string; bas: number } | null = null;
  state.doc.forEach((dugum, offset) => {
    if (offset <= from && from <= offset + dugum.nodeSize) {
      blok = { tip: dugum.attrs.tip as ScriptBlockType, metin: dugum.textContent, bas: offset };
    }
  });
  if (!blok) return { oneriler: [], onek: '', blokBasi: -1 };
  const b: { tip: ScriptBlockType; metin: string; bas: number } = blok;

  const kaynakTipi = ONERI_KAYNAGI[b.tip];
  if (!kaynakTipi) return { oneriler: [], onek: '', blokBasi: -1 };

  /* Önek: imlecin SOLUNDA kalan metin. Sağında bir şey varsa kullanıcı
     satırın ortasını düzenliyordur ve oraya tamamlama sokmak yazdığını
     bozardı. */
  const imlecOfseti = from - b.bas - 1;
  if (imlecOfseti < 0 || imlecOfseti < b.metin.length) {
    if (imlecOfseti !== b.metin.length) return { oneriler: [], onek: '', blokBasi: b.bas };
  }
  const onek = b.metin;

  /* Boş satırda öneri YOK: belgedeki bütün adları listelemek bir menü değil
     bir duvar olurdu ve kullanıcı yazmaya başlamadan ne aradığını bilmiyor. */
  if (onek.trim() === '') return { oneriler: [], onek, blokBasi: b.bas };

  const anahtar = sozlukAnahtari(onek);
  const sayaç = new Map<string, number>();
  state.doc.forEach((dugum, offset) => {
    if (dugum.attrs.tip !== kaynakTipi) return;
    /* İmlecin İÇİNDE olduğu blok kaynak DEĞİL: yazılmakta olan yarım
       sözcüğü kendine önermek anlamsız. */
    if (offset === b.bas) return;
    const m = dugum.textContent.trim();
    if (!m) return;
    const a = sozlukAnahtari(m);
    if (!a.startsWith(anahtar)) return;
    /* Tam olarak yazılanı önermek gereksiz: kullanıcı zaten yazmış. */
    if (a === anahtar) return;
    sayaç.set(m, (sayaç.get(m) ?? 0) + 1);
  });

  const oneriler = [...sayaç.entries()]
    .map(([metin, sayi]) => ({ metin, sayi }))
    /* Sık geçen önce; eşitlikte alfabetik ve KARARLI — sıralama her
       tuşta değişirse ok tuşuyla gezinmek imkânsız olur. */
    .sort((x, y) => y.sayi - x.sayi || x.metin.localeCompare(y.metin, 'tr'))
    .slice(0, enCok);

  return { oneriler, onek, blokBasi: b.bas };
}
