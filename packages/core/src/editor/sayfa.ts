import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { useUiStore } from '../store/ui';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import {
  sayaclar as sayaclariHesapla,
  sayfaDolgulari,
  sayfaSinirlari,
  metinSayaclari,
  type Sayaclar,
  type SayfaSiniri,
} from '../format/ekran';
import { sayfala, type Sayfa } from '../format/sayfala';
import type { FormatProfili } from '../format/profil';
import { docToBloklar } from './sema';

/**
 * Editörün sayfa durumu — sayfalar, sınırlar, sayaçlar.
 *
 * Hepsi TEK bir `sayfala` çağrısından türer (Karar 34). Bileşen bu durumu
 * okur; kendi başına sayfa saymaz, DOM ölçmez.
 */
export interface SayfaDurumu {
  sayfalar: Sayfa[];
  sinirlar: SayfaSiniri[];
  sayaclar: Sayaclar;
  /** Sayfa BAŞINDA duran blokların kimlikleri — önlerindeki boş satır düşer. */
  sayfaBasi: Set<string>;
  dekorasyonlar: DecorationSet;
}

const SAYFA = new PluginKey<SayfaDurumu>('senaryo-sayfa');

function hesapla(doc: PMNode, profil: FormatProfili): SayfaDurumu {
  const { bloklar } = docToBloklar(doc);
  /* Sayfa sonu sürekliliği ayarı buradan geçiyor: ekran ve PDF AYNI
     sayfalayıcıyı çağırıyor (Karar 34), yani ayar iki yerde ayrı ayrı
     uygulanmıyor — bir kez burada, bir kez pdf.ts'te, ikisi de aynı
     mağazadan okuyor. */
  const sayfalar = sayfala(bloklar, profil, useUiStore.getState().sayfaSonuSurekliligi);
  const sinirlar = sayfaSinirlari(sayfalar, profil.satirSayisi);
  const dolgular = sayfaDolgulari(sayfalar, profil.satirSayisi);
  /* Yalnız `satirIndex === 0` olan sınır bir bloğu SAYFA BAŞI yapar. Blok
     ortasında biten sayfada blok zaten önceki sayfada başlamıştır; boşluğu
     orada yer kaplamıştır ve düşürülmemelidir. */
  const sayfaBasi = new Set(sinirlar.filter((s) => s.satirIndex === 0).map((s) => s.blockId));

  const dekor: Decoration[] = [];
  if (sayfaBasi.size) {
    doc.forEach((dugum, konum) => {
      const id = dugum.attrs.id;
      if (typeof id === 'string' && sayfaBasi.has(id)) {
        const dolgu = dolgular.get(id);
        dekor.push(Decoration.node(konum, konum + dugum.nodeSize, {
          class: 'sayfa-basi',
          /* Dolgu STİL DEĞİŞKENİ olarak gidiyor, hazır `margin-top` olarak
             değil: hesap CSS'te kalınca satır yüksekliğinin tek kaynağı
             (`--satir`) korunuyor ve px'i burada yeniden türetmek
             gerekmiyor. */
          ...(dolgu ? { style: `--sayfa-dolgu:${dolgu}` } : {}),
        }));
      }
    });
  }

  return {
    sayfalar,
    sinirlar,
    sayaclar: sayaclariHesapla(bloklar, profil, sayfalar),
    sayfaBasi,
    dekorasyonlar: DecorationSet.create(doc, dekor),
  };
}

/**
 * Sayfalama eklentisi.
 *
 * Yeniden hesap YALNIZ `docChanged` işlemde yapılır: imleç hareketi, seçim ve
 * odak değişimi sayfa sayısını değiştirmez ve uzun senaryoda her ok tuşunda
 * tam sayfalama yapmak editörü kilitlerdi.
 *
 * ponytail: hesap tam — değişen bloğun ötesini de sayfalıyor. Artımlı
 * sayfalama (değişen bloktan sonraki sayfaları yeniden kurmak) ölçüm eşiği
 * aşılırsa yapılır; bugün ölçülen maliyet için erken.
 */
export function sayfaEklentisi(profil: FormatProfili): Plugin<SayfaDurumu> {
  return new Plugin<SayfaDurumu>({
    key: SAYFA,
    state: {
      init: (_yapilandirma, state) => hesapla(state.doc, profil),
      apply: (tr, eski) => (tr.docChanged ? hesapla(tr.doc, profil) : eski),
    },
    props: {
      decorations(state) {
        return SAYFA.getState(state)?.dekorasyonlar ?? DecorationSet.empty;
      },
    },
  });
}

export function sayfaDurumu(state: EditorState): SayfaDurumu | undefined {
  return SAYFA.getState(state);
}

/**
 * Seçimin kelime/karakter sayısı (§16.1: `412 kelime · seçili 87`).
 *
 * Boş seçimde `null` — "seçili 0" göstermek, seçim yokken seçim varmış gibi
 * okunur.
 */
export function secimSayaclari(state: EditorState): { kelime: number; karakter: number } | null {
  const { from, to } = state.selection;
  if (from >= to) return null;
  /* Blok arası ayırıcı BOŞLUK olmalı: varsayılan boş dizge iki bloğun son ve
     ilk kelimesini birleştirir ve seçim bir kelime eksik sayılır. */
  return metinSayaclari(state.doc.textBetween(from, to, ' '));
}
