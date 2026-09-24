import { expect, test, type Page } from '@playwright/test';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc, docToProject } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';
import { setScript } from '../../packages/core/src/doc/mutations';
import { strokeGeometry } from '../../packages/core/src/render/stroke';

const SERVER = 'http://localhost:5180';
const WS = 'ws://localhost:5180';

async function joinAsEditor(page: Page, request: any) {
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Stüdyo E2E', ownerName: 'Sahip' },
  });
  const session = await res.json();

  const project = createProject({ panels: [createPanel()] });
  const seed = createDoc(project);
  const owner = await connectTestClient(WS, session.roomId, session.ownerToken);
  Y.applyUpdate(owner.doc, Y.encodeStateAsUpdate(seed));
  owner.push();
  await new Promise((r) => setTimeout(r, 300));
  await owner.close();

  const inviteRes = await request.post(`${SERVER}/api/sessions/${session.roomId}/invites`, {
    headers: { authorization: `Bearer ${session.ownerToken}` },
    data: { role: 'editor' },
  });
  const invite = await inviteRes.json();

  await page.goto(`/?oda=${session.roomCode}&davet=${encodeURIComponent(invite.token)}`);
  await page.getByPlaceholder(/Görünecek ad|Display name/).fill('Editör');
  await page.getByRole('button', { name: /Oturuma katıl|Join session/ }).click();
  /* AÇILIŞ ARTIK SENARYO SAYFASINDA (kullanıcı kararı 2026-08-26: "proje
     açılınca storyboardda açılıyor, senaryoda olmalı"). Bu dosyanın testleri
     tuvalle ilgileniyor, o yüzden yardımcı panoya GEÇİYOR — her testin
     niyeti olduğu gibi kalsın. */
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('mod-board').click();
  await expect(page.getByTestId('canvas-container')).toBeVisible({ timeout: 20_000 });
  return session;
}

/** Panel bilgisi bölümündeki "N obje" sayacı. */
function objectCount(page: Page) {
  return page.locator('text=/\\d+ obje/').first();
}

async function paperLeft(page: Page): Promise<number> {
  return page.getByTestId('canvas-container').evaluate((container) => {
    const canvas = container.querySelector('canvas')!;
    const context = canvas.getContext('2d')!;
    const pixels = context.getImageData(0, Math.floor(canvas.height / 2), canvas.width, 1).data;
    for (let x = 0; x < canvas.width; x++) {
      if (pixels[x * 4 + 3] > 250) return x;
    }
    return -1;
  });
}

test('English panel and locked screenplay tooltips are translated', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('mizansen.arayuz-dili', 'en'));
  await joinAsEditor(page, request);
  const collapse = page.getByTitle('Collapse Properties panel');
  await expect(collapse).toBeVisible();
  await collapse.click();
  await expect(page.getByTitle('Expand Properties panel')).toBeVisible();
  await page.getByTestId('mod-senaryo').click();
  await expect(page.getByTestId('yazi-tipi-kilitli'))
    .toHaveAttribute('title', 'The screenplay typeface is Courier; the industry convention and the page count depend on it.');
  await expect(page.getByTestId('punto-kilitli'))
    .toHaveAttribute('title', 'The size is 12pt: 60 characters per line, 55 lines per page. Change it and the page ≈ minute contract collapses.');
});

test('mode controls stay contextual and document language remains in Settings', async ({ page, request }) => {
  await joinAsEditor(page, request);
  await expect(page.getByTestId('sunum-modu')).toBeVisible();
  await expect(page.getByTestId('odak-modu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Kalem', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('mod-grid').click();
  await expect(page.getByTestId('sunum-modu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kalem', exact: true })).toHaveCount(0);

  await page.getByTestId('mod-senaryo').click();
  await expect(page.getByTestId('sunum-modu')).toHaveCount(0);
  await expect(page.getByTestId('odak-modu')).toBeVisible();
  await expect(page.getByTestId('dil-sec-cubuk')).toHaveCount(0);

  await page.getByTestId('uygulama-menusu').click();
  await page.getByRole('menuitem', { name: 'Ayarlar' }).click();
  const language = page.getByTestId('dil-sec');
  await expect(language).toBeVisible();
  await language.selectOption('en');
  await expect(language).toHaveValue('en');
});

test('middle drag pans without drawing and Shift+wheel pans horizontally', async ({ page, request }) => {
  await joinAsEditor(page, request);
  const canvas = page.getByTestId('canvas-container');
  const box = (await canvas.boundingBox())!;
  const start = await paperLeft(page);
  expect(start).toBeGreaterThanOrEqual(0);
  const zoom = await page.getByTitle('%100').textContent();
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.5;

  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(x + 120, y, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  const moved = await paperLeft(page);
  expect(moved - start).toBeGreaterThan(60);
  await expect(objectCount(page)).toHaveText(/^0 obje$/);

  await page.mouse.move(x, y);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 60);
  await page.keyboard.up('Shift');
  await expect.poll(() => paperLeft(page)).toBeLessThan(moved - 20);
  await expect(page.getByTitle('%100')).toHaveText(zoom ?? '');

  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + box.width + 20, y, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  const released = await paperLeft(page);
  await page.mouse.move(box.x + box.width + 70, y);
  expect(await paperLeft(page)).toBe(released);
  await expect(page.getByRole('button', { name: 'Kaydır', exact: true })).toHaveCount(0);
});

test('Presentation fullscreen button and F follow browser state, Escape returns to Storyboard', async ({ page, request }) => {
  await joinAsEditor(page, request);
  await page.getByTestId('sunum-modu').click();
  const surface = page.getByTestId('sunum-yuzeyi');
  const toggle = page.getByTestId('sunum-tam-ekran');
  await expect(surface).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid')))
    .toBe('sunum-yuzeyi');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(surface).toBeVisible();

  await page.keyboard.press('f');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('canvas-container')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();

  await page.getByTestId('sunum-modu').click();
  await page.getByTestId('sunum-yuzeyi').evaluate((host) => {
    Object.defineProperty(host, 'requestFullscreen', {
      value: () => Promise.reject(new Error('denied')),
      configurable: true,
    });
  });
  const deniedToggle = page.getByTestId('sunum-tam-ekran');
  await deniedToggle.click();
  await expect(deniedToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('alert')).toContainText('Tam ekran açılamadı');
});

test('revision controls live in the screenplay format row and work at narrow width', async ({ page, request }) => {
  await joinAsEditor(page, request);
  await expect(page.getByTestId('revizyon-seridi')).toHaveCount(0);
  await page.getByTestId('mod-senaryo').click();
  const revision = page.getByTestId('revizyon-seridi');
  await expect(revision.locator('xpath=ancestor::header[1]')).toHaveCount(1);
  await page.setViewportSize({ width: 800, height: 700 });
  const publish = page.getByTestId('serit-yayinla');
  await expect(publish).toBeVisible();
  expect((await publish.boundingBox())!.x + (await publish.boundingBox())!.width).toBeLessThan(800);
  await publish.click();
  const color = page.getByTestId('revizyon-renk-secici');
  await color.click();
  await expect(page.getByTestId('revizyon-renk-menusu')).toBeVisible();
  await page.getByTestId('revizyon-renk-tan').click();
  await expect(color).toHaveAccessibleName(/Tan/);
  await expect(page.getByTestId('serit-isaretle')).toBeVisible();
});

test('only active-revision marked screenplay pages change colour without moving the caret', async ({ page, request }, testInfo) => {
  const session = await joinAsEditor(page, request);
  await page.getByTestId('mod-senaryo').click();
  const observer = await connectTestClient(WS, session.roomId, session.ownerToken);
  try {
    const blocks = Array.from({ length: 120 }, (_, i) => ({
      id: `revision-${i}`, fp: '', type: 'action' as const,
      text: `Satır ${i} biraz metin taşır.`, scene: '', sceneId: '',
    }));
    setScript(observer.doc, { name: 'Revisions', blocks });
    observer.push();
    await expect(page.getByTestId('sayac-sayfa')).not.toContainText('1 sayfa');
    await page.locator('.senaryo-metin [data-tip]').first().click();
    const caret = await page.evaluate(() => window.getSelection()?.anchorOffset);
    await page.getByTestId('serit-yayinla').click();
    await page.getByTestId('serit-isaretle').click();
    await expect(page.getByTestId('serit-sayi')).toContainText('1');
    const overlay = page.locator('[data-revizyon-sayfa]');
    await expect(overlay).toHaveCount(1);
    await expect(overlay).toHaveAttribute('data-revizyon-sayfa', '1');
    expect(await overlay.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(await page.locator('.senaryo-kagit').evaluate((el) => getComputedStyle(el).backgroundColor));
    expect(await page.evaluate(() => window.getSelection()?.anchorOffset)).toBe(caret);
    await page.screenshot({ path: testInfo.outputPath('revision-page.png') });
  } finally {
    await observer.close();
  }
});

test('Cards includes Gallery filters without a separate Gallery tab', async ({ page, request }) => {
  await joinAsEditor(page, request);
  await page.getByTestId('mod-grid').click();
  await expect(page.getByTestId('cards')).toBeVisible();
  await expect(page.getByTestId('cards-filter-all')).toBeVisible();
  await expect(page.getByTestId('cards-filter-linked')).toBeVisible();
  await expect(page.getByTestId('cards-filter-unlinked')).toBeVisible();
  await expect(page.getByTestId('mod-galeri')).toHaveCount(0);
});

test('Cards shows an insertion gap while dragging and commits the new order', async ({ page, request }) => {
  await joinAsEditor(page, request);
  await page.getByTestId('mod-grid').click();
  await page.getByTestId('cards-add').click();
  await page.getByTestId('cards-add').click();
  const cards = page.getByTestId('cards-card');
  await expect(cards).toHaveCount(3);
  const before = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-panel-id')));
  const first = (await cards.first().boundingBox())!;
  const last = (await cards.nth(2).boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + 15);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2 + 15, first.y + 15, { steps: 5 });
  await page.mouse.move(last.x + last.width * 0.8, last.y + 15, { steps: 12 });
  await expect(page.getByTestId('cards-gap')).toBeVisible();
  await page.mouse.up();
  await expect.poll(() => cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-panel-id'))))
    .toEqual([before[1], before[2], before[0]]);
  await cards.nth(2).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-panel-id'))))
    .toEqual([before[1], before[0], before[2]]);
});

test('kalemle çizim yapıldığında panele obje eklenir', async ({ page, request }) => {
  await joinAsEditor(page, request);
  await expect(objectCount(page)).toHaveText(/^0 obje$/);

  await page.getByTitle('Kalem (B)').click();
  const canvas = page.getByTestId('canvas-container');
  const box = (await canvas.boundingBox())!;

  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + box.width * (0.4 + i * 0.02), box.y + box.height * (0.4 + i * 0.015));
  }
  await page.mouse.up();

  await expect(objectCount(page)).toHaveText(/^1 obje$/, { timeout: 5000 });
});

/* SİLÜET + POZ SİSTEMİ KALDIRILDI (2026-08-29).

   Buradaki test kütüphanede "Pozlar" sekmesini açıp bir silüet
   sürüklüyordu; o sekme de o obje türü de artık yok, yani testin ÖLÇTÜĞÜ
   ŞEY kalmamıştı ve hiçbir zaman yeşile dönemezdi — 29 Ağustos'tan beri
   kırmızıydı.

   Yerine kaldırma kararını ÇİVİLEYEN bir test geliyor; aynı kalıp
   `script.spec.ts`teki "otomatik algılama kaldırıldı" testinde de var:
   kaldırılan bir davranış da en az eklenen kadar test ister, yoksa bir
   gün sessizce geri gelir. */
test('kütüphanede POZ sekmesi YOK — silüet sistemi kaldırıldı', async ({ page, request }) => {
  await joinAsEditor(page, request);
  await page.getByTestId('kutuphane-anahtari').click();

  /* İKİ YÖNLÜ İDDİA: yalnız "Pozlar yok" demek, kütüphanenin tamamen
     çizilmediği bir gerilemede de yeşil kalırdı. Kalanlar da çivileniyor. */
  await expect(page.getByRole('button', { name: 'Kamera Açıları' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Objeler' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Şablonlar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pozlar' })).toHaveCount(0);
});

test('kamera preseti panel meta verisine etiket yazar', async ({ page, request }) => {
  await joinAsEditor(page, request);
  await page.getByTestId('kutuphane-anahtari').click();
  await page.getByRole('button', { name: 'Kamera Açıları' }).click();
  await page.getByPlaceholder('Kütüphanede ara…').fill('yakın plan');

  const card = page.locator('text=Yakın Plan').first();
  await card.dragTo(page.getByTestId('canvas-container'));

  const cameraField = page.getByPlaceholder('Preset seçilince dolar');
  await expect(cameraField).toHaveValue(/CU|MCU/, { timeout: 5000 });
});

test('panel ekleme ve grid görünümü', async ({ page, request }) => {
  await joinAsEditor(page, request);
  await expect(page.getByText(/1 panel · toplam/)).toBeVisible();

  await page.getByRole('button', { name: '+ Panel' }).click();
  await expect(page.getByText(/2 panel · toplam/)).toBeVisible();

  await page.getByTestId('mod-grid').click();
  await expect(page.getByText('Sayfa başına', { exact: true })).toBeVisible();
  await expect(page.getByText('Sayfa 1')).toBeVisible();
});

test('zaman çizelgesi süresi panel süresini yansıtır', async ({ page, request }) => {
  await joinAsEditor(page, request);
  await page.getByTestId('pano-sekme-ozellik').click();
  const duration = page.getByRole('spinbutton', { name: 'Süre sn' });
  await duration.fill('5');
  await duration.blur();
  await expect(page.getByText(/toplam 5\.00 sn/)).toBeVisible({ timeout: 5000 });
});

test('editör dışa aktarma diyaloğunu açamaz (yalnızca Sahip)', async ({ page, request }) => {
  await joinAsEditor(page, request);
  await expect(page.getByRole('button', { name: 'Dışa aktar' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Kaydet/  })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Farklı kaydet', exact: true })).toBeDisabled();
  await page.keyboard.press('Control+s');
  await expect(page.getByText('Bu rol dışa aktaramaz.')).toBeVisible();
});


test('tuval metni yazılır, çift tıklamayla yeniden düzenlenir ve kova yalnız şekli boyar', async ({ page, request }) => {
  const session = await joinAsEditor(page, request);
  const observer = await connectTestClient(WS, session.roomId, session.ownerToken);
  try {
    const box = (await page.getByTestId('canvas-container').boundingBox())!;
    const x = box.x + box.width * 0.3;
    const y = box.y + box.height * 0.35;
    await page.getByRole('button', { name: 'Metin', exact: true }).click();
    await page.mouse.click(x, y);
    const input = page.getByTestId('tuval-metin-duzenle');
    await expect(input).toBeVisible();
    await input.fill('Öykü ışığı açar.');
    await page.mouse.click(x, y + 100);
    const panel = () => docToProject(observer.doc).panels[0];
    await expect.poll(() => panel().objects.find(o => o.kind === 'text')?.text).toBe('Öykü ışığı açar.');
    await page.mouse.dblclick(x + 10, y + 8);
    await expect(input).toHaveValue('Öykü ışığı açar.');
    await input.fill('Öykü ışığı kapatır.');
    await page.mouse.click(x, y + 100);
    await expect.poll(() => panel().objects.find(o => o.kind === 'text')?.text).toBe('Öykü ışığı kapatır.');
    const left = box.x + box.width * 0.55;
    const top = box.y + box.height * 0.35;
    await page.getByRole('button', { name: 'Dikdörtgen', exact: true }).click();
    await page.mouse.move(left, top);
    await page.mouse.down();
    await page.mouse.move(left + 140, top + 100, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => panel().objects.find(o => o.kind === 'rect')?.fill).toBe(null);
    const background = panel().background;
    await page.getByTestId('pano-sekme-boya').click();
    await page.getByTestId('paint-fill-color').fill('#111827');
    await page.getByRole('button', { name: 'Kova doldurma', exact: true }).click();
    await page.mouse.click(left + 60, top + 40);
    await expect.poll(() => panel().objects.find(o => o.kind === 'rect')?.fill).toBe('#111827');
    expect(panel().background).toBe(background);
  } finally {
    await observer.close();
  }
});

test('timeline shows drawings and ruler; scrubbing respects horizontal scroll and resizing does not seek', async ({ page, request }) => {
  await joinAsEditor(page, request);
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '+ Panel' }).click();
  const track = page.getByTestId('timeline-track');
  const shots = page.getByTestId('timeline-shot');
  await expect(shots).toHaveCount(6);
  await expect(page.getByTestId('timeline-thumbnail')).toHaveCount(6);
  await expect(page.getByTestId('timeline-ruler').locator('[data-time="0"]')).toBeVisible();
  await track.evaluate((element) => { element.scrollLeft = 336; });
  const scroll = await track.evaluate((element) => element.scrollLeft);
  expect(scroll).toBeGreaterThan(0);
  const box = (await track.boundingBox())!;
  await page.mouse.move(box.x + 56, box.y + 28);
  await page.mouse.down();
  await page.mouse.move(box.x + 112, box.y + 28, { steps: 5 });
  await expect.poll(async () => {
    const label = await page.locator('span.font-mono.tabular-nums').first().textContent();
    const match = label?.match(/^(\d+):(\d+)\.(\d+)/);
    return match ? Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 100 : -1;
  }).toBeCloseTo((112 + scroll) / 56, 1);
  await page.mouse.up();
  const beforeResize = await page.locator('span.font-mono.tabular-nums').first().textContent();
  const resize = page.getByTestId('timeline-resize').nth(3);
  const handle = (await resize.boundingBox())!;
  await page.mouse.move(handle.x + 2, handle.y + 10);
  await page.mouse.down();
  await page.mouse.move(handle.x + 20, handle.y + 10, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('span.font-mono.tabular-nums').first()).toContainText(beforeResize!.split(' / ')[0]);
});

test('timeline drag grip previews an insertion gap and keyboard reorder uses the same order', async ({ page, request }) => {
  await joinAsEditor(page, request);
  await page.getByRole('button', { name: '+ Panel' }).click();
  await page.getByRole('button', { name: '+ Panel' }).click();
  const shots = page.getByTestId('timeline-shot');
  const before = await shots.evaluateAll((elements) => elements.map((el) => el.getAttribute('data-panel-id')));
  const grip = page.getByTestId('timeline-drag-grip').first();
  const from = (await grip.boundingBox())!;
  const to = (await shots.nth(2).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 14, from.y + 3, { steps: 5 });
  await page.mouse.move(to.x + to.width * 0.8, to.y + 20, { steps: 12 });
  await expect(page.getByTestId('timeline-gap')).toBeVisible();
  await page.mouse.up();
  await expect.poll(() => shots.evaluateAll((elements) => elements.map((el) => el.getAttribute('data-panel-id'))))
    .toEqual([before[1], before[2], before[0]]);
  await page.getByTestId('timeline-drag-grip').nth(2).focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(() => shots.evaluateAll((elements) => elements.map((el) => el.getAttribute('data-panel-id'))))
    .toEqual([before[1], before[0], before[2]]);
});

test('lasso repeatedly selects drawn objects after zoom and pan; cancel clears only its outline', async ({ page, request }) => {
  await joinAsEditor(page, request);
  const canvas = page.getByTestId('canvas-container');
  const box = (await canvas.boundingBox())!;
  const drawRect = async (x: number, y: number) => {
    await page.getByRole('button', { name: 'Dikdörtgen', exact: true }).click();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 75, y + 50, { steps: 8 });
    await page.mouse.up();
  };
  const loop = async (x: number, y: number) => {
    await page.getByRole('button', { name: 'Kement seçim', exact: true }).click();
    await page.mouse.move(x - 12, y - 12);
    await page.mouse.down();
    await expect(canvas).toHaveAttribute('data-lasso-active', 'true');
    for (const [dx, dy] of [[88, -12], [88, 62], [-12, 62], [-12, -12]]) {
      await page.mouse.move(x + dx, y + dy, { steps: 6 });
    }
    await page.mouse.up();
    await expect(canvas).toHaveAttribute('data-lasso-active', 'false');
    await expect(page.getByRole('button', { name: 'Kement seçim', exact: true })).toHaveAttribute('aria-pressed', 'true');
  };
  const selectedX = () => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Obje — Dikdörtgen' }) })
    .getByText('X', { exact: true }).locator('..').locator('input');

  const first = { x: box.x + box.width * 0.33, y: box.y + box.height * 0.40 };
  await drawRect(first.x, first.y);
  await loop(first.x, first.y);
  await expect(selectedX()).toBeVisible();
  const firstX = await selectedX().inputValue();

  for (let i = 0; i < 7; i++) await page.getByTitle('Yakınlaş').click();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + box.width * 0.5 + 35, box.y + box.height * 0.5 + 25, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  const second = { x: box.x + box.width * 0.53, y: box.y + box.height * 0.48 };
  await drawRect(second.x, second.y);
  await loop(second.x, second.y);
  await expect(selectedX()).not.toHaveValue(firstX);
  const secondX = await selectedX().inputValue();

  await page.mouse.move(second.x - 20, second.y - 20);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute('data-lasso-active', 'true');
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
  await expect(canvas).toHaveAttribute('data-lasso-active', 'false');
  await page.mouse.up();
  await expect(selectedX()).toHaveValue(secondX);
});

test('new pen and brush marks persist with visibly different geometry', async ({ page, request }) => {
  const session = await joinAsEditor(page, request);
  const observer = await connectTestClient(WS, session.roomId, session.ownerToken);
  try {
    const box = (await page.getByTestId('canvas-container').boundingBox())!;
    const draw = async (tool: 'Kalem' | 'Fırça', y: number) => {
      await page.getByRole('button', { name: tool, exact: true }).click();
      await page.mouse.move(box.x + box.width * 0.35, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.55, y + 12, { steps: 12 });
      await page.mouse.up();
    };
    await draw('Kalem', box.y + box.height * 0.40);
    await draw('Fırça', box.y + box.height * 0.53);
    await expect(objectCount(page)).toHaveText(/^2 obje$/);
    const strokes = () => docToProject(observer.doc).panels[0].objects.filter((obj) => obj.kind === 'stroke');
    await expect.poll(() => strokes().length).toBe(2);
    const [pen, brush] = strokes();
    expect(pen.geometryVersion).toBe(2);
    expect(brush.geometryVersion).toBe(2);
    expect(pen.brush).toBe(false);
    expect(brush.brush).toBe(true);
    expect(strokeGeometry(pen).filled).toBe(false);
    expect(strokeGeometry(brush).filled).toBe(true);
  } finally {
    await observer.close();
  }
});

test('right inspector follows the active mode even when screenplay has content', async ({ page, request }) => {
  const session = await joinAsEditor(page, request);
  const owner = await connectTestClient(WS, session.roomId, session.ownerToken);
  try {
    setScript(owner.doc, {
      name: 'Inspector mode',
      blocks: [{ id: 'scene-1', fp: 'scene-1', type: 'action', text: 'The room opens.', scene: '', sceneId: 'scene-1' }],
    });
    owner.push();
    await expect(page.getByTestId('storyboard-inspector')).toBeVisible();
    await expect(page.getByTestId('denetci-sekmeleri')).toHaveCount(0);
    await expect(page.getByTestId('pano-sekme-katman')).toBeVisible();
    await expect(page.getByTestId('pano-sekme-boya')).toBeVisible();
    await expect(page.getByTestId('pano-sekme-ozellik')).toBeVisible();
    await expect(page.getByTestId('pano-sekme-rehber')).toBeVisible();
    await page.getByTestId('mod-grid').click();
    await expect(page.getByTestId('cards-inspector')).toBeVisible();
    await expect(page.getByTestId('pano-sekmeleri')).toHaveCount(0);
    await page.getByTestId('cards-open-board').click();
    await expect(page.getByTestId('storyboard-inspector')).toBeVisible();
    await page.getByTestId('mod-senaryo').click();
    await expect(page.getByTestId('denetci-sekmeleri')).toBeVisible();
    await expect(page.getByTestId('storyboard-inspector')).toHaveCount(0);
  } finally {
    await owner.close();
  }
});

test('paint settings persist on new strokes and transparent bucket clears only shape fill', async ({ page, request }) => {
  const session = await joinAsEditor(page, request);
  const observer = await connectTestClient(WS, session.roomId, session.ownerToken);
  try {
    const box = (await page.getByTestId('canvas-container').boundingBox())!;
    const x = box.x + box.width * 0.45;
    const y = box.y + box.height * 0.42;
    await page.getByTestId('pano-sekme-boya').click();
    await page.getByTestId('paint-stroke-color').fill('#ff0000');
    await page.getByTestId('paint-opacity').evaluate((input: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '40');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'Kalem', exact: true }).click();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 100, y + 12, { steps: 8 });
    await page.mouse.up();
    const panel = () => docToProject(observer.doc).panels[0];
    await expect.poll(() => panel().objects.find(o => o.kind === 'stroke')?.opacity).toBe(0.4);
    expect(panel().objects.find(o => o.kind === 'stroke')?.color).toBe('#ff0000');

    await page.getByRole('button', { name: 'Dikdörtgen', exact: true }).click();
    const left = box.x + box.width * 0.55;
    const top = box.y + box.height * 0.57;
    await page.mouse.move(left, top);
    await page.mouse.down();
    await page.mouse.move(left + 110, top + 70, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => panel().objects.find(o => o.kind === 'rect')?.fill).toBe(null);
    await page.getByTestId('paint-fill-color').fill('#00ff00');
    await page.getByRole('button', { name: 'Kova doldurma', exact: true }).click();
    await page.mouse.click(left + 40, top + 30);
    await expect.poll(() => panel().objects.find(o => o.kind === 'rect')?.fill).toBe('#00ff00');
    const background = panel().background;
    await page.getByTestId('paint-transparent-fill').click();
    await page.mouse.click(left + 40, top + 30);
    await expect.poll(() => panel().objects.find(o => o.kind === 'rect')?.fill).toBe(null);
    await page.mouse.click(box.x + 15, box.y + 15);
    expect(panel().background).toBe(background);
  } finally {
    await observer.close();
  }
});

test('layer grip inserts between rows and keeps the active layer and edits', async ({ page, request }) => {
  const session = await joinAsEditor(page, request);
  const observer = await connectTestClient(WS, session.roomId, session.ownerToken);
  try {
    const rows = page.getByTestId('layer-row');
    await expect(rows).toHaveCount(3);
    const initial = [...docToProject(observer.doc).panels[0].layers].sort((a, b) => a.order - b.order);
    const movedId = initial[2].id;
    const activeName = await page.getByTestId('active-layer-name').inputValue();
    const destination = (await rows.nth(1).boundingBox())!;
    await page.getByTestId('layer-grip').first().dragTo(rows.nth(1), {
      targetPosition: { x: destination.width / 2, y: destination.height - 2 },
    });
    await expect.poll(() => {
      const layers = [...docToProject(observer.doc).panels[0].layers].sort((a, b) => a.order - b.order);
      return layers[1].id;
    }).toBe(movedId);
    await expect(rows.nth(1).locator('input')).toHaveValue(initial[2].name);
    await expect(page.getByTestId('active-layer-name')).toHaveValue(activeName);
    await expect(page.getByTestId('layer-gap')).toHaveCount(0);
  } finally {
    await observer.close();
  }
});
