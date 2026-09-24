import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { RevizyonRengi } from '../model/revizyon';

/**
 * REVİZYON İŞARETİ — satır zemini + sağ kenar boşluğunda yıldız.
 *
 * ## Metne GİRMİYOR
 *
 * `numaraEklentisi` ile aynı desen: dekorasyon olarak çiziliyor. Belgede
 * yok, seçilemez, kopyalanan metne karışmaz, kelime sayımına girmez.
 * Metne yazılsaydı işareti kaldırmak bir DÜZENLEME olurdu ve ortak
 * çalışmada her işaret bir çakışma adayı hâline gelirdi.
 *
 * ## Sayfa sayısını DEĞİŞTİRMİYOR
 *
 * Yıldız kenar boşluğunda mutlak konumda, zemin bir arka plan boyası —
 * ikisi de satır genişliğini ve satır sayısını etkilemiyor. Sayfa ≈ dakika
 * sözleşmesi bu işaretlerden bağımsız kalıyor (`numara-eklenti.ts`teki
 * kararın aynısı).
 *
 * ## Neden `docChanged` YETMİYOR
 *
 * İşaretler belgede değil, `revizyonIsaretleri` kökünde yaşıyor. Bir satır
 * işaretlendiğinde ProseMirror belgesi DEĞİŞMİYOR, yani `tr.docChanged`
 * hiç doğru olmuyor ve dekorasyon asla tazelenmezdi. Çağıran, işaret kümesi
 * değiştiğinde `REVIZYON_TAZELE` meta'sıyla boş bir işlem göndermek
 * zorunda; `ScriptEditor` bunu Y haritasını gözleyerek yapıyor, böylece
 * ORTAK ÇALIŞANIN koyduğu işaret de anında görünüyor.
 */

const REVIZYON = new PluginKey<DecorationSet>('senaryo-revizyon');

/** İşaret kümesi değişti — dekorasyonu yeniden hesapla. */
export const REVIZYON_TAZELE = 'revizyon-tazele';

export interface RevizyonGorunumu {
  /** İşaretli blok kimlikleri — YALNIZ etkin revizyonunkiler. */
  isaretler: ReadonlySet<string>;
  /** Etkin revizyonun rengi; işaret yoksa da gerekli değil ama zararsız. */
  renk: RevizyonRengi | null;
}

function hesapla(state: EditorState, g: RevizyonGorunumu): DecorationSet {
  if (!g.renk || g.isaretler.size === 0) return DecorationSet.empty;

  const suslemeler: Decoration[] = [];
  state.doc.forEach((dugum, konum) => {
    const id = dugum.attrs.id;
    if (typeof id !== 'string' || !g.isaretler.has(id)) return;
    suslemeler.push(
      Decoration.node(konum, konum + dugum.nodeSize, {
        'data-revizyon': g.renk as string,
      }),
    );
  });
  return DecorationSet.create(state.doc, suslemeler);
}

/**
 * Görünüm `oku()` ile HER hesapta okunuyor; eklenti listesi yeniden
 * kurulmuyor (imleç ve kaydırma düşerdi — `numara-eklenti.ts` ile aynı
 * gerekçe).
 */
export function revizyonEklentisi(oku: () => RevizyonGorunumu): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: REVIZYON,
    state: {
      init: (_y, state) => hesapla(state, oku()),
      apply: (tr, eski, _e, yeni) =>
        tr.docChanged || tr.getMeta(REVIZYON_TAZELE) ? hesapla(yeni, oku()) : eski,
    },
    props: {
      decorations(state) {
        return REVIZYON.getState(state) ?? DecorationSet.empty;
      },
    },
  });
}
