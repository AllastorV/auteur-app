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
 * KEŞİF TURU — iddia etmiyor, DENİYOR.
 *
 * Otomatik testler "yazdığım şey çalışıyor" der; bu tur "kullanıcı bunu
 * açınca ne oluyor" sorusunu sorar. Her adım try/catch içinde: bir yer
 * patlarsa tur durmuyor, patladığı NOT EDİLİYOR ve gezinti sürüyor.
 *
 * Çıktı: `design/kesif/rapor.md` + adım adım ekran görüntüleri.
 * Senaryo metni üretilmiştir.
 */

const SERVER = 'http://localhost:5180';
const WS = 'ws://localhost:5180';
const CIKTI = 'design/kesif';

let sayac = 0;
const b = (type: ScriptBlock['type'], text: string, sceneId = 'sc1'): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `f${sayac}`, type, text, scene: '', sceneId });

const BLOKLAR: ScriptBlock[] = [
  b('scene', 'İÇ. ATÖLYE — GECE', 'sc1'),
  b('action', 'Torna tezgâhı döner. Demir eğilip parçaya bakar. Işık soluk, tozlu.', 'sc1'),
  b('character', 'DEMİR', 'sc1'),
  b('parenthetical', '(alçak sesle)', 'sc1'),
  b('dialogue', 'Bu iş burada bitmez. Sabaha kadar dursak da bitmez, biliyorsun.', 'sc1'),
  b('character', 'NALAN', 'sc1'),
  b('dialogue', 'Şafak sökmeden gideceğiz.', 'sc1'),
  b('transition', 'KESME:', 'sc1'),
  b('scene', 'DIŞ. İSKELE — SABAH', 'sc2'),
  b('action', 'Martılar. Uzakta bir tekne belirir. Nalan iskelede bekler.', 'sc2'),
  b('character', 'NALAN', 'sc2'),
  b('dialogue', 'Geç oldu. Gelmeyecek galiba.', 'sc2'),
  b('action', 'Tekne yanaşır. Motor sesi kesilir.', 'sc2'),
  b('scene', 'İÇ. KAHVE — GÜNDÜZ', 'sc3'),
  b('character', 'HAKKI', 'sc3'),
  b('dialogue', 'Kimse yok burada.', 'sc3'),
];

const rapor: string[] = [];
const hatalar: string[] = [];
let adimNo = 0;

function not(satir: string) {
  rapor.push(satir);
  console.log(satir);
}

test('keşif turu', async ({ page, request }) => {
  test.setTimeout(600_000);
  fs.mkdirSync(CIKTI, { recursive: true });

  page.on('console', (m) => {
    if (m.type() === 'error') hatalar.push(`KONSOL: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => hatalar.push(`SAYFA: ${e.message.slice(0, 200)}`));

  /** Bir adımı dener; patlarsa tura devam eder ve notu yazar. */
  async function dene(ad: string, is: () => Promise<string | void>) {
    adimNo++;
    const oncekiHata = hatalar.length;
    try {
      const sonuc = await is();
      const yeni = hatalar.length - oncekiHata;
      not(`- [${String(adimNo).padStart(2, '0')}] ✅ ${ad}${sonuc ? ` — ${sonuc}` : ''}${yeni ? ` ⚠ ${yeni} konsol hatası` : ''}`);
    } catch (e) {
      not(`- [${String(adimNo).padStart(2, '0')}] ❌ ${ad} — ${(e as Error).message.split('\n')[0].slice(0, 160)}`);
    }
  }

  const cek = async (ad: string) => {
    await page.screenshot({ path: path.join(CIKTI, `${String(adimNo).padStart(2, '0')}-${ad}.png`) });
  };

  /* ---------------------------------------------------------- açılış */
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Keşif Turu', ownerName: 'Sahip' },
  });
  const oturum = await res.json();
  const tohum = createDoc(createProject({ panels: [createPanel(), createPanel(), createPanel()] }));
  setScript(tohum, { name: 'Keşif', blocks: BLOKLAR });
  const sahip = await connectTestClient(WS, oturum.roomId, oturum.ownerToken);
  Y.applyUpdate(sahip.doc, Y.encodeStateAsUpdate(tohum));
  sahip.push();
  await new Promise((r) => setTimeout(r, 500));
  await sahip.close();

  const davetRes = await request.post(`${SERVER}/api/sessions/${oturum.roomId}/invites`, {
    headers: { authorization: `Bearer ${oturum.ownerToken}` },
    data: { role: 'editor' },
  });
  const davet = await davetRes.json();

  await dene('Uygulama açılıyor ve oturuma katılınıyor', async () => {
    await page.goto(`/?oda=${oturum.roomCode}&davet=${encodeURIComponent(davet.token)}`);
    await page.getByPlaceholder('Görünecek ad').fill('Keşif');
    await page.getByRole('button', { name: 'Oturuma katıl' }).click();
    await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 25_000 });
    return `${await page.locator('.senaryo-metin > *').count()} blok yüklendi`;
  });
  await cek('acilis');

  /* ------------------------------------------------------------ modlar */
  for (const [id, ad] of [
    ['mod-senaryo', 'Senaryo'],
    ['mod-kartlar', 'Kartlar'],
    ['mod-storyboard', 'Storyboard'],
    ['mod-sunum', 'Sunum'],
  ] as const) {
    await dene(`Mod: ${ad}`, async () => {
      const dugme = page.locator(`[data-testid="${id}"]`);
      if (!(await dugme.count())) {
        const yedek = page.getByRole('button', { name: new RegExp(ad) });
        if (!(await yedek.count())) throw new Error('düğme bulunamadı');
        await yedek.click();
      } else {
        await dugme.click();
      }
      await page.waitForTimeout(1200);
      return 'açıldı';
    });
    await cek(`mod-${ad.toLowerCase()}`);
    /* Sunum modu kabuğu GİZLİYOR (tam ekran gösterim): araç çubuğu
       erişilemez oluyor ve bir sonraki adım süresiz bekliyor. Çıkış Esc
       ile — ürünün kuralı bu, turun onu bilmesi gerekiyor. */
    if (ad === 'Sunum') {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    }
  }

  /* Senaryoya geri dön */
  await dene('Senaryo moduna dönüş', async () => {
    const d = page.locator('[data-testid="mod-senaryo"]');
    if (await d.count()) await d.click();
    else await page.getByRole('button', { name: 'Senaryo', exact: true }).click();
    await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 15_000 });
  });

  /* -------------------------------------------------------- sağ sekmeler */
  const sekmeler = ['Sahne', 'Yazım', 'İmler', 'Analiz', 'Yapı', 'Kadro', 'Döküm'];
  for (const ad of sekmeler) {
    await dene(`Denetçi sekmesi: ${ad}`, async () => {
      const t = page.getByRole('button', { name: ad, exact: true });
      if (!(await t.count())) throw new Error('sekme bulunamadı');
      await t.first().click();
      await page.waitForTimeout(700);
      return 'çizildi';
    });
    await cek(`sekme-${ad.toLowerCase()}`);
  }

  fs.writeFileSync(
    path.join(CIKTI, 'rapor.md'),
    ['# Keşif turu — 1. bölüm', '', ...rapor, '', '## Konsol / sayfa hataları', '',
      ...(hatalar.length ? [...new Set(hatalar)].map((h) => `- ${h}`) : ['- (yok)'])].join('\n'),
    'utf8',
  );
  console.log('\nRAPOR: design/kesif/rapor.md');
  console.log('HATA SAYISI:', hatalar.length);

  /* Tur bir İDDİA da taşıyor: konsola düşen hata SIFIR olmalı. Yalnız
     rapor yazan bir gezinti, yeşil görünüp hiçbir şey korumazdı. */
  expect(hatalar, hatalar.join(' | ')).toEqual([]);
});
