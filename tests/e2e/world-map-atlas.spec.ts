import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { masaustuDerlemesiniDenetle } from '../helpers/masaustuDerleme';

const desktop = path.join(__dirname, '..', '..', 'apps', 'desktop');
const evidence = path.join(__dirname, '..', '..', 'release-work', 'auteur-how-to-2026-09-24', 'Previews', 'atlas-e2e');

test('isolated desktop atlas: varied worlds, protection, editing, textures and exports', async () => {
  test.setTimeout(180_000);
  masaustuDerlemesiniDenetle();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'auteur-atlas-e2e-'));
  let app: ElectronApplication = await electron.launch({ args: [desktop, `--user-data-dir=${profile}`], cwd: desktop });
  try {
    const page = await app.firstWindow();
    const consoleErrors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await page.waitForLoadState('domcontentloaded');
    fs.mkdirSync(evidence, { recursive: true });
    const create = page.getByTestId('kitaplik-yeni').or(page.getByTestId('bos-yeni')).first();
    await expect(create).toBeVisible({ timeout: 30_000 });
    await create.click();
    await page.getByTestId('yeni-proje-ad').fill('Atlas QA');
    await page.getByTestId('yeni-proje-olustur').click();
    await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('mod-harita').click();
    await expect(page.getByTestId('map-empty-state')).toBeVisible();
    await page.getByTestId('map-create').click();
    await expect(page.getByTestId('map-workspace')).toBeVisible();

    for (const [seed, family] of [[0, 'single'], [1, 'fragmented'], [5, 'multi']] as const) {
      const started = performance.now();
      await page.getByTestId('map-seed').fill(String(seed));
      await expect(page.getByTestId('map-preview')).toBeVisible();
      await page.getByTestId('map-apply').click();
      await expect(page.getByTestId('map-preview')).toHaveCount(0);
      console.log(`Atlas seed ${seed} (${family}) preview + apply: ${Math.round(performance.now() - started)} ms`);
      await page.screenshot({ path: path.join(evidence, `atlas-${family}-color.png`) });
      await page.getByTestId('map-appearance-texture').click();
      await page.screenshot({ path: path.join(evidence, `atlas-${family}-texture.png`) });
      await page.getByTestId('map-appearance-color').click();
    }
    await page.getByTestId('map-lakes').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('map-lakes')).toHaveValue('1');
    await page.getByTestId('map-apply').click();
    await expect(page.locator('[data-map-lake]')).not.toHaveCount(0);
    await page.screenshot({ path: path.join(evidence, 'atlas-multi-lake-color.png') });

    await page.getByTestId('map-lock').click();
    await expect(page.getByTestId('map-lock')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('map-regenerate').click();
    await expect(page.getByTestId('map-keep-map')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('map-regenerate-dialog')).toHaveCount(0);
    await expect(page.getByTestId('map-preview')).toHaveCount(0);
    await page.getByTestId('map-regenerate').click();
    await page.getByTestId('map-confirm-regenerate').click();
    await expect(page.getByTestId('map-preview')).toBeVisible();
    await page.getByTestId('map-cancel').click();
    await expect(page.getByTestId('map-lock')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('map-tab-countries').click();
    await page.getByTestId('map-country-list-country-1').click();
    await page.getByTestId('map-country-name').fill('Arel');
    await page.getByTestId('map-country-note').fill('Forest frontier');
    await expect(page.getByTestId('map-canvas')).toContainText('Arel');

    await page.getByTestId('map-appearance-texture').click();
    await page.getByTestId('map-tab-settings').click();
    await page.getByTestId('map-custom-textures').locator('summary').click();
    const png = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 32;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#22935d';
      context.fillRect(0, 0, 32, 32);
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    await page.getByTestId('map-texture-input-forest').setInputFiles({
      name: 'forest.png', mimeType: 'image/png', buffer: png,
    });
    await expect(page.getByTestId('map-texture-row-forest')).toContainText('forest.png');
    await page.getByTestId('map-texture-input-sea').setInputFiles({
      name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG'),
    });
    await expect(page.getByTestId('map-texture-error-sea')).toBeVisible();
    await expect(page.getByTestId('map-texture-row-forest')).toContainText('forest.png');
    const waterPng = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 32;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#327caa';
      context.fillRect(0, 0, 32, 32);
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    await page.getByTestId('map-texture-input-sea').setInputFiles({
      name: 'water.png', mimeType: 'image/png', buffer: waterPng,
    });
    await expect(page.getByTestId('map-texture-row-sea')).toContainText('water.png');
    await expect(page.locator('[data-map-lake="1"]')).toHaveAttribute('fill', /^url\(#map-atlas-.*-sea\)$/);
    await page.screenshot({ path: path.join(evidence, 'atlas-custom-water-texture.png') });

    await page.getByTestId('map-tab-layers').click();
    await page.getByTestId('map-image-input').setInputFiles({
      name: 'emblem.png', mimeType: 'image/png', buffer: png,
    });
    await expect(page.locator('[data-testid^="map-overlay-mo_"]')).toHaveCount(1);
    await page.screenshot({ path: path.join(evidence, 'atlas-edited-texture.png') });
    // Electron handles data-URL downloads outside Playwright's page.download
    // channel. Capture the generated href at the final anchor boundary.
    await page.evaluate(() => {
      (window as any).__atlasExports = [];
      HTMLAnchorElement.prototype.click = function () {
        (window as any).__atlasExports.push({ href: this.href, name: this.download });
      };
    });
    await page.getByTestId('map-export-png').click();
    await expect.poll(() => page.evaluate(() => (window as any).__atlasExports.length),
      { timeout: 15_000, message: consoleErrors.join(' | ') }).toBe(1);
    const pngUrl = await page.evaluate(() => (window as any).__atlasExports[0].href as string);
    expect(pngUrl).toMatch(/^data:image\/png;base64,/);
    const pngBytes = Buffer.from(pngUrl.split(',')[1], 'base64');
    expect([...pngBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    await page.getByTestId('map-export-jpg').click();
    await expect.poll(() => page.evaluate(() => (window as any).__atlasExports.length),
      { timeout: 15_000, message: consoleErrors.join(' | ') }).toBe(2);
    const jpgUrl = await page.evaluate(() => (window as any).__atlasExports[1].href as string);
    expect(jpgUrl).toMatch(/^data:image\/jpeg;base64,/);
    const jpgBytes = Buffer.from(jpgUrl.split(',')[1], 'base64');
    expect([...jpgBytes.subarray(0, 3)]).toEqual([255, 216, 255]);
    fs.writeFileSync(path.join(evidence, 'atlas-export.png'), pngBytes);
    fs.writeFileSync(path.join(evidence, 'atlas-export.jpg'), jpgBytes);
    const svgBytes = await page.getByTestId('map-canvas').evaluate((element) =>
      new TextEncoder().encode(element.outerHTML).length);
    console.log(`Atlas edited SVG DOM: ${svgBytes} bytes; PNG: ${pngBytes.length} bytes; JPG: ${jpgBytes.length} bytes`);

    const canvas = page.getByTestId('map-canvas');
    const bounds = (await canvas.boundingBox())!;
    const geography = canvas.locator('g[transform]').first();
    const transformBeforePan = await geography.getAttribute('transform');
    await page.mouse.move(bounds.x + bounds.width * .48, bounds.y + bounds.height * .15);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(bounds.x + bounds.width * .48 + 68, bounds.y + bounds.height * .15 + 24, { steps: 4 });
    await page.mouse.up({ button: 'middle' });
    await expect(geography).not.toHaveAttribute('transform', transformBeforePan!);
    await page.mouse.wheel(0, -220);
    await expect(page.getByTestId('map-zoom')).not.toHaveText('%100');

    const savedPath = path.join(profile, 'atlas-qa.sbp');
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
    }, savedPath);
    await page.locator('button[title*="Ctrl+S"]').first().click();
    await expect.poll(() => fs.existsSync(savedPath), { timeout: 20_000 }).toBe(true);
    expect(fs.statSync(savedPath).size).toBeGreaterThan(1000);
    await app.evaluate(({ app: electronApp }) => electronApp.exit(0));
    app = await electron.launch({ args: [desktop, `--user-data-dir=${profile}`], cwd: desktop });
    const reopened = await app.firstWindow();
    await expect(reopened.getByTestId(`kitap-${savedPath}`)).toBeVisible({ timeout: 30_000 });
    await reopened.getByTestId(`kitap-${savedPath}`).click();
    // A forced Electron exit leaves a recovery journal. Keep that journal
    // as a backup and inspect the explicitly saved SBP, not recovered state.
    await expect(reopened.getByTestId('kurtarma-diyalogu')).toBeVisible({ timeout: 10_000 });
    await reopened.getByTestId('yoksay').click();
    await reopened.getByTestId('mod-harita').click();
    await expect(reopened.getByTestId('map-workspace')).toBeVisible();
    await expect(reopened.getByTestId('map-lock')).toHaveAttribute('aria-pressed', 'true');
    await expect(reopened.getByTestId('map-appearance-texture')).toHaveAttribute('aria-pressed', 'true');
    await reopened.getByTestId('map-tab-countries').click();
    await reopened.getByTestId('map-country-list-country-1').click();
    await expect(reopened.getByTestId('map-country-name')).toHaveValue('Arel');
    await reopened.getByTestId('map-tab-layers').click();
    await expect(reopened.locator('[data-testid^="map-overlay-mo_"]')).toHaveCount(1);
    await reopened.getByTestId('map-tab-settings').click();
    await reopened.getByTestId('map-custom-textures').locator('summary').click();
    await expect(reopened.getByTestId('map-texture-row-forest')).toContainText('forest.png');
    await expect(reopened.getByTestId('map-texture-row-sea')).toContainText('water.png');
  } finally {
    await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {});
  }
});
