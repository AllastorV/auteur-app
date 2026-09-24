import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/**
 * Odak modu — yazarken imlecin bulunduğu blok dışındaki her şey söner.
 *
 * §14: "Yazarken görüş alanında hiçbir şey oynamamalı." Sönme bir OPAKLIK
 * değişimidir, düzen değişimi değil: blokları gizlemek ya da daraltmak satır
 * sonlarını ve sayfa sınırlarını kaydırırdı ve sayfa ≈ dakika sözleşmesi
 * ekranda yalan söylerdi.
 *
 * Eklenti odak modu KAPALIYKEN de koşar ve dekorasyonu her zaman üretir;
 * açma/kapama CSS tarafında (`data-odak`) yapılır. Gerekçe: eklentiyi
 * yeniden yapılandırmak görünümü yeniden kurar, bu da imleci ve kaydırma
 * konumunu düşürür — odak moduna girmenin bedeli yazının yerini kaybetmek
 * olamaz.
 */

const ODAK = new PluginKey<DecorationSet>('senaryo-odak');

/** İmlecin bulunduğu bloğun belge içindeki konumu. Bulunamazsa `null`. */
export function odaklananBlok(state: EditorState): number | null {
  const $bas = state.selection.$head;
  /* Derinlik 1 = `doc`'un doğrudan çocuğu, yani blok. `$head.parent` metin
     düğümünün ebeveyni olduğu için doğrudan kullanılamaz. */
  if ($bas.depth < 1) return null;
  return $bas.before(1);
}

export function odakEklentisi(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: ODAK,
    state: {
      init: (_y, state) => hesapla(state),
      /* Seçim değişimi de yeniden hesaplatır — imleç hareket ettikçe odak onu
         izlemeli. `docChanged` yeterli olsaydı ok tuşuyla gezinirken odak
         eski blokta kalırdı. */
      apply: (tr, eski, _e, yeni) =>
        tr.docChanged || tr.selectionSet ? hesapla(yeni) : eski,
    },
    props: {
      decorations(state) {
        return ODAK.getState(state) ?? DecorationSet.empty;
      },
    },
  });
}

function hesapla(state: EditorState): DecorationSet {
  const konum = odaklananBlok(state);
  if (konum === null) return DecorationSet.empty;
  const dugum = state.doc.nodeAt(konum);
  if (!dugum) return DecorationSet.empty;
  return DecorationSet.create(state.doc, [
    Decoration.node(konum, konum + dugum.nodeSize, { class: 'odakli' }),
  ]);
}

export function odakDurumu(state: EditorState): DecorationSet | undefined {
  return ODAK.getState(state);
}
