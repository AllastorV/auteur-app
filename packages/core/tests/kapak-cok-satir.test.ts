import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { BASLIK_PUNTO, baslikSayfasiCiz } from '@storyboard/core/disa/baslik-sayfasi';
import { profilOlustur } from '@storyboard/core/format/profil';
import { baslikSayfasiDuzelt } from '@storyboard/core/model/baslik-sayfasi';

/**
 * KAPAK — ÇOK SATIRLI BAŞLIK ve 23 PUNTO FİLM ADI.
 *
 * Kullanıcı bildirimi (2026-08-30): kapak alanlarında Enter alt satıra
 * geçmiyordu ve film adı küçük kalıyordu. Ekran tarafı `input` yerine
 * `textarea` oldu; bu test ÇIKTININ da satır sonlarını çizdiğini ve
 * başlığın gövdeden büyük basıldığını ölçüyor.
 *
 * İçerik ÜRETİLMİŞTİR.
 */

const gerek = createRequire(import.meta.url);
const oku = (y: string) =>
  new Uint8Array(fs.readFileSync(path.join(
    path.dirname(gerek.resolve(`@expo-google-fonts/courier-prime/${y}`)), path.basename(y))));

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

/** Çizilen her metin bloğunun punto boyu, sırayla. */
function puntolar(ops: string): number[] {
  return [...ops.matchAll(/\/[A-Za-z0-9+\-]+ ([\d.]+) Tf/g)].map((m) => Number(m[1]));
}

async function ciz(baslik: string) {
  const belge = await PDFDocument.create();
  belge.registerFontkit(fontkit);
  const duz = await belge.embedFont(oku('400Regular/CourierPrime_400Regular.ttf'), { subset: true });
  const kalin = await belge.embedFont(oku('700Bold/CourierPrime_700Bold.ttf'), { subset: true });
  belge.addPage();
  baslikSayfasiCiz(
    belge,
    profilOlustur('amerikan', 'letter', 'tr'),
    { duz, kalin, italik: duz },
    baslikSayfasiDuzelt({ baslik, yazar: 'BİR YAZAR' }),
  );
  return PDFDocument.load(await belge.save());
}

describe('kapak başlığı', () => {
  it('tek satırlık başlık bir kez çiziliyor', async () => {
    const belge = await ciz('ATÖLYE');
    const ops = akis(belge, 0);
    expect((ops.match(/Tj/g) ?? []).length).toBe(3); // başlık + "yazan" + yazar
  });

  it('SATIR SONLARI çıktıya geçiyor — Enter yutulmuyor', async () => {
    const tek = akis(await ciz('ATÖLYE'), 0);
    const cift = akis(await ciz('ATÖLYE\nGECESİ'), 0);
    expect((cift.match(/Tj/g) ?? []).length).toBe((tek.match(/Tj/g) ?? []).length + 1);
  });

  it('boş satırlar çizilmiyor — sayfada boşluk uydurulmuyor', async () => {
    /* Üç satır: dolu, boş, dolu. Ortadaki çizilmemeli. */
    const bosluklu = akis(await ciz('ATÖLYE\n\nGECESİ'), 0);
    expect((bosluklu.match(/Tj/g) ?? []).length).toBe(4);
  });

  it('film adı GÖVDEDEN BÜYÜK basılıyor', async () => {
    const boylar = puntolar(akis(await ciz('ATÖLYE'), 0));
    const enBuyuk = Math.max(...boylar);
    const govde = Math.min(...boylar);
    expect(enBuyuk).toBeGreaterThan(govde);
    /* Oran `BASLIK_PUNTO / 12` — gövde 12 punto. */
    expect(enBuyuk / govde).toBeCloseTo(BASLIK_PUNTO / 12, 1);
  });

  it('satır sayısı SINIRLI — dördüncü satır alt başlığın üstüne binmiyor', async () => {
    const cok = akis(await ciz('BİR\nİKİ\nÜÇ\nDÖRT'), 0);
    /* Üç başlık satırı + "yazan" + yazar = 5. */
    expect((cok.match(/Tj/g) ?? []).length).toBe(5);
  });

  it('başlık sayfanın DIŞINA taşmıyor', async () => {
    const belge = await ciz('ÇOK UZUN BİR FİLM ADI BURADA');
    const genislik = belge.getPage(0).getWidth();
    const konumlar = [...akis(belge, 0).matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/g)]
      .map((m) => Number(m[1]));
    for (const x of konumlar) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(genislik);
    }
  });
});
