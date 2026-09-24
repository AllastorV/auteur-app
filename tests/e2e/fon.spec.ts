import { expect, test, type Page } from '@playwright/test';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';

/**
 * FON BAŞVURU DOSYASI — menüden pakete kadar gerçek tur.
 *
 * Birim testleri her parçayı ayrı ayrı ölçüyor; burada ölçülen şey
 * kullanıcının GERÇEKTEN yürüyebildiği yol: menü → kurum seçimi → belge →
 * kontrol listesi → ZIP. Bu depoda üç kez "özellik yazıldı ama menüye
 * bağlanmadı" hatası yaşandı ve web kabuğunda hiç ulaşılamadı.
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

async function menu(page: Page, ad: string) {
  await page.getByTestId('uygulama-menusu').click();
  await page.getByText(ad, { exact: true }).click();
}

test('senaryodan fon dosyası kuruluyor ve paket indiriliyor', async ({ page, request }) => {
  await joinEmpty(page, request);

  /* Kaydedilmemiş iş uyarısı pencereden ÖNCE geliyor (doNew ile aynı
     kural); Playwright `confirm`i varsayılan olarak reddediyor. */
  page.on('dialog', (d) => void d.accept());

  await menu(page, 'Bu senaryodan fon dosyası oluştur…');
  await expect(page.getByTestId('fon-sablon-listesi')).toBeVisible();
  await page.getByTestId('fon-sablon-eurimages-coprod').click();
  await page.getByTestId('fon-olustur').click();

  /* Belge kuruldu: senaryo editörü şablonun ilk bölümünü gösteriyor. */
  await expect(page.getByTestId('senaryo-editor')).toContainText('Synopsis', { timeout: 20_000 });

  await menu(page, 'Fon dosyası kontrol listesi…');
  const liste = page.getByTestId('fon-bolum-listesi');
  await expect(liste).toBeVisible();
  /* Sinopsis elle yazılıyor: kurulumdan BOŞ geliyor ve liste bunu
     söylüyor. Söylemeseydi kullanıcı eksik ekle başvurur ve Eurimages'ta
     başvuru doğrudan elenirdi. */
  await expect(page.getByTestId('fon-bolum-synopsis:en')).toContainText('boş');
  /* Türetilen bölüm DOLU geliyor. */
  await expect(page.getByTestId('fon-bolum-scene-list')).toContainText('dolu');
  /* Auteur'ün üretmediği ekler gizlenmiyor. */
  await expect(page.getByTestId('fon-harici-listesi')).toContainText('Detailed budget');

  const indirme = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByTestId('fon-paket').click();
  const dosya = await indirme;
  expect(dosya.suggestedFilename()).toMatch(/eurimages-coprod\.zip$/);
});
