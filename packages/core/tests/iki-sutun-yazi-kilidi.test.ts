import { describe, expect, it } from 'vitest';
import { tipProfili } from '@storyboard/core/format/profil';
import { yaziTipi } from '@storyboard/core/format/yazi';
import { DOKUMAN_TIPLERI } from '@storyboard/core/model/dokuman-tipi';

/**
 * YAZI KİLİDİ — iki sütunlu belgede de geçerli.
 *
 * Ölçüldü: Fransız belgede ekran Courier çiziyordu (`format/ekran.ts` bunu
 * açıkça sabitliyor), PDF ise varsayılan tercihle Tinos basıyordu. İki
 * sütunlu sayfalayıcı KARAKTER sayıyor (28 sütun); orantılı bir yazıda o
 * sayı gerçek genişliği anlatmaz.
 */
describe('yazı kilidi', () => {
  const tinos = yaziTipi('tinos')!;

  it('iki sütunlu belge Courier’e kilitli — verilen yazı yok sayılıyor', () => {
    expect(tipProfili('goruntu-ses', 'letter', 'tr', tinos).yazi.esgenislik).toBe(true);
    expect(tipProfili('goruntu-ses', 'letter', 'tr', tinos).yaziKilitli).toBe(true);
  });

  it('senaryo ailesi de kilitli kalıyor', () => {
    expect(tipProfili('senaryo', 'letter', 'tr', tinos).yazi.esgenislik).toBe(true);
  });

  it('roman KİLİTLİ DEĞİL — orada ızgara karakter saymıyor', () => {
    expect(tipProfili('roman', 'letter', 'tr', tinos).yazi.id).toBe('tinos');
  });

  it('iki sütunlu bayrağı taşıyan her tip kilitli', () => {
    for (const tip of Object.values(DOKUMAN_TIPLERI)) {
      if (!tip.ikiSutun) continue;
      expect(tipProfili(tip.id, 'letter', 'tr', tinos).yaziKilitli, tip.id).toBe(true);
    }
  });
});
