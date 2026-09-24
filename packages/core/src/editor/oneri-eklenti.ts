import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { onerileriBul, type Oneri } from './oneri';

/**
 * ÖNERİ AÇILIR LİSTESİ — ok tuşlarıyla gezilen tamamlama.
 *
 * Kullanıcı isteği (2026-08-26): "daha önce yazılmış isim, sahne başlığı
 * varsa imlecin orada dropdown öneri kısmı açılsın, ok tuşlarıyla
 * gezilebilsin."
 *
 * ## Tuşlar EDİTÖRDEN ÖNCE yakalanıyor
 *
 * Liste açıkken `↑ ↓` seçimi gezdiriyor, `Enter`/`Tab` kabul ediyor, `Esc`
 * kapatıyor. Liste KAPALIYKEN hiçbiri yakalanmıyor — yoksa Enter yeni satır
 * açamaz, ok tuşları imleç gezdiremezdi. Bir kısayolun yalnız gerektiğinde
 * var olması, hiç olmamasından da her zaman var olmasından da iyidir.
 *
 * ## Liste BELGEYE yazmıyor
 *
 * Menü DOM'da ayrı bir katmanda duruyor; kabul edilene kadar belgeye hiçbir
 * şey girmiyor. Aksi hâlde öneriyi görüp vazgeçen kullanıcı, geri almak için
 * Ctrl+Z'ye basmak zorunda kalırdı.
 */
export const ONERI = new PluginKey<OneriDurumu>('senaryo-oneri');

export interface OneriDurumu {
  oneriler: Oneri[];
  secili: number;
  onek: string;
  blokBasi: number;
  /** Kullanıcı Esc ile kapattıysa: aynı önekte bir daha açılmaz. */
  kapali: boolean;
}

const BOS: OneriDurumu = { oneriler: [], secili: 0, onek: '', blokBasi: -1, kapali: false };

function durumHesapla(state: EditorState, oncekiKapali: boolean, oncekiOnek: string): OneriDurumu {
  const { oneriler, onek, blokBasi } = onerileriBul(state);
  /* Esc'den sonra önek DEĞİŞENE kadar kapalı kalıyor: kullanıcı "bunu
     istemiyorum" dedi, her tuşta yeniden açmak onu yok saymak olurdu. */
  const kapali = oncekiKapali && onek === oncekiOnek;
  return { oneriler: kapali ? [] : oneriler, secili: 0, onek, blokBasi, kapali };
}

/** Öneriyi belgeye yazar ve imleci sonuna koyar. */
export function oneriyiKabulEt(view: EditorView, oneri: Oneri): boolean {
  const durum = ONERI.getState(view.state);
  if (!durum || durum.blokBasi < 0) return false;
  const bas = durum.blokBasi + 1;
  const son = bas + durum.onek.length;
  const tr = view.state.tr.insertText(oneri.metin, bas, son);
  tr.setSelection(TextSelection.create(tr.doc, bas + oneri.metin.length));
  view.dispatch(tr);
  view.focus();
  return true;
}

export function oneriEklentisi(): Plugin<OneriDurumu> {
  return new Plugin<OneriDurumu>({
    key: ONERI,
    state: {
      init: () => BOS,
      apply(tr, onceki, _eski, yeni) {
        const kapat = tr.getMeta(ONERI) === 'kapat';
        if (kapat) return { ...onceki, oneriler: [], kapali: true };
        const gez = tr.getMeta(ONERI) as { gez: number } | undefined;
        if (gez && onceki.oneriler.length) {
          /* Sarmalıyor: son öğedeyken ↓ başa döner. Uçta takılmak,
             kullanıcıya listenin bittiğini söylemenin en sessiz yolu ve
             klavye gezinmesinde herkes sarmalamayı bekler. */
          const n = onceki.oneriler.length;
          return { ...onceki, secili: (onceki.secili + gez.gez + n) % n };
        }
        if (!tr.docChanged && !tr.selectionSet) return onceki;
        return durumHesapla(yeni, onceki.kapali, onceki.onek);
      },
    },
    props: {
      handleKeyDown(view, olay) {
        const durum = ONERI.getState(view.state);
        /* LİSTE KAPALIYKEN HİÇBİR TUŞ YAKALANMIYOR. Aksi hâlde Enter yeni
           satır açamaz, ok tuşları imleç gezdiremezdi. */
        if (!durum || durum.oneriler.length === 0) return false;

        if (olay.key === 'ArrowDown' || olay.key === 'ArrowUp') {
          view.dispatch(view.state.tr.setMeta(ONERI, { gez: olay.key === 'ArrowDown' ? 1 : -1 }));
          return true;
        }
        /* DEĞİŞTİRİCİLİ Enter BU LİSTENİN İŞİ DEĞİL. Ctrl+Enter sayfa
           başı koyuyor (`sayfa-basi.ts`) ve liste açıkken — yani tam da
           karakter adı yazılan `character` bloğunda — tuş buraya düşüp
           öneriyi kabul ediyordu; kullanıcı sayfa başı isterken ad
           tamamlanıyordu. Gerçek pencerede ölçüldü, birim testleri
           göremezdi: ikisi ayrı eklenti ve yalnız birlikte çalışırken
           çakışıyorlar. */
        if ((olay.key === 'Enter' || olay.key === 'Tab')
            && !olay.ctrlKey && !olay.metaKey && !olay.altKey) {
          const secili = durum.oneriler[durum.secili];
          return secili ? oneriyiKabulEt(view, secili) : false;
        }
        if (olay.key === 'Escape') {
          view.dispatch(view.state.tr.setMeta(ONERI, 'kapat'));
          return true;
        }
        return false;
      },
    },
  });
}
