import { crc32 } from './gunluk';

/**
 * Yazarlık günlüğü — "bu satırı kim yazdı" sorusunun DEPO katmanı.
 *
 * `veri/gunluk.ts`nin desenini taklit eder (sihir baytı, sürüm alanı, CRC-32
 * sağlama, uzunluk önekli çerçeve) ama AYRI bir dosya/format: içerik
 * (`{zaman, yazar, bloklar}`) günlüğün Yjs güncellemesinden bambaşka bir şey
 * kodluyor ve iki formatı aynı çerçeveleyiciye sıkıştırmak, birinin
 * değişmesini diğerine sessizce sızdırırdı.
 *
 * Bu dosya SAF: dosya sistemi bilmez, tarayıcıda da koşar. `crc32` gunluk.ts'
 * ten alınıyor — sağlama tablosunu ikinci kez kurmak yerine.
 *
 * KAPSAM DIŞI (bilerek): `ScriptBlock`'a ya da Yjs belgesine yazar alanı
 * EKLENMEDİ. Ölçüldü: çıpalar zaten ~5 MB ve belgeye eklenen her alan her
 * çıpaya ve her ağ paketine giriyor. Yazarlık kaydı belgenin DIŞINDA, bu ayrı
 * günlükte duruyor.
 */

/** Dosya başlığı — `MZYZ` (MiZansen YaZarlık). Yabancı dosyayı oynatmamak için. */
export const YAZARLIK_SIHIR = new Uint8Array([0x4d, 0x5a, 0x59, 0x5a]);
export const YAZARLIK_SURUM = 1;
/** Başlık: sihir(4) + sürüm(2). */
export const YAZARLIK_BASLIK_UZUNLUK = 6;
/** Çerçeve başlığı: uzunluk(4) + sağlama(4). */
const CERCEVE_BASLIK = 8;

/**
 * Tek bir çerçevenin kabul edilebilir en büyük boyu.
 *
 * `gunluk.ts`'in 64 MiB'lik tavanından KASITEN küçük: bir yazarlık kaydı bir
 * ad ve birkaç blok kimliğinden ibaret, gerçek bir kaydın kilobaytı aşması
 * beklenmez. Tavan yine de aynı gerekçeyle var — bozuk bir uzunluk alanı
 * devasa bir ayırma denemesine yol açmamalı.
 */
export const YAZARLIK_EN_BUYUK_CERCEVE = 1024 * 1024;

/** Tek bir dizge alanının en çok bayt uzunluğu (u16 önek sınırı). */
const EN_UZUN_DIZGI = 0xffff;

export interface YazarlikKaydi {
  /** ms epoch — yazımın olduğu an. */
  zaman: number;
  /** Yazan kişinin adı. BOŞ OLAMAZ — boş ad çağıran tarafından elenmeli. */
  yazar: string;
  /** Bu kayıtta dokunulan blokların kimlikleri. BOŞ OLAMAZ. */
  bloklar: string[];
}

const KODLAYICI = new TextEncoder();
const COZUCU = new TextDecoder();

/** Yeni bir yazarlık dosyasının başlığı. Yalnız dosya oluşturulurken yazılır. */
export function yazarlikBasligi(): Uint8Array {
  const b = new Uint8Array(YAZARLIK_BASLIK_UZUNLUK);
  b.set(YAZARLIK_SIHIR, 0);
  new DataView(b.buffer).setUint16(4, YAZARLIK_SURUM, true);
  return b;
}

function dizgiKodla(metin: string): Uint8Array {
  const bayt = KODLAYICI.encode(metin);
  if (bayt.length > EN_UZUN_DIZGI) {
    throw new Error(`Yazarlik dizgisi cok uzun: ${bayt.length} > ${EN_UZUN_DIZGI}`);
  }
  return bayt;
}

/**
 * Bir yazarlık kaydını günlüğe EKLENECEK çerçeveye çevirir.
 *
 * Yerleşim: zaman(f64,8) + yazarUzunluk(u16,2) + yazarBayt + blokSayisi(u16,2)
 * + [blokUzunluk(u16,2) + blokBayt] × N.
 */
export function yazarlikCercevesi(kayit: YazarlikKaydi): Uint8Array {
  if (!Number.isFinite(kayit.zaman)) throw new Error(`Yazarlik zamani sonlu olmali: ${kayit.zaman}`);
  if (!kayit.yazar) throw new Error('Yazarlik kaydi bos yazarla yazilamaz');
  if (!kayit.bloklar.length) throw new Error('Yazarlik kaydi bos blok listesiyle yazilamaz');
  if (kayit.bloklar.length > EN_UZUN_DIZGI) {
    throw new Error(`Yazarlik kaydinda cok fazla blok: ${kayit.bloklar.length}`);
  }

  const yazarBayt = dizgiKodla(kayit.yazar);
  const blokBaytlari = kayit.bloklar.map(dizgiKodla);
  const blokToplam = blokBaytlari.reduce((t, b) => t + 2 + b.length, 0);
  const kayitUzunluk = 8 + 2 + yazarBayt.length + 2 + blokToplam;
  if (kayitUzunluk > YAZARLIK_EN_BUYUK_CERCEVE) {
    throw new Error(`Yazarlik cercevesi cok buyuk: ${kayitUzunluk} > ${YAZARLIK_EN_BUYUK_CERCEVE}`);
  }

  const cikti = new Uint8Array(CERCEVE_BASLIK + kayitUzunluk);
  const gorunum = new DataView(cikti.buffer);
  let konum = CERCEVE_BASLIK;

  gorunum.setFloat64(konum, kayit.zaman, true);
  konum += 8;
  gorunum.setUint16(konum, yazarBayt.length, true);
  konum += 2;
  cikti.set(yazarBayt, konum);
  konum += yazarBayt.length;
  gorunum.setUint16(konum, blokBaytlari.length, true);
  konum += 2;
  for (const b of blokBaytlari) {
    gorunum.setUint16(konum, b.length, true);
    konum += 2;
    cikti.set(b, konum);
    konum += b.length;
  }

  const kayitBaytlari = cikti.subarray(CERCEVE_BASLIK);
  gorunum.setUint32(0, kayitUzunluk, true);
  gorunum.setUint32(4, crc32(kayitBaytlari), true);
  return cikti;
}

export type YazarlikDurumu =
  | 'tam'
  | 'kirpik'
  | 'bozuk'
  | 'yabanci';

export interface YazarlikOkuma {
  kayitlar: YazarlikKaydi[];
  durum: YazarlikDurumu;
  /** Çözümlenemeyen kuyruğun bayt sayısı. */
  artikBayt: number;
}

/**
 * Bir kaydın gövdesini çözer. `konum` KAYIT İÇİNDEKİ göreli konumdur (0'dan
 * başlar) — `gorunum` de `kayit` üzerinde KURULUR, çağıranın tam dosya
 * arabelleğiyle KARIŞTIRILMAZ; aksi hâlde sınır denetimleri (`kayit.length`
 * ile karşılaştırma) mutlak bir konumla yapılır ve her zaman yanlışlıkla
 * tetiklenir.
 *
 * Sınır hatasında (dizgi/blok sayısı gövdeyi aşıyor) `null` döner — çağıran
 * bunu "bozuk" sayar; gunluk.ts'teki CRC denetimiyle aynı güven sınırı.
 */
function govdeCoz(kayit: Uint8Array): YazarlikKaydi | null {
  try {
    const gorunum = new DataView(kayit.buffer, kayit.byteOffset, kayit.byteLength);
    let konum = 0;
    const zaman = gorunum.getFloat64(konum, true);
    konum += 8;
    const yazarUzunluk = gorunum.getUint16(konum, true);
    konum += 2;
    if (konum + yazarUzunluk > kayit.length) return null;
    const yazar = COZUCU.decode(kayit.subarray(konum, konum + yazarUzunluk));
    konum += yazarUzunluk;
    if (konum + 2 > kayit.length) return null;
    const blokSayisi = gorunum.getUint16(konum, true);
    konum += 2;
    const bloklar: string[] = [];
    for (let i = 0; i < blokSayisi; i++) {
      if (konum + 2 > kayit.length) return null;
      const uzunluk = gorunum.getUint16(konum, true);
      konum += 2;
      if (konum + uzunluk > kayit.length) return null;
      bloklar.push(COZUCU.decode(kayit.subarray(konum, konum + uzunluk)));
      konum += uzunluk;
    }
    if (konum !== kayit.length) return null;
    return { zaman, yazar, bloklar };
  } catch {
    return null;
  }
}

/**
 * Yazarlık günlüğünü çözümler ve BOZULMANIN BAŞLADIĞI yerde durur.
 *
 * `gunluk.ts`teki `gunlukCozumle` ile aynı kural: sağlam ön ek kurtarılır,
 * yarım kalan son çerçeve YALNIZ kendini götürür. Yazarlık kayıtları
 * birbirinden bağımsız (Yjs güncellemeleri gibi artımlı/sıraya bağlı değil),
 * yine de bozuk bir çerçeveden SONRASI atlanmıyor: dosyanın geri kalanının
 * neden bozulduğu bilinmiyor (kısmi disk hatası, çökme) ve atlanan kayıtlar
 * sessizce kaybolmuş gibi görünmemeli.
 */
export function yazarlikCozumle(bayt: Uint8Array): YazarlikOkuma {
  const bos: YazarlikOkuma = { kayitlar: [], durum: 'yabanci', artikBayt: bayt.length };
  if (bayt.length < YAZARLIK_BASLIK_UZUNLUK) return bos;
  for (let i = 0; i < YAZARLIK_SIHIR.length; i++) if (bayt[i] !== YAZARLIK_SIHIR[i]) return bos;
  const gorunum = new DataView(bayt.buffer, bayt.byteOffset, bayt.byteLength);
  if (gorunum.getUint16(4, true) !== YAZARLIK_SURUM) return bos;

  const kayitlar: YazarlikKaydi[] = [];
  let konum = YAZARLIK_BASLIK_UZUNLUK;

  for (;;) {
    if (konum === bayt.length) return { kayitlar, durum: 'tam', artikBayt: 0 };
    if (konum + CERCEVE_BASLIK > bayt.length) break;
    const uzunluk = gorunum.getUint32(konum, true);
    const saglamaDegeri = gorunum.getUint32(konum + 4, true);
    if (uzunluk === 0 || uzunluk > YAZARLIK_EN_BUYUK_CERCEVE) {
      return { kayitlar, durum: 'bozuk', artikBayt: bayt.length - konum };
    }
    if (konum + CERCEVE_BASLIK + uzunluk > bayt.length) break;
    const kayitBaytlari = bayt.subarray(konum + CERCEVE_BASLIK, konum + CERCEVE_BASLIK + uzunluk);
    if (crc32(kayitBaytlari) !== saglamaDegeri) {
      return { kayitlar, durum: 'bozuk', artikBayt: bayt.length - konum };
    }
    const kayit = govdeCoz(kayitBaytlari);
    if (!kayit) return { kayitlar, durum: 'bozuk', artikBayt: bayt.length - konum };
    kayitlar.push(kayit);
    konum += CERCEVE_BASLIK + uzunluk;
  }

  return { kayitlar, durum: 'kirpik', artikBayt: bayt.length - konum };
}

/** Varsayılan birleştirme penceresi — kullanıcı kararı: 30 saniye. */
export const BIRLESTIRME_PENCERESI_MS = 30_000;

/** İki blok listesi (sırasız) aynı kümeyi mi taşıyor. */
function ayniBlokKumesi(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const kume = new Set(a);
  return b.every((id) => kume.has(id));
}

/**
 * Ardışık kayıtları birleştirir: AYNI yazarın AYNI blok kümesine, verilen
 * pencere içinde art arda yazdığı kayıtlar TEK kayda iner (en yeni zamanla).
 *
 * GEREKÇE — ÖLÇÜLDÜ: `yazici.ts`nin 1 saniyelik boşaltma döngüsüyle aynı
 * cadence'te bir yazarlık kaydı üretilirse (bkz. `agir-yazarlik-boyut.test.ts`),
 * birleştirmesiz günlük saniyede bir kayıt ≈ dakikada 60 kayıt ≈ 4000 bloklu,
 * 10 oturumluk gerçekçi bir günde onbinlerce kayıt, aya katlanınca onlarca MB
 * demek. Aynı yazarın aynı bloğa yazmaya DEVAM etmesi tipik durum (bir
 * paragrafı yazmak saniyeler sürer) — bu durumu tek kayda indirmek, bilgiyi
 * KAYBETMEDEN (kim, hangi blok, ne zamana kadar) boyutu bir kerteden fazla
 * küçültüyor.
 *
 * `kayitlar` KRONOLOJİK SIRALI varsayılıyor (günlükten okunan sıra zaten
 * budur — dosyaya EKLENEREK yazılıyor). Girdi değiştirilmiyor, yeni dizi
 * dönüyor.
 */
export function birlestir(
  kayitlar: readonly YazarlikKaydi[],
  pencereMs: number = BIRLESTIRME_PENCERESI_MS,
): YazarlikKaydi[] {
  const sonuc: YazarlikKaydi[] = [];
  for (const kayit of kayitlar) {
    const son = sonuc[sonuc.length - 1];
    if (
      son &&
      son.yazar === kayit.yazar &&
      ayniBlokKumesi(son.bloklar, kayit.bloklar) &&
      kayit.zaman - son.zaman <= pencereMs
    ) {
      sonuc[sonuc.length - 1] = { ...son, zaman: kayit.zaman };
      continue;
    }
    sonuc.push(kayit);
  }
  return sonuc;
}

/**
 * Verilen bloğu ANAN EN YENİ kaydı bulur. Yoksa `null`.
 *
 * Uydurma isim ya da "bilinmiyor" dizesi DÖNMÜYOR bilerek — o karar çağırana
 * ait (arayüz "bilinmiyor" gösterebilir, dışa aktarım alanı boş bırakabilir).
 *
 * `kayitlar` kronolojik sıralı varsayılıyor; en yeniden en eskiye taranıyor.
 */
export function kimYazdi(
  kayitlar: readonly YazarlikKaydi[],
  blokId: string,
): { yazar: string; zaman: number } | null {
  for (let i = kayitlar.length - 1; i >= 0; i--) {
    const kayit = kayitlar[i];
    if (kayit.bloklar.includes(blokId)) return { yazar: kayit.yazar, zaman: kayit.zaman };
  }
  return null;
}
