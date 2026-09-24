/**
 * Yazı tipi metriklerini TTF'ten çıkarıp bir TS tablosuna yazar.
 *
 * Neden DERLEME ZAMANI: `sayfala` saf ve SENKRON bir fonksiyon; motorun
 * ölçüsü çalışma zamanında yüklenen bir dosyaya bağlanırsa sayfalama font
 * gelene kadar yanlış sayı verir ve node testlerinde hiç koşamaz. Tablo
 * küçük (Türkçe + İngilizce yazımın kullandığı kod noktaları), o yüzden
 * gömmek indirmekten hem ucuz hem doğru.
 *
 * Çalıştırma:  node tools/metrik-uret.mjs
 */
import fs from 'node:fs';
/* `@pdf-lib/fontkit` KULLANILIYOR, ayrı bir `fontkit` DEĞİL: PDF gömme yolu
   zaten onu kullanıyor ve ölçüyü başka bir ayrıştırıcıdan almak, ekranda
   hesaplanan satırla PDF'e çizilen satırın farklı metriklerden gelmesi
   demekti (Karar 2). */
import fontkitMod from '@pdf-lib/fontkit';
const fontkit = fontkitMod.default ?? fontkitMod;

const KAYNAK = 'node_modules/@expo-google-fonts/tinos/400Regular/Tinos_400Regular.ttf';
const HEDEF = 'packages/core/src/format/metrik-tinos.ts';

/** Türkçe ve İngilizce yazımın kullandığı kod noktaları. */
function kodNoktalari() {
  const k = new Set();
  for (let c = 0x20; c <= 0x7e; c++) k.add(c);           // ASCII yazdırılabilir
  for (const ch of 'ÇçĞğİıÖöŞşÜü') k.add(ch.codePointAt(0));
  for (const ch of 'ÂâÎîÛû') k.add(ch.codePointAt(0));     // düzeltme işaretli
  for (const ch of '‘’“”–—…«»°£€₺·•') k.add(ch.codePointAt(0));
  for (const ch of 'ÀÁÄÅÈÉÊËÌÍÏÒÓÔÕÙÚÛÝàáäåèéêëìíïòóôõùúýÑñ') k.add(ch.codePointAt(0));
  return [...k].sort((a, b) => a - b);
}

const font = fontkit.create(fs.readFileSync(KAYNAK));
const birim = font.unitsPerEm;
const satirlar = [];
for (const kod of kodNoktalari()) {
  const g = font.glyphForCodePoint(kod);
  if (!g) continue;
  satirlar.push(`  ${kod}: ${(g.advanceWidth / birim).toFixed(6)},`);
}
const varsayilan = (font.glyphForCodePoint(0x6e).advanceWidth / birim).toFixed(6);

fs.writeFileSync(HEDEF, `/* ÜRETİLMİŞ DOSYA — elle düzenlemeyin.
   Kaynak: ${KAYNAK}
   Üretim: node tools/metrik-uret.mjs

   Tinos, Times New Roman ile METRİK UYUMLUDUR (Apache 2.0). Roman el yazması
   standardı Times 12pt olduğu için sayfa sayıları sektörle tutuyor. */

/** Kod noktası → ilerleme genişliği (em). */
export const TINOS_ILERLEME: Readonly<Record<number, number>> = {
${satirlar.join('\n')}
};

/** Tabloda olmayan kod noktası için 'n' genişliği kullanılır.
    ⚠ Tavan: tablo Türkçe ve İngilizce yazımın kod noktalarını kapsıyor;
    başka bir yazı sistemi bu varsayılana düşer ve satır sayısı yaklaşık
    olur. Kapatma yolu tabloyu genişletmek — ölçü modeli değişmiyor. */
export const TINOS_VARSAYILAN = ${varsayilan};
`, 'utf8');
console.log('yazildi:', HEDEF, '|', satirlar.length, 'kod noktasi | varsayilan', varsayilan);
