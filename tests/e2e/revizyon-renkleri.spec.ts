import { test, expect, _electron as electron } from '@playwright/test';
import { masaustuDerlemesiniDenetle } from '../helpers/masaustuDerleme';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Gerçek Electron menüsünün ikonları ve eylemi, üst menüyle aynı belgeyi değiştirir. */
test('on revizyon rengi — üst menü, klavye ve yerel sağ tık', async ({}, testInfo) => {
  masaustuDerlemesiniDenetle();
  test.setTimeout(120_000);
  const kok = path.resolve('apps/desktop');
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'auteur-renk-'));
  const app = await electron.launch({ args: [kok, `--user-data-dir=${profil}`], cwd: kok });
  try {
    const sayfa = await app.firstWindow();
    await sayfa.waitForLoadState('domcontentloaded');
    await sayfa.locator('[data-testid="kitaplik-yeni"], [data-testid="bos-yeni"]').first().click();
    await sayfa.getByTestId('yeni-proje-ad').fill('Revision colours');
    await sayfa.getByTestId('yeni-proje-olustur').click();
    await expect(sayfa.getByTestId('senaryo-editor')).toBeVisible();
    await sayfa.getByTestId('senaryo-editor').click();
    await sayfa.keyboard.insertText('The camera waits.');
    await sayfa.getByTestId('serit-yayinla').click();
    await sayfa.getByTestId('serit-isaretle').click();
    const secici = sayfa.getByTestId('revizyon-renk-secici');
    await secici.click();
    const renkler = sayfa.getByRole('menuitemradio');
    await expect(renkler).toHaveText([
      '1. White', '2. Blue', '3. Pink', '4. Yellow', '5. Green',
      '6. Goldenrod', '7. Buff', '8. Salmon', '9. Cherry', '10. Tan',
    ]);
    const kareler = await renkler.locator('[data-renk]').evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, bg: getComputedStyle(el).backgroundColor };
    }));
    expect(kareler).toHaveLength(10);
    expect(kareler.every((k) => k.w === k.h && k.w >= 10 && k.bg !== 'rgba(0, 0, 0, 0)')).toBe(true);
    fs.mkdirSync('design/revizyon', { recursive: true });
    await sayfa.screenshot({ path: 'design/revizyon/renk-dropdown.png' });
    await sayfa.keyboard.press('End');
    await expect(sayfa.getByTestId('revizyon-renk-tan')).toBeFocused();
    await sayfa.keyboard.press('Enter');
    await expect(secici).toHaveAccessibleName('Revision colour: Tan');
    await expect(sayfa.locator('.senaryo-metin [data-revizyon="tan"]')).toHaveCount(1);
    await secici.click();
    await sayfa.keyboard.press('Escape');
    await expect(sayfa.getByTestId('revizyon-renk-menusu')).toHaveCount(0);
    await expect(secici).toBeFocused();

    await app.evaluate(({ Menu }) => {
      const popup = Menu.prototype.popup;
      Menu.prototype.popup = function (options) {
        (globalThis as any).__renkTestMenu = this;
        return popup.call(this, options);
      };
    });
    await sayfa.locator('.senaryo-metin > *').first().click({ button: 'right' });
    await expect.poll(() => app.evaluate(() => Boolean((globalThis as any).__renkTestMenu))).toBe(true);
    const native = await app.evaluate(() => {
      const root = (globalThis as any).__renkTestMenu;
      const renkMenu = root.items.find((i: any) => i.label === 'Revision colour').submenu;
      const items = renkMenu.items.map((i: any) => ({ label: i.label, checked: i.checked, size: i.icon.getSize(), empty: i.icon.isEmpty() }));
      root.closePopup();
      renkMenu.items[2].click();
      return items;
    });
    expect(native.map((i: any) => i.label)).toEqual([
      '1. White', '2. Blue', '3. Pink', '4. Yellow', '5. Green',
      '6. Goldenrod', '7. Buff', '8. Salmon', '9. Cherry', '10. Tan',
    ]);
    expect(native.every((i: any) => !i.empty && i.size.width === 14 && i.size.height === 14)).toBe(true);
    expect(native.filter((i: any) => i.checked).map((i: any) => i.label)).toEqual(['10. Tan']);
    await expect(secici).toHaveAccessibleName('Revision colour: Pink');
    await expect(sayfa.locator('.senaryo-metin [data-revizyon="pembe"]')).toHaveCount(1);
    await secici.click();
    await expect(sayfa.getByTestId('revizyon-renk-pembe')).toHaveAttribute('aria-checked', 'true');
    await sayfa.screenshot({ path: 'design/revizyon/renk-sag-tik-sonucu.png' });
    fs.writeFileSync(testInfo.outputPath('renk-native-menu.json'), JSON.stringify(native, null, 2));
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app.close().catch(() => {});
  }
});
