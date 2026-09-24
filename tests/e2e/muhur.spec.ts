import { expect, test, type Page } from '@playwright/test';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';

/**
 * MÜHÜR — menü bağı ve web kabuğunun DÜRÜST reddi.
 *
 * Web kabuğunda kanıt katmanı YOK: tarayıcıda kalıcı bir kanıt dosyası
 * tutulamıyor ve zaman damgası sunucularına doğrudan bağlanılamıyor. Bu
 * turun ölçtüğü iki şey: menü öğesi GERÇEKTEN bağlı mı (bu depoda üç kez
 * "yazıldı ama bağlanmadı" hatası yaşandı) ve pencere yokluğu SÖYLÜYOR mu —
 * sessizce boş bir liste göstermek "hiç mühür almamışsın" dedirtirdi.
 *
 * Masaüstündeki gerçek mühür yolu birim ve jsdom testleriyle ölçülüyor;
 * bağımsız doğrulayıcı `tests/kanit-paketi.test.ts`te alt süreçte koşuyor.
 */

const SERVER = 'http://localhost:5180';
const WS = 'ws://localhost:5180';

async function joinEmpty(page: Page, request: any) {
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Bavul', ownerName: 'Sahip' },
  });
  const session = await res.json();
  const seed = createDoc(createProject({ panels: [createPanel()] }));
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
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 20_000 });
}

test('mühür penceresi menüden açılıyor ve web kabuğunda yokluğu söylüyor', async ({ page, request }) => {
  await joinEmpty(page, request);

  await page.getByTestId('uygulama-menusu').click();
  await page.getByText('Mühür ve kanıt…', { exact: true }).click();

  const yok = page.getByTestId('muhur-yok');
  await expect(yok).toBeVisible();
  await expect(yok).toContainText('Masaüstü');
  /* Boş bir liste GÖSTERİLMİYOR: yokluk ile boşluk aynı şey değil. */
  await expect(page.getByTestId('muhur-listesi')).toHaveCount(0);
});
