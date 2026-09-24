import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as Y from 'yjs';
import { breakdownEkiGuncelle } from '@storyboard/core/doc/mutations';
import { breakdownMap } from '@storyboard/core/doc/schema';
import { KATMANLAR, KATMAN_ADLARI } from '@storyboard/core/model/zaman-katmani';
import { EN } from '@storyboard/core/dil/arayuz';

/**
 * Zaman katmanı etiketinin UÇTAN UCA yolu.
 *
 * Etiket Döküm sekmesinde giriliyor → `breakdownEkiGuncelle` ile belgeye
 * yazılıyor → analiz motoru oradan okuyor. Testler o zincirin kopmadığını
 * doğruluyor; "bir bileşen render oldu" değil.
 */

describe('etiket belgeye yazılıyor', () => {
  it('katman ve hikâye sırası saklanıyor', () => {
    const doc = new Y.Doc();
    breakdownEkiGuncelle(doc, 's1', { zamanKatmani: 'geri', hikayeSirasi: 3 });
    const kayit = breakdownMap(doc).get('s1')!;
    expect(kayit.zamanKatmani).toBe('geri');
    expect(kayit.hikayeSirasi).toBe(3);
  });

  it('başka bir alanı güncellemek katmanı SİLMİYOR', () => {
    const doc = new Y.Doc();
    breakdownEkiGuncelle(doc, 's1', { zamanKatmani: 'hayal', hikayeSirasi: 9 });
    breakdownEkiGuncelle(doc, 's1', { notlar: 'gece çekimi' });
    const kayit = breakdownMap(doc).get('s1')!;
    expect(kayit.zamanKatmani, 'katman öteki alan yazılınca kaybolmamalı').toBe('hayal');
    expect(kayit.hikayeSirasi).toBe(9);
    expect(kayit.notlar).toBe('gece çekimi');
  });

  it('sceneId boşsa yazmıyor — kimliksiz sahneye etiket iliştirilemez', () => {
    const doc = new Y.Doc();
    breakdownEkiGuncelle(doc, '', { zamanKatmani: 'geri' });
    expect(breakdownMap(doc).size).toBe(0);
  });

  it('bozuk katman değeri belgeyi kirletmiyor', () => {
    const doc = new Y.Doc();
    breakdownEkiGuncelle(doc, 's1', { zamanKatmani: 'uzay' as never });
    expect(breakdownMap(doc).get('s1')!.zamanKatmani).toBe('simdi');
  });
});

describe('arayüz katmanı gerçekten sunuyor', () => {
  const kaynak = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'inspector', 'BreakdownSekmesi.tsx'),
    'utf8',
  );

  it('Döküm sekmesinde katman seçici var ve mutasyonu çağırıyor', () => {
    expect(kaynak).toContain('breakdown-katman-');
    expect(kaynak).toContain('zamanKatmani:');
  });

  it('hikâye sırası alanı var', () => {
    expect(kaynak).toContain('breakdown-hikaye-');
    expect(kaynak).toContain('hikayeSirasi:');
  });

  it('seçicideki her katmanın İNGİLİZCE karşılığı var', () => {
    const eksik = KATMANLAR.filter((k) => !(KATMAN_ADLARI[k] in EN));
    expect(eksik, `sözlükte karşılığı olmayan katman: ${eksik.join(', ')}`).toEqual([]);
  });
});
