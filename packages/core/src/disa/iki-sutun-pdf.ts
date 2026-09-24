import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Geometri } from '../format/izgara';
import type { ScriptBlockType } from '../model/script';
import { KARAKTER_MM, SATIR_MM } from '../format/izgara';
import { YAZI_MM } from '../format/ekran';
import type { FormatProfili } from '../format/profil';
import {
  IKI_SUTUN,
  sayfalaIkiSutun,
  type CiftGirdi,
  type CiftSayfa,
} from '../format/iki-sutun';
import { MM_PUNTO, fontlariGom, mm, type GomuluFontlar, type PdfYaziTipleri } from './pdf';

/**
 * Fransız yerleşimin PDF çıktısı (§6.6).
 *
 * Sayfa sayısı garantisi tek sütunlu yolla AYNI gerekçeyle yapısaldır:
 * sayfalar doğrudan `sayfalaIkiSutun`'dan geliyor, ikinci bir sayfalama
 * hesabı yok (Karar 34).
 */

/** Bir sütunun sol kenarı (mm) — ızgaradan, ölçüden değil. */
export function sutunSolMm(g: Geometri, sutun: 'sol' | 'sag', b = IKI_SUTUN): number {
  return sutun === 'sol'
    ? g.solMm
    : g.solMm + (b.sol + b.oluk) * KARAKTER_MM;
}

/**
 * Sütunlar arasındaki dikey ayırıcı çizginin yeri — oluğun ORTASI.
 *
 * Çizgi süs değil: iki metin sütununda gözün satır sonunu bulmasını sağlar.
 * Oluğun ortasına konur, yoksa bir sütuna yapışıp o sütunu dar gösterir.
 */
export function ayiracSolMm(g: Geometri, b = IKI_SUTUN): number {
  return g.solMm + (b.sol + b.oluk / 2) * KARAKTER_MM;
}

export interface IkiSutunSecenekleri {
  profil: FormatProfili;
  yaziTipleri: PdfYaziTipleri;
  baslik?: string;
  yazar?: string;
}

export interface IkiSutunCiktisi {
  pdf: Uint8Array;
  /** `sayfalaIkiSutun`'un verdiği sayı. Ayrı bir hesap YOK. */
  sayfaSayisi: number;
}

/** Sayfaları VAR OLAN belgeye ekler, eklenen sayfa sayısını döndürür. */
export function ikiSutunCiz(
  belge: PDFDocument,
  sayfalar: readonly CiftSayfa[],
  opts: {
    profil: FormatProfili;
    fontlar: GomuluFontlar;
    /**
     * Sütunları ayıran dikey çizgi BASILSIN mı — VARSAYILAN HAYIR.
     *
     * Çizgi ekranda yazarken işe yarıyor (hangi hücrede olduğunu gösteriyor)
     * ama teslim edilen sayfada kötü duruyor (kullanıcı kararı 2026-08-29).
     * Ekran ile çıktının ayrıldığı bilinçli bir yer: `YazimSekmesi`'ndeki
     * sayfa rengi kararının aynısı — ekranda yardımcı, kâğıtta yok.
     */
    ortaCizgi?: boolean;
  },
): number {
  const g = opts.profil.geometri;
  const punto = YAZI_MM * MM_PUNTO;
  /* Bölünme PROFİLDEN — ekranla PDF aynı sayıyı görmeli. */
  const b = opts.profil.ikiSutun;
  const solMm = sutunSolMm(g, 'sol', b);
  const sagMm = sutunSolMm(g, 'sag', b);

  /**
   * Satırın yazısı BLOK STİLİNDEN — tek sütunlu yolla AYNI kural.
   *
   * Buradaki üç çizim çağrısı da `fontlar.duz` sabitliyordu: iki sütunlu
   * belgede sahne başlığı ve karakter adı ekranda kalın görünüp PDF'te düz
   * çıkıyordu, presetteki kalınlık da hiç ulaşmıyordu. Kural artık tek
   * yerde (Karar 2) ve tek sütunlu çizicideki satırın birebir eşi.
   */
  const satirFontu = (tip: string) => {
    const stil = opts.profil.bloklar[tip as ScriptBlockType];
    if (stil?.kalin) return opts.fontlar.kalin;
    if (stil?.italik) return opts.fontlar.italik;
    return opts.fontlar.duz;
  };

  for (const s of sayfalar) {
    const sayfa = belge.addPage([mm(g.sayfaGenislikMm), mm(g.sayfaYukseklikMm)]);

    /* Dikey ayıraç — YALNIZ istendiyse ve YALNIZ satır taşıyan sayfada.
       Boş bir sayfaya çizgi koymak, kullanıcıya orada içerik olduğunu
       düşündürür. */
    if (opts.ortaCizgi && s.satirlar.length > 0) {
      sayfa.drawLine({
        start: { x: mm(ayiracSolMm(g, b)), y: mm(g.sayfaYukseklikMm - g.ustMm) },
        end: { x: mm(ayiracSolMm(g, b)), y: mm(g.altMm) },
        thickness: 0.4,
        color: rgb(0.6, 0.6, 0.6),
      });
    }

    s.satirlar.forEach((satir, i) => {
      /* PDF'te taban çizgisi ALTTAN ölçülür; `+1` olmasaydı ilk satır üst
         marjın ÜSTÜNE, kağıdın dışına düşerdi (tek sütunlu yolla aynı). */
      const altMm = g.sayfaYukseklikMm - g.ustMm - (i + 1) * SATIR_MM;

      const font = satirFontu(satir.tip);

      /* `'scene'`, `'sahne'` DEĞİL: `CiftSatir.tip` bir `ScriptBlockType`
         taşıyor (`IKI_SUTUN_BLOKLARI`) ve alan `string` yazıldığı için
         derleyici yanlış sabiti YAKALAMIYORDU — dal hiç çalışmıyordu. */
      if (satir.tip === 'scene') {
        /* Sahne başlığı iki sütuna YAYILIR: sol kenardan başlar ve oluğu da
           kullanır (§6.6 "sahne başlığı, ortak"). */
        if (satir.sol) {
          sayfa.drawText(satir.sol, {
            x: mm(solMm), y: mm(altMm), size: punto, font,
          });
        }
        return;
      }

      if (satir.sol) {
        sayfa.drawText(satir.sol, {
          x: mm(solMm), y: mm(altMm), size: punto, font,
        });
      }
      if (satir.sag) {
        sayfa.drawText(satir.sag, {
          x: mm(sagMm), y: mm(altMm), size: punto, font,
        });
      }
    });
  }

  return sayfalar.length;
}

export async function ikiSutunPdfYaz(
  girdiler: readonly CiftGirdi[],
  secenekler: IkiSutunSecenekleri,
): Promise<IkiSutunCiktisi> {
  const belge = await PDFDocument.create();
  belge.registerFontkit(fontkit);
  if (secenekler.baslik) belge.setTitle(secenekler.baslik);
  if (secenekler.yazar) belge.setAuthor(secenekler.yazar);

  const fontlar = await fontlariGom(belge, secenekler.yaziTipleri);
  const sayfalar = sayfalaIkiSutun(girdiler, secenekler.profil);
  const sayfaSayisi = ikiSutunCiz(belge, sayfalar, { profil: secenekler.profil, fontlar });

  return { pdf: await belge.save(), sayfaSayisi };
}
