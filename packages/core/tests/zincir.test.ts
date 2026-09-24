import { describe, expect, it } from 'vitest';
import {
  ZINCIR_BASLIK_UZUNLUK,
  ZINCIR_SIHIR,
  halka,
  ozetEsit,
  ozetHex,
  sifirHalka,
  zincirBasligi,
  zincirCercevesi,
  zincirCozumle,
  zinciriDogrula,
  type ZincirKaydi,
} from '@storyboard/core/veri/zincir';

/**
 * MÜHÜR ZİNCİRİ — çerçeveleme ve bağ.
 *
 * Bu dosyanın işi "bir dosya üretildi" demek değil: kurcalanan her alanın
 * bağı KOPARDIĞINI ölçmek. Kırık bir zincir kurcalanmış zincirden ayırt
 * edilemez ve tam da bu yüzden bozulmanın SESSİZ kalmaması gerekiyor.
 */

const ozet = (n: number): Uint8Array => new Uint8Array(32).fill(n);

const kayit = (p: Partial<ZincirKaydi> = {}): ZincirKaydi => ({
  zaman: 1_700_000_000_000,
  tur: 'muhur',
  tetikleyici: 'elle',
  oncekiHalka: sifirHalka(),
  icerikOzeti: ozet(7),
  icerikBayt: 1234,
  yazar: 'Alp Cavas',
  etiket: 'ilk taslak',
  ...p,
});

/** Başlık + verilen kayıtların çerçeveleri — gerçek bir dosyanın baytları. */
function dosya(kayitlar: readonly ZincirKaydi[]): Uint8Array {
  const parcalar = [zincirBasligi(), ...kayitlar.map(zincirCercevesi)];
  const toplam = parcalar.reduce((n, p) => n + p.length, 0);
  const cikti = new Uint8Array(toplam);
  let k = 0;
  for (const p of parcalar) { cikti.set(p, k); k += p.length; }
  return cikti;
}

/** İki kayıtlık gerçek bir zincir: ikincinin bağı birincinin halkası. */
async function zincir(): Promise<ZincirKaydi[]> {
  const bir = kayit({ etiket: 'birinci' });
  const iki = kayit({
    zaman: 1_700_000_060_000,
    etiket: 'ikinci',
    icerikOzeti: ozet(9),
    oncekiHalka: await halka(bir),
  });
  return [bir, iki];
}

describe('çerçeveleme', () => {
  it('yaz–oku turu kaydı aynen döndürüyor', () => {
    const k = kayit();
    const okuma = zincirCozumle(dosya([k]));
    expect(okuma.durum).toBe('tam');
    expect(okuma.artikBayt).toBe(0);
    expect(okuma.kayitlar).toHaveLength(1);
    const c = okuma.kayitlar[0];
    expect(c.zaman).toBe(k.zaman);
    expect(c.tur).toBe('muhur');
    expect(c.tetikleyici).toBe('elle');
    expect(c.icerikBayt).toBe(1234);
    expect(c.yazar).toBe('Alp Cavas');
    expect(c.etiket).toBe('ilk taslak');
    expect(ozetEsit(c.icerikOzeti, ozet(7))).toBe(true);
  });

  it('boş dizgeler ve boş yazar taşınabiliyor', () => {
    const okuma = zincirCozumle(dosya([kayit({ yazar: '', etiket: '' })]));
    expect(okuma.durum).toBe('tam');
    expect(okuma.kayitlar[0].yazar).toBe('');
  });

  /* GÖVDEDE TEK BAYT ÇEVİRMEK CRC'yi düşürüyor: kanıt dosyasında sessiz
     bir bozulma, kurcalamayı gizlemek olurdu. */
  it('gövdede bir bayt çevrilince bozuk', () => {
    const b = dosya([kayit()]);
    b[ZINCIR_BASLIK_UZUNLUK + 12] ^= 0xff;
    const okuma = zincirCozumle(b);
    expect(okuma.durum).toBe('bozuk');
    expect(okuma.kayitlar).toHaveLength(0);
  });

  /* Yarım kalan son çerçeve YALNIZ kendini götürüyor — çökme anında
     yazılan kayıt eksik kalır ama öncekiler okunur. */
  it('son çerçeve kırpılınca kirpik, öncekiler kurtuluyor', async () => {
    const [bir, iki] = await zincir();
    const tam = dosya([bir, iki]);
    const okuma = zincirCozumle(tam.subarray(0, tam.length - 5));
    expect(okuma.durum).toBe('kirpik');
    expect(okuma.kayitlar).toHaveLength(1);
    expect(okuma.artikBayt).toBeGreaterThan(0);
  });

  it('sihir baytı bozulunca yabancı — dosya OYNATILMIYOR', () => {
    const b = dosya([kayit()]);
    b[0] = ZINCIR_SIHIR[0] ^ 0xff;
    expect(zincirCozumle(b).durum).toBe('yabanci');
  });

  it('sürüm uyuşmazsa yabancı', () => {
    const b = dosya([kayit()]);
    new DataView(b.buffer).setUint16(4, 99, true);
    expect(zincirCozumle(b).durum).toBe('yabanci');
  });

  it('bozuk uzunluk alanı devasa ayırma denemesine yol açmıyor', () => {
    const b = dosya([kayit()]);
    new DataView(b.buffer).setUint32(ZINCIR_BASLIK_UZUNLUK, 0x7fff_ffff, true);
    expect(zincirCozumle(b).durum).toBe('bozuk');
  });

  it('geçersiz özet uzunluğu yazılamıyor', () => {
    expect(() => zincirCercevesi(kayit({ icerikOzeti: new Uint8Array(16) }))).toThrow();
    expect(() => zincirCercevesi(kayit({ oncekiHalka: new Uint8Array(31) }))).toThrow();
  });
});

describe('halka bağı', () => {
  it('sağlam zincir doğrulanıyor', async () => {
    const k = await zincir();
    expect((await zinciriDogrula(k)).saglam).toBe(true);
  });

  it('ilk kaydın bağı sıfır halka olmalı', async () => {
    const [bir, iki] = await zincir();
    const sonuc = await zinciriDogrula([{ ...bir, oncekiHalka: ozet(3) }, iki]);
    expect(sonuc.bulgular).toContainEqual({ tur: 'halka-kopuk', sira: 0 });
  });

  /* HALKA BÜTÜN ALANLARI KAPSIYOR. Kurcalayan biri tek bir alanı
     değiştirse bile bağ kopmalı: zamanı değiştirmek de yazarı değiştirmek
     de aynı sonucu vermeli. Bir alan hesabın dışında kalsaydı, o alan
     serbestçe değiştirilebilirdi. */
  it.each([
    ['zaman', { zaman: 1_700_000_000_001 }],
    ['yazar', { yazar: 'Başkası' }],
    ['etiket', { etiket: 'başka etiket' }],
    ['tetikleyici', { tetikleyici: 'surum' as const }],
    ['icerikBayt', { icerikBayt: 1235 }],
    ['icerikOzeti', { icerikOzeti: ozet(8) }],
  ])('ilk kaydın %s alanı değişince bağ kopuyor', async (_ad, degisiklik) => {
    const [bir, iki] = await zincir();
    const sonuc = await zinciriDogrula([{ ...bir, ...degisiklik }, iki]);
    expect(sonuc.saglam).toBe(false);
    expect(sonuc.bulgular).toContainEqual({ tur: 'halka-kopuk', sira: 1 });
  });

  /* Metin ölçümü DIŞARIDAN geliyor: saf çekirdek dosya okumaz. */
  it('metin özeti uyuşmazsa bulgu düşüyor', async () => {
    const k = await zincir();
    const sonuc = await zinciriDogrula(k, async (i) => (i === 0 ? ozet(7) : ozet(0)));
    expect(sonuc.bulgular).toContainEqual({ tur: 'icerik-uyusmuyor', sira: 1 });
  });

  it('metin bulunamazsa bulgu düşüyor', async () => {
    const k = await zincir();
    const sonuc = await zinciriDogrula(k, async () => null);
    expect(sonuc.bulgular).toContainEqual({ tur: 'metin-eksik', sira: 0 });
  });

  /* Damga kaydı bir MÜHRE dayanmak zorunda: dayanağı olmayan damga,
     hiçbir metne bağlanmayan bir tarih iddiasıdır. */
  it('damga dayandığı mührü buluyor', async () => {
    const bir = kayit({ etiket: 'birinci' });
    const damga = kayit({
      tur: 'damga',
      etiket: 'https://freetsa.org/tsr',
      icerikOzeti: await halka(bir),
      oncekiHalka: await halka(bir),
    });
    expect((await zinciriDogrula([bir, damga])).saglam).toBe(true);
  });

  it('dayanaksız damga yakalanıyor', async () => {
    const bir = kayit({ etiket: 'birinci' });
    const damga = kayit({
      tur: 'damga',
      icerikOzeti: ozet(200),
      oncekiHalka: await halka(bir),
    });
    const sonuc = await zinciriDogrula([bir, damga]);
    expect(sonuc.bulgular).toContainEqual({ tur: 'damga-dayanaksiz', sira: 1 });
  });

  /* Damga kaydında metin ölçümü ARANMIYOR: damganın dayanağı bir metin
     değil bir MÜHÜR. Aranırsa her damga "metin eksik" derdi. */
  it('damga kaydı metin ölçümü istemiyor', async () => {
    const bir = kayit();
    const damga = kayit({
      tur: 'damga', icerikOzeti: await halka(bir), oncekiHalka: await halka(bir),
    });
    const sonuc = await zinciriDogrula([bir, damga], async (i) => (i === 0 ? ozet(7) : null));
    expect(sonuc.saglam).toBe(true);
  });
});

describe('özet yardımcıları', () => {
  it('hex 64 karakter ve kararlı', () => {
    expect(ozetHex(ozet(0xab))).toBe('ab'.repeat(32));
  });

  it('aynı kayıt aynı halkayı veriyor', async () => {
    expect(ozetEsit(await halka(kayit()), await halka(kayit()))).toBe(true);
  });
});
