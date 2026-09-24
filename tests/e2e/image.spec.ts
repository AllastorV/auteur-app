import { expect, test, type Page } from '@playwright/test';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';

const SERVER = 'http://localhost:5180';
const WS = 'ws://localhost:5180';

/** 4x4 kırmızı PNG. */
const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64',
);

async function joinAsEditor(page: Page, request: any) {
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Görsel testi', ownerName: 'Sahip' },
  });
  const session = await res.json();

  const seed = createDoc(createProject({ panels: [createPanel()] }));
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
  await page.getByPlaceholder('Görünecek ad').fill('Editör');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  /* AÇILIŞ ARTIK SENARYO SAYFASINDA (kullanıcı kararı 2026-08-26); bu
     bekleme tuvali istiyor. */
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('mod-board').click();
  await expect(page.getByTestId('canvas-container')).toBeVisible({ timeout: 20_000 });
}

test('görsel içe aktarılıp panele gömülür', async ({ page, request }) => {
  await joinAsEditor(page, request);

  /* Kütüphane artık ÇEKMECE (kalıcı sütun değil): kullanmadan önce
     araç çubuğundaki anahtardan açılır. */
  await page.getByTestId('kutuphane-anahtari').click();
  await page.getByRole('button', { name: 'Objeler', exact: true }).click();
  const importButton = page.getByRole('button', { name: /Görsel ekle/ });
  await expect(importButton).toBeVisible();

  const fileChooserPromise = page.waitForEvent('filechooser');
  await importButton.click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles({ name: 'kare.png', mimeType: 'image/png', buffer: RED_PNG });

    /* Obje sayacının TEK evi tuval alt çubuğu; "· N obje" kalıbı
     denetçiden kaldırıldı (aynı sayı iki yerde okunuyordu). */
  await expect(page.getByTestId('tuval-obje')).toHaveText(/^1 obje$/,{ timeout: 5000 });

  // Obje "image" türünde olmalı ve seçildiğinde katman alanı görünmeli.
  await page.getByTitle('Seç (V)').click();
  await page.keyboard.press('Control+a');
  await expect(page.getByText(/^Obje — kare\.png$/)).toBeVisible();
});
