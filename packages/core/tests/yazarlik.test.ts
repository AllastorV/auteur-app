import { describe, expect, it } from 'vitest';
import {
  BIRLESTIRME_PENCERESI_MS,
  YAZARLIK_BASLIK_UZUNLUK,
  YAZARLIK_EN_BUYUK_CERCEVE,
  YAZARLIK_SIHIR,
  birlestir,
  kimYazdi,
  yazarlikBasligi,
  yazarlikCercevesi,
  yazarlikCozumle,
  type YazarlikKaydi,
} from '@storyboard/core/veri/yazarlik';

/** Başlık + verilen çerçeveler; gerçek bir yazarlık dosyasının baytları. */
function gunluk(...cerceveler: Uint8Array[]): Uint8Array {
  const parcalar = [yazarlikBasligi(), ...cerceveler];
  const toplam = parcalar.reduce((t, p) => t + p.length, 0);
  const cikti = new Uint8Array(toplam);
  let k = 0;
  for (const p of parcalar) { cikti.set(p, k); k += p.length; }
  return cikti;
}

const kayit = (zaman: number, yazar: string, ...bloklar: string[]): YazarlikKaydi => ({
  zaman, yazar, bloklar,
});

describe('yazarlik — yazma ve okuma', () => {
  it('yazılan kayıtlar aynen ve sırayla geri gelir', () => {
    const a = kayit(1000, 'Ayşe', 'sb_1');
    const b = kayit(2000, 'Ayşe', 'sb_1', 'sb_2');
    const c = kayit(3000, 'Deniz', 'sb_3');
    const okuma = yazarlikCozumle(gunluk(yazarlikCercevesi(a), yazarlikCercevesi(b), yazarlikCercevesi(c)));
    expect(okuma.durum).toBe('tam');
    expect(okuma.artikBayt).toBe(0);
    expect(okuma.kayitlar).toEqual([a, b, c]);
  });

  it('yalnız başlıktan ibaret günlük tamdır, boştur', () => {
    const okuma = yazarlikCozumle(yazarlikBasligi());
    expect(okuma.durum).toBe('tam');
    expect(okuma.kayitlar).toEqual([]);
  });

  it('Türkçe karakterli ad ve blok kimlikleri sağlam çözülür', () => {
    const a = kayit(1, 'Şükrü Ömer İçöz', 'sb_ç', 'sb_ğ');
    const okuma = yazarlikCozumle(gunluk(yazarlikCercevesi(a)));
    expect(okuma.kayitlar).toEqual([a]);
  });

  it('boş yazar, boş blok listesi ve sonsuz olmayan zaman reddedilir', () => {
    expect(() => yazarlikCercevesi(kayit(1, ''))).toThrow(/bos yazarla/);
    expect(() => yazarlikCercevesi({ zaman: 1, yazar: 'a', bloklar: [] })).toThrow(/bos blok/);
    expect(() => yazarlikCercevesi(kayit(Number.NaN, 'a', 'b'))).toThrow(/sonlu/);
  });
});

describe('§yarım/bozuk son çerçeve YALNIZ kendini götürür', () => {
  it('son çerçevenin her kırpılma noktasında önceki kayıtlar kurtarılır', () => {
    const a = kayit(1000, 'Ayşe', 'sb_1');
    const sonCerceve = yazarlikCercevesi(kayit(2000, 'Deniz', 'sb_2', 'sb_3'));
    const tam = gunluk(yazarlikCercevesi(a), sonCerceve);

    for (let kes = 1; kes < sonCerceve.length; kes++) {
      const kirpik = tam.subarray(0, tam.length - kes);
      const okuma = yazarlikCozumle(kirpik);
      expect(okuma.kayitlar, `kes=${kes}`).toEqual([a]);
      expect(okuma.durum, `kes=${kes}`).toBe('kirpik');
      expect(okuma.artikBayt, `kes=${kes}`).toBe(sonCerceve.length - kes);
    }

    const tamamenSilinmis = yazarlikCozumle(tam.subarray(0, tam.length - sonCerceve.length));
    expect(tamamenSilinmis.durum).toBe('tam');
    expect(tamamenSilinmis.kayitlar).toEqual([a]);
  });
});

describe('bozulma — sağlam ön ek korunur, gerisi bildirilir', () => {
  it('ikinci çerçevenin yükünde tek bit bozulması o çerçevede durdurur', () => {
    const a = kayit(1000, 'Ayşe', 'sb_1');
    const b = kayit(2000, 'Deniz', 'sb_2');
    const bozuk = gunluk(yazarlikCercevesi(a), yazarlikCercevesi(b));
    bozuk[bozuk.length - 1] ^= 0xff; // b çerçevesinin son baytı — blok kimliğinin içinde.
    const okuma = yazarlikCozumle(bozuk);
    expect(okuma.durum).toBe('bozuk');
    expect(okuma.kayitlar).toEqual([a]);
    expect(okuma.artikBayt).toBeGreaterThan(0);
  });

  it('sıfırla dolmuş kuyruk sonsuz döngü değil BOZUK verir', () => {
    const a = kayit(1000, 'Ayşe', 'sb_1');
    const temel = gunluk(yazarlikCercevesi(a));
    const sifirli = new Uint8Array(temel.length + 512);
    sifirli.set(temel, 0);
    const okuma = yazarlikCozumle(sifirli);
    expect(okuma.durum).toBe('bozuk');
    expect(okuma.kayitlar).toEqual([a]);
  });

  it('saçma uzunluk alanı devasa ayırma denemez', () => {
    const temel = gunluk(yazarlikCercevesi(kayit(1, 'a', 'b')));
    const kotu = new Uint8Array(temel.length + 8);
    kotu.set(temel, 0);
    new DataView(kotu.buffer).setUint32(temel.length, YAZARLIK_EN_BUYUK_CERCEVE + 1, true);
    const t = performance.now();
    const okuma = yazarlikCozumle(kotu);
    expect(performance.now() - t).toBeLessThan(200);
    expect(okuma.durum).toBe('bozuk');
  });

  it('yabancı sihir ve bilinmeyen sürüm oynatılmaz', () => {
    const yabanci = gunluk(yazarlikCercevesi(kayit(1, 'a', 'b')));
    yabanci[0] ^= 0xff;
    expect(yazarlikCozumle(yabanci).durum).toBe('yabanci');

    const eski = gunluk(yazarlikCercevesi(kayit(1, 'a', 'b')));
    new DataView(eski.buffer).setUint16(4, 99, true);
    const okuma = yazarlikCozumle(eski);
    expect(okuma.durum).toBe('yabanci');
    expect(okuma.kayitlar).toEqual([]);
    expect(YAZARLIK_SIHIR).toHaveLength(4);
    expect(YAZARLIK_BASLIK_UZUNLUK).toBe(6);
  });
});

describe('birlestir — aynı yazar + aynı blok kümesi, pencere içinde tek kayda iner', () => {
  it('pencere İÇİNDE ardışık yazımlar TEK kayda iniyor, zaman EN YENİYE güncelleniyor', () => {
    const kayitlar = [
      kayit(0, 'Ayşe', 'sb_1'),
      kayit(1000, 'Ayşe', 'sb_1'),
      kayit(29_000, 'Ayşe', 'sb_1'),
    ];
    const sonuc = birlestir(kayitlar);
    expect(sonuc).toEqual([kayit(29_000, 'Ayşe', 'sb_1')]);
  });

  it('pencere DIŞINDA iki ayrı kayıt kalıyor', () => {
    const kayitlar = [kayit(0, 'Ayşe', 'sb_1'), kayit(30_001, 'Ayşe', 'sb_1')];
    expect(birlestir(kayitlar)).toEqual(kayitlar);
  });

  it('tam pencere sınırında (=30000ms) HÂLÂ birleşiyor', () => {
    const kayitlar = [kayit(0, 'Ayşe', 'sb_1'), kayit(30_000, 'Ayşe', 'sb_1')];
    expect(birlestir(kayitlar)).toEqual([kayit(30_000, 'Ayşe', 'sb_1')]);
  });

  it('FARKLI yazar, aynı blok, pencere içi → AYRI kayıt', () => {
    const kayitlar = [kayit(0, 'Ayşe', 'sb_1'), kayit(1000, 'Deniz', 'sb_1')];
    expect(birlestir(kayitlar)).toEqual(kayitlar);
  });

  it('aynı yazar, FARKLI blok kümesi, pencere içi → AYRI kayıt', () => {
    const kayitlar = [kayit(0, 'Ayşe', 'sb_1'), kayit(1000, 'Ayşe', 'sb_2')];
    expect(birlestir(kayitlar)).toEqual(kayitlar);
  });

  it('blok kümesi SIRASIZ eşitse yine birleşir', () => {
    const kayitlar = [kayit(0, 'Ayşe', 'sb_1', 'sb_2'), kayit(1000, 'Ayşe', 'sb_2', 'sb_1')];
    expect(birlestir(kayitlar)).toEqual([{ zaman: 1000, yazar: 'Ayşe', bloklar: ['sb_1', 'sb_2'] }]);
  });

  it('özel pencere parametresi kullanılabiliyor', () => {
    const kayitlar = [kayit(0, 'Ayşe', 'sb_1'), kayit(500, 'Ayşe', 'sb_1')];
    expect(birlestir(kayitlar, 100)).toEqual(kayitlar); // 500ms > 100ms pencere
    expect(birlestir(kayitlar, 1000)).toEqual([kayit(500, 'Ayşe', 'sb_1')]);
  });

  it('varsayılan pencere 30 saniye', () => {
    expect(BIRLESTIRME_PENCERESI_MS).toBe(30_000);
  });

  it('boş girdi boş çıktı verir, girdi DEĞİŞTİRİLMEZ', () => {
    const girdi = [kayit(0, 'Ayşe', 'sb_1')];
    const kopya = [...girdi];
    birlestir(girdi);
    expect(girdi).toEqual(kopya);
    expect(birlestir([])).toEqual([]);
  });
});

describe('kimYazdi — en yeni kaydı bulur', () => {
  it('bloğu anan en YENİ kaydı döndürür, eskisini değil', () => {
    const kayitlar = [
      kayit(1000, 'Ayşe', 'sb_1'),
      kayit(2000, 'Deniz', 'sb_2'),
      kayit(3000, 'Deniz', 'sb_1'),
    ];
    expect(kimYazdi(kayitlar, 'sb_1')).toEqual({ yazar: 'Deniz', zaman: 3000 });
  });

  it('bloğa hiç dokunulmadıysa null döner', () => {
    expect(kimYazdi([kayit(1000, 'Ayşe', 'sb_1')], 'sb_yok')).toBeNull();
    expect(kimYazdi([], 'sb_1')).toBeNull();
  });

  it('kayıt birden çok blok taşıyorsa hepsinde bulunur', () => {
    const kayitlar = [kayit(1000, 'Ayşe', 'sb_1', 'sb_2', 'sb_3')];
    expect(kimYazdi(kayitlar, 'sb_2')).toEqual({ yazar: 'Ayşe', zaman: 1000 });
  });
});
