import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { ikiSutunCiz } from '@storyboard/core/disa/iki-sutun-pdf';
import { profilOlustur } from '@storyboard/core/format/profil';
import { sayfalaIkiSutun, type CiftGirdi } from '@storyboard/core/format/iki-sutun';
import { icerikAkisi } from './yardim/pdf-konum';

/**
 * FRANSIZ SÜTUN AYIRACI — ekranda var, çıktıda VARSAYILAN YOK.
 *
 * Çizgi yazarken hangi hücrede olunduğunu gösteriyor; teslim edilen
 * sayfada kötü duruyor (kullanıcı kararı 2026-08-29). Ekranla çıktının
 * bilinçli olarak ayrıldığı bir yer — `YazimSekmesi`'ndeki sayfa rengi
 * kararının aynısı.
 *
 * Test "bir seçenek var" demiyor: PDF'in içerik akışını okuyup ÇİZGİNİN
 * gerçekten çizilip çizilmediğine bakıyor.
 *
 * İçerik üretilmiştir.
 */

const gerek = createRequire(import.meta.url);
const fontBayt = new Uint8Array(
  fs.readFileSync(
    path.join(
      path.dirname(
        gerek.resolve('@expo-google-fonts/courier-prime/400Regular/CourierPrime_400Regular.ttf'),
      ),
      'CourierPrime_400Regular.ttf',
    ),
  ),
);

const profil = () => profilOlustur('amerikan', 'letter', 'tr');

const CIFTLER: CiftGirdi[] = [
  { id: 'c1', tip: 'scene', metin: 'DIŞ. İSKELE — SABAH' },
  { id: 'c2', tip: 'action', metin: 'Martılar. Uzakta bir tekne belirir.' },
  { id: 'c3', tip: 'dialogue', metin: 'Nalan gelir, yanına oturur.' },
];

async function ciz(ortaCizgi?: boolean) {
  const belge = await PDFDocument.create();
  belge.registerFontkit(fontkit);
  const duz = await belge.embedFont(fontBayt, { subset: true });
  const p = profil();
  ikiSutunCiz(belge, sayfalaIkiSutun(CIFTLER, p), {
    profil: p,
    fontlar: { duz, kalin: duz, italik: duz },
    ortaCizgi,
  });
  return PDFDocument.load(await belge.save());
}

/**
 * Dikey çizgi akışta bir `S` (stroke) ile biten yol olarak görünür.
 * `pdf-lib` `drawLine` için `m`/`l`/`S` yazıyor (ölçüldü).
 */
const cizgiVar = (ops: string) => /\nS\n/.test(ops);

describe('sütun ayıracı', () => {
  it('VARSAYILAN olarak basılmıyor', async () => {
    expect(cizgiVar(icerikAkisi(await ciz(), 0))).toBe(false);
  });

  it('açıkça istendiğinde basılıyor', async () => {
    expect(cizgiVar(icerikAkisi(await ciz(true), 0))).toBe(true);
  });

  it('kapalıyken metin YİNE basılıyor — çizgiyle birlikte metin gitmiyor', async () => {
    const ops = icerikAkisi(await ciz(false), 0);
    expect(ops).toContain('Tj');
  });

  it('açık ve kapalı çıktıda METİN aynı yerde — çizgi yerleşimi kaydırmıyor', async () => {
    const { metinKonumlari } = await import('./yardim/pdf-konum');
    const kapali = metinKonumlari(await ciz(false), 0);
    const acik = metinKonumlari(await ciz(true), 0);
    expect(acik).toEqual(kapali);
  });
});
