import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  arayuzDiliniAyarla,
  arayuzDiliniSifirla,
  EN,
  t,
  tf,
  VARSAYILAN_ARAYUZ_DILI,
} from '@storyboard/core/dil/arayuz';

/**
 * Arayüz dili — kullanıcı kararı (2026-08-27): varsayılan İNGİLİZCE,
 * Ayarlar'dan değiştirilir. Türkçe dizgi t()'nin anahtarıdır; bilinmeyen
 * anahtar Türkçe döner (sessiz kayıp yok).
 *
 * Buradaki en önemli test SÖZLEŞME testi: koddaki HER t() anahtarının
 * İngilizce karşılığı olmalı. Olmasaydı "varsayılan İngilizce" vaadi
 * sessizce yarım kalırdı — yeni bir dizgi ekleyip sözlüğü unutan herkes
 * bu testte yakalanır.
 */

afterEach(() => {
  /* Testler Türkçe koşuyor (tests/kurulum-dil.ts) — burada değiştirip
     geri koymazsak sonraki dosyanın iddiaları İngilizceye düşer. */
  arayuzDiliniAyarla('tr');
});

describe('t() sözleşmesi', () => {
  it('varsayılan dil İngilizce', () => {
    expect(VARSAYILAN_ARAYUZ_DILI).toBe('en');
    arayuzDiliniSifirla();
    expect(t('Kaydet')).toBe('Save');
  });

  it('Türkçede anahtar olduğu gibi döner', () => {
    arayuzDiliniAyarla('tr');
    expect(t('Kaydet')).toBe('Kaydet');
  });

  it('bilinmeyen anahtar TÜRKÇE düşer — sessiz kayıp yok', () => {
    arayuzDiliniAyarla('en');
    expect(t('bu anahtar sözlükte yok')).toBe('bu anahtar sözlükte yok');
  });

  it('tf yer tutucuları sırayla doldurur', () => {
    arayuzDiliniAyarla('tr');
    expect(tf('%d görselin dosyası bulunamadı', 3)).toBe('3 görselin dosyası bulunamadı');
  });
});

describe('sözlük eksiksizliği — koddaki her t() anahtarı çevrili', () => {
  it("t('…') ile sarılmış her dizginin EN karşılığı var", () => {
    const kokler = [
      path.join(__dirname, '..', 'src'),
      path.join(__dirname, '..', '..', '..', 'apps', 'web', 'src'),
    ];
    const dosyalar: string[] = [];
    const gez = (d: string) => {
      for (const ad of fs.readdirSync(d)) {
        const yol = path.join(d, ad);
        if (fs.statSync(yol).isDirectory()) gez(yol);
        else if (/\.tsx?$/.test(ad)) dosyalar.push(yol);
      }
    };
    kokler.forEach(gez);
    expect(dosyalar.length).toBeGreaterThan(50); // tarama gerçekten geziyor

    const desen = /\bt\('((?:[^'\\]|\\.)+)'\)/g;
    const eksik = new Set<string>();
    for (const yol of dosyalar) {
      if (yol.includes(`dil${path.sep}arayuz.ts`)) continue;
      const icerik = fs.readFileSync(yol, 'utf8');
      for (const m of icerik.matchAll(desen)) {
        const anahtar = m[1].replace(/\\'/g, "'");
        if (!(anahtar in EN)) eksik.add(`${anahtar}  ←  ${path.basename(yol)}`);
      }
    }
    expect([...eksik]).toEqual([]);
  });
});
