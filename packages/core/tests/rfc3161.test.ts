import { describe, expect, it } from 'vitest';
import {
  VARSAYILAN_TSA,
  pkiDurumu,
  zamanDamgasiAl,
  zamanDamgasiIstegi,
} from '@storyboard/core/kanit/rfc3161';

/**
 * RFC 3161 — istek elle DER kodlanıyor, yanıt opak saklanıyor.
 *
 * DER elle yazıldığı için TEK doğrulama yolu ALTIN VEKTÖR: baytların
 * tamamı çivileniyor. "Bir istek üretildi" demek burada hiçbir şey ölçmez —
 * yanlış kodlanmış bir istek de üretilir, sunucu da reddeder ve hata ağ
 * hatası gibi görünür.
 */

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const bayt = (h: string) => new Uint8Array(h.match(/../gu)!.map((x) => parseInt(x, 16)));

const OZET = new Uint8Array(32).fill(0xaa);
const NONCE = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

/**
 * ```
 * SEQUENCE (0x3f)
 *   INTEGER 1                       020101
 *   SEQUENCE (0x31)                 MessageImprint
 *     SEQUENCE (0x0d)               AlgorithmIdentifier
 *       OID 2.16.840.1.101.3.4.2.1  SHA-256
 *       NULL
 *     OCTET STRING (32)             özet
 *   INTEGER nonce                   0204 01020304
 *   BOOLEAN TRUE                    0101ff  (certReq)
 * ```
 */
const ALTIN =
  '303f'
  + '020101'
  + '3031'
  + '300d06096086480165030402010500'
  + '0420' + 'aa'.repeat(32)
  + '020401020304'
  + '0101ff';

describe('TimeStampReq', () => {
  it('altın vektör — bayt bayt', () => {
    expect(hex(zamanDamgasiIstegi(OZET, NONCE))).toBe(ALTIN);
  });

  /* DER'de en anlamlı bit 1 ise sayı NEGATİF okunur; başa 0x00 eklenmezse
     sunucu nonce'u bambaşka bir değer sanar ve yanıtı eşleştiremeyiz. */
  it('en anlamlı biti 1 olan nonce başa sıfır alıyor', () => {
    const istek = hex(zamanDamgasiIstegi(OZET, new Uint8Array([0x80])));
    expect(istek).toContain('02020080');
  });

  it('baştaki gereksiz sıfırlar kırpılıyor', () => {
    const istek = hex(zamanDamgasiIstegi(OZET, new Uint8Array([0x00, 0x00, 0x05])));
    expect(istek).toContain('020105');
  });

  it('32 bayt olmayan özet ve boş nonce reddediliyor', () => {
    expect(() => zamanDamgasiIstegi(new Uint8Array(16), NONCE)).toThrow();
    expect(() => zamanDamgasiIstegi(OZET, new Uint8Array(0))).toThrow();
  });
});

describe('PKIStatus', () => {
  it('granted 0, grantedWithMods 1, rejection 2', () => {
    expect(pkiDurumu(bayt('30053003020100'))).toBe(0);
    expect(pkiDurumu(bayt('30053003020101'))).toBe(1);
    expect(pkiDurumu(bayt('30053003020102'))).toBe(2);
  });

  /* Okunamayan yanıt -1 dönüyor, 0 DEĞİL: "bilinmiyor" ile "granted" aynı
     sayıya düşseydi bozuk bir yanıt geçerli sayılırdı. */
  it('bozuk yanıt -1, granted değil', () => {
    expect(pkiDurumu(bayt('ff'))).toBe(-1);
    expect(pkiDurumu(bayt('300502010030'))).toBe(-1);
    expect(pkiDurumu(new Uint8Array(0))).toBe(-1);
  });
});

describe('damga alma', () => {
  const yanitla = (govde: Uint8Array, durum = 200): Getirici =>
    (async () => new Response(govde as BodyInit, { status: durum })) as unknown as Getirici;
  type Getirici = typeof fetch;

  it('granted yanıtta jeton dönüyor', async () => {
    const govde = bayt('30053003020100');
    const sonuc = await zamanDamgasiAl(OZET, { getirici: yanitla(govde), nonce: NONCE });
    expect(sonuc.durum).toBe(0);
    expect(hex(sonuc.jeton)).toBe(hex(govde));
    expect(sonuc.url).toBe(VARSAYILAN_TSA);
  });

  /* REDDEDİLEN YANIT SAKLANMIYOR: "damga alındı" diye kaydetmek,
     kullanıcıya olmayan bir tanıklığı varmış gibi göstermek olurdu. */
  it('reddedilen durum FIRLATIYOR', async () => {
    await expect(zamanDamgasiAl(OZET, {
      getirici: yanitla(bayt('30053003020102')), nonce: NONCE,
    })).rejects.toThrow('PKIStatus 2');
  });

  it('okunamayan yanıt FIRLATIYOR', async () => {
    await expect(zamanDamgasiAl(OZET, {
      getirici: yanitla(bayt('ffff')), nonce: NONCE,
    })).rejects.toThrow('PKIStatus -1');
  });

  /* Hata gövdesi mesaja giriyor ama 300 karaktere kırpılıyor: bir HTML
     hata sayfasının tamamını bildirime basmak hiçbir şey söylemez. */
  it('HTTP hatası gövdeyi taşıyor ve kırpıyor', async () => {
    const uzun = 'x'.repeat(1000);
    const getirici = (async () => new Response(uzun, { status: 502 })) as unknown as Getirici;
    await expect(zamanDamgasiAl(OZET, { getirici, nonce: NONCE }))
      .rejects.toThrow(/TSA 502: x{300}$/u);
  });

  it('istenen adres kullanılıyor', async () => {
    let cagrilan = '';
    const getirici = (async (u: string) => {
      cagrilan = u;
      return new Response(bayt('30053003020100') as BodyInit, { status: 200 });
    }) as unknown as Getirici;
    await zamanDamgasiAl(OZET, { getirici, nonce: NONCE, url: 'https://tsa.example/tsr' });
    expect(cagrilan).toBe('https://tsa.example/tsr');
  });
});
