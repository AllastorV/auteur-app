import { test, expect } from '@playwright/test';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';
import { setScript } from '../../packages/core/src/doc/mutations';
import type { ScriptBlock } from '../../packages/core/src/model/script';

/**
 * ARAYÜZ ÖLÇEĞİ GERÇEKTEN ÖLÇEKLİYOR MU.
 *
 * Bu spec bir HATADAN doğdu (kullanıcı bildirimi 2026-08-30: "interface
 * scale çalışmıyor"). Ayar kabuk kökünde `font-size` ayarlıyordu ve
 * kodun yorumu "bütün ölçüler rem/em tabanlı" diyordu — DEĞİLLERDİ.
 * Arayüz baştan sona Tailwind piksel sınıflarıyla yazılı, piksel kök
 * yazı boyunu umursamaz: kaydırıcı hareket ediyor, yüzde değişiyor,
 * ekranda HİÇBİR ŞEY olmuyordu.
 *
 * Ölçüt DOM ÖLÇÜSÜ: ekran görüntüsüne bakmak "büyümüş gibi" demek olurdu.
 * İki karşıt iddia birden sınanıyor — kabuk BÜYÜYECEK, senaryo kâğıdı
 * DEĞİŞMEYECEK. İkincisi ayarın altında kullanıcıya verilen sözdür.
 *
 * Senaryo metni ÜRETİLMİŞTİR.
 */

const SERVER = 'http://localhost:5180';

let sayac = 0;
const b = (type: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `f${sayac}`, type, text, scene: '', sceneId: 'sc1' });

/** Kabuk (araç çubuğu) ve kâğıt genişliği — ikisi ayrı sözleşme. */
async function olcu(page: any) {
  return page.evaluate(() => {
    const cubuk = document.querySelector('.mzn-kabuk-kaydir') as HTMLElement;
    const kagit = document.querySelector('.senaryo-kagit') as HTMLElement;
    return {
      cubuk: cubuk.getBoundingClientRect().height,
      kagit: kagit.getBoundingClientRect().width,
    };
  });
}

test('arayüz ölçeği kabuğu büyütür, senaryo kâğıdını değiştirmez', async ({ page, request }) => {
  test.setTimeout(180_000);

  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Ölçek', ownerName: 'Sahip' },
  });
  const oturum = await res.json();
  const tohum = createDoc(createProject({ panels: [createPanel()] }));
  setScript(tohum, { name: 'Ölçek', blocks: [
    b('scene', 'İÇ. ATÖLYE — GECE'), b('action', 'Torna tezgâhı döner.')] });
  const sahip = await connectTestClient('ws://localhost:5180', oturum.roomId, oturum.ownerToken);
  Y.applyUpdate(sahip.doc, Y.encodeStateAsUpdate(tohum));
  sahip.push();
  await new Promise((r) => setTimeout(r, 500));
  await sahip.close();

  await page.goto(`/?oda=${oturum.roomCode}&davet=${encodeURIComponent(oturum.ownerToken)}`);
  await page.getByPlaceholder('Görünecek ad').fill('Ölçek');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(1200);

  const once = await olcu(page);
  expect(once.cubuk).toBeGreaterThan(0);

  /* GERÇEK YOL: uygulama menüsü → Ayarlar → kaydırıcı. Mağazaya test
     kancası EKLENMEDİ; ürün koduna yalnız test için kapı açmak, sınanan
     şeyin kullanıcının kullandığı yol olmaktan çıkması demek.
     Ayarlar bir MODAL DEĞİL, kendi paneli. */
  await page.getByTestId('uygulama-menusu').click();
  await page.waitForTimeout(400);
  await page.getByRole('menuitem', { name: /^Ayarlar$/ }).first().click();
  const panel = page.locator('[data-testid="ayarlar-paneli"]');
  await panel.waitFor({ state: 'visible', timeout: 15_000 });

  const kaydirici = panel.locator('[data-testid="arayuz-olcegi"]');
  await kaydirici.fill('1.3');
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const sonra = await olcu(page);

  /* %30 büyüme; ölçüm gürültüsü için gevşek pay. */
  expect(sonra.cubuk / once.cubuk, `çubuk ${once.cubuk} → ${sonra.cubuk}`)
    .toBeGreaterThan(1.2);
  /* KÂĞIT DEĞİŞMEZ — ayarın altındaki söz bu. */
  expect(Math.abs(sonra.kagit - once.kagit), `kâğıt ${once.kagit} → ${sonra.kagit}`)
    .toBeLessThan(2);
});
