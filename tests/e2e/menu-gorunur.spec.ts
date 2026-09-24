import { expect, test } from '@playwright/test';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';

const SERVER = 'http://localhost:5180';
const WS = 'ws://localhost:5180';

/** Web kabuğu doğrudan stüdyoyu açmıyor; önce bir odaya katılmak gerekiyor. */
async function studyoyuAc(page: any, request: any) {
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Menü E2E', ownerName: 'Sahip' },
  });
  expect(res.ok()).toBeTruthy();
  const oturum = await res.json();

  const tohum = createDoc(createProject({ panels: [createPanel()] }));
  const sahip = await connectTestClient(WS, oturum.roomId, oturum.ownerToken);
  Y.applyUpdate(sahip.doc, Y.encodeStateAsUpdate(tohum));
  sahip.push();
  await new Promise((r) => setTimeout(r, 300));
  await sahip.close();

  const davetRes = await request.post(`${SERVER}/api/sessions/${oturum.roomId}/invites`, {
    headers: { authorization: `Bearer ${oturum.ownerToken}` },
    data: { role: 'editor' },
  });
  const davet = await davetRes.json();
  await page.goto(`/?oda=${oturum.roomCode}&davet=${encodeURIComponent(davet.token)}`);
  await page.getByPlaceholder('Görünecek ad').fill('Menü E2E');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 20_000 });
}

/**
 * UYGULAMA MENÜSÜ GERÇEKTEN AÇILIYOR MU.
 *
 * Bu test bir GERİLEMEDEN doğdu: üst çubuğun taşmasını önlemek için sol
 * gruba `overflow-hidden` konmuştu ve menünün mutlak konumlu paneli o
 * kutuya takılıp görünmez oldu. Düğme çalışıyordu, durum değişiyordu,
 * panel DOM'daydı — kullanıcı için hiçbir şey açılmıyordu.
 *
 * Bu yüzden ölçüt "öğe belgede var mı" DEĞİL. Kırpılmış bir öğe hâlâ
 * belgededir ve ölçülebilir bir kutusu vardır; `toBeVisible` bunu yeşil
 * geçirir. Ölçüt: öğenin merkezine tıklandığında GERÇEKTEN o öğe
 * yakalanıyor mu (`elementFromPoint`) ve panel başlık çubuğunun altına
 * taşabiliyor mu.
 */

test('uygulama menüsü açılıyor ve öğeleri tıklanabilir', async ({ page, request }) => {
  await studyoyuAc(page, request);

  const dugme = page.getByTestId('uygulama-menusu');
  await expect(dugme).toBeVisible();
  await dugme.click();

  const oge = page.getByRole('menuitem', { name: 'Ayarlar', exact: true });
  await expect(oge).toBeVisible();

  const kutu = await oge.boundingBox();
  expect(kutu, 'menü öğesinin ölçülebilir bir kutusu olmalı').not.toBeNull();

  /* Panel başlık çubuğunun (h-11 = 44 px) ALTINA taşımalı. Kırpılan bir
     panelde öğe ya sıfır yüksekliğe iner ya da çubuğun içinde sıkışır. */
  expect(kutu!.height).toBeGreaterThan(4);
  expect(kutu!.y).toBeGreaterThan(44);

  /* ASIL ÖLÇÜM: o noktada gerçekten bu öğe mi duruyor. Kırpılmış öğe
     burada `null` ya da arkadaki başka bir düğüm döner. */
  const nokta = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el ? (el.textContent ?? '').trim() : null;
    },
    { x: kutu!.x + kutu!.width / 2, y: kutu!.y + kutu!.height / 2 },
  );
  expect(nokta, 'menü öğesinin merkezinde başka bir şey duruyor').toContain('Ayarlar');

  /* Ve tıklanınca gerçekten açıyor.

     `role="dialog"` DEĞİL: ayarlar 2026-08-27'de kullanıcı kararıyla
     popup olmaktan çıkıp tam ekran panele döndü (`role="region"`) ve bu
     iddia o gün güncellenmedi — test o tarihten beri kırmızıydı, ürün
     ise doğru çalışıyordu. Panelin KENDİSİ ölçülüyor. */
  await oge.click();
  await expect(page.getByTestId('ayarlar-paneli')).toBeVisible();
});
