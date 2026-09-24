import { crc32 } from './gunluk';

/**
 * MÜHÜR ZİNCİRİ — "bu metin şu sırayla vardı" sorusunun DEPO katmanı.
 *
 * `veri/gunluk.ts` ve `veri/yazarlik.ts`in üçüncü kardeşi: aynı sihir +
 * sürüm + CRC-32 + uzunluk önekli çerçeveleme, ayrı bir dosya ve ayrı bir
 * içerik. Bu dosya SAF: dosya sistemi bilmez, tarayıcıda da koşar.
 *
 * ## Neden ÜÇÜNCÜ bir günlük
 *
 * Var olan üç yerin hiçbiri bir zinciri taşıyamıyor, ölçüldü:
 * - `oturum.log` her çıpada siliniyor — zincir beş dakika yaşardı.
 * - Çıpa halkası `seyrelt()` ile 30 gün sonra atılıyor — kanıtın ömrü
 *   depolama politikasına bağlanamaz.
 * - `yazarlik.log` `buda()` ile REWRITE ediliyor. Bir hash zinciri
 *   rewrite edilen dosyada yaşayamaz: budama zinciri kırar ve KIRIK
 *   zincir, KURCALANMIŞ zincirden ayırt edilemez.
 *
 * `zincir.log` bu yüzden ASLA budanmıyor, ASLA yeniden yazılmıyor. Maliyeti
 * ödenebilir olsun diye kayıt her çıpada değil MÜHÜR OLAYLARINDA yazılıyor
 * (yılda yüzler mertebesi, ~50 KB).
 *
 * ## Ne kanıtlar, ne KANITLAMAZ
 *
 * Zincir metnin bu SIRAYLA var olduğunu kanıtlar. TARİHİ kanıtlamaz — saat
 * bu makinenindir. Tarihi ancak bağımsız bir zaman damgası otoritesi
 * (RFC 3161) kanıtlar ve o ayrı bir kayıt türü olarak (`damga`) yine bu
 * zincire giriyor.
 */

/** Dosya başlığı — `MZZN` (MiZansen ZiNcir). */
export const ZINCIR_SIHIR = new Uint8Array([0x4d, 0x5a, 0x5a, 0x4e]);
export const ZINCIR_SURUM = 1;
/** Başlık: sihir(4) + sürüm(2). */
export const ZINCIR_BASLIK_UZUNLUK = 6;
/** Çerçeve başlığı: uzunluk(4) + sağlama(4). */
const CERCEVE_BASLIK = 8;

/**
 * Tek çerçeve tavanı.
 *
 * Bir zincir kaydı iki özet, bir zaman ve iki kısa dizgeden ibaret — 64 KiB
 * fazlasıyla yeter. Tavanın işi `gunluk.ts`teki ile aynı: bozuk bir uzunluk
 * alanı devasa bir ayırma denemesine yol açmasın.
 */
export const ZINCIR_EN_BUYUK_CERCEVE = 64 * 1024;

const EN_UZUN_DIZGI = 0xffff;
/** SHA-256 çıktısı. Zincirin bütün özetleri bu boyda. */
export const OZET_UZUNLUK = 32;

/**
 * Kaydın NE olduğu.
 *
 * Append-only bir dosyada DURUM GÜNCELLENEMEZ: bir mühür sonradan
 * damgalanırsa üstüne yazılmaz, İKİNCİ bir kayıt (`damga`) eklenir ve
 * `icerikOzeti` alanı damgalanan mührün halkasını taşır.
 */
export type ZincirKayitTuru = 'muhur' | 'damga';

/** Mührü ne tetikledi — kullanıcıya ne vaat edildiğini belirler. */
export type MuhurTetikleyici = 'elle' | 'surum' | 'revizyon';

const TURLER: readonly ZincirKayitTuru[] = ['muhur', 'damga'];
const TETIKLEYICILER: readonly MuhurTetikleyici[] = ['elle', 'surum', 'revizyon'];

export interface ZincirKaydi {
  /** ms epoch — YEREL saat. Tarih iddiası DEĞİL. */
  zaman: number;
  tur: ZincirKayitTuru;
  tetikleyici: MuhurTetikleyici;
  /** Bir önceki kaydın halka özeti. İlk kayıtta 32 sıfır bayt. */
  oncekiHalka: Uint8Array;
  /**
   * `muhur`: mühürlenen metnin SHA-256'sı.
   * `damga`: damgalanan MÜHÜR KAYDININ halka özeti.
   */
  icerikOzeti: Uint8Array;
  /** Mühürlenen metnin bayt uzunluğu — doğrulayıcı için ikinci bağ. */
  icerikBayt: number;
  /** Mühürleyen. Oturum açılmamışsa boş olabilir. */
  yazar: string;
  /** `muhur`: kullanıcı etiketi. `damga`: TSA adresi. */
  etiket: string;
}

const KODLAYICI = new TextEncoder();
const COZUCU = new TextDecoder();

/** Yeni bir zincir dosyasının başlığı. */
export function zincirBasligi(): Uint8Array {
  const b = new Uint8Array(ZINCIR_BASLIK_UZUNLUK);
  b.set(ZINCIR_SIHIR, 0);
  new DataView(b.buffer).setUint16(4, ZINCIR_SURUM, true);
  return b;
}

function dizgiKodla(metin: string): Uint8Array {
  const bayt = KODLAYICI.encode(metin);
  if (bayt.length > EN_UZUN_DIZGI) {
    throw new Error(`Zincir dizgisi cok uzun: ${bayt.length} > ${EN_UZUN_DIZGI}`);
  }
  return bayt;
}

function ozetDenetle(ad: string, ozet: Uint8Array): void {
  if (ozet.length !== OZET_UZUNLUK) {
    throw new Error(`Zincir ${ad} ozeti ${OZET_UZUNLUK} bayt olmali: ${ozet.length}`);
  }
}

/**
 * Kaydın KANONİK gövde baytları.
 *
 * Yerleşim: zaman(f64,8) + tur(u8,1) + tetikleyici(u8,1) + oncekiHalka(32)
 * + icerikOzeti(32) + icerikBayt(u32,4) + yazarUzunluk(u16,2) + yazar
 * + etiketUzunluk(u16,2) + etiket.
 *
 * DIŞA AÇIK, çünkü halka özeti TAM OLARAK bu baytların SHA-256'sı: diske
 * yazılan ne ise hash'lenen o. İkinci bir "hash için serileştirme"
 * yazılsaydı ikisi bir gün ayrışır ve zincir kendi dosyasını doğrulayamaz
 * hâle gelirdi (Karar 2).
 */
export function zincirGovdesi(kayit: ZincirKaydi): Uint8Array {
  if (!Number.isFinite(kayit.zaman)) throw new Error(`Zincir zamani sonlu olmali: ${kayit.zaman}`);
  if (!Number.isInteger(kayit.icerikBayt) || kayit.icerikBayt < 0) {
    throw new Error(`Zincir icerikBayt negatif olamaz: ${kayit.icerikBayt}`);
  }
  ozetDenetle('onceki halka', kayit.oncekiHalka);
  ozetDenetle('icerik', kayit.icerikOzeti);
  const turIndeks = TURLER.indexOf(kayit.tur);
  const tetikIndeks = TETIKLEYICILER.indexOf(kayit.tetikleyici);
  if (turIndeks < 0) throw new Error(`Bilinmeyen zincir kayit turu: ${kayit.tur}`);
  if (tetikIndeks < 0) throw new Error(`Bilinmeyen muhur tetikleyicisi: ${kayit.tetikleyici}`);

  const yazarBayt = dizgiKodla(kayit.yazar);
  const etiketBayt = dizgiKodla(kayit.etiket);
  const uzunluk = 8 + 1 + 1 + OZET_UZUNLUK * 2 + 4 + 2 + yazarBayt.length + 2 + etiketBayt.length;

  const govde = new Uint8Array(uzunluk);
  const g = new DataView(govde.buffer);
  let k = 0;
  g.setFloat64(k, kayit.zaman, true); k += 8;
  govde[k] = turIndeks; k += 1;
  govde[k] = tetikIndeks; k += 1;
  govde.set(kayit.oncekiHalka, k); k += OZET_UZUNLUK;
  govde.set(kayit.icerikOzeti, k); k += OZET_UZUNLUK;
  g.setUint32(k, kayit.icerikBayt, true); k += 4;
  g.setUint16(k, yazarBayt.length, true); k += 2;
  govde.set(yazarBayt, k); k += yazarBayt.length;
  g.setUint16(k, etiketBayt.length, true); k += 2;
  govde.set(etiketBayt, k);
  return govde;
}

/** Gövdeyi uzunluk + CRC ile sarar — dosyaya EKLENECEK çerçeve. */
export function zincirCercevesi(kayit: ZincirKaydi): Uint8Array {
  const govde = zincirGovdesi(kayit);
  if (govde.length > ZINCIR_EN_BUYUK_CERCEVE) {
    throw new Error(`Zincir cercevesi cok buyuk: ${govde.length} > ${ZINCIR_EN_BUYUK_CERCEVE}`);
  }
  const cikti = new Uint8Array(CERCEVE_BASLIK + govde.length);
  const g = new DataView(cikti.buffer);
  g.setUint32(0, govde.length, true);
  g.setUint32(4, crc32(govde), true);
  cikti.set(govde, CERCEVE_BASLIK);
  return cikti;
}

export type ZincirDurumu = 'tam' | 'kirpik' | 'bozuk' | 'yabanci';

export interface ZincirOkuma {
  kayitlar: ZincirKaydi[];
  durum: ZincirDurumu;
  /** Çözümlenemeyen kuyruğun bayt sayısı. */
  artikBayt: number;
}

/** Gövdeyi kayda çevirir. Sınır hatasında `null` — çağıran "bozuk" sayar. */
function govdeCoz(govde: Uint8Array): ZincirKaydi | null {
  try {
    const g = new DataView(govde.buffer, govde.byteOffset, govde.byteLength);
    let k = 0;
    const en = 8 + 1 + 1 + OZET_UZUNLUK * 2 + 4 + 2;
    if (govde.length < en) return null;
    const zaman = g.getFloat64(k, true); k += 8;
    const tur = TURLER[govde[k]]; k += 1;
    const tetikleyici = TETIKLEYICILER[govde[k]]; k += 1;
    if (!tur || !tetikleyici) return null;
    const oncekiHalka = govde.slice(k, k + OZET_UZUNLUK); k += OZET_UZUNLUK;
    const icerikOzeti = govde.slice(k, k + OZET_UZUNLUK); k += OZET_UZUNLUK;
    const icerikBayt = g.getUint32(k, true); k += 4;
    const yazarUzunluk = g.getUint16(k, true); k += 2;
    if (k + yazarUzunluk + 2 > govde.length) return null;
    const yazar = COZUCU.decode(govde.subarray(k, k + yazarUzunluk)); k += yazarUzunluk;
    const etiketUzunluk = g.getUint16(k, true); k += 2;
    if (k + etiketUzunluk > govde.length) return null;
    const etiket = COZUCU.decode(govde.subarray(k, k + etiketUzunluk)); k += etiketUzunluk;
    if (k !== govde.length) return null;
    return { zaman, tur, tetikleyici, oncekiHalka, icerikOzeti, icerikBayt, yazar, etiket };
  } catch {
    return null;
  }
}

/**
 * Zincir dosyasını çözümler ve BOZULMANIN BAŞLADIĞI yerde durur.
 *
 * `gunlukCozumle` ve `yazarlikCozumle` ile aynı kural: sağlam ön ek
 * kurtarılır, yarım kalan son çerçeve yalnız kendini götürür. Bozuk bir
 * çerçeveden sonrası ATLANMIYOR — bir kanıt dosyasında "gerisini okudum ama
 * ortası bozuktu" demek, kurcalamayı gizlemek olurdu.
 */
export function zincirCozumle(bayt: Uint8Array): ZincirOkuma {
  const bos: ZincirOkuma = { kayitlar: [], durum: 'yabanci', artikBayt: bayt.length };
  if (bayt.length < ZINCIR_BASLIK_UZUNLUK) return bos;
  for (let i = 0; i < ZINCIR_SIHIR.length; i++) if (bayt[i] !== ZINCIR_SIHIR[i]) return bos;
  const g = new DataView(bayt.buffer, bayt.byteOffset, bayt.byteLength);
  if (g.getUint16(4, true) !== ZINCIR_SURUM) return bos;

  const kayitlar: ZincirKaydi[] = [];
  let konum = ZINCIR_BASLIK_UZUNLUK;

  for (;;) {
    if (konum === bayt.length) return { kayitlar, durum: 'tam', artikBayt: 0 };
    if (konum + CERCEVE_BASLIK > bayt.length) break;
    const uzunluk = g.getUint32(konum, true);
    const saglama = g.getUint32(konum + 4, true);
    if (uzunluk === 0 || uzunluk > ZINCIR_EN_BUYUK_CERCEVE) {
      return { kayitlar, durum: 'bozuk', artikBayt: bayt.length - konum };
    }
    if (konum + CERCEVE_BASLIK + uzunluk > bayt.length) break;
    const govde = bayt.subarray(konum + CERCEVE_BASLIK, konum + CERCEVE_BASLIK + uzunluk);
    if (crc32(govde) !== saglama) {
      return { kayitlar, durum: 'bozuk', artikBayt: bayt.length - konum };
    }
    const kayit = govdeCoz(govde);
    if (!kayit) return { kayitlar, durum: 'bozuk', artikBayt: bayt.length - konum };
    kayitlar.push(kayit);
    konum += CERCEVE_BASLIK + uzunluk;
  }
  return { kayitlar, durum: 'kirpik', artikBayt: bayt.length - konum };
}

/** İlk kaydın `oncekiHalka` değeri — 32 sıfır bayt. */
export function sifirHalka(): Uint8Array {
  return new Uint8Array(OZET_UZUNLUK);
}

/**
 * Kaydın HALKA ÖZETİ — saklanmıyor, TÜRETİLİYOR.
 *
 * Saklansaydı dosyada iki gerçek olurdu (yazılan halka ve hesaplanan
 * halka) ve kurcalayan kişi ikisini birden düzeltebilirdi. Türetilmiş
 * halka, zincirin bağını kaydın BÜTÜN alanlarına bağlıyor: zamanı
 * değiştirmek de yazarı değiştirmek de bağı koparıyor.
 *
 * `crypto.subtle` PLATFORM ÖZELLİĞİ — Node 18+ ve tarayıcıda var, yeni
 * bağımlılık yok ve `packages/core`un saflığı bozulmuyor.
 * `blockFingerprint` KULLANILMAZ: FNV-1a kriptografik değil ve konumsal
 * sayaç taşıyor.
 */
export async function halka(kayit: ZincirKaydi): Promise<Uint8Array> {
  const govde = zincirGovdesi(kayit);
  const ozet = await globalThis.crypto.subtle.digest('SHA-256', govde as BufferSource);
  return new Uint8Array(ozet);
}

/** İki özet birebir aynı mı. */
export function ozetEsit(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Özeti onaltılık dizgeye çevirir — rapor ve JSON dökümü için. */
export function ozetHex(ozet: Uint8Array): string {
  return [...ozet].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type ZincirBulgu =
  | { tur: 'halka-kopuk'; sira: number }
  | { tur: 'icerik-uyusmuyor'; sira: number }
  | { tur: 'damga-dayanaksiz'; sira: number }
  | { tur: 'metin-eksik'; sira: number };

/**
 * Zincirin BÜTÜNLÜĞÜ.
 *
 * `metinOzeti` çağıranın verdiği ölçüm: saf çekirdek dosya okumaz. Verilmezse
 * yalnız halka bağı denetlenir — kanıt paketindeki bağımsız doğrulayıcı onu
 * dosyalardan okuyup veriyor.
 */
export async function zinciriDogrula(
  kayitlar: readonly ZincirKaydi[],
  metinOzeti?: (sira: number) => Promise<Uint8Array | null>,
): Promise<{ saglam: boolean; bulgular: ZincirBulgu[] }> {
  const bulgular: ZincirBulgu[] = [];
  const sifir = sifirHalka();
  const halkalar: Uint8Array[] = [];

  for (let i = 0; i < kayitlar.length; i++) {
    const k = kayitlar[i];
    const beklenen = i === 0 ? sifir : halkalar[i - 1];
    if (!ozetEsit(k.oncekiHalka, beklenen)) bulgular.push({ tur: 'halka-kopuk', sira: i });
    halkalar.push(await halka(k));

    if (k.tur === 'damga') {
      /* Damga kaydı bir MÜHRE dayanmalı: dayanağı olmayan bir damga,
         hiçbir metne bağlanmayan bir tarih iddiasıdır. */
      const dayanak = halkalar.slice(0, i).some((h) => ozetEsit(h, k.icerikOzeti));
      if (!dayanak) bulgular.push({ tur: 'damga-dayanaksiz', sira: i });
      continue;
    }

    if (!metinOzeti) continue;
    const olculen = await metinOzeti(i);
    if (!olculen) bulgular.push({ tur: 'metin-eksik', sira: i });
    else if (!ozetEsit(olculen, k.icerikOzeti)) bulgular.push({ tur: 'icerik-uyusmuyor', sira: i });
  }

  return { saglam: bulgular.length === 0, bulgular };
}
