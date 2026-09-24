import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { ikiSutunCiz } from '@storyboard/core/disa/iki-sutun-pdf';
import { profilOlustur, tipProfili } from '@storyboard/core/format/profil';
import { profileUygula } from '@storyboard/core/format/preset';
import { sayfalaIkiSutun, type CiftGirdi } from '@storyboard/core/format/iki-sutun';
import { icerikAkisi } from './yardim/pdf-konum';

/**
 * İKİ SÜTUNLU (FRANSIZ) BELGEDE KALIN HARF.
 *
 * Bulunan kusur: `ikiSutunCiz` üç çizim çağrısında da `fontlar.duz`
 * sabitliyordu. Sahne başlığı ve karakter adı ekranda kalın görünüp PDF'te
 * düz çıkıyordu; presetteki kalınlık da hiç ulaşmıyordu.
 *
 * İçerik üretilmiştir.
 */

const gerek = createRequire(import.meta.url);
const oku = (yol: string) =>
  new Uint8Array(
    fs.readFileSync(
      path.join(
        path.dirname(gerek.resolve(`@expo-google-fonts/courier-prime/${yol}`)),
        path.basename(yol),
      ),
    ),
  );
const DUZ = oku('400Regular/CourierPrime_400Regular.ttf');
const KALIN = oku('700Bold/CourierPrime_700Bold.ttf');

const CIFTLER: CiftGirdi[] = [
  { id: 'c1', tip: 'scene', metin: 'DIŞ. İSKELE — SABAH' },
  { id: 'c2', tip: 'action', metin: 'Martılar. Uzakta bir tekne belirir.' },
  { id: 'c3', tip: 'character', metin: 'NALAN' },
  { id: 'c4', tip: 'dialogue', metin: 'Geç oldu.' },
];

/** Çizim sırasına göre yazı AİLELERİ; pdf-lib'in kaynak son eki atılıyor. */
function fontSirasi(ops: string): string[] {
  const adlar: string[] = [];
  const re = /\/([A-Za-z0-9+\-]+) [\d.]+ Tf/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ops))) adlar.push(m[1].replace(/-\d+$/, ''));
  return adlar;
}

async function ciz(presetler: Record<string, { kalin?: boolean }> = {}) {
  const { profil } = profileUygula(profilOlustur('amerikan', 'letter', 'tr'), presetler as never);
  const belge = await PDFDocument.create();
  belge.registerFontkit(fontkit);
  const duz = await belge.embedFont(DUZ, { subset: true });
  const kalin = await belge.embedFont(KALIN, { subset: true });
  ikiSutunCiz(belge, sayfalaIkiSutun(CIFTLER, profil), {
    profil,
    fontlar: { duz, kalin, italik: duz },
  });
  const geri = await PDFDocument.load(await belge.save());
  return fontSirasi(icerikAkisi(geri, 0));
}

describe('iki sütunlu belgede yazı seçimi', () => {
  it('kalın bloklar KALIN yazıyla çiziliyor', async () => {
    const fontlar = await ciz();
    expect(fontlar.length).toBeGreaterThan(0);
    expect(fontlar).toContain('CourierPrime-Bold');
  });

  it('düz bloklar DÜZ kalıyor — her şey kalın basılmıyor', async () => {
    expect(await ciz()).toContain('CourierPrime-Regular');
  });

  it('presetteki kalınlık PDF\'e ulaşıyor', async () => {
    /* `dialogue` tabanda DÜZ; presetle kalın yapılınca çıktıda da kalın
       olmalı. Tabanda zaten kalın olan bir blokla sınamak, presetin hiç
       işlemediği durumu kaçırırdı. */
    const oncesi = await ciz();
    const sonrasi = await ciz({ dialogue: { kalin: true } });
    expect(sonrasi.filter((f) => f === 'CourierPrime-Bold').length).toBeGreaterThan(
      oncesi.filter((f) => f === 'CourierPrime-Bold').length,
    );
  });

  it('presetle kalınlık KALDIRILABİLİYOR', async () => {
    const kapali = await ciz({ scene: { kalin: false }, character: { kalin: false } });
    expect(kapali).not.toContain('CourierPrime-Bold');
  });
});

describe('GERÇEK Fransız profili — uygulamanın kullandığı profil', () => {
  /* Yukarıdaki testler `profilOlustur('amerikan')` kullanıyor; uygulama ise
     `tipProfili('goruntu-ses')` kuruyor. İkisi AYNI DEĞİLDİ: Fransız
     profilinin blok tablosu BOŞTU, yani hiçbir stil kaynağı yoktu ve
     ekranda kalın görünen sahne başlığı kâğıtta düz çıkıyordu. */
  async function cizGercek() {
    const profil = tipProfili('goruntu-ses', 'letter', 'tr');
    const belge = await PDFDocument.create();
    belge.registerFontkit(fontkit);
    const duz = await belge.embedFont(DUZ, { subset: true });
    const kalin = await belge.embedFont(KALIN, { subset: true });
    ikiSutunCiz(belge, sayfalaIkiSutun(CIFTLER, profil), {
      profil,
      fontlar: { duz, kalin, italik: duz },
    });
    return fontSirasi(icerikAkisi(await PDFDocument.load(await belge.save()), 0));
  }

  it('sahne başlığı KALIN basılıyor — ekrandaki `font-weight:700` ile aynı', async () => {
    const fontlar = await cizGercek();
    expect(fontlar[0]).toBe('CourierPrime-Bold');
  });

  it('gövde satırları DÜZ kalıyor', async () => {
    const fontlar = await cizGercek();
    expect(fontlar.slice(1)).toContain('CourierPrime-Regular');
    expect(fontlar.filter((f) => f === 'CourierPrime-Bold')).toHaveLength(1);
  });
});
