import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import * as Y from 'yjs';
import { PDFDocument, PDFArray, PDFName, PDFRawStream } from 'pdf-lib';
import { connectTestClient } from '../helpers/wsClient';
import { createDoc, metaMap } from '../../packages/core/src/doc/schema';
import { createPanel, createProject } from '../../packages/core/src/model/factory';
import { ciftEkle } from '../../packages/core/src/doc/mutations';

/**
 * KEŞİF TURU — FRANSIZ (İKİ SÜTUNLU) BELGE.
 *
 * Bugün bu yolda iki kusur düzeltildi (sütun ayıracı export anahtarı,
 * blok stil tablosunun boş olması) ama ikisi de gerçek uygulamada
 * görülmedi. Bu tur belgeyi açıyor, ekranı çekiyor ve ÜRETİLEN PDF'in
 * içine bakıyor.
 *
 * İçerik ÜRETİLMİŞTİR.
 */

const SERVER = 'http://localhost:5180';
const CIKTI = 'design/kesif';

const CIFTLER = [
  { id: 'c1', tip: 'scene', metin: 'DIŞ. İSKELE — SABAH' },
  { id: 'c2', tip: 'action', metin: 'Martılar. Uzakta bir tekne belirir. Nalan iskelede bekler.' },
  { id: 'c3', tip: 'character', metin: 'NALAN' },
  { id: 'c4', tip: 'dialogue', metin: 'Geç oldu. Gelmeyecek galiba.' },
  { id: 'c5', tip: 'action', metin: 'Tekne yanaşır. Motor sesi kesilir.' },
];

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

/** Yazı AİLELERİ — pdf-lib'in kaynak son eki atılıyor. */
function fontlar(belge: PDFDocument): string[] {
  const adlar: string[] = [];
  for (let i = 0; i < belge.getPageCount(); i++) {
    for (const m of akis(belge, i).matchAll(/\/([A-Za-z0-9+\-]+) [\d.]+ Tf/g)) {
      adlar.push(m[1].replace(/-\d+$/, ''));
    }
  }
  return adlar;
}

/** Dikey ayıraç çizgisi — `drawLine` bir `S` (stroke) bırakıyor. */
const cizgiVar = (belge: PDFDocument) => /\nS\n/.test(akis(belge, 0));

const rapor: string[] = [];
const hatalar: string[] = [];
let adimNo = 0;
const not = (s: string) => { rapor.push(s); console.log(s); };

test('Fransız belge turu', async ({ page, request }) => {
  test.setTimeout(600_000);
  const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-fr-'));
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

  /* --------------------------------------------------- iki sütunlu proje */
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Fransız Turu', ownerName: 'Sahip' },
  });
  const oturum = await res.json();

  const tohum = createDoc(createProject({ panels: [createPanel()] }));
  /* Doküman TİPİ belgeden okunuyor (`meta.dokumanTipi`); iki sütunlu
     editör ve ayrı sayfalayıcı bu bayrağa bakıyor. */
  metaMap(tohum).set('dokumanTipi', 'goruntu-ses');
  for (const c of CIFTLER) ciftEkle(tohum, c);

  const sahip = await connectTestClient('ws://localhost:5180', oturum.roomId, oturum.ownerToken);
  Y.applyUpdate(sahip.doc, Y.encodeStateAsUpdate(tohum));
  sahip.push();
  await new Promise((r) => setTimeout(r, 600));
  await sahip.close();

  await page.goto(`/?oda=${oturum.roomCode}&davet=${encodeURIComponent(oturum.ownerToken)}`);
  await page.getByPlaceholder('Görünecek ad').fill('Fransız');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  await page.waitForTimeout(3000);

  await dene('İki sütunlu editör açılıyor', async () => {
    const satir = page.locator('.iki-sutun-satir');
    const n = await satir.count();
    await page.screenshot({ path: path.join(CIKTI, 'fransiz-editor.png') });
    if (!n) throw new Error('iki sütunlu satır bulunamadı');
    return `${n} satır çizildi`;
  });

  await dene('Metin ekranda görünüyor', async () => {
    /* Hücreler <textarea>: metin innerText'te YOK, value'da. İlk denemem
       bunu bilmiyordu ve çalışan bir editörü "metin yok" diye raporladı. */
    const degerler = await page.locator('.iki-sutun-satir textarea').allInnerTexts();
    const kutular = page.locator('.iki-sutun-satir textarea');
    const n = await kutular.count();
    const toplanan: string[] = [];
    for (let i = 0; i < n; i++) toplanan.push(await kutular.nth(i).inputValue());
    const metin = (toplanan.join(' ') + ' ' + degerler.join(' ')).replace(/\s+/g, ' ');
    if (!metin.includes('İSKELE')) throw new Error('sahne başlığı ekranda yok');
    if (!metin.includes('Geç oldu')) throw new Error('replik ekranda yok');
    return 'sahne + replik yerinde';
  });

  const pencere = page.locator('[role="dialog"]');
  async function aktar(ad: string, ayirac: boolean): Promise<PDFDocument> {
    await page.getByRole('button', { name: 'Dışa aktar', exact: false }).first().click();
    await pencere.waitFor({ state: 'visible', timeout: 15_000 });
    await pencere.locator('[data-testid="kapsam-senaryo"]').click();
    const kutu = pencere.locator('[data-testid="orta-cizgi"]');
    if (!(await kutu.count())) throw new Error('sütun ayıracı kutusu YOK — iki sütunlu belgede olmalı');
    if (ayirac) await kutu.check();
    const inecek = page.waitForEvent('download', { timeout: 120_000 });
    await pencere.getByRole('button', { name: /oluştur/i }).last().click();
    const indirme = await inecek;
    const yol = path.join(gecici, ad);
    await indirme.saveAs(yol);
    await pencere.waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(400);
    return PDFDocument.load(fs.readFileSync(yol));
  }

  await dene('PDF — ayıraç KAPALI (varsayılan)', async () => {
    const belge = await aktar('fr-cizgisiz.pdf', false);
    const f = fontlar(belge);
    if (!f.length) throw new Error('PDF BOŞ — hiç metin çizilmemiş');
    if (cizgiVar(belge)) throw new Error('ayıraç kapalıyken ÇİZİLDİ');
    /* Yazı AİLESİ sabitlenmiyor: iki sütunlu belgede sayfa ≈ dakika
       sözleşmesi yok, o yüzden Courier kilidi de yok ve tip kendi
       yazısını kullanıyor (ölçüldü: Tinos). Aileyi sabitleyen bir sınama
       çalışan bir çıktıyı kırık gösterirdi. */
    if (!f.some((x) => /-Bold$/.test(x))) {
      throw new Error('sahne başlığı KALIN değil — bulunan yazılar: ' + [...new Set(f)].join(', '));
    }
    return `${belge.getPageCount()} sayfa · ${f.length} satır · yazılar: ${[...new Set(f)].join(', ')}`;
  });

  await dene('PDF — ayıraç AÇIK', async () => {
    const belge = await aktar('fr-cizgili.pdf', true);
    if (!cizgiVar(belge)) throw new Error('ayıraç açıkken ÇİZİLMEDİ');
    return 'çizgi basıldı';
  });

  fs.writeFileSync(
    path.join(CIKTI, 'rapor-fransiz.md'),
    ['# Keşif turu — Fransız belge', '', ...rapor, '', '## Konsol hataları', '',
      ...(hatalar.length ? [...new Set(hatalar)].map((h) => `- ${h}`) : ['- (yok)'])].join('\n'),
    'utf8',
  );
  console.log('HATA SAYISI:', hatalar.length);
  expect(hatalar, hatalar.join(' | ')).toEqual([]);
  fs.rmSync(gecici, { recursive: true, force: true });
});
