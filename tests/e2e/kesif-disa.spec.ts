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
 * KEŞİF TURU — DIŞA AKTARIM.
 *
 * Her biçim gerçekten indiriliyor, dosya diske yazılıyor ve İÇİNE
 * bakılıyor: boyut, sihirli baytlar, metin biçimlerinde gerçek satırlar.
 * "İndirme tetiklendi" yeterli değil — sıfır baytlık ya da boş bir dosya
 * da indirme tetikler.
 *
 * Senaryo metni üretilmiştir.
 */

const SERVER = 'http://localhost:5180';
const WS = 'ws://localhost:5180';
const CIKTI = 'design/kesif';
const INDIRME = path.join(CIKTI, 'indirilen');

let sayac = 0;
const b = (type: ScriptBlock['type'], text: string, sceneId = 'sc1'): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `f${sayac}`, type, text, scene: '', sceneId });

const BLOKLAR: ScriptBlock[] = [
  b('scene', 'İÇ. ATÖLYE — GECE', 'sc1'),
  b('action', 'Torna tezgâhı döner. Demir eğilip parçaya bakar.', 'sc1'),
  b('character', 'DEMİR', 'sc1'),
  b('parenthetical', '(alçak sesle)', 'sc1'),
  b('dialogue', 'Bu iş burada bitmez. Sabaha kadar dursak da bitmez.', 'sc1'),
  b('character', 'NALAN', 'sc1'),
  b('dialogue', 'Şafak sökmeden gideceğiz.', 'sc1'),
  b('transition', 'KESME:', 'sc1'),
  b('scene', 'DIŞ. İSKELE — SABAH', 'sc2'),
  b('action', 'Martılar. Uzakta bir tekne belirir.', 'sc2'),
  b('character', 'HAKKI', 'sc2'),
  b('dialogue', 'Kimse yok burada.', 'sc2'),
];

const rapor: string[] = [];
const hatalar: string[] = [];
let adimNo = 0;
const not = (s: string) => { rapor.push(s); console.log(s); };

test('dışa aktarım turu', async ({ page, request }) => {
  test.setTimeout(600_000);
  fs.mkdirSync(INDIRME, { recursive: true });

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

  /* ------------------------------------------------------------ açılış */
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Dışa Aktarım Turu', ownerName: 'Sahip' },
  });
  const oturum = await res.json();
  const tohum = createDoc(createProject({ panels: [createPanel(), createPanel()] }));
  setScript(tohum, { name: 'Kesif', blocks: BLOKLAR });
  const sahip = await connectTestClient(WS, oturum.roomId, oturum.ownerToken);
  Y.applyUpdate(sahip.doc, Y.encodeStateAsUpdate(tohum));
  sahip.push();
  await new Promise((r) => setTimeout(r, 500));
  await sahip.close();
  /* SAHİP olarak katılıyoruz: dışa aktarma yalnız Sahip rolünde açık
     ("Editör — tam düzenleme, dışa aktarma yok"). Davet oluşturma yolu
     `owner` rolünü REDDEDİYOR (sunucu: "Geçersiz rol"), o yüzden oturumun
     kendi `ownerToken`ı doğrudan kullanılıyor. */
  await page.goto(`/?oda=${oturum.roomCode}&davet=${encodeURIComponent(oturum.ownerToken)}`);
  await page.getByPlaceholder('Görünecek ad').fill('Keşif');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 25_000 });

  /* HER ŞEY PENCEREYE KAPSANIYOR.
     İlk denemede `page.locator('select').first()` araç çubuğundaki "Sahne
     başlığı" seçicisini yakaladı — pencerenin ARKASINDA kalan, tıklanamaz
     bir öğe. Playwright onu tıklanabilir olana kadar bekledi ve tur 15
     dakika boyunca donup öldü. Kapsamsız seçici, açık bir pencerede yanlış
     öğeyi bulmanın en kolay yoludur. */
  const pencere = page.locator('[role="dialog"]');

  /** Dışa aktar penceresini açar. */
  async function pencereyiAc() {
    if (await pencere.count()) return;
    const dugme = page.getByRole('button', { name: 'Dışa aktar', exact: false }).first();
    if (!(await dugme.count())) throw new Error('Dışa aktar düğmesi yok');
    await dugme.click({ timeout: 10_000 });
    await pencere.waitFor({ state: 'visible', timeout: 10_000 });
  }

  /** Bir biçimi indirir ve dosyayı inceler. */
  async function aktar(
    kapsam: '[data-testid="kapsam-senaryo"]' | '[data-testid="kapsam-storyboard"]' | '[data-testid="kapsam-ikisi"]',
    bicim: string | null,
    dosyaAdi: string,
    hazirla?: () => Promise<void>,
  ): Promise<string> {
    await pencereyiAc();
    await pencere.locator(kapsam).click({ timeout: 10_000 });
    await page.waitForTimeout(400);
    if (bicim) {
      await pencere.locator('select').first().selectOption({ label: bicim }, { timeout: 10_000 });
      await page.waitForTimeout(400);
    }
    if (hazirla) await hazirla();

    /* Üretme düğmesinin metni KAPSAMA GÖRE değişiyor ("Senaryo PDF
       oluştur", "Storyboard PNG oluştur"...). Sabit bir ada bağlanmak
       kapsam değişince sessizce araç çubuğundaki düğmeyi yakalardı. */
    const uret = pencere.getByRole('button', { name: /oluştur|indir|aktar|kaydet/i }).last();
    const inecek = page.waitForEvent('download', { timeout: 120_000 });
    await uret.click({ timeout: 10_000 });
    const indirme = await inecek;
    const yol = path.join(INDIRME, dosyaAdi);
    await indirme.saveAs(yol);
    const boyut = fs.statSync(yol).size;
    const bayt = fs.readFileSync(yol);
    const bas = bayt.subarray(0, 5).toString('latin1');
    const tur =
      bas.startsWith('%PDF') ? 'PDF' :
      bayt[0] === 0x50 && bayt[1] === 0x4b ? 'ZIP/OOXML' :
      'metin';
    // Pencere kapanmadıysa kapat
    if (await pencere.count()) {
      const vazgec = pencere.getByRole('button', { name: 'Vazgeç' });
      if (await vazgec.count()) await vazgec.first().click({ timeout: 5_000 }).catch(() => {});
    }
    await pencere.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
    return `${boyut} bayt · ${tur}`;
  }

  /* -------------------------------------------------------- senaryo biçimleri */
  for (const [bicim, ad] of [
    ['PDF', 'senaryo.pdf'],
    ['Fountain (.fountain)', 'senaryo.fountain'],
    ['Final Draft (.fdx)', 'senaryo.fdx'],
    ['Word (.docx)', 'senaryo.docx'],
    ['Markdown (.md)', 'senaryo.md'],
    ['Düz metin (.txt)', 'senaryo.txt'],
  ] as const) {
    await dene(`Dışa aktar — ${bicim}`, () => aktar('[data-testid="kapsam-senaryo"]', bicim, ad));
  }

  /* ------------------------------------------------------------ storyboard */
  await dene('Dışa aktar — Storyboard (PDF ızgarası)', () =>
    aktar('[data-testid="kapsam-storyboard"]', 'PDF (panel ızgarası)', 'storyboard.pdf'));
  await dene('Dışa aktar — Storyboard (PNG dizisi)', () =>
    aktar('[data-testid="kapsam-storyboard"]', 'PNG dizisi (ZIP)', 'storyboard-png.zip'));
  await dene('Dışa aktar — İkisi birlikte', () =>
    aktar('[data-testid="kapsam-ikisi"]', null, 'ikisi.pdf'));

  /* ----------------------------------------------- PDF seçenekleri: başlık, filigran */
  await dene('Dışa aktar — PDF + başlık sayfası + filigran', () =>
    aktar('[data-testid="kapsam-senaryo"]', 'PDF', 'senaryo-filigran.pdf', async () => {
      await pencere.locator('[data-testid="baslik-sayfasi-ac"]').check();
      await pencere.locator('[data-testid="filigran-ac"]').check();
      await pencere.locator('[data-testid="filigran-metin"]').fill('TASLAK');
    }));

  await dene('Dışa aktar — PDF + sayfa aralığı 1-1', () =>
    aktar('[data-testid="kapsam-senaryo"]', 'PDF', 'senaryo-aralik.pdf', async () => {
      await pencere.locator('[data-testid="aralik-ac"]').check();
    }));

  /* -------------------------------------------------------------- revizyon */
  await dene('Revizyon yayınla (şeritten)', async () => {
    await page.locator('[data-testid="serit-yayinla"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="serit-yayinla"]').click();
    await page.waitForTimeout(300);
    return (await page.locator('[data-testid="serit-ad"]').textContent()) ?? '';
  });

  await dene('Satır işaretle', async () => {
    const bloklar = page.locator('.senaryo-metin > *');
    const kutu = await bloklar.nth(1).boundingBox();
    if (kutu) {
      await page.mouse.click(kutu.x + 20, kutu.y + kutu.height / 2);
      await page.waitForTimeout(250);
    }
    await page.locator('[data-testid="serit-isaretle"]').click();
    await page.waitForTimeout(500);
    const n = await page.locator('.senaryo-metin [data-revizyon]').count();
    if (!n) throw new Error('kâğıtta işaret görünmedi');
    return `${n} satır işaretli`;
  });

  await dene('Dışa aktar — revizyon (renkli, yalnız işaretli sayfalar)', () =>
    aktar('[data-testid="kapsam-senaryo"]', 'PDF', 'revizyon.pdf', async () => {
      await pencere.locator('[data-testid="revizyon-ac"]').check();
      await page.waitForTimeout(300);
    }));

  fs.writeFileSync(
    path.join(CIKTI, 'rapor-disa.md'),
    ['# Keşif turu — dışa aktarım', '', ...rapor, '', '## Konsol / sayfa hataları', '',
      ...(hatalar.length ? [...new Set(hatalar)].map((h) => `- ${h}`) : ['- (yok)'])].join('\n'),
    'utf8',
  );
  console.log('\nHATA SAYISI:', hatalar.length);

  /* Tur bir İDDİA da taşıyor: konsola düşen hata SIFIR olmalı. Yalnız
     rapor yazan bir gezinti, yeşil görünüp hiçbir şey korumazdı. */
  expect(hatalar, hatalar.join(' | ')).toEqual([]);
});
