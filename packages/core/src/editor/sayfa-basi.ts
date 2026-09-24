import type { Command } from 'prosemirror-state';
import { dokunulanBloklar } from './preset';

/**
 * ELLE SAYFA BAŞI — Ctrl+Enter (Word'ün "sayfa sonu ekle" tuşu).
 *
 * "SAYFA SONU" DEĞİL "SAYFA BAŞI" olarak modellendi. Word'ün kendi iç modeli
 * de böyle (`pageBreakBefore` bir PARAGRAF özelliğidir), ve seçim doğal
 * sonucu: araya görünmez bir işaret bloğu KOYMUYORUZ. Koysaydık o blok bir
 * kimlik taşırdı, panel bağlarına, sahne gruplamasına, karşılaştırmaya ve
 * revizyon işaretlerine girerdi — hepsi "her blok metindir" varsayımıyla
 * yazılmış yerler. Bayrak olarak taşımak bu sistemlerin hiçbirine
 * dokunmuyor.
 *
 * DEĞİŞTİRME (toggle): dokunulan blokların HEPSİ işaretliyse işaret kalkar,
 * değilse hepsi işaretlenir. Kalın/italik değiştirmeleriyle aynı sözleşme.
 *
 * İLK BLOK ATLANIR. `sayfala` boş sayfada zaten tetiklenmiyor, yani işaret
 * hiçbir şey yapmazdı — ama editörde kesikli çizgi görünürdü. Çalışmayan
 * bir işaret göstermek, hiç göstermemekten kötü.
 */
export const sayfaBasiKomutu: Command = (state, dispatch) => {
  const hedefler = dokunulanBloklar(state).filter((pos) => pos > 0);
  if (!hedefler.length) return false;

  const hepsiIsaretli = hedefler.every((pos) => state.doc.nodeAt(pos)?.attrs.yeniSayfada === '1');
  const yeni = hepsiIsaretli ? '' : '1';

  if (dispatch) {
    const tr = state.tr;
    for (const pos of hedefler) tr.setNodeAttribute(pos, 'yeniSayfada', yeni);
    dispatch(tr);
  }
  return true;
};
