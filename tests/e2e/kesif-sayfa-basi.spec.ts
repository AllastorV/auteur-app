import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import * as Y from 'yjs';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';
import { setScript } from '../../packages/core/src/doc/mutations';
import type { ScriptBlock } from '../../packages/core/src/model/script';

/**
 * KEŞİF — ELLE SAYFA BAŞI (Ctrl+Enter).
 *
 * Kullanıcı isteği (2026-08-30): "kullanıcı worddeki gibi sayfa sonu
 * tuşuna basıp diyince sonrasına oto boş bir sayfa eklesin".
 *
 * Birim testleri bayrağın SAYFALAYICIYA ulaştığını kanıtlıyor. Buradaki
 * soru başka: gerçek tuş gerçek editörde çalışıyor mu, kâğıt gerçekten
 * uzuyor mu, işaret gerçekten görünüyor mu. Bu oturumda bulunan altı
 * hatanın beşi ancak programı açınca göründü.
 *
 * Senaryo metni ÜRETİLMİŞTİR.
 */

const SERVER = 'http://localhost:5180';
const CIKTI = 'design/kesif';

let sayac = 0;
const b = (type: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `f${sayac}`, type, text, scene: '', sceneId: 'sc1' });

/** Tek sayfaya rahat sığan kısa senaryo — sayfa sayısı yalnız tuşla artmalı. */
const BLOKLAR: ScriptBlock[] = [
  b('scene', 'İÇ. ATÖLYE — GECE'),
  b('action', 'Torna tezgâhı döner.'),
  b('action', 'Demir eğilip parçaya bakar.'),
  b('character', 'DEMİR'),
  b('dialogue', 'Bu iş burada bitmez.'),
];

/** Sayfa sınırı sayısı + kâğıt yüksekliği + görünen işaret sayısı. */
async function olcu(page: any) {
  return page.evaluate(() => ({
    sinir: document.querySelectorAll('.senaryo-sinir').length,
    kagit: (document.querySelector('.senaryo-kagit') as HTMLElement).getBoundingClientRect().height,
    isaret: document.querySelectorAll('.senaryo-metin [data-elle-sayfa]').length,
  }));
}

test('Ctrl+Enter sayfa başı koyuyor ve kâğıt bir sayfa uzuyor', async ({ page, request }) => {
  test.setTimeout(300_000);
  fs.mkdirSync(CIKTI, { recursive: true });

  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'SayfaBasi', ownerName: 'Sahip' },
  });
  const oturum = await res.json();
  const tohum = createDoc(createProject({ panels: [createPanel()] }));
  setScript(tohum, { name: 'SayfaBasi', blocks: BLOKLAR });
  const sahip = await connectTestClient('ws://localhost:5180', oturum.roomId, oturum.ownerToken);
  Y.applyUpdate(sahip.doc, Y.encodeStateAsUpdate(tohum));
  sahip.push();
  await new Promise((r) => setTimeout(r, 500));
  await sahip.close();

  const hatalar: string[] = [];
  page.on('console', (m: any) => { if (m.type() === 'error') hatalar.push(m.text()); });

  await page.goto(`/?oda=${oturum.roomCode}&davet=${encodeURIComponent(oturum.ownerToken)}`);
  await page.getByPlaceholder('Görünecek ad').fill('Sayfa');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(1500);

  const once = await olcu(page);
  expect(once.sinir, 'kısa senaryo tek sayfa olmalı').toBe(0);
  expect(once.isaret).toBe(0);

  /* İMLEÇ KARAKTER SATIRINA OK TUŞLARIYLA götürülüyor, TIKLAYARAK DEĞİL.
     Ölçüldü: tıklama bazen ProseMirror seçimini hiç taşımıyor (imleç 1'de,
     yani ilk blokta kalıyor) ve test rastgele düşüyordu — üç koşudan
     ikisi. Tuşla gezinme belgenin kendi olayı, yarış yok. */
  await page.locator('.senaryo-metin').click({ position: { x: 40, y: 10 } });
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(800);

  const sonra = await olcu(page);
  /* SENARYO KÂĞIDINA KAYDIR. Yüzeyde önce KAPAK sayfası var; ilk
     çekimlerde "kâğıt bomboş" sandığım şey kapağın alt yarısıydı. */
  await page.evaluate(() => {
    document.querySelector('.senaryo-kagit')?.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(400);

  await page.screenshot({ path: path.join(CIKTI, 'sayfa-basi.png') });

  expect(sonra.isaret, 'kesikli işaret görünmeli').toBe(1);
  expect(sonra.sinir, 'sayfa sınırı belirmeli').toBe(1);
  expect(sonra.kagit, 'kâğıt bir sayfa uzamalı').toBeGreaterThan(once.kagit + 100);

  /* İKİNCİ BASIŞ GERİ ALIR — işaret bir anahtardır, tek yönlü değil. */
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(800);
  const geri = await olcu(page);
  expect(geri.isaret).toBe(0);
  expect(geri.sinir).toBe(0);
  expect(Math.abs(geri.kagit - once.kagit)).toBeLessThan(2);

  expect(hatalar, `konsol hatası: ${hatalar.join(' | ')}`).toEqual([]);
});
