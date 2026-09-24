import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import * as Y from 'yjs';
import { PDFDocument, PDFArray, PDFName, PDFRawStream } from 'pdf-lib';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';
import { setScript } from '../../packages/core/src/doc/mutations';
import type { ScriptBlock } from '../../packages/core/src/model/script';

/**
 * DIŞA AKTARIM SEÇENEKLERİ ÇIKTIYA ULAŞIYOR MU.
 *
 * Bu spec bir HATADAN doğdu. `pdfAktar` bir `useCallback`ti ve bağımlılık
 * dizisinde seçenekler YOKTU: geri çağrı ilk render'da, her seçenek
 * `false`ken donuyordu. Kutu işaretleniyor, ekran güncelleniyor, PDF'i
 * üreten fonksiyon hâlâ ilk hâli görüyordu — başlık sayfası, filigran ve
 * sayfa aralığı çıktıya HİÇ GİTMİYOR, hiçbir hata da bildirilmiyordu.
 *
 * Arayüz testleri bunu yakalayamazdı: kutunun işaretlendiğini doğruluyorlar,
 * çıktıya ulaştığını değil. Bu yüzden ölçüt ÜRETİLEN DOSYANIN İÇİDİR.
 *
 * Senaryo metni üretilmiştir.
 */

const SERVER = 'http://localhost:5180';

let sayac = 0;
const b = (type: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `f${sayac}`, type, text, scene: '', sceneId: 'sc1' });

const BLOKLAR: ScriptBlock[] = [
  b('scene', 'İÇ. ATÖLYE — GECE'),
  b('action', 'Torna tezgâhı döner.'),
  b('character', 'DEMİR'),
  b('dialogue', 'Bu iş burada bitmez.'),
];

/** Sayfanın çizim komutları — dolgu rengi ve metin sayısı buradan okunur. */
function akis(belge: PDFDocument, no: number): string {
  const sayfa = belge.getPage(no);
  const ham = sayfa.node.context.lookup(sayfa.node.get(PDFName.of('Contents')));
  const parcalar = ham instanceof PDFArray
    ? ham.asArray().map((r) => sayfa.node.context.lookup(r))
    : [ham];
  let ops = '';
  for (const p of parcalar) {
    if (!(p instanceof PDFRawStream)) continue;
    const bayt = Buffer.from(p.getContents());
    ops += String(p.dict.get(PDFName.of('Filter')) ?? '').includes('Flate')
      ? zlib.inflateSync(bayt).toString('latin1')
      : bayt.toString('latin1');
  }
  return ops;
}

const dolgular = (belge: PDFDocument) => {
  const küme = new Set<string>();
  for (let i = 0; i < belge.getPageCount(); i++) {
    for (const m of akis(belge, i).match(/[\d.]+ [\d.]+ [\d.]+ rg/g) ?? []) küme.add(m);
  }
  return küme;
};

test('PDF seçenekleri üretilen dosyaya ulaşıyor', async ({ page, request }) => {
  test.setTimeout(300_000);
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-disa-'));

  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Seçenek', ownerName: 'Sahip' },
  });
  const oturum = await res.json();
  const tohum = createDoc(createProject({ panels: [createPanel()] }));
  setScript(tohum, { name: 'Secenek', blocks: BLOKLAR });
  const sahip = await connectTestClient('ws://localhost:5180', oturum.roomId, oturum.ownerToken);
  Y.applyUpdate(sahip.doc, Y.encodeStateAsUpdate(tohum));
  sahip.push();
  await new Promise((r) => setTimeout(r, 500));
  await sahip.close();

  /* SAHİP olarak katılınıyor: dışa aktarma yalnız Sahip rolünde açık ve
     davet oluşturma yolu `owner` rolünü reddediyor. */
  await page.goto(`/?oda=${oturum.roomCode}&davet=${encodeURIComponent(oturum.ownerToken)}`);
  await page.getByPlaceholder('Görünecek ad').fill('Seçenek');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 25_000 });

  const pencere = page.locator('[role="dialog"]');

  /** Pencereyi açar, hazırlığı uygular, üretir ve dosyayı okur. */
  async function aktar(ad: string, hazirla?: () => Promise<void>): Promise<PDFDocument> {
    await page.getByRole('button', { name: 'Dışa aktar', exact: false }).first().click();
    await pencere.waitFor({ state: 'visible' });
    await pencere.locator('[data-testid="kapsam-senaryo"]').click();
    if (hazirla) await hazirla();
    const inecek = page.waitForEvent('download', { timeout: 120_000 });
    await pencere.getByRole('button', { name: /oluştur/i }).last().click();
    const indirme = await inecek;
    const yol = path.join(gecici, ad);
    await indirme.saveAs(yol);
    await pencere.waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
    return PDFDocument.load(fs.readFileSync(yol));
  }

  const taban = await aktar('taban.pdf');
  expect(taban.getPageCount()).toBe(1);

  const baslikli = await aktar('baslikli.pdf', async () => {
    await pencere.locator('[data-testid="baslik-sayfasi-ac"]').check();
  });
  /* Başlık sayfası BİR SAYFA EKLER. Sayfa sayısı değişmiyorsa seçenek
     çıktıya ulaşmamıştır — hatanın kendisi buydu. */
  expect(baslikli.getPageCount()).toBe(taban.getPageCount() + 1);

  const filigranli = await aktar('filigranli.pdf', async () => {
    await pencere.locator('[data-testid="filigran-ac"]').check();
    await pencere.locator('[data-testid="filigran-metin"]').fill('TASLAK');
  });
  /* Filigran GRİ tonla çiziliyor (opaklık renge çevriliyor, bkz. pdf.ts).
     Taban çıktıda yalnız siyah dolgu var. */
  const griVar = [...dolgular(filigranli)].some((d) => /^0\.\d+ 0\.\d+ 0\.\d+ rg$/.test(d));
  expect(griVar, 'filigran gri dolgusu bulunamadı').toBe(true);
  expect([...dolgular(taban)].every((d) => d === '0 0 0 rg')).toBe(true);

  const revizyonlu = await aktar('revizyonlu.pdf', async () => {
    /* Revizyon kutusu yalnız etkin revizyon varken çiziliyor; şeritten
       yayınlanıyor. */
    await pencere.getByRole('button', { name: 'Vazgeç' }).click();
    await page.locator('[data-testid="serit-yayinla"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="serit-yayinla"]').click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Dışa aktar', exact: false }).first().click();
    await pencere.waitFor({ state: 'visible' });
    await pencere.locator('[data-testid="kapsam-senaryo"]').click();
    await pencere.locator('[data-testid="revizyon-ac"]').check();
    await pencere.locator('[data-testid="yalniz-isaretli"]').uncheck();
  });
  /* Mavi revizyonun kâğıt rengi `RENK_ZEMINI.mavi` = 0.722 0.831 0.933. */
  expect([...dolgular(revizyonlu)]).toContain('0.722 0.831 0.933 rg');

  fs.rmSync(gecici, { recursive: true, force: true });
});
