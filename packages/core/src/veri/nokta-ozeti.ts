import type { ScriptBlock } from '../model/script';
import type { FormatProfili } from '../format/profil';
import { sayfala } from '../format/sayfala';
import { bloklariKarsilastir, sahnelereBol } from '../model/karsilastir';

/**
 * Bir geri dönüş noktası ile mevcut belge arasındaki fark — İNSAN diliyle.
 *
 * Ayrıntılı, blok blok fark zaten var (`KarsilastirDialog` /
 * `model/karsilastir.ts`); burada YENİDEN YAZILMIYOR. Panikteyken açılan bu
 * ekranda tek satırlık bir özet yeter — ayrıntı isteyen "Sürümleri
 * karşılaştır" ekranına gider.
 *
 * Sayfa sayısı DAİMA tek sayfalayıcıdan (`sayfala`) gelir — Karar 34. DOM'dan
 * ölçülmez.
 */
export interface NoktaOzeti {
  sayfaSayisi: number;
  sayfaFarki: number;
  degisenSahneSayisi: number;
  /** "3 sahne, ~2 sayfa fark" gibi tek satırlık özet. */
  metin: string;
}

export function noktaOzetiCikar(
  noktaBloklari: readonly ScriptBlock[],
  mevcutBloklari: readonly ScriptBlock[],
  profil: FormatProfili,
): NoktaOzeti {
  const sayfaSayisi = sayfala(noktaBloklari, profil).length;
  const mevcutSayfaSayisi = sayfala(mevcutBloklari, profil).length;
  const sayfaFarki = Math.abs(mevcutSayfaSayisi - sayfaSayisi);

  const farklar = bloklariKarsilastir(noktaBloklari, mevcutBloklari);
  const degisenSahneSayisi = sahnelereBol(farklar).filter((s) => s.degisti).length;

  const metin =
    degisenSahneSayisi === 0 && sayfaFarki === 0
      ? 'Şu anki hâlinle aynı.'
      : `${degisenSahneSayisi} sahne, ~${sayfaFarki} sayfa fark`;

  return { sayfaSayisi, sayfaFarki, degisenSahneSayisi, metin };
}
