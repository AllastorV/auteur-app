import type { PDFDocument } from 'pdf-lib';
import type { FormatProfili } from '../format/profil';
import { genislikEm } from '../format/yazi';
import { KARAKTER_MM } from '../format/izgara';
import type { GomuluFontlar } from './pdf';

/**
 * BAŞLIK SAYFASI (§16.2 borcu).
 *
 * Sektörde bir senaryo başlık sayfası olmadan teslim edilmez: kimin yazdığı,
 * kimin temsil ettiği ve nasıl ulaşılacağı orada yazar. Liste bunu sayıyordu
 * ama yazılmamıştı.
 *
 * ## Yerleşim VERİ, sabit değil
 *
 * Klasik teslim düzeni: başlık sayfanın dikey ortasına yakın (yaklaşık %38),
 * ortalanmış ve büyük harfle; altında "yazan" satırı ve yazar adı; iletişim
 * bilgisi SOL ALT köşede. Ölçüler oran olarak yazılıyor çünkü kağıt
 * değişince (Letter ↔ A4) yerleşim de birlikte kaymalı — sabit milimetre
 * yazılsaydı A4'te başlık sayfanın ortasında durmazdı.
 *
 * ## Sayfa sayısına GİRMİYOR
 *
 * Başlık sayfası numaralanmaz ve "1 sayfa ≈ 1 dakika" sözleşmesine dahil
 * değildir: hiçbir şey oynanmıyor orada. Bu yüzden `senaryoCiz`'in döndürdüğü
 * sayıya eklenmiyor — eklenseydi programın söylediği süre bir dakika uzardı.
 */

export interface BaslikSayfasi {
  baslik: string;
  /**
   * "yazan" satırının altındaki ad. Boşsa satır hiç çizilmez.
   *
   * ÇOK SATIRLI olabilir: birden fazla yazar alt alta yazılır (kullanıcı
   * kararı 2026-08-27). Satırlar ayrı ayrı ortalanır — tek satıra virgülle
   * dizmek uzun adlarda sayfayı taşırırdı.
   */
  yazar?: string;
  /** Sol alt köşe — ajans, telefon, e-posta. Satır satır. */
  iletisim?: readonly string[];
  /** Başlığın altındaki alt başlık — "bir uzun metraj senaryosu" gibi. */
  altBaslik?: string;
  /** Taslak/sürüm satırı, sağ alt köşe — "1. taslak", "2. revizyon". */
  surum?: string;
  /**
   * Tarih — sağ alt köşe, sürümün ALTINDA. Sürümden ayrı bir alan:
   * sektörde ikisi yan yana durur ("2. taslak" / "12 Mart 2026") ve tek
   * alana sıkıştırmak kullanıcıyı biçimi kendi uydurmaya zorlardı.
   */
  tarih?: string;
}

const MM_PUNTO = 72 / 25.4;
const mm = (deger: number) => deger * MM_PUNTO;

/**
 * Yerleşim oranları — kağıttan bağımsız.
 *
 * EXPORTED: başlık sayfası EKRANININ canlı önizlemesi (§14 borcu) BURADAN
 * okuyor, kendi kopyasını YAZMIYOR (Karar 2) — yoksa önizleme ile PDF
 * ıraksardı (görev tanımının uyardığı tuzak tam bu).
 */
/**
 * Film adının puntosu — gövde metninden BÜYÜK.
 *
 * Gövde 12 punto (ızgaranın kendisi); kapak başlığı ona bağlı değil çünkü
 * kapak sayfası ızgaraya girmiyor — sayfalayıcı onu hiç görmüyor, sayfa ≈
 * dakika sözleşmesine karışmıyor. 12 punto başlık sektörde küçük kalıyor
 * (kullanıcı kararı 2026-08-30).
 *
 * TEK EV: ekran bu sayıyı `format/ekran.ts` üzerinden CSS değişkeni olarak
 * okuyor. İki yerde yazılsaydı biri değişip öteki eskirdi (Karar 2).
 */
export const BASLIK_PUNTO = 23;

export const ORAN = {
  baslikUst: 0.38,
  altBaslikUst: 0.44,
  yazanUst: 0.52,
  yazarUst: 0.56,
  iletisimAlt: 0.12,
  surumAlt: 0.12,
  /* Tarih sürümün BİR SATIR ALTINDA: aynı köşede iki bilgi, üstte taslak
     adı altta tarih — sektörde bu sırayla okunur. */
  tarihAlt: 0.09,
} as const;

/**
 * Başlık sayfasını çizer ve belgenin başına yerleştirir.
 *
 * Dil PROFİLDEN: "yazan" satırı Türkçe belgede Türkçe, İngilizcede
 * "written by" olmalı ve terimi burada sabitlemek §16.4'ün dil eksenini
 * kırardı.
 */
export function baslikSayfasiCiz(
  belge: PDFDocument,
  profil: FormatProfili,
  fontlar: GomuluFontlar,
  bilgi: BaslikSayfasi,
): void {
  const g = profil.geometri;
  const sayfa = belge.insertPage(0, [mm(g.sayfaGenislikMm), mm(g.sayfaYukseklikMm)]);
  const punto = mm(KARAKTER_MM / 0.6);

  const genislikMm = (metin: string) => (profil.yazi.esgenislik
    ? metin.length * KARAKTER_MM
    : genislikEm(metin, profil.yazi) * (KARAKTER_MM / 0.6));

  /**
   * Ortalanmış metin — SATIR SATIR.
   *
   * Alan çok satırlı olabiliyor (kullanıcı kapakta Enter'a basabiliyor);
   * bütün dizgeyi tek `drawText`e vermek satır sonlarını yutar ve uzun bir
   * başlık sayfanın dışına taşardı.
   */
  const ortaCiz = (metin: string, oran: number, kalin = false, boy = punto) => {
    if (!metin) return;
    const satirlar = metin.split('\n').filter((x) => x.trim() !== '');
    satirlar.forEach((satir, i) => {
      /* Genişlik ÖLÇÜLEN puntoya göre: gövde ölçüsüyle hesaplanan bir
         genişlik 23 puntoluk başlığı ortalamazdı. */
      const oran23 = boy / punto;
      sayfa.drawText(satir, {
        x: mm((g.sayfaGenislikMm - genislikMm(satir) * oran23) / 2),
        y: mm(g.sayfaYukseklikMm * (1 - oran)) - i * boy * 1.2,
        size: boy,
        font: kalin ? fontlar.kalin : fontlar.duz,
      });
    });
  };

  const YAZAN = profil.dil === 'tr' ? 'yazan' : 'written by';

  /* Başlık BÜYÜK HARF: sektör sözleşmesi. `buyut` değil `toLocaleUpperCase`
     kullanılmıyor — büyük harf çevrimi projede tek evde ve dile bağlı. */
  ortaCiz(bilgi.baslik, ORAN.baslikUst, true, mm(BASLIK_PUNTO * (KARAKTER_MM / 0.6) / 12));
  if (bilgi.altBaslik) ortaCiz(bilgi.altBaslik, ORAN.altBaslikUst);
  if (bilgi.yazar) {
    ortaCiz(YAZAN, ORAN.yazanUst);
    /* Her yazar AYRI satırda ve ayrı ortalanmış: birden çok yazarı tek
       satıra dizmek uzun adlarda sayfayı taşırırdı. Satır aralığı
       `punto * 1.4` — iletişim bloğuyla AYNI ölçü (aşağıda), ikinci bir
       satır aralığı sabiti icat edilmiyor. */
    const yazarlar = bilgi.yazar.split('\n').map((a) => a.trim()).filter(Boolean);
    yazarlar.forEach((ad, i) => {
      const kayma = (i * punto * 1.4) / mm(g.sayfaYukseklikMm);
      ortaCiz(ad, ORAN.yazarUst + kayma);
    });
  }

  /* İletişim SOL ALT: sektörde oraya yazılır ve ortalanmış bir iletişim
     bloğu başlık sayfasını amatör gösterir. */
  const iletisim = bilgi.iletisim ?? [];
  iletisim.forEach((satir, i) => {
    if (!satir) return;
    sayfa.drawText(satir, {
      x: mm(g.solMm),
      y: mm(g.sayfaYukseklikMm * ORAN.iletisimAlt + (iletisim.length - 1 - i) * punto * 1.4),
      size: punto,
      font: fontlar.duz,
    });
  });

  /* Taslak ve tarih AYNI köşede, sağa yaslı, üstte taslak altta tarih. */
  const sagaCiz = (metin: string | undefined, oran: number) => {
    if (!metin) return;
    sayfa.drawText(metin, {
      x: mm(g.sayfaGenislikMm - g.sagMm - genislikMm(metin)),
      y: mm(g.sayfaYukseklikMm * oran),
      size: punto,
      font: fontlar.duz,
    });
  };
  sagaCiz(bilgi.surum, ORAN.surumAlt);
  sagaCiz(bilgi.tarih, ORAN.tarihAlt);
}
