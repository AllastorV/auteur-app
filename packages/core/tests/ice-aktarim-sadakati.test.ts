// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseFountain, parseFdx, type ScriptBlock, type ScriptBlockType } from '@storyboard/core/model/script';
import { fountainYaz } from '@storyboard/core/disa/fountain';
import { fdxYaz } from '@storyboard/core/disa/fdx';

/**
 * İÇE AKTARMA SADAKATİ — gidiş-dönüş ölçümü.
 *
 * Başka bir programda arşivi olan yazar, geçişin metnini kaybettirmeyeceğini
 * bilmeden taşınmaz. Bu testler o sözü ölçüyor: kendi yazdığımız senaryoyu
 * dışa aktarıp geri okuyunca TİP ve METİN aynı kalmalı.
 *
 * Test verisi ÜRETİLMİŞTİR. Gerçek bir senaryodan alıntı yok — telif
 * kuralı: testler metni değil KURALI tutar.
 *
 * jsdom şart: `parseFdx` DOMParser kullanıyor.
 */

let sayac = 0;
const b = (type: ScriptBlockType, text: string, sceneId = 'sc1', scene = ''): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `${text}${sayac}`, type, text, scene, sceneId });

/** Her blok tipini ve Türkçe'ye özgü harfleri taşıyan temsilî senaryo. */
const SENARYO: ScriptBlock[] = [
  b('scene', 'İÇ. MUTFAK - GECE', 'sc1', '1'),
  b('action', 'Demir masaya oturur. Işık soluk.', 'sc1'),
  b('character', 'DEMİR', 'sc1'),
  b('parenthetical', '(fısıldayarak)', 'sc1'),
  b('dialogue', 'Bu iş burada bitmez.', 'sc1'),
  b('character', 'NALAN (D.S.)', 'sc1'),
  b('dialogue', 'Şafak sökmeden gideceğiz.', 'sc1'),
  b('transition', 'KESME:', 'sc1'),
  b('scene', 'DIŞ. İSKELE - GÜNDÜZ', 'sc2', '2'),
  b('action', 'Martılar. Uzakta bir tekne belirir.', 'sc2'),
  b('character', 'HAKKI', 'sc2'),
  b('dialogue', 'Çağırdığın kişi gelmedi mi?', 'sc2'),
];

const ozet = (bloklar: readonly ScriptBlock[]) => bloklar.map((x) => [x.type, x.text] as const);

describe('Fountain gidiş-dönüş', () => {
  const geri = parseFountain(fountainYaz(SENARYO).metin);

  it('blok sayısı korunuyor', () => {
    expect(ozet(geri)).toHaveLength(SENARYO.length);
  });

  it('her bloğun TİPİ ve METNİ korunuyor', () => {
    expect(ozet(geri)).toEqual(ozet(SENARYO));
  });

  it('Türkçe harfler bozulmuyor', () => {
    const metin = geri.map((x) => x.text).join('\n');
    for (const harf of ['İ', 'ı', 'ş', 'ğ', 'ü', 'ö', 'ç', 'Ş', 'Ğ', 'Ç']) {
      expect(metin.includes(harf) || !SENARYO.some((x) => x.text.includes(harf)))
        .toBe(true);
    }
    expect(metin).toContain('Şafak');
    expect(metin).toContain('Çağırdığın');
  });

  it('sahne sınırları korunuyor — iki sahne, iki sceneId', () => {
    expect(new Set(geri.map((x) => x.sceneId)).size).toBe(2);
  });
});

describe('FDX gidiş-dönüş', () => {
  const geri = parseFdx(fdxYaz(SENARYO));

  it('blok sayısı korunuyor', () => {
    expect(ozet(geri)).toHaveLength(SENARYO.length);
  });

  it('her bloğun TİPİ ve METNİ korunuyor', () => {
    expect(ozet(geri)).toEqual(ozet(SENARYO));
  });

  it('XML kaçışı geri çözülüyor — & < > senaryoda geçebilir', () => {
    sayac = 0;
    const kacisli: ScriptBlock[] = [
      b('scene', 'İÇ. ODA - GÜN', 'sc1', '1'),
      b('action', 'Tabelada "AÇIK & KAPALI" yazıyor; <perde> inik.', 'sc1'),
    ];
    const d = parseFdx(fdxYaz(kacisli));
    expect(d[1].text).toBe('Tabelada "AÇIK & KAPALI" yazıyor; <perde> inik.');
  });

  it('sahne numarası korunuyor', () => {
    const sahneler = geri.filter((x) => x.type === 'scene');
    expect(sahneler.map((x) => x.scene)).toEqual(['1', '2']);
  });
});

describe('bozuk girdi SESSİZCE yutulmuyor', () => {
  it('geçersiz XML açık hata veriyor', () => {
    expect(() => parseFdx('<FinalDraft><Paragraph>')).toThrow();
  });

  it('boş fountain boş belge üretiyor, çökmüyor', () => {
    expect(parseFountain('')).toEqual([]);
  });
});
