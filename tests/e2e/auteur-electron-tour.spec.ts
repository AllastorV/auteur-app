import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { masaustuDerlemesiniDenetle } from '../helpers/masaustuDerleme';

/** Screenshots come from the built Electron window, never from a mock scene. */
test('disposable Auteur desktop tour captures screenplay, storyboard, cards and map', async () => {
  test.setTimeout(180_000);
  masaustuDerlemesiniDenetle();
  const root = path.resolve('apps/desktop');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'auteur-tour-'));
  const evidence = path.resolve('release-work/auteur-how-to-2026-09-24/Previews/electron-tour');
  fs.mkdirSync(evidence, { recursive: true });
  const app = await electron.launch({ args: [root, `--user-data-dir=${profile}`], cwd: root });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    const shot = async (name: string) =>
      page.screenshot({ path: path.join(evidence, name), animations: 'disabled' });

    await page.locator('[data-testid="kitaplik-yeni"], [data-testid="bos-yeni"]').first().click();
    await page.getByTestId('yeni-proje-ad').fill('Auteur Tur Projesi');
    await page.getByTestId('yeni-proje-olustur').click();
    await expect(page.getByTestId('senaryo-editor')).toBeVisible();
    await expect(page.getByTestId('sunum-modu')).toHaveCount(0);
    await shot('01-senaryo.png');

    await page.getByTestId('mod-board').click();
    await expect(page.getByTestId('canvas-container')).toBeVisible();
    await expect(page.getByTestId('storyboard-inspector')).toBeVisible();
    const canvas = await page.getByTestId('canvas-container').boundingBox();
    if (!canvas) throw new Error('Storyboard canvas is missing');
    const startX = canvas.x + canvas.width * 0.36;
    const startY = canvas.y + canvas.height * 0.35;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 90, startY + 38, { steps: 12 });
    await page.mouse.move(startX + 180, startY - 10, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByText('1 objects')).toBeVisible();
    await shot('02-storyboard-timeline.png');
    await page.getByTestId('pano-sekme-boya').click();
    await expect(page.getByTestId('paint-fill-color')).toBeVisible();
    await shot('03-storyboard-boya.png');
    await page.getByTestId('pano-sekme-katman').click();
    await shot('04-storyboard-katmanlar.png');

    await page.getByTestId('sunum-modu').click();
    await expect(page.getByTestId('sunum-yuzeyi')).toBeVisible();
    await shot('05-sunum.png');
    await page.getByTestId('sunum-tam-ekran').click();
    await expect(page.getByTestId('sunum-tam-ekran')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('canvas-container')).toBeVisible();

    await page.getByTestId('mod-grid').click();
    await expect(page.getByTestId('cards-inspector')).toBeVisible();
    await shot('06-kartlar.png');

    await page.getByTestId('mod-harita').click();
    await expect(page.getByTestId('map-empty-state')).toBeVisible();
    await page.getByTestId('map-create').click();
    await expect(page.getByTestId('map-workspace')).toBeVisible();
    await expect(page.getByTestId('map-inspector')).toBeVisible();
    await shot('07-harita-renk.png');

    await page.getByTestId('map-lakes').focus();
    await page.keyboard.press('ArrowRight');
    await page.getByTestId('map-spacing').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('map-apply')).toBeEnabled();
    await page.getByTestId('map-apply').click();
    await expect(page.locator('[data-map-lake="1"]')).toHaveCount(1);
    await shot('08-harita-gol-ve-aralik.png');

    await page.getByTestId('map-tab-countries').click();
    await page.getByTestId('map-country-list-country-1').click();
    await page.getByTestId('map-country-name').fill('Kuzey Krallığı');
    await page.getByTestId('map-country-biome').selectOption('forest');
    await shot('09-ulke-ozellikleri.png');

    await page.getByTestId('map-appearance-texture').click();
    await page.getByTestId('map-tab-settings').click();
    await page.getByTestId('map-custom-textures').locator('summary').click();
    await expect(page.locator('[data-testid^="map-texture-row-"]')).toHaveCount(8);
    await shot('10-harita-dokular.png');

    const bytes = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 40; canvas.height = 40;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#1670cf';
      context.fillRect(0, 0, 40, 40);
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    await page.getByTestId('map-texture-input-sea').setInputFiles({
      name: 'aurora-sea.png', mimeType: 'image/png', buffer: bytes,
    });
    await expect(page.getByTestId('map-texture-row-sea')).toContainText('aurora-sea.png');
    await expect(page.getByTestId('map-canvas').locator('pattern[data-map-texture="sea"] image'))
      .toHaveAttribute('href', /^data:image\/png;base64,/);
    await shot('11-ozel-deniz-dokusu.png');
  } finally {
    await app.evaluate(({ app: running }) => running.exit(0)).catch(() => {});
    await app.close().catch(() => {});
  }
});
