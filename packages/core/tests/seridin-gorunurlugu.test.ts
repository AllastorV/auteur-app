import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * §15.4'ün görünürlük sözü: "Bildirimi kaçırmak mümkündür, şeridi kaçırmak
 * değildir."
 *
 * Bu KAYNAK DÜZEYİNDE bir değişmez — `Studio` bileşeninin kendisi jsdom'da
 * ucuz render edilemiyor (üç boyutlu sahne, tuval, platform kabuğu). Kaynağa
 * bakan bir test kırılgandır ve bunu biliyoruz; ama korunan şey, kullanıcının
 * diske yazamadığını öğrenebileceği TEK yoldur ve bir kez zaten kaybolmuştu:
 * odak modu (`F`) `chromeHidden`'ı açıyor, şerit de ona bağlıydı; yani uzun
 * yazma seansı için girilen mod, uyarıyı kapatan moddu.
 *
 * Daha iyi ev: yazıcıyı e2e'den hataya düşürebildiğimiz gün gerçek bir
 * tarayıcı iddiası. O gün bu dosya silinmeli.
 */

const STUDIO = fs.readFileSync(
  path.resolve(__dirname, '../src/components/Studio.tsx'),
  'utf8',
);

describe('§15.4 — veri güvenliği şeridi gizlenebilir kabuğa bağlı DEĞİL', () => {
  it('`VeriSeridi` `hidden` koşulunun içinde çizilmiyor', () => {
    const satir = STUDIO.split('\n').find((s) => s.includes('<VeriSeridi'));
    expect(satir, 'Studio artık VeriSeridi çizmiyor').toBeDefined();
    expect(satir).not.toMatch(/hidden\s*&&/);
  });

  it('şerit gerçekten çiziliyor — koşul kaldırılırken bileşen de düşmesin', () => {
    expect(STUDIO).toContain('<VeriSeridi durum={veriDurumu} />');
  });
});
