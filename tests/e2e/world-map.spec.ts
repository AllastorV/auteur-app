import { expect, test, type Page } from '@playwright/test';
import * as Y from 'yjs';
import fs from 'node:fs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';
import { dunyaEkle, lokasyonEkle, setWorldMapSettings } from '../../packages/core/src/doc/mutations';
import { adoptLegacyMap } from '../../packages/core/src/model/project-world-map';

async function openWorld(page: Page, request: any, role: 'editor' | 'owner' = 'editor') {
  const server = 'http://localhost:5180';
  const response = await request.post(`${server}/api/sessions`, {
    data: { projectName: 'Harita E2E', ownerName: 'Sahip' },
  });
  const session = await response.json();
  const seed = createDoc(createProject({ panels: [createPanel()] }));
  const world = dunyaEkle(seed, { ad: 'Aster Dünyası' });
  const place = lokasyonEkle(seed, { ad: 'Liman', aciklama: 'Sisli kıyı' });
  setWorldMapSettings(seed, world.id, { seed: 91 }); adoptLegacyMap(seed, world.id);
  const owner = await connectTestClient('ws://localhost:5180', session.roomId, session.ownerToken);
  Y.applyUpdate(owner.doc, Y.encodeStateAsUpdate(seed));
  owner.push();
  await new Promise((resolve) => setTimeout(resolve, 300));
  await owner.close();
  let token = session.ownerToken;
  if (role === 'editor') {
    const inviteResponse = await request.post(`${server}/api/sessions/${session.roomId}/invites`, {
      headers: { authorization: `Bearer ${session.ownerToken}` },
      data: { role: 'editor' },
    });
    token = (await inviteResponse.json()).token;
  }
  await page.goto(`/?oda=${session.roomCode}&davet=${encodeURIComponent(token)}`);
  await page.getByPlaceholder(/Görünecek ad|Display name/).fill('Editör');
  await page.getByRole('button', { name: /Oturuma katıl|Join session/ }).click();
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('sekme-yazim').first().click();
  await page.getByTestId('sekme-dunya').click();
  await expect(page.getByTestId(`dunya-harita-${world.id}`)).toBeVisible();
  await page.getByTestId(`dunya-harita-${world.id}`).click();
  await expect(page.getByTestId('map-workspace')).toBeVisible();
  return { world, place };
}

test('World note opens an editable Map workspace, previews a coast and returns', async ({ page, request }) => {
  const { place } = await openWorld(page, request);
  await expect(page.getByTestId('map-inspector')).toBeVisible();
  await expect(page.getByTestId('sunum-modu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Kalem', exact: true })).toHaveCount(0);
  const before = await page.getByTestId('map-canvas').locator('path').first().getAttribute('d');
  await page.getByTestId('map-regenerate').click();
  const preview = await page.getByTestId('map-canvas').locator('path').first().getAttribute('d');
  expect(preview).not.toBe(before);
  await page.getByTestId('map-cancel').click();
  await expect(page.getByTestId('map-canvas').locator('path').first()).toHaveAttribute('d', before!);
  await page.getByTestId('map-regenerate').click();
  await page.getByTestId('map-apply').click();
  await expect(page.getByTestId('map-canvas').locator('path').first()).not.toHaveAttribute('d', before!);

  await page.getByTestId('map-tab-places').click();
  await page.getByTestId('map-location-select').selectOption(place.id);
  await page.getByTestId('map-add-marker').click();
  const canvas = page.getByTestId('map-canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.52, y: box.height * 0.52 } });
  await expect(page.getByTestId('map-inspector')).toContainText('Liman');
  await expect(page.locator('[data-testid^="map-marker-"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Yakınlaş' }).last().click();
  await expect(page.getByTestId('map-zoom')).not.toHaveText('%100');
  await page.getByTestId('map-back').click();
  await expect(page.getByTestId('senaryo-editor')).toBeVisible();
});

test('Lake control makes unselectable water and transparent lake pixels in PNG', async ({ page, request }) => {
  await openWorld(page, request, 'owner');
  const lakes = page.getByTestId('map-lakes');
  await lakes.focus();
  await page.keyboard.press('ArrowRight');
  await expect(lakes).toHaveValue('1');
  await page.getByTestId('map-apply').click();
  const lake = page.locator('[data-map-lake="1"]');
  await expect(lake).toHaveCount(1);
  const center = await lake.evaluate((element) => {
    const path = element as SVGPathElement;
    const box = path.getBBox();
    const svg = path.ownerSVGElement!;
    const point = svg.createSVGPoint();
    point.x = box.x + box.width / 2;
    point.y = box.y + box.height / 2;
    const screen = point.matrixTransform(path.getScreenCTM()!);
    return { x: point.x, y: point.y, screenX: screen.x, screenY: screen.y };
  });
  await page.mouse.click(center.screenX, center.screenY);
  await expect(page.getByTestId('map-tab-countries')).toHaveAttribute('aria-current', 'false');
  const pending = page.waitForEvent('download');
  await page.getByTestId('map-export-png').click();
  const download = await pending;
  const base64 = fs.readFileSync(await download.path()).toString('base64');
  const alpha = await page.evaluate(async ({ base64, center }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return context.getImageData(Math.round(center.x), Math.round(center.y), 1, 1).data[3];
  }, { base64, center });
  expect(alpha).toBe(0);
});

test('Country on land opens its inspector and saves name, biome, note and color', async ({ page, request }) => {
  await openWorld(page, request, 'owner');
  const canvas = page.getByTestId('map-canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.02, y: box.height * 0.02 } });
  await expect(page.getByTestId('map-tab-countries')).toHaveAttribute('aria-current', 'false');
  const first = page.getByTestId('map-country-country-1');
  await expect(first).toBeVisible();
  const site = await first.evaluate((element) => {
    const path = element as SVGPathElement;
    const svg = path.ownerSVGElement!;
    const point = svg.createSVGPoint();
    point.x = Number(path.dataset.siteX);
    point.y = Number(path.dataset.siteY);
    const screen = point.matrixTransform(path.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(site.x, site.y);
  await expect(page.getByTestId('map-tab-countries')).toHaveAttribute('aria-current', 'true');
  await page.getByTestId('map-country-name').fill('Eshar');
  await page.getByTestId('map-country-biome').selectOption('desert');
  await page.getByTestId('map-country-note').fill('Tuz yolu');
  await page.getByTestId('map-country-color').fill('#be8b55');
  await expect(page.getByTestId('map-canvas')).toContainText('Eshar');
  await page.getByTestId('map-tab-places').click();
  await page.getByTestId('map-add-marker').click();
  await page.mouse.click(site.x, site.y);
  await expect(page.locator('[data-testid^="map-marker-"]')).toHaveCount(1);
  await page.mouse.click(site.x, site.y);
  await expect(page.getByTestId('map-tab-places')).toHaveAttribute('aria-current', 'true');
  await page.getByTestId('map-back').click();
  await page.getByTestId('sekme-dunya').click();
  await page.locator('[data-testid^="dunya-harita-"]').click();
  await page.getByTestId('map-tab-countries').click();
  await page.getByTestId('map-country-list-country-1').click();
  await expect(page.getByTestId('map-country-name')).toHaveValue('Eshar');
  await expect(page.getByTestId('map-country-biome')).toHaveValue('desert');
});

test('Seven authored biomes switch between color and offline texture appearance', async ({ page, request }) => {
  await openWorld(page, request, 'owner');
  await page.getByTestId('map-tab-countries').click();
  const biomes = ['plain', 'forest', 'desert', 'mountain', 'swamp', 'tundra', 'volcanic'];
  for (let index = 0; index < biomes.length; index++) {
    await page.getByTestId(`map-country-list-country-${index + 1}`).click();
    await page.getByTestId('map-country-biome').selectOption(biomes[index]);
  }
  const site = await page.getByTestId('map-country-country-2').evaluate((path) => ({
    x: Math.round(Number((path as SVGPathElement).dataset.siteX)),
    y: Math.round(Number((path as SVGPathElement).dataset.siteY)),
  }));
  const exportedPixel = async (button: string, mime: string) => {
    const pending = page.waitForEvent('download');
    await page.getByTestId(button).click();
    const download = await pending;
    const base64 = fs.readFileSync(await download.path()).toString('base64');
    return page.evaluate(async ({ base64, mime, site }) => {
      const image = new Image();
      image.src = `data:${mime};base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return {
        land: [...context.getImageData(site.x, site.y, 1, 1).data],
        sea: [...context.getImageData(3, 3, 1, 1).data],
      };
    }, { base64, mime, site });
  };
  await expect(page.getByTestId('map-canvas').locator('pattern')).toHaveCount(0);
  const colorPng = await exportedPixel('map-export-png', 'image/png');
  await page.getByTestId('map-appearance-texture').click();
  await expect(page.getByTestId('map-canvas').locator('pattern')).toHaveCount(7);
  await expect(page.getByTestId('map-canvas').locator('path[data-testid^="map-country-country-"]')).toHaveCount(8);
  const texturePng = await exportedPixel('map-export-png', 'image/png');
  const textureJpg = await exportedPixel('map-export-jpg', 'image/jpeg');
  expect(texturePng.sea[3]).toBe(0);
  expect(textureJpg.sea[3]).toBe(255);
  expect(texturePng.land[3]).toBe(255);
  expect(textureJpg.land[3]).toBe(255);
  expect(texturePng.land.slice(0, 3)).not.toEqual(colorPng.land.slice(0, 3));
  await page.getByTestId('map-appearance-color').click();
  await expect(page.getByTestId('map-canvas').locator('pattern')).toHaveCount(0);
});

test('Custom sea and biome textures resolve in the scene and reset independently', async ({ page, request }) => {
  await openWorld(page, request, 'owner');
  await page.getByTestId('map-lakes').focus();
  await page.keyboard.press('ArrowRight');
  await page.getByTestId('map-apply').click();
  await page.getByTestId('map-tab-countries').click();
  await page.getByTestId('map-country-list-country-1').click();
  await page.getByTestId('map-country-biome').selectOption('forest');
  await page.getByTestId('map-appearance-texture').click();
  await page.getByTestId('map-tab-settings').click();
  await page.getByTestId('map-custom-textures').locator('summary').click();
  await expect(page.locator('[data-testid^="map-texture-row-"]')).toHaveCount(8);
  const makePng = async (color: string) => Buffer.from(await page.evaluate((fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = fill;
    context.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png').split(',')[1];
  }, color), 'base64');
  await page.getByTestId('map-texture-input-forest').setInputFiles({
    name: 'my-forest.png', mimeType: 'image/png', buffer: await makePng('#38a043'),
  });
  await expect(page.getByTestId('map-texture-row-forest')).toContainText('my-forest.png');
  await expect(page.getByTestId('map-canvas').locator('pattern[id$="-forest"] image')).toHaveAttribute('href', /^data:image\/png;base64,/);
  await page.getByTestId('map-texture-input-sea').setInputFiles({
    name: 'blue-water.png', mimeType: 'image/png', buffer: await makePng('#1555dd'),
  });
  await expect(page.getByTestId('map-texture-row-sea')).toContainText('blue-water.png');
  await expect(page.getByTestId('map-canvas').locator('pattern[id$="-sea"] image')).toHaveAttribute('href', /^data:image\/png;base64,/);
  await expect(page.getByTestId('map-export-png')).toHaveAttribute('title', /custom sea texture|özel deniz dokusu/i);
  const lakePoint = await page.locator('[data-map-lake="1"]').evaluate((element) => {
    const box = (element as SVGPathElement).getBBox();
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  });
  const forestPoint = await page.getByTestId('map-country-country-1').evaluate((path) => ({
    x: Math.round(Number((path as SVGPathElement).dataset.siteX)),
    y: Math.round(Number((path as SVGPathElement).dataset.siteY)),
  }));
  const samplePng = async () => {
    const pending = page.waitForEvent('download');
    await page.getByTestId('map-export-png').click();
    const download = await pending;
    const base64 = fs.readFileSync(await download.path()).toString('base64');
    return page.evaluate(async ({ base64, lakePoint, forestPoint }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return {
        sea: [...context.getImageData(3, 3, 1, 1).data],
        lake: [...context.getImageData(lakePoint.x, lakePoint.y, 1, 1).data],
        forest: [...context.getImageData(forestPoint.x, forestPoint.y, 1, 1).data],
      };
    }, { base64, lakePoint, forestPoint });
  };
  const withWater = await samplePng();
  expect(withWater.sea[3]).toBe(255);
  expect(withWater.sea[2]).toBeGreaterThan(withWater.sea[0]);
  expect(withWater.lake[3]).toBe(255);
  expect(withWater.forest[1]).toBeGreaterThan(withWater.forest[0]);
  const pendingJpg = page.waitForEvent('download');
  await page.getByTestId('map-export-jpg').click();
  const jpg = await pendingJpg;
  const jpgWater = await page.evaluate(async ({ base64, lakePoint }) => {
    const image = new Image();
    image.src = `data:image/jpeg;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return {
      sea: [...context.getImageData(3, 3, 1, 1).data],
      lake: [...context.getImageData(lakePoint.x, lakePoint.y, 1, 1).data],
    };
  }, { base64: fs.readFileSync(await jpg.path()).toString('base64'), lakePoint });
  expect(jpgWater.sea[3]).toBe(255);
  expect(jpgWater.sea[2]).toBeGreaterThan(jpgWater.sea[0]);
  expect(jpgWater.lake[3]).toBe(255);
  await page.getByTestId('map-texture-reset-sea').click();
  await expect(page.getByTestId('map-canvas').locator('pattern[id$="-sea"]')).toHaveCount(0);
  await expect(page.getByTestId('map-texture-row-forest')).toContainText('my-forest.png');
  const defaultWater = await samplePng();
  expect(defaultWater.sea[3]).toBe(0);
  expect(defaultWater.lake[3]).toBe(0);
});

test('PNG/JPG overlays render in the downloaded map, with transparent PNG sea', async ({ page, request }) => {
  await openWorld(page, request, 'owner');
  await page.getByTestId('map-tab-layers').click();
  const makePng = async (color: string) => page.evaluate((fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext('2d')!;
    context.fillStyle = fill;
    context.fillRect(0, 0, 24, 24);
    return canvas.toDataURL('image/png').split(',')[1];
  }, color);
  await page.getByTestId('map-image-input').setInputFiles({
    name: 'red.png', mimeType: 'image/png', buffer: Buffer.from(await makePng('#ef3030'), 'base64'),
  });
  await expect(page.locator('[data-testid^="map-overlay-mo_"]')).toHaveCount(1);
  await page.getByTestId('map-image-input').setInputFiles({
    name: 'blue.png', mimeType: 'image/png', buffer: Buffer.from(await makePng('#305bef'), 'base64'),
  });
  const overlays = page.locator('[data-testid^="map-overlay-mo_"]');
  await expect(overlays).toHaveCount(2);
  await overlays.nth(1).dragTo(overlays.nth(0));

  const pngDownloadPromise = page.waitForEvent('download');
  await page.getByTestId('map-export-png').click();
  const pngDownload = await pngDownloadPromise;
  expect(pngDownload.suggestedFilename()).toMatch(/-harita\.png$/);
  const pngBase64 = fs.readFileSync(await pngDownload.path()).toString('base64');
  const pngPixels = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return {
      sea: [...context.getImageData(3, 3, 1, 1).data],
      overlay: [...context.getImageData(600, 375, 1, 1).data],
    };
  }, pngBase64);
  expect(pngPixels.sea[3]).toBe(0);
  expect(pngPixels.overlay[0]).toBeGreaterThan(pngPixels.overlay[2]);

  const jpgDownloadPromise = page.waitForEvent('download');
  await page.getByTestId('map-export-jpg').click();
  const jpgDownload = await jpgDownloadPromise;
  expect(jpgDownload.suggestedFilename()).toMatch(/-harita\.jpg$/);
  const jpgBase64 = fs.readFileSync(await jpgDownload.path()).toString('base64');
  const jpgPixels = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/jpeg;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return {
      sea: [...context.getImageData(3, 3, 1, 1).data],
      overlay: [...context.getImageData(600, 375, 1, 1).data],
    };
  }, jpgBase64);
  expect(jpgPixels.sea[3]).toBe(255);
  expect(jpgPixels.overlay[0]).toBeGreaterThan(jpgPixels.overlay[2]);
});
