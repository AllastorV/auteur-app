import { expect, test } from '@playwright/test';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';
import { setScript } from '../../packages/core/src/doc/mutations';
import type { ScriptBlock } from '../../packages/core/src/model/script';

const SERVER = 'http://localhost:5180';
const WS = 'ws://localhost:5180';

/**
 * REVİZYON'UN GERÇEK UYGULAMADAKİ GÖRÜNÜMÜ.
 *
 * jsdom testleri bileşenin çalıştığını söylüyor; bu spec kâğıdın üstünde
 * NASIL DURDUĞUNU gösteriyor. Ekran görüntüsü `design/revizyon/` altına
 * yazılıyor — "önce bak, sonra göster".
 *
 * Senaryo metni üretilmiştir.
 */

let sayac = 0;
const b = (type: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `f${sayac}`, type, text, scene: '', sceneId: 'sc1' });

const BLOKLAR: ScriptBlock[] = [
  b('scene', 'İÇ. ATÖLYE — GECE'),
  b('action', 'Torna tezgâhı döner. Demir eğilip parçaya bakar. Işık soluk, tozlu.'),
  b('character', 'DEMİR'),
  b('parenthetical', '(alçak sesle)'),
  b('dialogue', 'Bu iş burada bitmez. Sabaha kadar dursak da bitmez, biliyorsun.'),
  b('character', 'NALAN'),
  b('dialogue', 'Şafak sökmeden gideceğiz.'),
  b('action', 'Nalan kapıya yürür. Demir arkasından bakar, sonra tezgâha döner.'),
  b('character', 'DEMİR'),
  b('dialogue', 'Bir dakika.'),
  b('action', 'Duraksar. Elindeki parçayı tezgâha bırakır.'),
];

async function studyoyuAc(page: any, request: any) {
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Revizyon E2E', ownerName: 'Sahip' },
  });
  expect(res.ok()).toBeTruthy();
  const oturum = await res.json();

  const tohum = createDoc(createProject({ panels: [createPanel()] }));
  setScript(tohum, { name: 'Revizyon', blocks: BLOKLAR });

  const sahip = await connectTestClient(WS, oturum.roomId, oturum.ownerToken);
  Y.applyUpdate(sahip.doc, Y.encodeStateAsUpdate(tohum));
  sahip.push();
  await new Promise((r) => setTimeout(r, 400));
  await sahip.close();

  const davetRes = await request.post(`${SERVER}/api/sessions/${oturum.roomId}/invites`, {
    headers: { authorization: `Bearer ${oturum.ownerToken}` },
    data: { role: 'editor' },
  });
  const davet = await davetRes.json();
  await page.goto(`/?oda=${oturum.roomCode}&davet=${encodeURIComponent(davet.token)}`);
  await page.getByPlaceholder('Görünecek ad').fill('Revizyon E2E');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 20_000 });
}

test('revizyon şeridi ve işaretli satır kâğıtta görünüyor', async ({ page, request }) => {
  await studyoyuAc(page, request);

  // Senaryo moduna geç
  const senaryo = page.locator('[data-testid="mod-senaryo"]');
  if (await senaryo.count()) {
    await senaryo.click();
    await page.waitForTimeout(900);
  }

  const serit = page.locator('[data-testid="revizyon-seridi"]');
  await expect(serit).toBeVisible();

  // İki revizyon: Beyaz, sonra Mavi
  await page.locator('[data-testid="serit-yayinla"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="serit-yayinla"]').click();
  await page.waitForTimeout(300);
  await expect(page.locator('[data-testid="serit-ad"]')).toContainText('MAVİ');

  // Diyalog satırlarını seç ve işaretle
  const bloklar = page.locator('.senaryo-metin > *');
  const n = await bloklar.count();
  expect(n).toBeGreaterThan(6);
  const bas = await bloklar.nth(4).boundingBox();
  const son = await bloklar.nth(6).boundingBox();
  if (bas && son) {
    await page.mouse.move(bas.x + 6, bas.y + bas.height / 2);
    await page.mouse.down();
    await page.mouse.move(son.x + son.width - 12, son.y + son.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  }
  await page.locator('[data-testid="serit-isaretle"]').click();
  await page.waitForTimeout(700);

  /* Asıl iddia: işaret KÂĞITTA görünür oldu. Yalnız veri yazıldığını
     doğrulamak, dekorasyonun hiç çizilmediği durumu kaçırırdı. */
  await expect(page.locator('.senaryo-metin [data-revizyon]').first()).toBeVisible();
  expect(await page.locator('.senaryo-metin [data-revizyon]').count()).toBeGreaterThan(0);

  /* İşaretli satırı GÖRÜNÜR alana getir: ilk sayfa düzenlenebilir kapak,
     senaryo metni onun altında. Kaydırmadan çekilen görüntü özelliğin
     çalıştığını gösterse de NASIL DURDUĞUNU göstermez. */
  await page.locator('.senaryo-metin [data-revizyon]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'design/revizyon/canli.png' });

  const kutu = await page.locator('[data-testid="revizyon-seridi"]').boundingBox();
  if (kutu) {
    await page.screenshot({
      path: 'design/revizyon/serit.png',
      clip: { x: kutu.x, y: kutu.y, width: Math.min(kutu.width, 700), height: kutu.height },
    });
  }
});
