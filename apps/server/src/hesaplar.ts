import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { newId } from './tokens';

const scrypt = promisify(crypto.scrypt) as (
  parola: string | Buffer,
  tuz: Buffer,
  uzunluk: number,
  secenekler: crypto.ScryptOptions,
) => Promise<Buffer>;

/**
 * E-posta + parola ile kullanıcı hesapları.
 *
 * ## Neden ayrı ev
 *
 * Oda (`rooms.ts`) bir OTURUMDUR, hesap bir KİMLİKTİR: oda kapanınca hesap
 * durmaya devam eder. İkisi aynı dosyada olsaydı odayı silen kod hesabı da
 * silme yoluna girerdi.
 *
 * ## Parola HİÇBİR YERDE DÜZ DURMAZ
 *
 * Yalnız `scrypt` türevi ve tuz saklanıyor. `Hesap` kaydında `parola` diye bir
 * alan YOK — olsaydı bir `JSON.stringify(hesap)` (günlük, hata raporu, yanıt
 * gövdesi) düz parolayı dışarı taşırdı. Alanın hiç var olmaması, "yazmamayı
 * unutmamak"tan daha güçlü bir garantidir.
 *
 * ## Neden scrypt
 *
 * Node'un `crypto`'sunda YERLEŞİK (yeni bağımlılık yok), bellek-sert (GPU ile
 * kaba kuvvet pahalı) ve argon2 gibi derlenmiş bir eklenti gerektirmiyor.
 * Parametreler RFC 7914'ün önerdiği aralıkta: N=16384, r=8, p=1 → çağrı başına
 * ~16 MB. ASENKRON çağrılıyor: `scryptSync` Node'un tek iş parçacığını bu süre
 * boyunca kilitler ve giriş ucuna gelen bir sel bütün odaları durdururdu.
 *
 * ⚠ TAVAN: depo BELLEKTE. Sunucu yeniden başlayınca hesaplar gider. Diske
 * yazma başka bir çalışmanın alanı; buradaki arayüz (`HesapDeposu`) o katmanın
 * altına girebilecek kadar dar tutuldu.
 */

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const ANAHTAR_UZUNLUGU = 64;

/** Parola alt sınırı — altında kaba kuvvet hız sınırıyla bile ucuz kalır. */
export const PAROLA_EN_AZ = 8;
/**
 * Parola üst sınırı. scrypt maliyeti girdi uzunluğuyla artmaz ama sınırsız
 * gövde kabul etmek başka bir yerde bellek maliyetidir; sınır güven sınırında.
 */
export const PAROLA_EN_COK = 200;

export interface Hesap {
  hesapId: string;
  /** Küçük harfe indirgenmiş — "Ali@x.com" ile "ali@x.com" AYNI hesaptır. */
  eposta: string;
  ad: string;
  /** scrypt türevi. Düz parola SAKLANMAZ. */
  hash: Buffer;
  tuz: Buffer;
  olusturuldu: number;
  /**
   * Geçerli yenileme jetonlarının kimlikleri.
   *
   * Jetonun kendisi durum taşımıyor (HMAC); iptal edilebilirlik ve DÖNDÜRME
   * (kullanılan yenileme jetonu geçersizleşir) ancak sunucuda bir kayıt
   * tutmakla olur. Çalınan bir yenileme jetonu böylece ikinci kez kullanılamaz.
   */
  yenilemeler: Set<string>;
}

export interface HesapDeposu {
  epostaylaBul(eposta: string): Hesap | undefined;
  kimlikleBul(hesapId: string): Hesap | undefined;
  /** Yeni hesap. E-posta zaten varsa `null` döner — çağıran ayırt eder. */
  olustur(eposta: string, parola: string, ad: string): Promise<Hesap | null>;
  sayi(): number;
}

/** Tek `@`, boşluksuz, en az bir noktalı alan adı. */
const EPOSTA = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/u;

export function epostaNormalle(deger: unknown): string | null {
  if (typeof deger !== 'string') return null;
  const e = deger.trim().toLowerCase();
  // 254: RFC 5321'in adres üst sınırı.
  if (e.length < 3 || e.length > 254 || !EPOSTA.test(e)) return null;
  return e;
}

export function parolaGecerliMi(deger: unknown): deger is string {
  return typeof deger === 'string' && deger.length >= PAROLA_EN_AZ && deger.length <= PAROLA_EN_COK;
}

async function turet(parola: string, tuz: Buffer): Promise<Buffer> {
  return scrypt(Buffer.from(parola, 'utf8'), tuz, ANAHTAR_UZUNLUGU, SCRYPT);
}

export function hesapDeposu(): HesapDeposu {
  const epostaIndeksi = new Map<string, Hesap>();
  const kimlikIndeksi = new Map<string, Hesap>();

  return {
    epostaylaBul: (e) => epostaIndeksi.get(e),
    kimlikleBul: (id) => kimlikIndeksi.get(id),
    sayi: () => kimlikIndeksi.size,

    async olustur(eposta, parola, ad) {
      if (epostaIndeksi.has(eposta)) return null;
      const tuz = crypto.randomBytes(16);
      const hash = await turet(parola, tuz);
      const hesap: Hesap = {
        hesapId: newId('hsp'),
        eposta,
        ad: ad.slice(0, 80) || eposta.split('@')[0],
        hash,
        tuz,
        olusturuldu: Date.now(),
        yenilemeler: new Set(),
      };
      epostaIndeksi.set(eposta, hesap);
      kimlikIndeksi.set(hesap.hesapId, hesap);
      return hesap;
    },
  };
}

/**
 * Parola doğrulaması — SABİT ZAMANLI.
 *
 * `crypto.timingSafeEqual` kullanılıyor: `Buffer.equals`/`===` ilk farklı
 * baytta döner ve saldırgan yanıt süresinden türevi bayt bayt çıkarabilir.
 * Uzunluklar zaten sabit (`ANAHTAR_UZUNLUGU`), yine de kontrol ediliyor —
 * `timingSafeEqual` farklı uzunlukta FIRLATIR.
 */
export async function parolaDogruMu(hesap: Hesap, parola: unknown): Promise<boolean> {
  if (!parolaGecerliMi(parola)) return false;
  const aday = await turet(parola, hesap.tuz);
  return aday.length === hesap.hash.length && crypto.timingSafeEqual(aday, hesap.hash);
}

/**
 * Var olmayan hesap için de bir scrypt hesabı yakar.
 *
 * NEDEN: giriş ucu var olmayan e-postaya ANINDA "yok" derse, kayıtlı
 * e-postalar yanıt süresinden ayırt edilebilir (hesap sayımı = kimlik
 * sızıntısı). Sahte bir tuza karşı aynı işi yaparak iki yolun süresi
 * yaklaşık eşitleniyor.
 */
const SAHTE_TUZ = crypto.randomBytes(16);
export async function sahteDogrulama(parola: unknown): Promise<false> {
  if (typeof parola === 'string' && parola.length <= PAROLA_EN_COK) {
    await turet(parola, SAHTE_TUZ);
  }
  return false;
}
