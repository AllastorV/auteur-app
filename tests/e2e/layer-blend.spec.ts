import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc, docToProject } from '../../packages/core/src/doc/schema';
import { addObject, updateLayer } from '../../packages/core/src/doc/mutations';
import { createPanel, createProject } from '../../packages/core/src/model/factory';
import { createRect, createStroke } from '../../packages/core/src/model/objects';

const SERVER = 'http://localhost:5180';
const WS = 'ws://localhost:5180';

async function openBoard(page: Page, request: any) {
  const response = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Blend pixels', ownerName: 'Owner' },
  });
  const session = await response.json();
  const owner = await connectTestClient(WS, session.roomId, session.ownerToken);
  const seed = createDoc(createProject({ panels: [createPanel()] }));
  Y.applyUpdate(owner.doc, Y.encodeStateAsUpdate(seed));
  owner.push();
  await page.goto(`/?oda=${session.roomCode}&davet=${encodeURIComponent(session.ownerToken)}`);
  await page.getByPlaceholder(/Görünecek ad|Display name/).fill('Owner');
  await page.getByRole('button', { name: /Oturuma katıl|Join session/ }).click();
  await expect(page.getByTestId('senaryo-editor')).toBeVisible();
  await page.getByTestId('mod-board').click();
  await expect(page.getByTestId('canvas-container')).toBeVisible();
  return owner;
}

async function centerPixel(page: Page, target: Locator): Promise<[number, number, number]> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const png = await page.screenshot({ scale: 'css' });
  return page.evaluate(async ({ base64, x, y }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixel = context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    return [pixel[0], pixel[1], pixel[2]] as [number, number, number];
  }, { base64: png.toString('base64'), x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

const renderModuleUrl = '/@fs/' + path.resolve('packages/core/src/export/renderPanel.tsx').replaceAll('\\', '/');

async function exportedPixel(
  page: Page,
  panel: ReturnType<typeof docToProject>['panels'][number],
  transparent = false,
  position: [number, number] = [0.5, 0.5],
): Promise<[number, number, number, number]> {
  return page.evaluate(async ({ moduleUrl, panelData, transparentBackground, position }) => {
    const { renderPanelToDataURL } = await import(/* @vite-ignore */ moduleUrl);
    const url = await renderPanelToDataURL(panelData, {
      width: 640, height: 360, transparent: transparentBackground, settleMs: 0,
    });
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixel = context.getImageData(
      Math.floor(canvas.width * position[0]), Math.floor(canvas.height * position[1]), 1, 1,
    ).data;
    return [pixel[0], pixel[1], pixel[2], pixel[3]] as [number, number, number, number];
  }, { moduleUrl: renderModuleUrl, panelData: panel, transparentBackground: transparent, position });
}

test('whole-layer blend pixels agree in Storyboard, Cards, Timeline and Presentation', async ({ page, request }) => {
  const owner = await openBoard(page, request);
  try {
    const panel = docToProject(owner.doc).panels[0];
    const [lower, upper] = panel.layers;
    addObject(owner.doc, panel.id, createRect(
      { layerId: lower.id, x: 960, y: 540, z: 1 },
      { width: 700, height: 500, fill: '#ff0000', stroke: null },
    ));
    addObject(owner.doc, panel.id, createRect(
      { layerId: upper.id, x: 960, y: 540, z: 2 },
      { width: 450, height: 300, fill: '#0000ff', stroke: null },
    ));
    updateLayer(owner.doc, panel.id, upper.id, { blendMode: 'multiply' });
    owner.push();
    await expect.poll(() => centerPixel(page, page.getByTestId('canvas-container'))).toEqual([0, 0, 0]);
    await expect.poll(() => exportedPixel(page, docToProject(owner.doc).panels[0])).toEqual([0, 0, 0, 255]);
    const timeline = page.getByTestId('timeline-thumbnail').getByTestId('panel-thumbnail');
    await expect.poll(() => centerPixel(page, timeline)).toEqual([0, 0, 0]);
    await page.getByTestId('mod-grid').click();
    const card = page.getByTestId('cards').getByTestId('panel-thumbnail').first();
    await expect.poll(() => centerPixel(page, card)).toEqual([0, 0, 0]);
    await page.getByTestId('mod-board').click();
    await page.getByTestId('sunum-modu').click();
    const presentation = page.getByTestId('sunum-yuzeyi').getByTestId('panel-thumbnail');
    await expect.poll(() => centerPixel(page, presentation)).toEqual([0, 0, 0]);

    updateLayer(owner.doc, panel.id, upper.id, { blendMode: 'normal' });
    owner.push();
    await expect.poll(() => centerPixel(page, presentation)).toEqual([0, 0, 255]);
    await expect.poll(() => exportedPixel(page, docToProject(owner.doc).panels[0])).toEqual([0, 0, 255, 255]);
    updateLayer(owner.doc, panel.id, upper.id, { blendMode: 'screen' });
    owner.push();
    await expect.poll(() => centerPixel(page, presentation)).toEqual([255, 0, 255]);
    await expect.poll(() => exportedPixel(page, docToProject(owner.doc).panels[0])).toEqual([255, 0, 255, 255]);
    updateLayer(owner.doc, panel.id, upper.id, { blendMode: 'multiply' });
    owner.push();
    await expect.poll(() => centerPixel(page, presentation)).toEqual([0, 0, 0]);

    updateLayer(owner.doc, panel.id, upper.id, { visible: false });
    owner.push();
    await expect.poll(() => centerPixel(page, presentation)).toEqual([255, 0, 0]);
    await expect.poll(() => exportedPixel(page, docToProject(owner.doc).panels[0])).toEqual([255, 0, 0, 255]);
    updateLayer(owner.doc, panel.id, upper.id, { visible: true, opacity: 0.5 });
    owner.push();
    await expect.poll(async () => (await centerPixel(page, presentation))[0]).toBeGreaterThan(110);
    await expect.poll(async () => (await centerPixel(page, presentation))[0]).toBeLessThan(145);
    await expect.poll(async () => (await exportedPixel(page, docToProject(owner.doc).panels[0]))[0]).toBeGreaterThan(125);
    await expect.poll(async () => (await exportedPixel(page, docToProject(owner.doc).panels[0]))[0]).toBeLessThan(130);

    addObject(owner.doc, panel.id, createStroke(
      { layerId: upper.id, x: 0, y: 0, z: 3 },
      { points: [850, 540, 1, 1070, 540, 1], color: '#ffffff', width: 100, eraser: true },
    ));
    owner.push();
    await expect.poll(() => centerPixel(page, presentation)).toEqual([255, 0, 0]);
    await expect.poll(() => exportedPixel(page, docToProject(owner.doc).panels[0])).toEqual([255, 0, 0, 255]);
    await expect.poll(() => exportedPixel(page, docToProject(owner.doc).panels[0], true, [0.05, 0.05]))
      .toEqual([0, 0, 0, 0]);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mod-board')).toBeVisible();
    await page.getByRole('button', { name: 'Dışa aktar', exact: false }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('kapsam-storyboard').click();
    await dialog.locator('select').first().selectOption({ label: 'PDF (panel ızgarası)' });
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await dialog.getByRole('button', { name: /oluştur/i }).last().click();
    const download = await downloadPromise;
    const chunks: Buffer[] = [];
    for await (const chunk of (await download.createReadStream())!) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const pdf = Buffer.concat(chunks);
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);
  } finally {
    await owner.close();
  }
});
