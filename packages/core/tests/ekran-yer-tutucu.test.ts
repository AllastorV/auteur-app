import { afterEach, expect, it } from 'vitest';
import { arayuzDiliniAyarla } from '@storyboard/core/dil/arayuz';
import { blokKurallari } from '@storyboard/core/format/ekran';
import { profilOlustur } from '@storyboard/core/format/profil';

afterEach(() => arayuzDiliniAyarla('tr'));

it('İngilizce arayüzde senaryo sayfasının boş blok etiketleri İngilizcedir', () => {
  arayuzDiliniAyarla('en');
  const css = blokKurallari(profilOlustur('amerikan', 'letter', 'tr'));
  expect(css).toContain('content:\'Scene heading\'');
  expect(css).toContain('content:\'Action\'');
  expect(css).not.toContain('content:\'Sahne başlığı\'');
  expect(css).not.toContain('content:\'Aksiyon\'');
});
