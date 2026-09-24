import type { EditorView } from 'prosemirror-view';
import { TextSelection, type Command } from 'prosemirror-state';

/**
 * Açık senaryo editörünün görünümü — kabuğun ona ulaşabildiği TEK yer.
 *
 * Neden var: blok tipini değiştirmenin tek yazma yolu ProseMirror komutudur
 * (`presetKomutu`), çünkü seçimi yalnız o bilir. Araç çubuğu ise editörün
 * dışında yaşıyor. İkinci bir yazma yolu (Yjs attribute'una doğrudan yazmak)
 * açılsaydı aynı kural iki evde yaşardı ve biri `elleSabit` işaretini
 * koymayı unuttuğunda hata sessiz olurdu: tip değişir, algılama bir sonraki
 * tuşta geri alır, kullanıcı "liste çalışmıyor" derdi (Karar 2).
 *
 * Kapsam dar tutuldu: yalnız `komutCalistir`. Görünümün kendisi dışarı
 * verilmiyor ki kabuk ProseMirror'ın iç durumuna bağlanmasın.
 */
let acikGorunum: EditorView | null = null;

export function gorunumuBagla(view: EditorView | null): void {
  acikGorunum = view;
}

/**
 * Komutu açık editörde çalıştırır. Editör yoksa (pano görünümü, iki sütunlu
 * belge) SESSİZCE `false` döner — kabuk her modda çizilir ve orada editör
 * olmaması bir hata değildir.
 */
export function komutCalistir(komut: Command): boolean {
  const view = acikGorunum;
  if (!view) return false;
  const sonuc = komut(view.state, view.dispatch, view);
  /* Odak geri veriliyor: kullanıcı listeden seçtikten sonra yazmaya devam
     edebilmeli, fareyle editöre geri tıklamak zorunda kalmamalı. */
  if (sonuc) view.focus();
  return sonuc;
}

/** Harici gezinme: belgeye dokunmadan imleci ve görünür alanı taşır. */
export function senaryoBlogunaGit(blockId: string): boolean {
  return komutCalistir((state, dispatch, view) => {
    let hedef: number | undefined;
    state.doc.forEach((node, pos) => { if (node.attrs.id === blockId) hedef = pos + 1; });
    if (hedef === undefined) return false;
    view?.focus();
    dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, hedef)).scrollIntoView());
    return true;
  });
}
