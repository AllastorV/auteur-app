import { describe, expect, it } from 'vitest';
import {
  BASLIK_UZUNLUK,
  EN_BUYUK_CERCEVE,
  GUNLUK_SIHIR,
  cerceve,
  crc32,
  gunlukBasligi,
  gunlukCozumle,
} from '@storyboard/core/veri/gunluk';

const yuk = (n: number, tohum = 1) =>
  Uint8Array.from({ length: n }, (_, i) => (i * 31 + tohum * 17) % 251);

/** Başlık + verilen çerçeveler; gerçek bir günlük dosyasının baytları. */
function gunluk(...cerceveler: Uint8Array[]): Uint8Array {
  const parcalar = [gunlukBasligi(), ...cerceveler];
  const toplam = parcalar.reduce((t, p) => t + p.length, 0);
  const cikti = new Uint8Array(toplam);
  let k = 0;
  for (const p of parcalar) { cikti.set(p, k); k += p.length; }
  return cikti;
}

describe('crc32', () => {
  it('bilinen değeri verir', () => {
    // "123456789" → 0xCBF43926 (IEEE CRC-32 kontrol değeri).
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  /* Basit toplam yerine CRC seçilmesinin sebebi: çökmede kimi dosya
     sistemleri dosyayı SIFIRLA doldurarak uzatıyor. Sıfır dizisinin toplamı
     sıfırdır ve bozuk çerçeve geçerli görünürdü. */
  it('sıfır dizisi için sıfır DÖNDÜRMEZ', () => {
    expect(crc32(new Uint8Array(64))).not.toBe(0);
  });
});

describe('günlük — yazma ve okuma', () => {
  it('yazılan güncellemeler aynen ve sırayla geri gelir', () => {
    const a = yuk(40, 1);
    const b = yuk(7, 2);
    const c = yuk(1200, 3);
    const okuma = gunlukCozumle(gunluk(cerceve(a, 1000), cerceve(b, 2000), cerceve(c, 3000)));
    expect(okuma.durum).toBe('tam');
    expect(okuma.artikBayt).toBe(0);
    expect(okuma.guncellemeler).toEqual([a, b, c]);
    expect(okuma.zamanlar).toEqual([1000, 2000, 3000]);
  });

  it('yalnız başlıktan ibaret günlük tamdır, boştur', () => {
    const okuma = gunlukCozumle(gunlukBasligi());
    expect(okuma.durum).toBe('tam');
    expect(okuma.guncellemeler).toEqual([]);
  });

  it('boş güncelleme ve sonsuz olmayan zaman reddedilir', () => {
    expect(() => cerceve(new Uint8Array(0), 1)).toThrow(/Bos guncelleme/);
    expect(() => cerceve(yuk(4), Number.NaN)).toThrow(/sonlu/);
  });
});

describe('§15.5 — yarım kalmış günlük kaydı kurtarmayı bozmuyor', () => {
  /* Çökme izi budur: son çerçeve yarım yazılmış. Sağlam ÖN EK eksiksiz
     kurtarılmalı. Kırpma noktası tek tek denenir — "bir yerde çalışıyor"
     yetmez, HER yerde çalışmalı. */
  it('son çerçevenin her kırpılma noktasında önceki çerçeveler kurtarılır', () => {
    const a = yuk(40, 1);
    const b = yuk(64, 2);
    const son = cerceve(b, 2000);
    const tam = gunluk(cerceve(a, 1000), son);

    // `kes = son.length` son çerçeveyi TAMAMEN siler; o dosya kırpık değil
    // eksiksizdir ve ayrıca iddia edilir.
    for (let kes = 1; kes < son.length; kes++) {
      const kirpik = tam.subarray(0, tam.length - kes);
      const okuma = gunlukCozumle(kirpik);
      expect(okuma.guncellemeler, `kes=${kes}`).toEqual([a]);
      expect(okuma.zamanlar, `kes=${kes}`).toEqual([1000]);
      expect(okuma.durum, `kes=${kes}`).toBe('kirpik');
      expect(okuma.artikBayt, `kes=${kes}`).toBe(son.length - kes);
    }

    const tamamenSilinmis = gunlukCozumle(tam.subarray(0, tam.length - son.length));
    expect(tamamenSilinmis.durum).toBe('tam');
    expect(tamamenSilinmis.guncellemeler).toEqual([a]);
  });

  it('tek çerçeveli günlük tamamen kırpılırsa boş ama TAM okunur', () => {
    const okuma = gunlukCozumle(gunluk(cerceve(yuk(20), 1)).subarray(0, BASLIK_UZUNLUK));
    expect(okuma.durum).toBe('tam');
    expect(okuma.guncellemeler).toEqual([]);
  });
});

describe('bozulma — sağlam ön ek korunur, gerisi bildirilir', () => {
  it('yükte tek bit bozulması o çerçevede durdurur', () => {
    const a = yuk(40, 1);
    const bozuk = gunluk(cerceve(a, 1000), cerceve(yuk(30, 2), 2000));
    // İkinci çerçevenin yükünün ilk baytını çevir.
    bozuk[BASLIK_UZUNLUK + (8 + 8 + 40) + 8 + 8] ^= 0xff;
    const okuma = gunlukCozumle(bozuk);
    expect(okuma.durum).toBe('bozuk');
    expect(okuma.guncellemeler).toEqual([a]);
    expect(okuma.artikBayt).toBeGreaterThan(0);
  });

  /* Zaman damgası sağlamanın KAPSAMINDA. Kapsam dışı bırakılsaydı yırtılmış
     bir yazım geçerli çerçeve gibi görünür ve kullanıcıya §15.3'te uydurma
     bir süre ("47 saatlik iş bulundu") gösterilirdi. */
  it('zaman damgasındaki bozulma da yakalanır', () => {
    const a = yuk(24, 1);
    const bozuk = gunluk(cerceve(a, 1000), cerceve(yuk(24, 2), 2000));
    // İkinci çerçevenin zaman alanının ilk baytı.
    bozuk[BASLIK_UZUNLUK + (8 + 8 + 24) + 8] ^= 0xff;
    const okuma = gunlukCozumle(bozuk);
    expect(okuma.durum).toBe('bozuk');
    expect(okuma.guncellemeler).toEqual([a]);
  });

  /* Çökmede sıfırla dolan kuyruk: uzunluk alanı sıfır okunur. Uzunluk
     muhafızı olmasa sonsuz döngüye girerdi — kurtarma hiç dönmezdi. */
  it('sıfırla dolmuş kuyruk sonsuz döngü değil BOZUK verir', () => {
    const a = yuk(40, 1);
    const temel = gunluk(cerceve(a, 1000));
    const sifirli = new Uint8Array(temel.length + 512);
    sifirli.set(temel, 0);
    const okuma = gunlukCozumle(sifirli);
    expect(okuma.durum).toBe('bozuk');
    expect(okuma.guncellemeler).toEqual([a]);
    expect(okuma.artikBayt).toBe(512);
  });

  /* Bozuk bir uzunluk alanı devasa bir ayırma denemesine yol açarsa kurtarma
     belleksiz kalır ve üçüncü katman da devreye giremez. */
  it('saçma uzunluk alanı devasa ayırma denemez', () => {
    const temel = gunluk(cerceve(yuk(16), 1));
    const kotu = new Uint8Array(temel.length + 8);
    kotu.set(temel, 0);
    new DataView(kotu.buffer).setUint32(temel.length, EN_BUYUK_CERCEVE + 1, true);
    const t = performance.now();
    const okuma = gunlukCozumle(kotu);
    expect(performance.now() - t).toBeLessThan(200);
    expect(okuma.durum).toBe('bozuk');
  });

  it('yabancı sihir ve bilinmeyen sürüm oynatılmaz', () => {
    const yabanci = gunluk(cerceve(yuk(16), 1));
    yabanci[0] ^= 0xff;
    expect(gunlukCozumle(yabanci).durum).toBe('yabanci');

    const eski = gunluk(cerceve(yuk(16), 1));
    new DataView(eski.buffer).setUint16(4, 99, true);
    const okuma = gunlukCozumle(eski);
    expect(okuma.durum).toBe('yabanci');
    expect(okuma.guncellemeler).toEqual([]);
    expect(GUNLUK_SIHIR).toHaveLength(4);
  });
});
