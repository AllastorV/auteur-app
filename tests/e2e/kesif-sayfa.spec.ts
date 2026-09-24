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
 * KEŞİF — SAYFA GÖRÜNÜMÜ.
 *
 * Kullanıcı bildirimi (2026-08-30): ikinci sayfa tam boyda değil, "çeyrek
 * köşe" gibi duruyor ve yazdıkça uzuyor. Kâğıt artık TAM SAYFA KATLARINDA.
 *
 * Ölçüt DOM yüksekliği: ekran görüntüsüne bakmak gözle yorum olurdu.
 *
 * Senaryo metni ÜRETİLMİŞTİR.
 */

const SERVER = 'http://localhost:5180';
const CIKTI = 'design/kesif';

let sayac = 0;
const b = (type: ScriptBlock['type'], text: string, sceneId: string): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `f${sayac}`, type, text, scene: '', sceneId });

/** İki sayfayı biraz aşan uzunlukta üretilmiş senaryo. */
function senaryo(sahne: number): ScriptBlock[] {
  sayac = 0;
  const bloklar: ScriptBlock[] = [];
  for (let i = 1; i <= sahne; i++) {
    const sid = `sc${i}`;
    bloklar.push(b('scene', `İÇ. ATÖLYE ${i} — GECE`, sid));
    for (let j = 0; j < 6; j++) {
      bloklar.push(b('action', `Torna tezgâhı döner ${i}-${j}. Demir eğilip parçaya bakar.`, sid));
    }
  }
  return bloklar;
}

async function ac(page: any, request: any, bloklar: ScriptBlock[]) {
  const res = await request.post(`${SERVER}/api/sessions`, {
    data: { projectName: 'Sayfa', ownerName: 'Sahip' },
  });
  const oturum = await res.json();
  const tohum = createDoc(createProject({ panels: [createPanel()] }));
  setScript(tohum, { name: 'Sayfa', blocks: bloklar });
  const sahip = await connectTestClient('ws://localhost:5180', oturum.roomId, oturum.ownerToken);
  Y.applyUpdate(sahip.doc, Y.encodeStateAsUpdate(tohum));
  sahip.push();
  await new Promise((r) => setTimeout(r, 500));
  await sahip.close();
  await page.goto(`/?oda=${oturum.roomCode}&davet=${encodeURIComponent(oturum.ownerToken)}`);
  await page.getByPlaceholder('Görünecek ad').fill('Sayfa');
  await page.getByRole('button', { name: 'Oturuma katıl' }).click();
  await expect(page.getByTestId('senaryo-editor')).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(1500);
}

/** Kâğıt yüksekliği ve tek sayfa yüksekliği (px). */
async function olcu(page: any) {
  return page.evaluate(() => {
    const kagit = document.querySelector('.senaryo-kagit') as HTMLElement;
    /* Sayfa yüksekliği KAPAKTAN ölçülüyor: kapak tam olarak BİR sayfa
       (`.kapak-kagit{height:var(--sayfa-yukseklik)}`). CSS değişkenini
       okumak birimi (mm) piksel sanmak olurdu. */
    const kapak = document.querySelector('.kapak-kagit') as HTMLElement | null;
    const sayfa = kapak ? kapak.getBoundingClientRect().height : NaN;
    const sinir = document.querySelectorAll('.senaryo-sinir').length;
    return { kagit: kagit.getBoundingClientRect().height, sayfa, sinir };
  });
}

test('kâğıt tam sayfa katlarında', async ({ page, request }) => {
  test.setTimeout(300_000);
  fs.mkdirSync(CIKTI, { recursive: true });

  await ac(page, request, senaryo(6));
  const o = await olcu(page);
  await page.screenshot({ path: path.join(CIKTI, 'sayfa-gorunumu.png'), fullPage: true });

  /* Sınır sayısı = sayfa sayısı − 1 (ilk sayfanın sınırı yok). */
  const sayfaSayisi = o.sinir + 1;
  expect(sayfaSayisi, 'senaryo birden çok sayfaya taşmalı').toBeGreaterThan(1);

  /* Kâğıt en az TAM sayfa katı kadar yüksek olmalı — yarım dolu son sayfa
     da tam sayfa görünsün. */
  const beklenen = o.sayfa * sayfaSayisi;
  expect(o.kagit, `kâğıt ${o.kagit}px, beklenen ≥ ${beklenen}px`).toBeGreaterThanOrEqual(
    beklenen - 2,
  );
});
