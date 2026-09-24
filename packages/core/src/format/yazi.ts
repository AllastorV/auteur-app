import { TINOS_ILERLEME, TINOS_VARSAYILAN } from './metrik-tinos';

/**
 * YAZI TİPLERİ ve ÖLÇÜLERİ.
 *
 * Motorun tamamı bugüne kadar sabit bir KARAKTER IZGARASI sayıyordu (60
 * sütun × 55 satır, Courier 10 cpi / 6 lpi). Bu senaryo için doğru — sayfa ≈
 * dakika sözleşmesi ızgaranın kendisidir — ama romanı ölçemez: el yazması
 * standardı Times 12pt çift aralıktır ve Times ORANTILI bir yazı tipidir,
 * karakter sayarak ölçülemez.
 *
 * Bu yüzden ölçü artık İLERLEME GENİŞLİĞİNDEN geliyor. Eşgenişlikli yazıda
 * ilerleme sabit olduğu için eski sütun aritmetiği DEĞİŞMİYOR: 60 sütun,
 * 60 × 0.6em ile aynı yer. Yani senaryo yolu sayısal olarak birebir aynı
 * kalıyor, yalnız aynı sonuca daha genel bir yoldan varıyor.
 *
 * Metrikler DERLEME ZAMANINDA çıkarılıyor (`tools/metrik-uret.mjs`), çalışma
 * zamanında yüklenmiyor: `sayfala` saf ve senkron: ölçüsü indirilen bir
 * dosyaya bağlansaydı font gelene kadar yanlış sayfa sayısı verir ve node
 * testlerinde hiç koşamazdı.
 */

export type YaziTipiAdi = 'courier-prime' | 'tinos';

export interface YaziTipi {
  id: YaziTipiAdi;
  /** Kullanıcıya gösterilen ad — "Tinos (Times uyumlu)" gibi açıklayıcı. */
  ad: string;
  /**
   * Yazı tipinin GERÇEK aile adı.
   *
   * `ad`'dan AYRI çünkü o bir etiket: DOCX'e etiket yazıldığında Word
   * "Tinos (Times uyumlu)" diye bir yazı arar, bulamaz ve belgeyi başka bir
   * yazıyla açar — teslim edilen dosyada sessiz bir format kaybı (ölçüldü,
   * test yakaladı).
   */
  aile: string;
  /** CSS `font-family` değeri — ekran ve PDF AYNI yazıyı kullanmalı. */
  cssAilesi: string;
  esgenislik: boolean;
  /** Bir kod noktasının ilerleme genişliği, em cinsinden. */
  ilerlemeEm(kod: number): number;
  /**
   * Satır yüksekliği, em cinsinden.
   *
   * Senaryoda 1: Courier 12pt'de 6 satır/inç ile 12pt em BİREBİR aynı
   * ölçüdür (1/6 in = 12pt). Romanda 2: el yazması çift aralıktır ve
   * editörün "çift aralık" dediği şey tam olarak budur.
   */
  satirEm: number;
}

/**
 * Courier Prime — sektör standardı, ilerleme 0.6em.
 *
 * TÜRETİM: Courier 12pt yatayda 10 karakter/inç, yani karakter başına 0.1 in.
 * 12pt em = 12/72 in = 0.1667 in. 0.1 / 0.1667 = 0.6. Yani `KARAKTER_MM`
 * ile bu sabit AYNI ölçünün iki yazılışı; ikisi ıraksarsa sayfa sayısı
 * yalan söyler.
 */
export const COURIER_PRIME: YaziTipi = {
  id: 'courier-prime',
  ad: 'Courier Prime',
  aile: 'Courier Prime',
  cssAilesi: "'Courier Prime', 'Courier New', monospace",
  esgenislik: true,
  ilerlemeEm: () => 0.6,
  satirEm: 1,
};

/**
 * Tinos — Times New Roman ile METRİK UYUMLU (Apache 2.0).
 *
 * Roman el yazması standardı Times New Roman 12pt çift aralıktır. Metrik
 * uyumlu olduğu için sayfa sayıları Times ile yazılmış bir el yazmasıyla
 * tutuyor; "yaklaşık Times" bir font seçilseydi sayfa sayısı sektörle
 * ıraksardı ve programın verdiği sayı yayıncının saydığından farklı olurdu.
 */
export const TINOS: YaziTipi = {
  id: 'tinos',
  ad: 'Tinos (Times uyumlu)',
  aile: 'Tinos',
  cssAilesi: "'Tinos', 'Times New Roman', Times, serif",
  esgenislik: false,
  ilerlemeEm: (kod) => TINOS_ILERLEME[kod] ?? TINOS_VARSAYILAN,
  satirEm: 2,
};

export const YAZI_TIPLERI: Readonly<Record<YaziTipiAdi, YaziTipi>> = {
  'courier-prime': COURIER_PRIME,
  tinos: TINOS,
};

/** Tanınmayan ad `null` döner — çağıran düşürme kararını KENDİ verir. */
export function yaziTipi(ad: unknown): YaziTipi | null {
  /* `in` prototip zincirini de gezdiği için `'__proto__'`, `'constructor'`,
     `'toString'` gibi adlar "yazı tipi var" sayılıyordu; ad tercih
     dosyasından/belgeden geldiği için bu bir güven sınırı. Kendi anahtarı
     sorularak kapatılıyor (`model/dokuman-tipi.ts` ile aynı düzeltme). */
  return typeof ad === 'string' && Object.prototype.hasOwnProperty.call(YAZI_TIPLERI, ad)
    ? YAZI_TIPLERI[ad as YaziTipiAdi]
    : null;
}

/**
 * Metnin genişliği, em cinsinden.
 *
 * Kod NOKTASI üzerinden geziyor (`for...of`), kod BİRİMİ değil: vekil çiftler
 * (emoji, bazı tarihî yazılar) iki birimdir ve tek tek ölçülürse genişlik iki
 * katına çıkardı.
 */
export function genislikEm(metin: string, yazi: YaziTipi): number {
  let toplam = 0;
  for (const harf of metin) toplam += yazi.ilerlemeEm(harf.codePointAt(0)!);
  return toplam;
}
