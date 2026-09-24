import { test, _electron as electron } from '@playwright/test';
import { masaustuDerlemesiniDenetle } from '../helpers/masaustuDerleme';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * TANI — İngilizce arayüzde ekranda ne yazıyor.
 *
 * Statik tarayıcı ASCII-Türkçeyi ("Senaryo", "Aksiyon", "Ekle") göremiyor:
 * Türkçe'ye özgü harf yok ve dizgi henüz sözlükte değil. Bu koşu her
 * paneli açıp GÖRÜNEN metni döküyor — kullanıcının gördüğü şey ne ise o.
 */
test('EN arayüz metin dökümü', async () => {
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
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-endokum-'));
  const app = await electron.launch({
    args: [kok, `--user-data-dir=${profil}`],
    cwd: kok,
  });
  const s = await app.firstWindow();
  await s.waitForLoadState('domcontentloaded');
  await s.waitForTimeout(2500);

  const parca: string[] = [];
  const dok = async (ad: string) => {
    const metin = await s.evaluate(() => document.body.innerText);
    parca.push('\n########## ' + ad + ' ##########\n' + metin);
  };

  await dok('KITAPLIK');

  const yeni = s.getByTestId('kitaplik-yeni');
  const bos = s.getByTestId('bos-yeni');
  await ((await yeni.count()) ? yeni : bos).first().click();
  await s.waitForTimeout(500);
  await dok('YENI PROJE');
  await s.getByTestId('yeni-proje-ad').fill('EN dokum');
  await s.getByTestId('yeni-proje-olustur').click();
  await s.getByTestId('senaryo-editor').waitFor({ timeout: 30_000 });
  await s.waitForTimeout(1200);
  await dok('SENARYO');

  /* Denetçi sekmeleri */
  for (const id of ['yazim', 'imler', 'analiz', 'yapi', 'kadro', 'dokum', 'dunya', 'cop', 'sahne']) {
    const d = s.getByTestId(`sekme-${id}`);
    if (await d.count()) {
      await d.click();
      await s.waitForTimeout(500);
      await dok('SEKME ' + id);
    }
  }

  /* Mod sekmeleri */
  for (const m of ['mod-grid', 'mod-board', 'mod-galeri', 'mod-senaryo']) {
    const d = s.getByTestId(m);
    if (await d.count()) {
      await d.click();
      await s.waitForTimeout(600);
      await dok(m.toUpperCase());
    }
  }

  /* Menüden açılan pencereler */
  const menuMaddeleri = ['Settings', 'Help', 'Keyboard Shortcuts', 'Keyboard shortcuts',
    'Collaboration session', 'Export', 'Title page', 'Version history', 'Restore points'];
  for (const ad of menuMaddeleri) {
    const menu = s.getByTestId('uygulama-menusu');
    if (!(await menu.count())) break;
    await menu.click().catch(() => {});
    await s.waitForTimeout(250);
    const madde = s.getByRole('button', { name: new RegExp('^' + ad + '$', 'i') });
    if (await madde.count()) {
      await madde.first().click().catch(() => {});
      await s.waitForTimeout(900);
      await dok('PENCERE ' + ad);
      await s.keyboard.press('Escape');
      await s.waitForTimeout(400);
    } else {
      await s.keyboard.press('Escape');
    }
  }

  fs.writeFileSync(path.join(process.cwd(), 'en-dokum.txt'), parca.join('\n'), 'utf8');
  console.log('döküm yazıldı:', parca.length, 'ekran');
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
});
