import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * YAPI RENGİ KURALI — kullanıcı kararı "P4".
 *
 * Kural: renk YALNIZ yapı listesinde anlam taşır; kağıt, araç çubuğu ve
 * düğmeler amber kalır. Bu testin koruduğu şey rengin kendisi değil,
 * kuralın TEK YERDE yaşaması: renkler bileşenlerin içine sabit olarak
 * serpiştirilirse palet değiştiğinde biri güncellenir, öteki unutulur ve
 * arayüz iki dilli olur. Daha önce tam olarak bu olmuştu — gezginde
 * #5a4a80 ve #2a3550 duruyordu, üstelik bir kısmı Tailwind'in kendi
 * amber tonlarıydı, yani projenin paletinden bile değildi.
 */

const kok = path.resolve(__dirname, '../src');
const gezgin = path.join(kok, 'components/script/ScriptNavigator.tsx');
const oku = (p: string) => fs.readFileSync(p, 'utf8');

/** Yorum satırlarını atar — gerekçe metninde geçen renk adı ihlal değildir. */
function koduAyikla(kaynak: string): string {
  return kaynak
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
}

describe('yapı renkleri tek yerden geliyor', () => {
  it('gezginde ham onaltılık renk kalmadı', () => {
    const kod = koduAyikla(oku(gezgin));
    const hamlar = kod.match(/#[0-9a-fA-F]{6}/g) ?? [];
    expect(hamlar).toEqual([]);
  });

  it('gezgin Tailwind\'in kendi amber tonlarını kullanmıyor', () => {
    /* `text-amber-300` projenin paletinden DEĞİL, Tailwind varsayılanı.
       Palet değişse o ton yerinde kalır ve kimse fark etmez. */
    const kod = koduAyikla(oku(gezgin));
    expect(kod).not.toMatch(/\b(text|bg|border)-amber-\d{2,3}\b/);
  });

  it('yapı tokenları iki kabukta da tanımlı', () => {
    /* Kabuk stilleri iki dosyada kopyalanmış durumda (bilinen borç).
       Biri güncellenip öteki unutulursa web ve masaüstü farklı renkte
       olurdu — kopyanın en tehlikeli hâli budur, çünkü görünmez. */
    const tokenlar = ['--mzn-yapi-baslik', '--mzn-yapi-kisi', '--mzn-yapi-bag'];
    for (const kabuk of ['apps/web/src/styles.css', 'apps/desktop/src/styles.css']) {
      const css = oku(path.resolve(__dirname, '../../..', kabuk));
      for (const t of tokenlar) expect(css, `${kabuk} · ${t}`).toContain(t);
    }
  });

  it('yapı tokenları iki Tailwind yapılandırmasında da açık', () => {
    for (const cfg of ['apps/web/tailwind.config.js', 'apps/desktop/tailwind.config.mjs']) {
      const metin = oku(path.resolve(__dirname, '../../..', cfg));
      expect(metin, cfg).toContain('yapi-baslik');
      expect(metin, cfg).toContain('yapi-kisi');
    }
  });

  it('başlık ve kişi AYRI renkler — ikisi de amber değil', () => {
    const kod = koduAyikla(oku(gezgin));
    expect(kod).toContain('text-yapi-baslik');
    expect(kod).toContain('text-yapi-kisi');
  });
});
