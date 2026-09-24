import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { senaryoCiz } from '@storyboard/core/disa/pdf';
import { profilOlustur } from '@storyboard/core/format/profil';
import { profileUygula } from '@storyboard/core/format/preset';
import type { ScriptBlock } from '@storyboard/core/model/script';
import { icerikAkisi } from './yardim/pdf-konum';

/**
 * PRESETTEKİ KALIN HARF PDF'E GİDİYOR MU?
 *
 * Kullanıcı bildirimi: sahne başlığı ve karakter için presette kalın
 * seçiliyor, ekranda kalın görünüyor, PDF'te görünmüyor.
 *
 * Test "profilde kalın yazıyor" demiyor — üretilen PDF'in içerik akışını
 * okuyup satırın GERÇEKTEN kalın yazı kaynağıyla çizildiğine bakıyor.
 * Profili doğrulamak, çizim çağrısının yanlış fontu seçtiği durumu
 * kaçırırdı.
 *
 * Senaryo metni üretilmiştir.
 */

const gerek = createRequire(import.meta.url);
const oku = (yol: string) =>
  new Uint8Array(
    fs.readFileSync(
      path.join(path.dirname(gerek.resolve(`@expo-google-fonts/courier-prime/${yol}`)), path.basename(yol)),
    ),
  );
const DUZ = oku('400Regular/CourierPrime_400Regular.ttf');
const KALIN = oku('700Bold/CourierPrime_700Bold.ttf');

const BLOKLAR: ScriptBlock[] = [
  { id: 'b1', fp: 'f1', type: 'scene', text: 'İÇ. ATÖLYE — GECE', scene: '', sceneId: 'sc1' },
  { id: 'b2', fp: 'f2', type: 'action', text: 'Torna tezgâhı döner.', scene: '', sceneId: 'sc1' },
  { id: 'b3', fp: 'f3', type: 'character', text: 'DEMİR', scene: '', sceneId: 'sc1' },
  { id: 'b4', fp: 'f4', type: 'dialogue', text: 'Bu iş bitmez.', scene: '', sceneId: 'sc1' },
];

/**
 * Akıştaki her `Tf` çağrısının yazı AİLESİ, çizim sırasıyla.
 *
 * Sondaki sayı ATILIYOR: pdf-lib alt kümeleme yaparken her `drawText` için
 * ayrı bir kaynak adı üretiyor (`CourierPrime-Regular-7098480789`,
 * `-9742682568`...). Ham kaynak adını karşılaştıran bir sınama, aynı yazıyı
 * FARKLI sanır ve "kalın çalışıyor" der — testin kendisi yalan söylerdi.
 */
function fontSirasi(ops: string): string[] {
  const adlar: string[] = [];
  const re = /\/([A-Za-z0-9+\-]+) [\d.]+ Tf/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ops))) adlar.push(m[1].replace(/-\d+$/, ''));
  return adlar;
}

async function ciz(presetler: Record<string, { kalin?: boolean }>) {
  const taban = profilOlustur('amerikan', 'letter', 'tr');
  const { profil } = profileUygula(taban, presetler as never);

  const belge = await PDFDocument.create();
  belge.registerFontkit(fontkit);
  const duz = await belge.embedFont(DUZ, { subset: true });
  const kalin = await belge.embedFont(KALIN, { subset: true });
  senaryoCiz(belge, BLOKLAR, { profil, fontlar: { duz, kalin, italik: duz } });
  const geri = await PDFDocument.load(await belge.save());
  return { ops: icerikAkisi(geri, 0), profil };
}

describe('presetteki kalın harf', () => {
  it('profile GİRİYOR — model katmanı doğru', async () => {
    const { profil } = await ciz({ scene: { kalin: true }, character: { kalin: true } });
    expect(profil.bloklar.scene?.kalin).toBe(true);
    expect(profil.bloklar.character?.kalin).toBe(true);
  });

  it('PDF çiziminde AYRI bir yazı kaynağı kullanılıyor', async () => {
    const { ops } = await ciz({ scene: { kalin: true }, character: { kalin: true } });
    const fontlar = fontSirasi(ops);
    /* Dört satır, dört `Tf`. Kalın olanlar (1. ve 3.) ötekilerden FARKLI
       kaynağı göstermeli; hepsi aynıysa kalınlık PDF'e hiç gitmemiştir. */
    expect(fontlar).toHaveLength(4);
    expect(new Set(fontlar).size).toBe(2);
    expect(fontlar[0]).toBe(fontlar[2]);
    expect(fontlar[1]).toBe(fontlar[3]);
    expect(fontlar[0]).not.toBe(fontlar[1]);
  });

  it('ÖLÇÜM: preset yokken hangi bloklar kalın', async () => {
    const { ops, profil } = await ciz({});
    console.log('taban kalinlik:', JSON.stringify({
      scene: profil.bloklar.scene?.kalin,
      action: profil.bloklar.action?.kalin,
      character: profil.bloklar.character?.kalin,
      dialogue: profil.bloklar.dialogue?.kalin,
    }));
    console.log('font sirasi:', JSON.stringify(fontSirasi(ops)));
  });
});

describe('paket yolu — dışa aktar düğmesinin gerçekten koştuğu yol', () => {
  it('presetteki kalınlık `pdfPaketiKur` üzerinden de gidiyor', async () => {
    const { pdfPaketiKur } = await import('@storyboard/core/disa/paket');
    const { profil } = profileUygula(profilOlustur('amerikan', 'letter', 'tr'), {
      dialogue: { kalin: true },
    } as never);

    const paket = await pdfPaketiKur({
      kapsam: 'senaryo',
      profil,
      yaziTipleri: { duz: DUZ, kalin: KALIN, italik: DUZ },
      bloklar: BLOKLAR,
      kareler: [],
    } as never);

    const belge = await PDFDocument.load(paket.pdf);
    const fontlar = fontSirasi(icerikAkisi(belge, 0));
    /* Tabanda sahne ve karakter zaten kalın; preset diyaloğu da kalın
       yaptığına göre DÜZ kalan tek satır aksiyon olmalı. */
    expect(fontlar.filter((f) => f === 'CourierPrime-Regular')).toHaveLength(1);
    expect(fontlar.filter((f) => f === 'CourierPrime-Bold')).toHaveLength(3);
  });
});
