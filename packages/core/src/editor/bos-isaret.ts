import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/**
 * BOŞ BLOĞU İŞARETLE — yer tutucu yazısı için.
 *
 * Kullanıcı bildirimi (2026-08-26): "presetler seçilince hangisi seçildiği
 * anlaşılmıyor; preset seçimine göre imlecin orada placeholder bir yazı
 * olabilir, anlaşılması kolaylaşır."
 *
 * Haklı: senaryoda blok tipini ayırt eden şey GİRİNTİ ve versal; boş bir
 * satırda ikisi de görünmez. Kullanıcı Ctrl+3'e basıyor, hiçbir şey
 * değişmiyor GİBİ görünüyor.
 *
 * Neden dekorasyon, `toDOM` değil: ProseMirror bir düğümün içeriği
 * değiştiğinde `toDOM`'u yeniden çalıştırmayabilir, çocukları yamalar. O
 * yüzden "boş mu" sorusu her durum değişiminde YENİDEN hesaplanmalı;
 * dekorasyon tam olarak bunu yapıyor.
 *
 * Yazının kendisi CSS'te (`content: attr(...)` ile blok tipinden): metin
 * ekrana ait, belgeye DEĞİL — dekorasyon belgeye yazmıyor, PDF'e ve dışa
 * aktarıma hiç ulaşmıyor.
 */
const BOS_ISARET = new PluginKey('senaryo-bos-isaret');

export function bosIsaretEklentisi(): Plugin {
  return new Plugin({
    key: BOS_ISARET,
    props: {
      decorations(state) {
        /* YALNIZ İMLECİN BULUNDUĞU boş blok işaretleniyor.
           İlk yazışımda BÜTÜN boş bloklar işaretleniyordu ve kullanıcı bunu
           gerçek pencerede gördü: "placeholderlar fazla, projede onlarca
           çıkıyor, imlecin orada tek bir tane yeter." Haklı — yer tutucunun
           işi kullanıcıya ŞU AN hangi presette yazdığını söylemek; başka
           satırlardaki kopyaları sayfayı okunmaz kılıyor. */
        const { from, to } = state.selection;
        if (from !== to) return null;
        let sus: Decoration | null = null;
        state.doc.forEach((dugum, offset) => {
          if (dugum.content.size !== 0) return;
          if (offset <= from && from <= offset + dugum.nodeSize) {
            sus = Decoration.node(offset, offset + dugum.nodeSize, { 'data-bos': 'evet' });
          }
        });
        return sus ? DecorationSet.create(state.doc, [sus]) : null;
      },
    },
  });
}
