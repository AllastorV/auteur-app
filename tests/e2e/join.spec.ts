import { expect, test } from '@playwright/test';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';

const SERVER = 'http://localhost:5180';
const WS = 'ws://localhost:5180';

async function createSession(request: any) {
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'E2E Projesi', ownerName: 'Sahip' },
  });
  expect(res.ok()).toBeTruthy();
  const session = await res.json();

  // Gerçek akışta masaüstü sahip istemcisi projeyi odaya taşır; testte
  // aynı işi bir Node istemcisi yapar.
  const project = createProject({ panels: [createPanel(), createPanel()] });
  const seed = createDoc(project);
  const owner = await connectTestClient(WS, session.roomId, session.ownerToken);
  Y.applyUpdate(owner.doc, Y.encodeStateAsUpdate(seed));
  owner.push();
  await new Promise((r) => setTimeout(r, 300));
  await owner.close();

  return session;
}

test('davet linkiyle web istemcisinden oturuma katılma', async ({ page, request }) => {
  const session = await createSession(request);
  const inviteRes = await request.post(`${SERVER}/api/sessions/${session.roomId}/invites`, {
    headers: { authorization: `Bearer ${session.ownerToken}` },
    data: { role: 'editor' },
  });
  const invite = await inviteRes.json();

  await page.goto(`/?oda=${session.roomCode}&davet=${encodeURIComponent(invite.token)}`);
  await expect(page.getByText('Auteur')).toBeVisible();

  await page.getByPlaceholder('Görünecek ad').fill('E2E Kullanıcısı');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();

  // Stüdyo yüklenmeli: araç çubuğu ve canvas görünür olmalı.
  /* AÇILIŞ ARTIK SENARYO SAYFASINDA (kullanıcı kararı 2026-08-26). */
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('mod-board').click();
  await expect(page.getByTestId('canvas-container')).toBeVisible({ timeout: 20_000 });
  /* Kütüphane artık ÇEKMECE (kalıcı sütun değil): kullanmadan önce
     araç çubuğundaki anahtardan açılır. */
  await page.getByTestId('kutuphane-anahtari').click();
  /* "Karakterler" ARTIK YOK: kütüphane sekmeleri Kamera Açıları / Objeler
     / Şablonlar. İddia eski bir kategori adına bakıyordu ve o kategori
     kaldırıldığında güncellenmedi. Amaç aynı: editör rolündeki kullanıcı
     kütüphane içeriğini görebilmeli. */
  await expect(page.getByRole('button', { name: 'Kamera Açıları' })).toBeVisible();
  await expect(page.getByText('Editör')).toBeVisible();
});

test('yorumcu rolünde çizim araçları kilitli', async ({ page, request }) => {
  const session = await createSession(request);
  const inviteRes = await request.post(`${SERVER}/api/sessions/${session.roomId}/invites`, {
    headers: { authorization: `Bearer ${session.ownerToken}` },
    data: { role: 'commenter' },
  });
  const invite = await inviteRes.json();

  await page.goto(`/?oda=${session.roomCode}&davet=${encodeURIComponent(invite.token)}`);
  await page.getByPlaceholder('Görünecek ad').fill('Yorumcu');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();

  /* AÇILIŞ ARTIK SENARYO SAYFASINDA (kullanıcı kararı 2026-08-26). */
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('mod-board').click();
  await expect(page.getByTestId('canvas-container')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Yorumcu').first()).toBeVisible();
  // Yorumcu dışa aktaramaz.
  await expect(page.getByRole('button', { name: 'Dışa aktar' })).toBeDisabled();
  // Çizim aracı açık kalır ama aktif katman işaretleme katmanına alınır.
  await expect(page.getByTitle('Kalem (B)')).toBeEnabled();
  /* Katmanlar artık panonun KATMAN sekmesinde: üç bölüm alt alta
     durduğunda sütun ekranı taşıyordu. */
  await page.getByTestId('pano-sekme-katman').click();
  await expect(page.getByTestId('active-layer-name')).toHaveValue('İşaretleme');
});
