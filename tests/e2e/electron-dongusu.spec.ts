import { test, expect, _electron as electron } from '@playwright/test';
import { masaustuDerlemesiniDenetle } from '../helpers/masaustuDerleme';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * TANI — masaüstü kabuğunda "Maximum update depth exceeded".
 *
 * Kitaplık, Ayarlar ve Yardım YALNIZ masaüstü kabuğunda var (web kabuğu
 * oturuma katılma ekranı). Uyarı da orada görülmüştü; bu yüzden tanı
 * Electron'u doğrudan açıyor.
 */
test('masaüstü — akışlar arka arkaya, render döngüsü var mı', async () => {
  masaustuDerlemesiniDenetle();
  const kok = path.join(__dirname, '..', '..', 'apps', 'desktop');
  /* AYRI PROFİL ŞART — `main.ts` TEK ÖRNEK KİLİDİ kullanıyor
     (`requestSingleInstanceLock`). Kullanıcının kendi Auteur'ü açıkken bu
     test kendi örneğini başlatamıyor: ikinci örnek hemen `app.quit()`
     diyor ve `firstWindow()` zaman aşımına kadar bekliyor. Ölçüldü
     2026-08-31 — iki masaüstü testi de bu yüzden kırmızıydı ve sebebi
     üründe DEĞİLDİ.
     Aynı tuzak `kesif-animatik`te bir kez daha ısırmıştı: orada test
     kullanıcının kaydetme penceresini ele geçirmişti. Kural artık şu —
     masaüstü açan HER test kendi profilinde açar. */
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-dongu-'));
  const app = await electron.launch({
    args: [kok, `--user-data-dir=${profil}`],
    cwd: kok,
  });
  const sayfa = await app.firstWindow();

  const hatalar: string[] = [];
  sayfa.on('console', (m) => {
    const metin = m.text();
    if (/Maximum update depth|Too many re-renders/i.test(metin)) {
      hatalar.push(metin);
      console.log('\n=== YAKALANDI (console) ===\n' + metin + '\n');
    }
  });
  sayfa.on('pageerror', (e) => {
    if (/Maximum update depth|Too many re-renders/i.test(e.message)) {
      hatalar.push(e.message);
      console.log('\n=== YAKALANDI (pageerror) ===\n' + e.message + '\n' + (e.stack ?? '') + '\n');
    }
  });

  await sayfa.waitForLoadState('domcontentloaded');
  await sayfa.waitForTimeout(2500);

  /* 1) Yeni proje */
  const yeni = sayfa.getByTestId('kitaplik-yeni');
  const bos = sayfa.getByTestId('bos-yeni');
  await ((await yeni.count()) ? yeni : bos).first().click();
  await sayfa.getByTestId('yeni-proje-ad').fill('Döngü Tanısı');
  await sayfa.getByTestId('yeni-proje-olustur').click();
  await expect(sayfa.getByTestId('senaryo-editor')).toBeVisible({ timeout: 30_000 });

  /* 2) Yazma */
  await sayfa.getByTestId('senaryo-editor').click();
  await sayfa.keyboard.type('İÇ - MUTFAK - GECE\n');
  await sayfa.keyboard.type('Ali masaya oturur.\n');
  await sayfa.waitForTimeout(400);

  /* 3) Sekmeler arasında gidip gel */
  for (let tur = 0; tur < 3; tur++) {
    for (const mod of ['mod-board', 'mod-grid', 'mod-galeri', 'mod-senaryo']) {
      const d = sayfa.getByTestId(mod);
      if (await d.count()) { await d.click(); await sayfa.waitForTimeout(300); }
    }
  }

  /* 4) Ayarlar ve Yardım panelleri */
  for (const ad of [/^Ayarlar$/, /^Yardım$/]) {
    const menu = sayfa.getByTestId('uygulama-menusu');
    if (!(await menu.count())) break;
    await menu.click();
    await sayfa.waitForTimeout(250);
    const madde = sayfa.getByRole('button', { name: ad });
    if (await madde.count()) {
      await madde.first().click();
      await sayfa.waitForTimeout(900);
      await sayfa.keyboard.press('Escape');
      await sayfa.waitForTimeout(600);
    } else {
      await sayfa.keyboard.press('Escape');
    }
  }

  /* 5) Pencere yeniden boyutlama — ResizeObserver döngüleri */
  for (const [w, h] of [[900, 700], [1400, 900], [760, 1000], [1280, 800]]) {
    await sayfa.setViewportSize({ width: w, height: h });
    await sayfa.waitForTimeout(400);
  }

  /* 6) STRES: bekleme yok. Uyarı bir kez görülmüştü — döngü kararlı
     durumda değil, GEÇİŞTE kuruluyor. Hızlı geçiş onu açığa çıkarır. */
  for (let tur = 0; tur < 12; tur++) {
    for (const mod of ['mod-board', 'mod-grid', 'mod-senaryo', 'mod-galeri']) {
      const d = sayfa.getByTestId(mod);
      if (await d.count()) await d.click({ timeout: 5000 }).catch(() => {});
    }
    await sayfa.setViewportSize({ width: 800 + (tur % 5) * 140, height: 700 + (tur % 3) * 120 });
  }
  await sayfa.waitForTimeout(800);

  /* 7) STRES: panel aç/kapa peş peşe */
  for (let tur = 0; tur < 6; tur++) {
    const menu = sayfa.getByTestId('uygulama-menusu');
    if (!(await menu.count())) break;
    await menu.click().catch(() => {});
    const madde = sayfa.getByRole('button', { name: tur % 2 ? /^Ayarlar$/ : /^Yardım$/ });
    if (await madde.count()) await madde.first().click().catch(() => {});
    await sayfa.waitForTimeout(150);
    await sayfa.keyboard.press('Escape');
  }

  await sayfa.waitForTimeout(1500);
  /* KAPANIŞ SÜRELİ, sonra ZORLA. Düz `app.close()` asılıyor: gövdenin
     tamamı yeşilken test KENDİ KAPANIŞI yüzünden zaman aşımına düşüyor ve
     gerçek sonucu gizliyor (ölçüldü 2026-08-31; aynı tuzak bir gün önce
     `kesif-animatik`te de ısırmıştı). `kill` yalnız kapanış asıldıysa:
     `close()` başarılı olduğunda `app.process()`in içi boşalıyor ve
     koşulsuz çağrı `TypeError` atıyor. */
  let kapandi = false;
  await Promise.race([
    app.close().then(() => { kapandi = true; }),
    new Promise((r) => setTimeout(r, 15_000)),
  ]).catch(() => {});
  if (!kapandi) {
    try { app.process().kill(); } catch { /* süreç zaten gitti */ }
  }
  expect(hatalar, `render döngüsü: ${hatalar.length} kayıt`).toEqual([]);
});
