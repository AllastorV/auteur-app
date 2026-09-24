/**
 * Courier 12pt ızgarası ve kağıt geometrisi.
 *
 * IZGARA SABİTTİR, MARJ ESNER. Sayfanın taşıdığı iş — satır başına karakter
 * ve sayfa başına satır — kağıttan bağımsızdır; kağıt değişince yalnız
 * marjlar yeniden hesaplanır. "1 sayfa yaklaşık 1 dakika" sözleşmesi buna
 * dayanır.
 *
 * STARC bunu yapmaz: Letter şablonu 60x54, A4 şablonu 61x59 ızgara verir,
 * aynı senaryo A4'te yaklaşık %9 daha az sayfa tutar (spec §6.3).
 */

/** Courier 12pt yatayda 10 karakter/inç. */
export const KARAKTER_MM = 25.4 / 10;

/** Courier 12pt dikeyde 6 satır/inç. */
export const SATIR_MM = 25.4 / 6;

/**
 * Metin bloğunun değişmez ölçüsü. Hiçbir kağıt bunu değiştiremez.
 * 55 satır Final Draft ve piyasa araçlarının fiilî değeridir; sayfa
 * sayılarının sektörle tutması buna bağlıdır (araştırma raporu §5).
 */
export const IZGARA = { sutun: 60, satir: 55 } as const;

/** Amerikan teslim standardı: sol marj 1.5 in (ciltleme payı). */
const SOL_MARJ_MM = 25.4 * 1.5;

/** Sektör kuralı: metin üstten 1 in aşağıda başlar. Alt marj türetilir. */
const UST_MARJ_MM = 25.4;

export type KagitAdi = 'letter' | 'a4';

export interface Geometri {
  kagit: KagitAdi;
  sayfaGenislikMm: number;
  sayfaYukseklikMm: number;
  solMm: number;
  sagMm: number;
  ustMm: number;
  altMm: number;
  metinGenislikMm: number;
  metinYukseklikMm: number;
}

const KAGIT: Record<KagitAdi, { g: number; y: number }> = {
  letter: { g: 215.9, y: 279.4 },
  a4: { g: 210, y: 297 },
};

/**
 * Marjları ızgaradan türetir — veri olarak yazmaz.
 * Sol ve üst sabittir (sektör kuralı), sağ ve alt kağıttan artan paydır.
 * Letter için türetim klasik 1.5/1.0 in marjlarını birebir üretir.
 */
export function kagitGeometrisi(kagit: KagitAdi): Geometri {
  // Bilinmeyen anahtarda destructure `undefined`'dan okur ve tanılamayan bir
  // TypeError verir; ad neredeyse her zaman dışarıdan (profil dosyası, içe
  // aktarım) gelir, o yüzden sınırda anlamlı hata verilir.
  /* Düz indeksleme (`KAGIT[kagit]`) PROTOTİP anahtarlarında muhafızı
     deliyordu: `KAGIT['__proto__']` `Object.prototype`i döner, o da doğru
     sayıldığı için hata fırlatılmaz; sonraki destructure `undefined` verir
     ve `sagMm`/`altMm` NaN olur. `NaN < 0` de FALSE olduğu için alttaki
     ikinci muhafız da geçilir — geriye baştan sona NaN dolu, sessizce
     geçerli görünen bir geometri kalır. Kağıt adı profil dosyasından ya da
     içe aktarımdan geliyor, yani güven sınırının dışında. Kendi anahtarı
     olup olmadığı sorularak kapatılıyor. */
  const olcu = Object.prototype.hasOwnProperty.call(KAGIT, kagit) ? KAGIT[kagit] : undefined;
  if (!olcu) throw new Error(`Bilinmeyen kagit: ${kagit}`);
  const { g: sayfaGenislikMm, y: sayfaYukseklikMm } = olcu;
  const metinGenislikMm = IZGARA.sutun * KARAKTER_MM;
  const metinYukseklikMm = IZGARA.satir * SATIR_MM;
  const sagMm = sayfaGenislikMm - SOL_MARJ_MM - metinGenislikMm;
  const altMm = sayfaYukseklikMm - UST_MARJ_MM - metinYukseklikMm;
  /* Türetilen marjlar POZİTİF olmalı — bilinmeyen-anahtar muhafızının
     kardeşi. Sol ve üst marj kağıttan bağımsız sabit, sağ ve alt ondan
     türüyor; metin bloğu kağıda sığmıyorsa `sagMm` NEGATİF çıkar ve metin
     sayfanın dışına SESSİZCE çizilir (A5 eklendiği an `sagMm = -42.5`).
     Modülün her başka sınırında bu muhafız var, tam da bu türetmede yoktu. */
  if (sagMm < 0 || altMm < 0) {
    throw new Error(
      `Kagit metin blogunu tasimiyor: ${kagit} (sag ${sagMm.toFixed(1)} mm, alt ${altMm.toFixed(1)} mm)`,
    );
  }
  return {
    kagit,
    sayfaGenislikMm,
    sayfaYukseklikMm,
    solMm: SOL_MARJ_MM,
    sagMm,
    ustMm: UST_MARJ_MM,
    altMm,
    metinGenislikMm,
    metinYukseklikMm,
  };
}
