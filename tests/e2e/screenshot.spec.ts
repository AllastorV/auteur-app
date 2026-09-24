import { test, expect, type Page } from '@playwright/test';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';

const SERVER = 'http://localhost:5180';
const WS = 'ws://localhost:5180';

test('stüdyo görünümü', async ({ page, request }) => {
  await page.setViewportSize({ width: 1680, height: 1000 });
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Kısa Film — Bölüm 1', ownerName: 'Sahip' },
  });
  const session = await res.json();

  const panels = [createPanel(), createPanel(), createPanel()];
  panels[0].meta = { ...panels[0].meta, scene: '1', shot: '1', duration: 3.5, action: 'Kamera koridorda ilerler.', dialogue: 'Kimse yok mu?', cameraLabel: 'MS — Orta Plan' };
  panels[1].meta = { ...panels[1].meta, scene: '1', shot: '2', duration: 2 };
  panels[2].meta = { ...panels[2].meta, scene: '1', shot: '3', duration: 4 };
  panels[0].transition = 'dissolve';
  const project = createProject({ panels });
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
  await page.getByPlaceholder('Görünecek ad').fill('Yönetmen');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  /* AÇILIŞ ARTIK SENARYO SAYFASINDA (kullanıcı kararı 2026-08-26). Bu
     dosyanın testleri tuvalle ilgileniyor, o yüzden panoya geçiliyor. */
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('mod-board').click();
  await expect(page.getByTestId('canvas-container')).toBeVisible({ timeout: 20_000 });

  // Kütüphaneden birkaç öğe yerleştir
  /* Kütüphane artık ÇEKMECE (kalıcı sütun değil): kullanmadan önce
     araç çubuğundaki anahtardan açılır. */
  await page.getByTestId('kutuphane-anahtari').click();
  /* POZ SÜRÜKLEME KALDIRILDI: silüet sistemi 2026-08-29'da kaldırıldı ve
     "Pozlar" sekmesi artık yok. Test o sekmeye tıklamaya çalışıyor ve
     Playwright var olmayan düğmeyi TEST ZAMAN AŞIMINA kadar beklediği için
     ekran görüntüsü hiç üretilemiyordu — bayat tek bir satır bütün testi
     düşürüyordu. Görüntünün dolu görünmesi objelerle sağlanıyor. */
  await page.getByRole('button', { name: 'Objeler', exact: true }).click();
  await page.getByPlaceholder('Kütüphanede ara…').fill('masa');
  await page.locator('[title="Masa"]').first().dragTo(page.getByTestId('canvas-container'), {
    targetPosition: { x: 380, y: 430 },
  });
  await page.getByRole('button', { name: 'Kamera Açıları' }).click();
  await page.getByPlaceholder('Kütüphanede ara…').fill('two');
  await page.locator('[title*="İki karakter"]').first().dragTo(page.getByTestId('canvas-container'));

  // Üç kütüphane öğesi de (poz, poz, obje) + kamera overlay'i eklenmiş olmalı.
  /* Sayaç artık tuval alt çubuğunda (obje sayısının TEK evi). İddia
     GÖRÜNÜRLÜK değil SAYI olmalı: görünür ama sıfır kalan bir sayaç,
     objenin eklenmediğini gizlerdi. */
  await expect(page.getByTestId('tuval-obje')).toHaveText(/^[4-9]\d* obje$/, { timeout: 10_000 });
  await expect(page.getByPlaceholder('Preset seçilince dolar')).toHaveValue(/2S/);

  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/studio.png', fullPage: false });

  // Obje + kamera overlay eklenmiş olmalı. (3D bölümü kaldırıldı: figür ve
  // 3D obje sistemi 2026-08-29'da çıkarıldı.)
  /* Sayaç PANODAYKEN okunuyor: obje sayısının tek evi tuvalin alt çubuğu
     ve grid modunda tuval yok. Önceden denetçi altındaki "· N obje"
     satırına bakılıyordu; o satır kaldırıldı çünkü aynı sayı ekranda iki
     kez okunuyordu. */
  await expect(page.getByTestId('tuval-obje')).toHaveText(/^[4-9]\d* obje$/);

  await page.getByTestId('mod-grid').click();
  await expect(page.getByText('Sayfa 1', { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="panel-thumbnail"]')).toHaveCount(3);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/grid.png', fullPage: false });
});
