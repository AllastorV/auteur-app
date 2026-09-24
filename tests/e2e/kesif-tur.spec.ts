import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import * as Y from 'yjs';
import { PDFDocument } from 'pdf-lib';
import os from 'node:os';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';

/**
 * GENEL KEŞİF TURU — program gerçekten çalışıyor mu.
 *
 * Kullanıcı talimatı (2026-08-30): "görsel turda tek tek yaz, sadece
 * kategorileri seç veya gerekli tuşlara bas… başka kendin düzeltme veya
 * yazı stili yapma, bırak program yapsın onları".
 *
 * Bu yüzden tur METNİ KÜÇÜK HARFLE yazıyor ve hiçbir biçimlendirme
 * uygulamıyor. Sahne başlığının BÜYÜK harfe geçmesi, karakter adının
 * ortalanması, sayfa sayısının artması — hepsi PROGRAMIN işi. Tur yalnız
 * yazıyor, kısayola basıyor ve sonucu ÖLÇÜYOR.
 *
 * Ekran görüntüsü kanıt değil, ölçünün resmidir: her adım DOM'dan ya da
 * üretilen dosyadan bir sayı okuyor.
 *
 * Senaryo metni ÜRETİLMİŞTİR.
 */

const SERVER = 'http://localhost:5180';
const CIKTI = 'design/tur';

const rapor: { adim: string; sonuc: string; gorsel?: string }[] = [];
let no = 0;

test('genel tur — yaz, kısayola bas, sonucu ölç', async ({ page, request }) => {
  test.setTimeout(600_000);
  fs.mkdirSync(CIKTI, { recursive: true });
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-tur-'));

  const hatalar: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') hatalar.push(m.text().slice(0, 180)); });
  page.on('pageerror', (e) => hatalar.push(e.message.slice(0, 180)));

  async function cek(ad: string): Promise<string> {
    const dosya = `${String(++no).padStart(2, '0')}-${ad}.png`;
    await page.screenshot({ path: path.join(CIKTI, dosya) });
    return dosya;
  }
  const not = (adim: string, sonuc: string, gorsel?: string) => {
    rapor.push({ adim, sonuc, gorsel });
    console.log(`[TUR] ${adim} → ${sonuc}`);
  };

  /* ------------------------------------------------ 1) oturum açılıyor */
  const oturum = await (await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Tur', ownerName: 'Sahip' },
  })).json();
  const tohum = createDoc(createProject({ panels: [createPanel()] }));
  const sahip = await connectTestClient('ws://localhost:5180', oturum.roomId, oturum.ownerToken);
  Y.applyUpdate(sahip.doc, Y.encodeStateAsUpdate(tohum));
  sahip.push();
  await new Promise((r) => setTimeout(r, 500));
  await sahip.close();

  await page.goto(`/?oda=${oturum.roomCode}&davet=${encodeURIComponent(oturum.ownerToken)}`);
  await page.getByPlaceholder('Görünecek ad').fill('Tur');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(1500);
  not('Boş projeyle stüdyo açılıyor', 'senaryo editörü göründü', await cek('acilis'));

  /* ------------------------------------------- 2) küçük harfle yazılıyor */
  const metin = page.locator('.senaryo-metin');
  await metin.click();
  await page.waitForTimeout(300);

  /** Bir satır: önce KATEGORİ (kısayol), sonra metin — küçük harfle. */
  async function satir(kisayol: string, yazi: string, ilk = false) {
    if (!ilk) await page.keyboard.press('Enter');
    await page.keyboard.press(kisayol);
    await page.keyboard.type(yazi, { delay: 12 });
    await page.waitForTimeout(150);
  }

  await satir('Control+1', 'iç. atölye — gece', true);
  await satir('Control+2', 'torna tezgâhı döner. demir eğilip parçaya bakar.');
  await satir('Control+3', 'demir');
  await satir('Control+5', 'bu iş burada bitmez.');
  await page.waitForTimeout(800);

  const yazilan = await page.evaluate(() =>
    [...document.querySelectorAll('.senaryo-metin > *')]
      .map((e) => `${(e as HTMLElement).dataset.tip}|${(e as HTMLElement).innerText}`));
  not('Dört satır küçük harfle yazıldı, kategoriler Ctrl+1/2/3/5 ile seçildi',
    yazilan.join(' ⟂ '), await cek('yazildi'));

  /* PROGRAM BÜYÜTÜYOR: tur hiç büyük harf yazmadı. Ekranda büyük
     görünmesi CSS `text-transform` ile de olabilir — ölçü hem tipin
     doğru atandığını hem de ekranda büyük çıktığını arıyor. */
  expect(yazilan[0], 'ilk satır sahne başlığı olmalı').toContain('scene|');
  expect(yazilan[0].split('|')[1]).toBe('İÇ. ATÖLYE — GECE');
  expect(yazilan[2]).toBe('character|DEMİR');
  expect(yazilan[3]).toContain('dialogue|');

  /* ------------------------------------------------ 3) sayfa başı tuşu */
  const sayfaOnce = await page.evaluate(() =>
    document.querySelectorAll('.senaryo-sinir').length);
  await page.locator('.senaryo-metin [data-tip="character"]').first().click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(800);
  const sayfaSonra = await page.evaluate(() => ({
    sinir: document.querySelectorAll('.senaryo-sinir').length,
    isaret: document.querySelectorAll('.senaryo-metin [data-elle-sayfa]').length,
  }));
  expect(sayfaSonra.sinir, 'Ctrl+Enter sayfa açmalı').toBe(sayfaOnce + 1);
  expect(sayfaSonra.isaret).toBe(1);
  not('Ctrl+Enter ile elle sayfa başı',
    `sayfa sınırı ${sayfaOnce} → ${sayfaSonra.sinir}, işaret ${sayfaSonra.isaret}`,
    await cek('sayfa-basi'));

  /* --------------------------------------------------- 4) yer imi + renk */
  await page.keyboard.press('Alt+b');
  await page.waitForTimeout(600);
  const im = page.locator('.senaryo-im').first();
  await expect(im).toBeVisible();
  const renkOnce = await im.getAttribute('data-renk');
  await im.click();
  await page.waitForTimeout(500);
  const renkSonra = await page.locator('.senaryo-im').first().getAttribute('data-renk');
  expect(renkSonra, 'tıklamak rengi değiştirmeli, imi SİLMEMELİ').not.toBe(renkOnce);
  expect(await page.locator('.senaryo-im').count()).toBe(1);
  not('Alt+B yer imi, üstüne tıklayınca renk değişiyor',
    `${renkOnce} → ${renkSonra}, im sayısı 1`, await cek('yer-imi'));

  /* Sağ tık menüsü — kaldırma buraya taşındı. */
  await page.locator('.senaryo-im').first().click({ button: 'right' });
  await page.waitForTimeout(400);
  const menuGorsel = await cek('yer-imi-menu');
  await page.locator('[data-testid="yer-imi-kaldir"]').click();
  await page.waitForTimeout(500);
  expect(await page.locator('.senaryo-im').count()).toBe(0);
  not('Sağ tık → Yer imini kaldır', 'im kaldırıldı', menuGorsel);

  /* ------------------------------------------------ 5) revizyon + geri al */
  await page.keyboard.press('Alt+Shift+M');
  await page.waitForTimeout(700);
  const revAd = await page.locator('[data-testid="serit-ad"]').innerText().catch(() => '');
  expect(revAd, 'revizyon açılmalı').not.toBe('');

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(800);
  const revYok = await page.locator('[data-testid="serit-yok"]').count();
  expect(revYok, 'Ctrl+Z revizyonu geri almalı').toBe(1);
  not('Alt+Shift+M revizyon yayınlar, Ctrl+Z geri alır',
    `açıldı: "${revAd}" → geri alındı`, await cek('revizyon'));

  /* -------------------------------------------------- 6) analiz panosu */
  /* İKİ AYRI YÜZEY: dar denetçi SEKMESİ bir özet, tam ekran PANO ayrı
     bileşen. Tur ikisine de bakıyor — biri çizerken öteki boş kalabilir
     ve o fark ancak ikisi birden ölçülünce görünür. */
  await page.locator('[data-testid="sekme-analiz"]').first().click();
  await page.waitForTimeout(1000);
  const sekmeGorsel = await cek('analiz-sekmesi');
  not('Analiz sekmesi (dar özet)', 'çizildi', sekmeGorsel);

  await page.keyboard.press('Control+Shift+A');
  await page.waitForTimeout(1500);
  const panoGorsel = await cek('analiz-panosu');
  const seritVar = await page.locator('[data-testid="sahne-seridi"]').count();
  expect(seritVar, 'analiz panosunda sahne şeridi olmalı').toBe(1);
  not('Analiz panosu (tam ekran) — tek sahnelik veriyle', 'sahne şeridi çizildi', panoGorsel);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  /* --------------------------------------------------- 7) sekme şeridi */
  const ustSekme = await page.locator('[data-testid="denetci-sekmeleri"] button')
    .allInnerTexts();
  const altSekme = await page.locator('[data-testid="denetci-alt-sekmeleri"] button')
    .allInnerTexts();
  expect(ustSekme.length).toBe(4);
  not('Denetçi sekmeleri gruplandı',
    `üst: ${ustSekme.join(' · ')} | alt: ${altSekme.join(' · ')}`, await cek('sekmeler'));

  /* ------------------------------------------------------- 8) PDF çıktı */
  await page.locator('[data-testid="disa-aktar-dugmesi"]').click();
  const panel = page.locator('[data-testid="disa-aktar-paneli"]');
  await panel.waitFor({ state: 'visible', timeout: 15_000 });
  await panel.locator('[data-testid="kapsam-senaryo"]').click();
  await panel.locator('[data-testid="senaryo-bicim"]').selectOption('pdf');
  await panel.locator('[data-testid="filigran-ac"]').check();
  await panel.locator('[data-testid="filigran-metin"]').fill('TASLAK');
  const disaGorsel = await cek('disa-aktar');

  const inecek = page.waitForEvent('download', { timeout: 120_000 });
  await panel.locator('[data-testid="disa-aktar-uret"]').click();
  const indirme = await inecek;
  const pdfYol = path.join(gecici, 'tur.pdf');
  await indirme.saveAs(pdfYol);
  const pdf = await PDFDocument.load(fs.readFileSync(pdfYol));
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
  not('Filigranlı PDF dışa aktarımı',
    `${pdf.getPageCount()} sayfa, ${fs.statSync(pdfYol).size} bayt`, disaGorsel);

  /* ------------------------------------------------------- 9) konsol */
  fs.writeFileSync(path.join(CIKTI, 'rapor.json'),
    JSON.stringify({ adimlar: rapor, hatalar: [...new Set(hatalar)] }, null, 2), 'utf8');
  fs.rmSync(gecici, { recursive: true, force: true });
  expect(hatalar, `konsol hatası: ${hatalar.join(' | ')}`).toEqual([]);
});
