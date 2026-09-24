import { expect, test, type Page } from '@playwright/test';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';
import { createRect } from '../../packages/core/src/model/objects';

const SERVER = 'http://localhost:5180';
const WS = 'ws://localhost:5180';

/**
 * Bilinen konumda TEK bir nesne içeren panelle oturuma katılır.
 *
 * Eskiden silüet + 3D obje konuyordu; o sistem kaldırıldı (2026-08-29).
 * Buradaki testler nesnenin TÜRÜYLE ilgilenmiyor — seçilebiliyor mu,
 * sürüklenince taşınıyor mu, tuval kayıyor mu diye soruyorlar.
 */
async function seedAndJoin(page: Page, request: any) {
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Sürükleme', ownerName: 'Sahip' },
  });
  const session = await res.json();

  const panel = createPanel();
  const layerId = panel.layers[1].id;
  const nesne = createRect({ layerId, x: 960, y: 620 }, { width: 260, height: 480 });
  panel.objects.push(nesne);

  const seed = createDoc(createProject({ panels: [panel] }));
  const owner = await connectTestClient(WS, session.roomId, session.ownerToken);
  Y.applyUpdate(owner.doc, Y.encodeStateAsUpdate(seed));
  owner.push();
  await new Promise((r) => setTimeout(r, 500));
  await owner.close();

  const inviteRes = await request.post(`${SERVER}/api/sessions/${session.roomId}/invites`, {
    headers: { authorization: `Bearer ${session.ownerToken}` },
    data: { role: 'editor' },
  });
  const invite = await inviteRes.json();

  await page.goto(`/?oda=${session.roomCode}&davet=${encodeURIComponent(invite.token)}`);
  await page.getByPlaceholder('Görünecek ad').fill('Editör');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  /* AÇILIŞ ARTIK SENARYO SAYFASINDA (kullanıcı kararı 2026-08-26); bu
     bekleme tuvali istiyor. */
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('mod-board').click();
  await expect(page.getByTestId('canvas-container')).toBeVisible({ timeout: 20_000 });
  // İlk boyama otursun.
  await page.waitForTimeout(1200);
  return { session, nesneId: nesne.id };
}

/** Konva sahnesinden okunan durum — kullanıcının gördüğü gerçek konumlar. */
async function stageState(page: Page, objectId: string) {
  return page.evaluate((id) => {
    const K = (window as any).Konva;
    const stage = K?.stages?.[0];
    if (!stage) return null;
    const node = stage.findOne('#' + id);
    const box = stage.container().getBoundingClientRect();
    const abs = node ? node.getAbsolutePosition() : null;
    return {
      pan: { x: stage.x(), y: stage.y() },
      zoom: stage.scaleX(),
      node: node ? { x: node.x(), y: node.y() } : null,
      screen: abs ? { x: box.left + abs.x, y: box.top + abs.y } : null,
    };
  }, objectId);
}


test('obje sürüklenince tuval kaymaz', async ({ page, request }) => {
  const { nesneId } = await seedAndJoin(page, request);

  const before = await stageState(page, nesneId);
  await page.mouse.move(before!.screen!.x, before!.screen!.y);
  await page.mouse.down();
  await page.mouse.move(before!.screen!.x + 120, before!.screen!.y + 40, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  const after = await stageState(page, nesneId);
  expect(Math.abs(after!.pan.x - before!.pan.x), 'tuval yatayda kaymamalı').toBeLessThan(2);
  expect(Math.abs(after!.pan.y - before!.pan.y), 'tuval dikeyde kaymamalı').toBeLessThan(2);
});


test('arayüz gizlendikten sonra geri getirilebilir', async ({ page, request }) => {
  await seedAndJoin(page, request);
  const toolbar = page.getByRole('button', { name: 'Yeni proje' });
  await expect(toolbar).toBeVisible();

  /* ODAĞI ÖNCE TUVALE AL. `seedAndJoin` panoya `mod-board` DÜĞMESİNE
     tıklayarak geçiyor ve odak o düğmede kalıyor; Tab orada bilinçli
     olarak NORMAL GEZİNME anlamını koruyor (`useShortcuts.ts`, odak bir
     denetimdeyken kabuk gizlenmez — klavye gezinmesini yok etmemek için).
     ÖLÇÜLDÜ 2026-08-31: eski hâlde Tab odağı `mod-galeri`ye taşıyordu ve
     test o yüzden kırmızıydı; ürün doğru çalışıyordu. Kullanıcı da bu
     tuşa tuvalde çalışırken basar. */
  await page.getByTestId('canvas-container').click({ position: { x: 5, y: 5 } });

  // Gizle.
  await page.locator('body').press('Tab');
  await expect(toolbar).toBeHidden();

  // Tab ile geri gelmeli.
  await page.locator('body').press('Tab');
  await expect(toolbar).toBeVisible();

  // Odak bir düğmedeyken de kilitlenmemeli: gizle, sonra tuvaldeki düğmeye
  // odaklan ve Tab'a bas.
  await page.locator('body').press('Tab');
  await expect(toolbar).toBeHidden();
  await page.getByRole('button', { name: 'Sığdır' }).focus();
  await page.keyboard.press('Tab');
  await expect(toolbar, 'odak düğmedeyken de arayüz geri gelmeli').toBeVisible();

  // Escape de kaçış yolu olmalı. (Önce odağı düğmeden al: arayüz görünürken
  // Tab'ın odak gezinmesine bırakılması bilinçli davranış.)
  await page.getByTestId('canvas-container').click({ position: { x: 6, y: 6 } });
  await page.locator('body').press('Tab');
  await expect(toolbar).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(toolbar, 'Escape arayüzü geri getirmeli').toBeVisible();
});


test('kamera çerçevesi seçilip taşınabilir', async ({ page, request }) => {
  await seedAndJoin(page, request);

  // Kütüphaneden bir kamera preseti bırak.
  /* Kütüphane artık ÇEKMECE: kullanmadan önce açılır. */
  await page.getByTestId('kutuphane-anahtari').click();
  await page.getByRole('button', { name: 'Kamera Açıları' }).click();
  await page.getByPlaceholder('Kütüphanede ara…').fill('yakın plan');
  await page.locator('text=Yakın Plan').first().dragTo(page.getByTestId('canvas-container'));

  // Çerçeve panele düşmeli ve etiketi panel meta verisine yazılmalı.
  const overlayId = await page.evaluate(() => {
    const K = (window as any).Konva;
    const stage = K?.stages?.[0];
    const node = stage.find('Group').find((g: any) => g.id()?.startsWith('cam'));
    return node?.id() ?? null;
  });
  expect(overlayId, 'kamera çerçevesi panele eklenmeli').not.toBeNull();

  const before = await stageState(page, overlayId!);
  expect(before!.node, 'kamera düğümü sahnede olmalı').not.toBeNull();

  // Çerçevenin kenarına tıkla (ortası boş; kesikli çerçeve ve etiket şeridi var).
  await page.mouse.click(before!.screen!.x, before!.screen!.y);
  await expect(
    page.getByText('Kamera Açısı', { exact: true }),
    'kamera çerçevesine tıklamak denetçisini açmalı',
  ).toBeVisible({ timeout: 3000 });

  // Taşınabilmeli.
  await page.mouse.move(before!.screen!.x, before!.screen!.y);
  await page.mouse.down();
  await page.mouse.move(before!.screen!.x + 90, before!.screen!.y + 30, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  const after = await stageState(page, overlayId!);
  expect(after!.node!.x - before!.node!.x, 'kamera çerçevesi taşınmalı').toBeGreaterThan(40);
  expect(Math.abs(after!.pan.x - before!.pan.x), 'tuval kaymamalı').toBeLessThan(2);
});
