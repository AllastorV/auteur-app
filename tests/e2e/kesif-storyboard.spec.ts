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
 * KEŞİF TURU — KARTLAR, STORYBOARD, GALERİ, SUNUM.
 *
 * Modlar "açılıyor mu" diye bir kez gezilmişti; bu tur İÇLERİNDE İŞ
 * YAPIYOR: panel ekliyor, tuvale çiziyor, kart taşıyor, sunumda
 * ilerliyor. Açılan ama hiçbir şey yapılamayan bir ekran da "açıldı"
 * raporu üretir.
 *
 * İçerik ÜRETİLMİŞTİR.
 */

const SERVER = 'http://localhost:5180';
const CIKTI = 'design/kesif';

let sayac = 0;
const b = (type: ScriptBlock['type'], text: string, sceneId: string): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `f${sayac}`, type, text, scene: '', sceneId });

const BLOKLAR: ScriptBlock[] = [
  b('scene', 'İÇ. ATÖLYE — GECE', 'sc1'),
  b('action', 'Torna tezgâhı döner.', 'sc1'),
  b('character', 'DEMİR', 'sc1'),
  b('dialogue', 'Bu iş burada bitmez.', 'sc1'),
  b('scene', 'DIŞ. İSKELE — SABAH', 'sc2'),
  b('action', 'Martılar. Uzakta bir tekne.', 'sc2'),
  b('scene', 'İÇ. KAHVE — GÜNDÜZ', 'sc3'),
  b('action', 'Hakkı kapıda durur.', 'sc3'),
];

const rapor: string[] = [];
const hatalar: string[] = [];
let adimNo = 0;
const not = (s: string) => { rapor.push(s); console.log(s); };

test('kartlar ve storyboard turu', async ({ page, request }) => {
  test.setTimeout(600_000);
  fs.mkdirSync(CIKTI, { recursive: true });

  page.on('console', (m) => {
    if (m.type() === 'error') hatalar.push(`KONSOL: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => hatalar.push(`SAYFA: ${e.message.slice(0, 200)}`));

  async function dene(ad: string, is: () => Promise<string | void>) {
    adimNo++;
    const once = hatalar.length;
    try {
      const s = await is();
      const yeni = hatalar.length - once;
      not(`- [${String(adimNo).padStart(2, '0')}] ✅ ${ad}${s ? ` — ${s}` : ''}${yeni ? ` ⚠ ${yeni} konsol hatası` : ''}`);
    } catch (e) {
      not(`- [${String(adimNo).padStart(2, '0')}] ❌ ${ad} — ${(e as Error).message.split('\n')[0].slice(0, 200)}`);
    }
  }

  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Storyboard Turu', ownerName: 'Sahip' },
  });
  const oturum = await res.json();
  const tohum = createDoc(createProject({ panels: [createPanel(), createPanel(), createPanel()] }));
  setScript(tohum, { name: 'Storyboard', blocks: BLOKLAR });
  const sahip = await connectTestClient('ws://localhost:5180', oturum.roomId, oturum.ownerToken);
  Y.applyUpdate(sahip.doc, Y.encodeStateAsUpdate(tohum));
  sahip.push();
  await new Promise((r) => setTimeout(r, 600));
  await sahip.close();

  await page.goto(`/?oda=${oturum.roomCode}&davet=${encodeURIComponent(oturum.ownerToken)}`);
  await page.getByPlaceholder('Görünecek ad').fill('Storyboard');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 25_000 });

  /* Mod KİMLİKLERİ ekrandaki adlarla aynı DEĞİL: Kartlar = grid,
     Storyboard = board (Toolbar MODLAR). Adı kimlik sanan ilk sürümüm
     var olmayan bir testid'yi tıklamaya çalışıp 10 dakika bekledi. */
  const moda = async (id: 'senaryo' | 'grid' | 'board') => {
    await page.locator(`[data-testid="mod-${id}"]`).click({ timeout: 15_000 });
    await page.waitForTimeout(1200);
  };

  /* ------------------------------------------------------------- kartlar */
  await dene('Kartlar — sahneler kart olarak çiziliyor', async () => {
    await moda('grid');
    await page.screenshot({ path: path.join(CIKTI, 'kartlar.png') });
    const metin = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    if (!metin.includes('ATÖLYE')) throw new Error('sahne kartı görünmüyor');
    if (!metin.includes('İSKELE')) throw new Error('ikinci sahne yok');
    return 'üç sahne kartta';
  });

  /* ---------------------------------------------------------- storyboard */
  await dene('Storyboard — tuval açılıyor', async () => {
    await moda('board');
    const tuval = page.locator('[data-testid="canvas-container"]');
    await tuval.waitFor({ state: 'visible', timeout: 15_000 });
    await page.screenshot({ path: path.join(CIKTI, 'storyboard.png') });
    return 'tuval çizildi';
  });

  await dene('Storyboard — tuvale çizim yapılıyor', async () => {
    const tuval = page.locator('[data-testid="canvas-container"]');
    const kutu = await tuval.boundingBox();
    if (!kutu) throw new Error('tuval ölçülemedi');
    /* Nesne sayısı TUVALİN KENDİ SAYACINDAN okunuyor ("0 obje").
       `tuval-obje` dekorasyonunu saymak yanıltıcıydı: çizimden önce de
       sonra da 1 dönüyordu ve çalışan çizimi "çizmiyor" gösteriyordu. */
    const objeSayisi = async () => {
      const m = (await page.locator('body').innerText()).match(/(\d+) obje/);
      return m ? Number(m[1]) : -1;
    };
    const onceObje = await objeSayisi();
    /* ARAÇ SEÇMEK ŞART: varsayılan araç SEÇİM OKU ve onunla sürüklemek
       nesne üretmez, seçim kutusu çizer. İlk sürümüm bunu bilmiyordu ve
       çalışan bir tuvali "çizmiyor" diye raporladı. Dikdörtgen aracı
       araç çubuğundaki beşinci düğme. */
    /* Araç başlığı "Dikdörtgen (R)" — kısayol da parantez içinde. */
    const dikdortgen = page.getByRole('button', { name: /Dikdörtgen/ }).first();
    if (!(await dikdortgen.count())) throw new Error('dikdörtgen aracı bulunamadı');
    await dikdortgen.click();
    await page.waitForTimeout(400);
    const secili = await dikdortgen.getAttribute('aria-pressed');
    if (secili !== 'true') throw new Error('araç seçilmedi (aria-pressed=' + secili + ')');
    await page.mouse.move(kutu.x + kutu.width * 0.35, kutu.y + kutu.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(kutu.x + kutu.width * 0.6, kutu.y + kutu.height * 0.6, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(800);
    const sonraObje = await objeSayisi();
    await page.screenshot({ path: path.join(CIKTI, 'storyboard-cizim.png') });
    if (sonraObje <= onceObje) throw new Error(`nesne üretilmedi (${onceObje} → ${sonraObje})`);
    return `obje: ${onceObje} → ${sonraObje}`;
  });

  await dene('Storyboard — panel eklemek', async () => {
    /* Zaman çizelgesindeki panel şeridi  KULLANMIYOR;
       sayım metinden okunuyor ("3 panel · toplam 9.00 sn"). */
    const sayiyiOku = async () => {
      const m = (await page.locator('body').innerText()).match(/(\d+) panel/);
      return m ? Number(m[1]) : -1;
    };
    const once = await sayiyiOku();
    const ekle = page.getByRole('button', { name: /\+\s*Panel|Yeni panel/i }).first();
    if (!(await ekle.count())) return `düğme yok (şerit: ${once} panel)`;
    await ekle.click();
    await page.waitForTimeout(900);
    const sonra = await sayiyiOku();
    if (sonra <= once) throw new Error(`panel eklenmedi (${once} → ${sonra})`);
    return `${once} → ${sonra}`;
  });

  /* Galeri filtreleri artık Kartlar içinde. */
  await dene('Kartlar — paneller ve filtreler listeleniyor', async () => {
    await moda('grid');
    await page.locator('[data-testid="cards-filter-all"]').waitFor();
    const n = await page.locator('[data-testid="panel-thumbnail"]').count();
    await page.screenshot({ path: path.join(CIKTI, 'kartlar-filtre.png') });
    if (!n) throw new Error('kartlarda hiç panel yok');
    return `${n} panel`;
  });

  /* --------------------------------------------------------------- sunum */
  await dene('Sunum — açılıyor ve ilerliyor', async () => {
    /* Sunum bir MOD DEĞİL, ayrı bir düğme (sunum-modu). */
    await page.locator('[data-testid="sunum-modu"]').click({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(CIKTI, 'sunum.png') });
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(CIKTI, 'sunum-2.png') });
    /* Sunum kabuğu gizliyor; çıkış Esc — ürünün kuralı. */
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    const geri = await page.locator('[data-testid="mod-senaryo"]').count();
    if (!geri) throw new Error('Esc ile çıkılamadı — araç çubuğu geri gelmedi');
    return 'ileri + Esc çalışıyor';
  });

  /* ------------------------------------------------------- animatik video */
  await dene('Animatik video seçeneği', async () => {
    const pencere = page.locator('[role="dialog"]');
    await page.getByRole('button', { name: 'Dışa aktar', exact: false }).first().click();
    await pencere.waitFor({ state: 'visible', timeout: 15_000 });
    /* KAPSAM DÜĞMELERİ YENİDEN ADLANDIRILDI: "Yalnız storyboard" artık yok,
       pencere "Senaryo / Storyboard / İkisi" diyor. Eski ad hiçbir zaman
       eşleşmiyordu ve Playwright düğmenin belirmesini TEST ZAMAN AŞIMINA
       kadar (600 sn) bekliyordu — tek bayat etiket bütün turu on dakika
       askıda tutuyordu. Ölçülü tıklama: takılırsa 5 sn'de söylesin. */
    await pencere.getByRole('button', { name: 'Storyboard', exact: true }).click({ timeout: 5_000 });
    await page.waitForTimeout(400);
    const secenekler = await pencere.locator('select').first().locator('option').allInnerTexts();
    const dugme = (await pencere.getByRole('button', { name: /oluştur/i }).last().innerText()).trim();
    await pencere.getByRole('button', { name: 'Vazgeç' }).click();
    return `biçimler: ${secenekler.join(' · ')} | düğme: ${dugme}`;
  });

  fs.writeFileSync(
    path.join(CIKTI, 'rapor-storyboard.md'),
    ['# Keşif turu — kartlar ve storyboard', '', ...rapor, '', '## Konsol hataları', '',
      ...(hatalar.length ? [...new Set(hatalar)].map((h) => `- ${h}`) : ['- (yok)'])].join('\n'),
    'utf8',
  );
  console.log('HATA SAYISI:', hatalar.length);
  expect(hatalar, hatalar.join(' | ')).toEqual([]);
});
