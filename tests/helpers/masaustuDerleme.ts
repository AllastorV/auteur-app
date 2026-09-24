import fs from 'node:fs';
import path from 'node:path';

/**
 * MASAÜSTÜ DERLEMESİ GÜNCEL Mİ.
 *
 * ## Neden gerekiyor
 *
 * Electron testleri `apps/desktop`i doğrudan açıyor ve Electron
 * `package.json`daki `main` alanını, yani **`dist-electron/main.cjs`ı**
 * çalıştırıyor — kaynağı değil. Playwright hiçbir şey derlemiyor.
 *
 * Sonuç ÖLÇÜLDÜ (2026-09-01): mühür turu, o gün yazılmış menü öğesini
 * bulamadığı için 30 saniye bekleyip düştü. Sebep üründe değildi; derleme
 * bir gün eskiydi ve testler **o günün kodunu hiç görmüyordu**. Daha
 * kötüsü: özellik EKLEMEYEN bir değişiklikte bu sessiz kalır ve testler
 * "yeşil" görünürken eski ikiliyi ölçer.
 *
 * ## Ne yapıyor
 *
 * Kaynak ağacının en yeni dosyasını derlemenin zaman damgasıyla
 * karşılaştırıyor ve bayatsa AÇIK bir hatayla düşüyor. Kendi kendine
 * derlemiyor: derleme yan etkisi olan bir test, koştuğu ağacı değiştirir
 * ve paralel koşan başka bir testi bozar.
 */

const KOK = path.join(__dirname, '..', '..');
const MAIN = path.join(KOK, 'apps', 'desktop', 'dist-electron', 'main.cjs');
const HTML = path.join(KOK, 'apps', 'desktop', 'dist', 'index.html');

/** Derlemenin girdisi olan ağaçlar. `dist*` ve `node_modules` hariç. */
const KAYNAKLAR = [
  path.join(KOK, 'packages', 'core', 'src'),
  path.join(KOK, 'apps', 'desktop', 'src'),
  path.join(KOK, 'apps', 'desktop', 'electron'),
];

function enYeni(dizin: string): number {
  let ms = 0;
  for (const oge of fs.readdirSync(dizin, { withFileTypes: true })) {
    const yol = path.join(dizin, oge.name);
    if (oge.isDirectory()) {
      if (oge.name === 'node_modules' || oge.name.startsWith('dist')) continue;
      ms = Math.max(ms, enYeni(yol));
    } else {
      ms = Math.max(ms, fs.statSync(yol).mtimeMs);
    }
  }
  return ms;
}

/**
 * Derleme bayatsa FIRLATIR.
 *
 * Mesaj komutu da veriyor: "bayat" demek yetmez, testi koşan kişi ne
 * yapacağını bilmeli.
 */
export function masaustuDerlemesiniDenetle(): void {
  if (!fs.existsSync(MAIN) || !fs.existsSync(HTML)) {
    throw new Error(
      'Masaüstü derlemesi YOK. Önce derle: npm --workspace @storyboard/desktop run build',
    );
  }
  const derleme = Math.min(fs.statSync(MAIN).mtimeMs, fs.statSync(HTML).mtimeMs);
  const kaynak = Math.max(...KAYNAKLAR.map(enYeni));
  if (kaynak > derleme) {
    const fark = Math.round((kaynak - derleme) / 60_000);
    throw new Error(
      `Masaüstü derlemesi BAYAT (kaynak ${fark} dk daha yeni). Electron testleri `
      + 'dist-electron/main.cjs çalıştırıyor, kaynağı değil — bu hâlde eski ikili '
      + 'ölçülür. Derle: npm --workspace @storyboard/desktop run build',
    );
  }
}
