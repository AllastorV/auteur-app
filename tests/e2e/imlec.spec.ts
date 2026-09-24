import { expect, test, type Browser, type Page } from '@playwright/test';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';
import { USER_COLORS } from '../../packages/core/src/util/color';

/**
 * ORTAK ÇALIŞMA GÖRSEL KATMANI — gerçek tarayıcıda, iki istemciyle.
 *
 * Birim testler kuralı doğruluyor; buradaki soru başka: renk, ad etiketi ve
 * kenar şeridi GERÇEKTEN çiziliyor mu. jsdom düzen hesaplamıyor, CSS
 * uygulamıyor ve WebSocket taşımıyor — bu üçü de bu katmanın işi. İki ayrı
 * tarayıcı bağlamı açılıyor çünkü tek sayfada iki imleç zaten hiç görünmez:
 * herkes kendi imlecini gizliyor.
 */

const SERVER = 'http://localhost:5180';
const WS = 'ws://localhost:5180';

async function oturumKur(request: any) {
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'İmleç E2E', ownerName: 'Sahip' },
  });
  expect(res.ok()).toBeTruthy();
  const session = await res.json();

  const project = createProject({ panels: [createPanel()] });
  const tohum = createDoc(project);
  const sahip = await connectTestClient(WS, session.roomId, session.ownerToken);
  Y.applyUpdate(sahip.doc, Y.encodeStateAsUpdate(tohum));
  sahip.push();
  await new Promise((r) => setTimeout(r, 300));
  await sahip.close();
  return session;
}

async function davetAl(request: any, session: any): Promise<string> {
  const res = await request.post(`${SERVER}/api/sessions/${session.roomId}/invites`, {
    headers: { authorization: `Bearer ${session.ownerToken}` },
    data: { role: 'editor' },
  });
  return (await res.json()).token as string;
}

async function katil(browser: Browser, session: any, davet: string, ad: string): Promise<Page> {
  const baglam = await browser.newContext();
  const sayfa = await baglam.newPage();
  await sayfa.goto(
    `http://localhost:5174/?oda=${session.roomCode}&davet=${encodeURIComponent(davet)}`,
  );
  await sayfa.getByPlaceholder('Görünecek ad').fill(ad);
  await sayfa.getByRole('button', { name: 'Oturuma katıl' }).click();
  await expect(sayfa.getByTestId('senaryo-editor')).toBeVisible({ timeout: 30_000 });
  return sayfa;
}

/** CSS'in verdiği `rgb(r, g, b)` dizgesini onaltılığa çevirir. */
function rgbToHex(deger: string): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(deger);
  if (!m) throw new Error(`rgb bekleniyordu: ${deger}`);
  return '#' + [1, 2, 3]
    .map((i) => Number(m[i]).toString(16).padStart(2, '0'))
    .join('');
}

test('iki istemci birbirinin imlecini, adını ve düzenleme şeridini görüyor', async ({
  browser,
  request,
}) => {
  const session = await oturumKur(request);
  const [davetA, davetB] = await Promise.all([
    davetAl(request, session),
    davetAl(request, session),
  ]);

  const ayse = await katil(browser, session, davetA, 'Ayşe');
  const bora = await katil(browser, session, davetB, 'Bora');

  // Ayşe yazıyor.
  await ayse.getByTestId('senaryo-metin').click();
  await ayse.keyboard.type('İÇ - MUTFAK - GECE');

  // Bora, Ayşe'nin imlecini ADIYLA görüyor.
  const ayseninImleci = bora.locator('.mzn-imlec-ad', { hasText: 'Ayşe' });
  await expect(ayseninImleci).toBeVisible({ timeout: 20_000 });

  // Renk paletten ve okunur: etiket zemini sekiz yazar renginden biri.
  const zemin = await ayseninImleci.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(USER_COLORS).toContain(rgbToHex(zemin));

  /* İMLEÇ AKIŞA GENİŞLİK EKLEMİYOR: kök öğe sıfır genişlikte olmalı, yoksa
     satır sonları kayar ve sayfa sayısı yalan söyler (§6.2). */
  const genislik = await bora.locator('.mzn-imlec').first()
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(genislik).toBeLessThan(1);

  // Düzenleme şeridi Bora'nın kağıdında beliriyor…
  await expect(bora.locator('.mzn-serit')).toHaveCount(1, { timeout: 20_000 });
  // …ve dört saniye sonra sönüp düşüyor.
  await expect(bora.locator('.mzn-serit')).toHaveCount(0, { timeout: 15_000 });

  // Karşı yön: Bora yazınca Ayşe onun imlecini görüyor — iki istemci, iki imleç.
  await bora.getByTestId('senaryo-metin').click();
  await bora.keyboard.type('Ayşe pencereyi açar.');
  await expect(ayse.locator('.mzn-imlec-ad', { hasText: 'Bora' }))
    .toBeVisible({ timeout: 20_000 });

  // Kimse kendi imlecini görmüyor: Ayşe'nin sayfasında yalnız Bora'nınki var.
  await expect(ayse.locator('.mzn-imlec-ad')).toHaveCount(1);

  await ayse.context().close();
  await bora.context().close();
});
