import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { NumaraAyari } from '../format/senaryo-ayarlari';
import { blokNumaralari } from '../format/senaryo-ayarlari';
import type { ScriptBlock } from '../model/script';

/**
 * SAHNE / DİYALOG NUMARASI — kenar boşluğunda.
 *
 * STARC'ta iki ayrı kutu (`Sahne numarasını göster` solda/sağda +
 * `Diyalog numarasını göster`); burada tek pakette (kullanıcı kararı
 * 2026-08-27).
 *
 * ## Numaralar METNE GİRMİYOR
 *
 * Dekorasyon olarak çiziliyorlar: belgede yoklar, seçilemezler,
 * kopyalanan metne karışmazlar ve kelime sayımına girmezler. Metne
 * yazılsalardı sahne eklendiğinde hepsini yeniden yazmak gerekirdi ve
 * her yeniden yazım ortak çalışmada bir çakışma adayı olurdu.
 *
 * ## Sayfa sayısını DEĞİŞTİRMİYOR
 *
 * Numaralar kenar boşluğunda, mutlak konumda duruyor (CSS); satır
 * genişliğini ve satır sayısını etkilemiyorlar. Sayfa ≈ dakika sözleşmesi
 * bu ayardan bağımsız kalıyor — sayfa sonu sürekliliğinden farkı bu, o
 * gerçek satır ekliyor ve bu yüzden varsayılanı kapalı.
 */

export const NUMARA_TAZELE = 'senaryo-numara-tazele';

const NUMARA = new PluginKey<DecorationSet>('senaryo-numara');

/**
 * Belge düğümlerinden `ScriptBlock` benzeri bir liste çıkarır.
 *
 * `blokNumaralari` saf çekirdekte ve `ScriptBlock` istiyor; editör
 * düğümlerinden yalnız numaralamanın ihtiyaç duyduğu üç alan okunuyor.
 * Tam bir `ScriptBlock` kurmak (fp, sceneId…) burada karşılıksız olurdu.
 */
function bloklariTopla(state: EditorState): { bloklar: ScriptBlock[]; konumlar: number[] } {
  const bloklar: ScriptBlock[] = [];
  const konumlar: number[] = [];
  state.doc.forEach((dugum, ofset) => {
    bloklar.push({
      id: String(dugum.attrs.id ?? ''),
      fp: '',
      type: dugum.attrs.tip,
      text: dugum.textContent,
      scene: String(dugum.attrs.scene ?? ''),
      sceneId: '',
    });
    konumlar.push(ofset);
  });
  return { bloklar, konumlar };
}

function hesapla(state: EditorState, ayar: NumaraAyari): DecorationSet {
  if (ayar.sahne === 'kapali' && !ayar.diyalog) return DecorationSet.empty;
  const { bloklar, konumlar } = bloklariTopla(state);
  const numaralar = blokNumaralari(bloklar, ayar);
  if (numaralar.size === 0) return DecorationSet.empty;

  const suslemeler: Decoration[] = [];
  bloklar.forEach((b, i) => {
    const no = numaralar.get(b.id);
    if (!no) return;
    const konum = konumlar[i];
    const dugum = state.doc.nodeAt(konum);
    if (!dugum) return;
    /* Sahne numarası İKİ kenarda birden olabilir (`ikisi`): sektörde
       revizyon kopyalarında iki yanda da basılır ki sayfa katlandığında
       görünür kalsın. Diyalog numarası her zaman solda. */
    const kenarlar = b.type === 'scene'
      ? (ayar.sahne === 'ikisi' ? ['sol', 'sag'] : [ayar.sahne])
      : ['sol'];
    for (const kenar of kenarlar) {
      suslemeler.push(
        Decoration.node(konum, konum + dugum.nodeSize, {
          [`data-no-${kenar}`]: no,
        }),
      );
    }
  });
  return DecorationSet.create(state.doc, suslemeler);
}

/**
 * Ayar `oku()` ile HER hesapta okunuyor; eklenti listesi yeniden
 * kurulmuyor. Ayar değişimi NUMARA_TAZELE işlemiyle anında görünür.
 */
export function numaraEklentisi(oku: () => NumaraAyari): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: NUMARA,
    state: {
      init: (_y, state) => hesapla(state, oku()),
      /* Belge değişiminde yeniden hesaplanıyor. Seçim değişimi numaraları
         etkilemiyor — orada hesaplamak her ok tuşunda bütün belgeyi
         gezmek olurdu. */
      apply: (tr, eski, _e, yeni) => (tr.docChanged || tr.getMeta(NUMARA_TAZELE) ? hesapla(yeni, oku()) : eski),
    },
    props: {
      decorations(state) {
        return NUMARA.getState(state) ?? DecorationSet.empty;
      },
    },
  });
}
