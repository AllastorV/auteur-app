import type { Command, EditorState } from 'prosemirror-state';
import type { ScriptBlockType } from '../model/script';

/**
 * Yazım preseti kısayolları (§16.3) — imleçteki bloğun TİPİNİ değiştirir.
 *
 * Bu kısayollar ProseMirror keymap'inde yaşıyor, `useShortcuts`'ta DEĞİL.
 * Sebep mekanik: genel kısayol kancası `isTypingTarget` ile yazı alanında
 * erken dönüyor — orada tanımlansalardı tam da işe yarayacakları anda,
 * yazarken, ölü tuş olurlardı.
 *
 * SAYI SIRAYA BAĞLI, tipe değil. `DokumanTipi.bloklar` zaten "sıra menü
 * sırasıdır" diyor; numaralar o sırayı takip ediyor. Böylece senaryoda
 * Ctrl+1..6 sektörün alıştığı Sahne/Aksiyon/Karakter/Parantez/Diyalog/Geçiş
 * oluyor, romanda Ctrl+1..3 Bölüm/Paragraf/Diyalog — ikinci bir tablo
 * yazmadan ve tip listesi değişince kısayolların geride kalma ihtimali
 * olmadan (Karar 2).
 *
 * Numara kaynağı `format/profil`'deki `TIP_BLOKLARI` DEĞİL: o tablonun
 * anahtar sırası bugün aynı görünse de ayrı bir bildirim ve stil tablosunun
 * sırası kullanıcıya vaat edilmiş bir sözleşme değil.
 */

/** Ctrl+1..9 — onuncu blok numarasız kalır, `Ctrl+10` diye bir tuş yok. */
export const EN_COK_PRESET_KISAYOLU = 9;

/**
 * Seçimin DOKUNDUĞU blokların belge konumları.
 *
 * BOŞ SEÇİM (imleç) ile ARALIK farklı sorular soruyor ve tek bir kesişim
 * testi ikisini birden doğru yanıtlamıyor.
 *
 * ÖLÇÜLDÜ: yepyeni bir belgede imleç 0 konumunda duruyor (henüz hiç
 * yazılmamış, hiç tıklanmamış) ve `offset < to` koşulu 0 < 0 ile
 * DÜŞÜYORDU — yani kullanıcının gördüğü şey "yeni belgede Ctrl+1..9 hiç
 * çalışmıyor" oluyordu. Kullanıcı bunu gerçek pencerede bildirdi;
 * tarayıcı testlerim önce tıkladığı için yakalamıyordu.
 *
 * Preset kısayolu ve sayfa başı (Ctrl+Enter) AYNI soruyu soruyor; kural
 * tek yerde yaşasın diye burada (Karar 2). İkinci bir kopya, yukarıdaki
 * ölçülmüş `0 <= from <= son` sınırını sessizce kaybetmenin en kolay yolu
 * olurdu.
 */
export function dokunulanBloklar(state: EditorState): number[] {
  const { from, to } = state.selection;
  const imlec = from === to;
  const konumlar: number[] = [];
  state.doc.forEach((dugum, offset) => {
    const son = offset + dugum.nodeSize;
    /* İmleçte: bloğun İÇİNDE ya da sınırında olmak yeter. Aralıkta:
       gerçek kesişim aranıyor, yoksa seçimin bittiği yerdeki komşu blok da
       değişirdi. */
    const kapsar = imlec ? (offset <= from && from <= son) : (son > from && offset < to);
    if (kapsar) konumlar.push(offset);
  });
  return konumlar;
}

/**
 * İmleçteki (ya da seçimdeki TÜM) blokların tipini `tip` yapar.
 *
 * Seçim boyunca uygular çünkü tipi düzeltmenin en sık hâli üç dört satırı
 * birden yanlış tiple yazmış olmak; satır satır dolaşmak zorunda kalmak
 * kısayolun kazandırdığını geri alırdı.
 *
 * Hepsi ZATEN o tipteyse `false` döner: keymap tuşu yutmaz ve boş bir işlem
 * geri-al yığınına girmez.
 */
export function presetKomutu(tip: ScriptBlockType): Command {
  return (state, dispatch) => {
    const hedefler = dokunulanBloklar(state)
      .filter((pos) => state.doc.nodeAt(pos)?.attrs.tip !== tip);
    if (!hedefler.length) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const pos of hedefler) tr.setNodeAttribute(pos, 'tip', tip);
      dispatch(tr);
    }
    return true;
  };
}

/**
 * Doküman tipinin blok sırasından `Mod-1..9` bağlarını üretir.
 *
 * Ctrl+rakam sektör sözleşmesi (Final Draft, Fade In, Story Architect hepsi
 * Cmd/Ctrl+rakam kullanıyor).
 *
 * "Chrome Ctrl+1..9'u sekme değiştirmeye ayırır, sayfaya ulaşmaz" diye bir
 * tavan YAZMIŞTIM — ÖLÇÜLDÜ ve YANLIŞ çıktı: odak bir `contenteditable`
 * içindeyken Chrome tuşu sayfaya veriyor ve e2e Chromium'da kısayol
 * çalışıyor. Bu not, aynı varsayımın bir daha "bilinen kısıt" diye
 * yazılmaması için duruyor.
 */
export function presetKisayollari(
  bloklar: readonly ScriptBlockType[],
): Record<string, Command> {
  const baglar: Record<string, Command> = {};
  bloklar.slice(0, EN_COK_PRESET_KISAYOLU).forEach((tip, i) => {
    baglar[`Mod-${i + 1}`] = presetKomutu(tip);
  });
  return baglar;
}
