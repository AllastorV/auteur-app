#!/usr/bin/env node
/**
 * `apps/desktop/dist`i YENİDEN DENEYEREK siler.
 *
 * ## Neden var
 *
 * Proje bir Dropbox klasöründe duruyor ve senkron ajanı yeni yazılan
 * `dist/assets`, `dist/types` gibi dizinleri indekslemek için AÇIK
 * TUTUYOR. Vite'ın `emptyOutDir` adımı tam o anda `rmSync` çağırıyor ve
 * `EPERM` ile düşüyor — derleme hiç başlamadan bitiyor. 2026-09-01'de üç
 * kez yaşandı (`dist/types` iki kez, `dist/assets` bir kez) ve her seferinde
 * elle silip yeniden başlatmak gerekti.
 *
 * Aynı sınıf hata daha önce testlerde de ısırmıştı: `guvenlik.test.ts`in
 * aralıklı kırmızısı da Dropbox'ın `.storyboard-data`yı açık tutmasıydı
 * (2026-08-31). Orada çözüm test çöpünü `os.tmpdir()`a taşımaktı; burada
 * çıktı dizini taşınamaz, o yüzden kısa aralıklarla YENİDEN DENENİYOR.
 *
 * Silinemezse SESSİZ KALMIYOR: hata mesajı sebebi ve çözümü söylüyor.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dizin = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'desktop', 'dist',
);

const bekle = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

let sonHata;
for (let deneme = 1; deneme <= 5; deneme++) {
  try {
    fs.rmSync(dizin, { recursive: true, force: true });
    process.exit(0);
  } catch (e) {
    sonHata = e;
    /* Artan bekleme: senkron ajanı kilidi bırakana kadar. */
    bekle(deneme * 300);
  }
}

console.error(
  `dist silinemedi: ${sonHata?.message}\n`
  + 'Sebep büyük olasılıkla bulut senkron ajanının dizini açık tutması. '
  + 'Senkronu duraklatıp yeniden dene.',
);
process.exit(1);
