/**
 * Yazma günlüğü — §15.2'nin 1. katmanı.
 *
 * Kayıp tavanını ~1 saniyeye indiren tek mekanizma budur. §15.2.1 anlık
 * görüntü aralığının (5 dk) güvenli olmasını doğrudan buna bağlıyor: aralık
 * "ne kadar kaybederim" sorusunu değil, "günlük ne sıklıkla toparlanır"
 * sorusunu yanıtlıyor. Bu modül bu yüzden sadeleştirilemez.
 *
 * Bu dosya SAF: dosya sistemi bilmez, Node bilmez, tarayıcıda da koşar.
 * Diske yazmak platform katmanının işi; çerçeveleme ve çözümleme burada
 * yaşar ve dosya sistemi olmadan test edilir.
 */

/** Dosya başlığı — `MZGN`. Yabancı/eski bir dosyayı sessizce oynatmamak için. */
export const GUNLUK_SIHIR = new Uint8Array([0x4d, 0x5a, 0x47, 0x4e]);
export const GUNLUK_SURUM = 1;
/** Başlık: sihir(4) + sürüm(2). */
export const BASLIK_UZUNLUK = 6;
/** Çerçeve başlığı: uzunluk(4) + sağlama(4). */
const CERCEVE_BASLIK = 8;
/** Kayıt içindeki zaman damgası (f64, ms). */
const ZAMAN_UZUNLUK = 8;

/**
 * Tek bir çerçevenin kabul edilebilir en büyük boyu (64 MiB).
 *
 * Bozuk bir uzunluk alanı — çökmede sıfırla dolan ya da yırtılan bir yazım —
 * aksi hâlde devasa bir ayırma denemesine yol açar ve kurtarma sürecini
 * belleksiz bırakır. Kurtarmanın kendisi çökerse üçüncü katman da devreye
 * giremez.
 */
export const EN_BUYUK_CERCEVE = 64 * 1024 * 1024;

/* ------------------------------ sağlama ------------------------------ */

const CRC_TABLOSU = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/**
 * CRC-32 (IEEE). Basit toplam YETMEZ: çökmede kimi dosya sistemleri dosyayı
 * SIFIRLA doldurarak uzatır, sıfırların toplamı da sıfırdır ve bozuk çerçeve
 * geçerli görünürdü. CRC-32'nin sıfır dizisi üzerindeki değeri sıfır değildir.
 */
export function crc32(bayt: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bayt.length; i++) c = CRC_TABLOSU[(c ^ bayt[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------ yazma ------------------------------ */

/** Yeni bir günlük dosyasının başlığı. Yalnız dosya oluşturulurken yazılır. */
export function gunlukBasligi(): Uint8Array {
  const b = new Uint8Array(BASLIK_UZUNLUK);
  b.set(GUNLUK_SIHIR, 0);
  new DataView(b.buffer).setUint16(4, GUNLUK_SURUM, true);
  return b;
}

/**
 * Bir Yjs güncellemesini günlüğe EKLENECEK çerçeveye çevirir.
 *
 * Ekleme (append) kritiktir (§15.2): ekleme sırasında çökme en fazla SON
 * çerçeveyi yarım bırakır, dosyanın geri kalanı sağlam kalır. Yerinde yazma
 * hem yeni hem eski hâli birlikte götürürdü.
 *
 * Sağlama, zaman damgasını da KAPSAR: zaman yalnız gösterim için kullanılsa
 * bile (§15.3 "3 dakikalık iş bulundu"), kapsam dışında bırakılırsa yırtılmış
 * bir yazım geçerli çerçeve gibi görünüp kullanıcıya uydurma bir süre
 * gösterirdi.
 */
export function cerceve(guncelleme: Uint8Array, zaman: number): Uint8Array {
  if (!Number.isFinite(zaman)) throw new Error(`Gunluk zamani sonlu olmali: ${zaman}`);
  if (!guncelleme.length) throw new Error('Bos guncelleme gunluge yazilamaz');
  const kayitUzunluk = ZAMAN_UZUNLUK + guncelleme.length;
  if (kayitUzunluk > EN_BUYUK_CERCEVE) {
    throw new Error(`Cerceve cok buyuk: ${kayitUzunluk} > ${EN_BUYUK_CERCEVE}`);
  }
  const cikti = new Uint8Array(CERCEVE_BASLIK + kayitUzunluk);
  const gorunum = new DataView(cikti.buffer);
  const kayit = cikti.subarray(CERCEVE_BASLIK);
  new DataView(cikti.buffer, CERCEVE_BASLIK, ZAMAN_UZUNLUK).setFloat64(0, zaman, true);
  cikti.set(guncelleme, CERCEVE_BASLIK + ZAMAN_UZUNLUK);
  gorunum.setUint32(0, kayitUzunluk, true);
  gorunum.setUint32(4, crc32(kayit), true);
  return cikti;
}

/* ----------------------------- okuma ------------------------------ */

export type GunlukDurumu =
  /** Dosya eksiksiz çözümlendi. */
  | 'tam'
  /** Son çerçeve yarım kalmış — olağan çökme izi. */
  | 'kirpik'
  /** Bir çerçeve sağlamasını tutturamadı — yırtılmış ya da sıfırlanmış yazım. */
  | 'bozuk'
  /** Başlık tanınmadı: yabancı dosya ya da desteklenmeyen sürüm. */
  | 'yabanci';

export interface GunlukOkuma {
  guncellemeler: Uint8Array[];
  /** `guncellemeler` ile aynı sıradaki ms zaman damgaları. */
  zamanlar: number[];
  durum: GunlukDurumu;
  /** Çözümlenemeyen kuyruğun bayt sayısı. */
  artikBayt: number;
}

/**
 * Günlüğü çözümler ve BOZULMANIN BAŞLADIĞI yerde durur.
 *
 * Kural: bozuk bir çerçeveden SONRASI atlanarak devam EDİLMEZ. Yjs
 * güncellemeleri artımlıdır ve sıraya bağlıdır; ortadaki bir çerçeveyi
 * atlayıp sonrakini uygulamak, kullanıcının metnini sessizce yanlış bir
 * duruma getirir. Sağlam ön ek kurtarılır, gerisi kullanıcıya bildirilir
 * (§15.4 sessiz başarısızlık yasağı).
 */
export function gunlukCozumle(bayt: Uint8Array): GunlukOkuma {
  const bos: GunlukOkuma = { guncellemeler: [], zamanlar: [], durum: 'yabanci', artikBayt: bayt.length };
  if (bayt.length < BASLIK_UZUNLUK) return bos;
  for (let i = 0; i < GUNLUK_SIHIR.length; i++) if (bayt[i] !== GUNLUK_SIHIR[i]) return bos;
  const gorunum = new DataView(bayt.buffer, bayt.byteOffset, bayt.byteLength);
  if (gorunum.getUint16(4, true) !== GUNLUK_SURUM) return bos;

  const guncellemeler: Uint8Array[] = [];
  const zamanlar: number[] = [];
  let konum = BASLIK_UZUNLUK;

  for (;;) {
    if (konum === bayt.length) {
      return { guncellemeler, zamanlar, durum: 'tam', artikBayt: 0 };
    }
    if (konum + CERCEVE_BASLIK > bayt.length) break;
    const uzunluk = gorunum.getUint32(konum, true);
    const saglamaDegeri = gorunum.getUint32(konum + 4, true);
    /* Uzunluk kendi başına bir güven sınırı: bozuk değer ya devasa bir ayırma
       ya da sonsuz döngü demektir. İkisi de kurtarmayı öldürür. */
    if (uzunluk <= ZAMAN_UZUNLUK || uzunluk > EN_BUYUK_CERCEVE) {
      return { guncellemeler, zamanlar, durum: 'bozuk', artikBayt: bayt.length - konum };
    }
    if (konum + CERCEVE_BASLIK + uzunluk > bayt.length) break;
    const kayit = bayt.subarray(konum + CERCEVE_BASLIK, konum + CERCEVE_BASLIK + uzunluk);
    if (crc32(kayit) !== saglamaDegeri) {
      return { guncellemeler, zamanlar, durum: 'bozuk', artikBayt: bayt.length - konum };
    }
    const zaman = new DataView(kayit.buffer, kayit.byteOffset, ZAMAN_UZUNLUK).getFloat64(0, true);
    zamanlar.push(zaman);
    guncellemeler.push(kayit.subarray(ZAMAN_UZUNLUK));
    konum += CERCEVE_BASLIK + uzunluk;
  }

  return { guncellemeler, zamanlar, durum: 'kirpik', artikBayt: bayt.length - konum };
}
