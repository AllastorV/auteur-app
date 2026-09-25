import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { anaDiliniAyarla, at } from './metin';

afterEach(() => anaDiliniAyarla('tr')); // diğer testler Türkçe koşuyor (tests/kurulum-dil.ts)

describe('ana süreç metinleri (yerel diyaloglar, video ilerlemesi, hatalar)', () => {
  it('İngilizce ve Türkçe', () => {
    anaDiliniAyarla('en');
    expect(at('Proje aç')).toBe('Open project');
    expect(at('Kodlanıyor… %s%', '42')).toBe('Encoding… 42%');
    expect(at('Geçersiz %s yolu.', at('video çıktısı'))).toBe('Invalid video output path.');
    anaDiliniAyarla('tr');
    expect(at('Proje aç')).toBe('Proje aç');
    expect(at('Kodlanıyor… %s%', '42')).toBe('Kodlanıyor… 42%');
  });

  it("ana süreçte at('…') ile sarılmış her dizginin İngilizcesi var", () => {
    anaDiliniAyarla('en');
    const eksik: string[] = [];
    for (const ad of fs.readdirSync(__dirname)) {
      if (!ad.endsWith('.ts') || ad.endsWith('.test.ts') || ad === 'metin.ts') continue;
      const icerik = fs.readFileSync(path.join(__dirname, ad), 'utf8');
      for (const m of icerik.matchAll(/\bat\(\s*'((?:[^'\\]|\\.)+)'/g)) {
        if (at(m[1]) === m[1]) eksik.push(`${ad}: ${m[1]}`);
      }
    }
    expect(eksik).toEqual([]);
  });
});
