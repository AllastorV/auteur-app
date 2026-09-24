import { PDFDocument, rgb } from 'pdf-lib';
import type { Geometri } from '../format/izgara';
import { mm, type GomuluFontlar } from './pdf';

/**
 * Storyboard panel ızgarası PDF'i (§16.2).
 *
 * Senaryo ile AYNI kağıtta ve AYNI yönde (dikey) üretilir. Panelin kendisi
 * 16:9 olsa da sayfayı yatıya çevirmek, "senaryo + arkasında storyboard" tek
 * dosyasını yön değiştiren bir belge yapardı; basılıp ciltlenen bir set
 * evrakında bu kullanışsızdır. Panel kendi oranını koruyarak hücreye
 * sığdırılır — kırpılmaz.
 */

export interface StoryboardKare {
  /** `renderPanelToDataURL` çıktısı (PNG dataURL). */
  dataUrl: string;
  sahne: string;
  cekim: string;
  /** Saniye. */
  sure: number;
  /** Hücrenin altına yazılan tek satırlık not (aksiyon ya da diyalog). */
  not: string;
}

export interface StoryboardSecenekleri {
  geometri: Geometri;
  fontlar: GomuluFontlar;
  /** Varsayılan 2×3 = sayfa başına 6 panel. */
  sutun?: number;
  satir?: number;
}

/** Hücre içi ölçüler (mm). */
const BOSLUK_MM = 6;
const ALT_YAZI_MM = 12;
const PUNTO = 8;
const SATIR_YUKSEK_MM = 3.6;

/**
 * Bir metni verilen mm genişliğine sığacak şekilde kısaltır.
 *
 * Kesme yazı tipi metriğiyle yapılır (ızgarayla değil): storyboard alt yazısı
 * senaryo ızgarasına ait değil, hücreye ait. Taşan not komşu hücrenin üstüne
 * biner ve okunmaz bir sayfa üretir.
 */
function kisalt(metin: string, genislikMm: number, fontlar: GomuluFontlar): string {
  const sigar = (s: string) => fontlar.duz.widthOfTextAtSize(s, PUNTO) <= mm(genislikMm);
  if (sigar(metin)) return metin;
  let kes = metin.length;
  while (kes > 1 && !sigar(metin.slice(0, kes) + '…')) kes--;
  return metin.slice(0, kes) + '…';
}

/**
 * Görseli kutuya sığdırır — oranı KORUYARAK.
 *
 * Yalnız genişliğe göre ölçeklemek, farklı oranlı bir paneli alt yazının
 * üstüne bindirir ve komşu hücreyi ezer; yalnız yüksekliğe göre ölçeklemek
 * geniş paneli hücrenin dışına taşırır. İkisinden KÜÇÜĞÜ alınır.
 */
export function sigdir(
  gorselGen: number,
  gorselYuk: number,
  kutuGen: number,
  kutuYuk: number,
): { gen: number; yuk: number } {
  const olcek = Math.min(kutuGen / gorselGen, kutuYuk / gorselYuk);
  /* Görsel HER İKİ eksende de sıfırsa (bozuk/boş PNG) `olcek` Infinity
     çıkar ve `0 * Infinity` NaN üretir — pdf-lib'e NaN koordinat gider,
     PDF SESSİZCE bozulur. Böyle bir görsel zaten çizilecek bir şey
     taşımıyor: sıfır boyut dönüyor, hücrede iz bırakmıyor. Tek eksen sıfır
     olduğunda `olcek` zaten SONLU kalıyor (diğer eksenin oranı seçilir),
     bu dal ona dokunmuyor. */
  if (!Number.isFinite(olcek)) return { gen: 0, yuk: 0 };
  return { gen: gorselGen * olcek, yuk: gorselYuk * olcek };
}

/**
 * Sayfa sayısını panel sayısından hesaplar.
 *
 * Son sayfa DOLU OLMAK ZORUNDA DEĞİL: `floor` kullanmak yedi panelin son
 * birini sessizce düşürürdü.
 */
export function storyboardSayfaSayisi(panelSayisi: number, basina: number): number {
  return Math.ceil(panelSayisi / basina);
}

/**
 * Storyboard sayfalarını VAR OLAN belgeye ekler, eklenen sayfa sayısını
 * döndürür.
 *
 * Boş panel listesi SIFIR sayfa üretir — "hiç panel yok" durumunda boş bir
 * kağıt basmak, kullanıcıya dosyanın bozuk olduğunu düşündürür. Yalnız
 * storyboard aktarılırken çağıran bu durumu önceden yakalayıp uyarmalıdır.
 */
export async function storyboardCiz(
  belge: PDFDocument,
  kareler: readonly StoryboardKare[],
  secenekler: StoryboardSecenekleri,
): Promise<number> {
  const g = secenekler.geometri;
  const sutun = secenekler.sutun ?? 2;
  const satir = secenekler.satir ?? 3;
  const basina = sutun * satir;
  const sayfaSayisi = storyboardSayfaSayisi(kareler.length, basina);

  const hucreGenislikMm = (g.metinGenislikMm - BOSLUK_MM * (sutun - 1)) / sutun;
  const hucreYukseklikMm = (g.metinYukseklikMm - BOSLUK_MM * (satir - 1)) / satir;
  const gorselYukseklikMm = hucreYukseklikMm - ALT_YAZI_MM;

  for (let s = 0; s < sayfaSayisi; s++) {
    const sayfa = belge.addPage([mm(g.sayfaGenislikMm), mm(g.sayfaYukseklikMm)]);

    for (let i = 0; i < basina; i++) {
      const kare = kareler[s * basina + i];
      /* Son sayfanın boş kalan hücreleri. `continue` ile birebir aynı sonucu
         verir (bir kez bittiyse gerisi de bitmiştir) — bilerek eşdeğer,
         `break` yalnız niyeti daha açık söylüyor. */
      if (!kare) break;
      const sut = i % sutun;
      const sat = Math.floor(i / sutun);

      const solMm = g.solMm + sut * (hucreGenislikMm + BOSLUK_MM);
      /* PDF tabanı ALTTAN ölçer: hücrenin dibi, üst marjın altındaki
         (sat+1). hücrenin altıdır. */
      const dipMm =
        g.sayfaYukseklikMm - g.ustMm - (sat + 1) * hucreYukseklikMm - sat * BOSLUK_MM;

      const png = await belge.embedPng(kare.dataUrl);
      /* Panel kendi oranını korur. Hücreye genişlikten DE yükseklikten DE
         sığdırılır: yalnız genişliğe göre ölçeklemek, farklı oranlı bir paneli
         alt yazının üstüne bindirirdi. */
      const { gen, yuk } = sigdir(
        png.width,
        png.height,
        mm(hucreGenislikMm),
        mm(gorselYukseklikMm),
      );
      sayfa.drawImage(png, {
        x: mm(solMm) + (mm(hucreGenislikMm) - gen) / 2,
        y: mm(dipMm + ALT_YAZI_MM) + (mm(gorselYukseklikMm) - yuk) / 2,
        width: gen,
        height: yuk,
      });
      sayfa.drawRectangle({
        x: mm(solMm),
        y: mm(dipMm + ALT_YAZI_MM),
        width: mm(hucreGenislikMm),
        height: mm(gorselYukseklikMm),
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 0.5,
      });

      const basligi = `${kare.sahne || '—'} / ${kare.cekim || '—'}  ${kare.sure.toFixed(1)} sn`;
      sayfa.drawText(kisalt(basligi, hucreGenislikMm, secenekler.fontlar), {
        x: mm(solMm),
        y: mm(dipMm + ALT_YAZI_MM - SATIR_YUKSEK_MM - 1),
        size: PUNTO,
        font: secenekler.fontlar.duz,
      });
      if (kare.not) {
        sayfa.drawText(kisalt(kare.not, hucreGenislikMm, secenekler.fontlar), {
          x: mm(solMm),
          y: mm(dipMm + ALT_YAZI_MM - 2 * SATIR_YUKSEK_MM - 1),
          size: PUNTO,
          font: secenekler.fontlar.duz,
          color: rgb(0.35, 0.35, 0.35),
        });
      }
    }
  }

  return sayfaSayisi;
}
