import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as Y from 'yjs';
import { PDFDocument, PDFName, PDFRawStream, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { fontlariGom, senaryoCiz } from '@storyboard/core/disa/pdf';
import { profilOlustur } from '@storyboard/core/format/profil';
import { loadProjectIntoDoc, readScript, yerImleriMap } from '@storyboard/core/doc/schema';
import { createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';
import type { ScriptBlock, ScriptBlockType } from '@storyboard/core/model/script';

/**
 * TESLİM EDİLEN KAĞIT TEMİZ.
 *
 * Yer imleri, sayfa sınır rakamları ve seçim vurgusu EKRANA aittir: yazarın
 * kendi işaretleri. PDF ise teslim edilen belge — orada bir yer imi şeridi
 * görünmesi, yazarın özel notunu prodüksiyona göndermek olurdu.
 *
 * Bu garanti YAPISAL: `senaryoCiz` yalnızca `(bloklar, profil, fontlar)`
 * alıyor, im tablosunu HİÇ görmüyor. Ama yapı tek başına yeterli değil —
 * biri yarın imzayı genişletip imleri çizebilir. Aşağıdaki test o değişikliği
 * KIRARAK yakalar: imli ve imsiz belge bayt bayt aynı PDF'i vermeli.
 */

const gerek = createRequire(import.meta.url);
const duz = new Uint8Array(
  fs.readFileSync(
    path.join(
      path.dirname(
        gerek.resolve('@expo-google-fonts/courier-prime/400Regular/CourierPrime_400Regular.ttf'),
      ),
      'CourierPrime_400Regular.ttf',
    ),
  ),
);

const profil = profilOlustur('amerikan', 'letter', 'tr');

let sayac = 0;
const b = (type: ScriptBlockType, text: string): ScriptBlock => ({
  id: `sb_${sayac++}`, fp: '', type, text, scene: '', sceneId: '',
});

/** İmli/imsiz aynı senaryo — id'ler de aynı olsun diye sayaç sıfırlanıyor. */
function senaryo(): ScriptBlock[] {
  sayac = 0;
  return [
    b('scene', 'İÇ. MUTFAK - GECE'),
    b('action', 'Buzdolabının ışığı Selim in yüzüne vuruyor.'),
    b('character', 'NURAY'),
    b('dialogue', 'Bavul hâlâ koridorda.'),
    b('scene', 'DIŞ. SOKAK - GÜNDÜZ'),
    b('action', 'Yağmur başlıyor.'),
  ];
}

async function pdfBaytlari(bloklar: readonly ScriptBlock[]): Promise<Uint8Array> {
  const belge = await PDFDocument.create();
  belge.registerFontkit(fontkit);
  /* Üretim zamanı damgası her çalıştırmada değişir ve iki baytı da kesin
     ayırırdı; karşılaştırma İÇERİĞE bakabilsin diye sabitleniyor. */
  const t = new Date(0);
  belge.setCreationDate(t);
  belge.setModificationDate(t);
  const fontlar = await fontlariGom(belge, { duz } as { duz: Uint8Array });
  senaryoCiz(belge, bloklar, { profil, fontlar });
  return belge.save();
}


function isFlate(akis: PDFRawStream): boolean {
  return String(akis.dict.get(PDFName.of('Filter')) ?? '').includes('FlateDecode');
}

/** Sayfanın içerik akışını düz metin olarak verir (operatörleri okumak için). */
function icerikAkisi(sayfa: PDFPage): string {
  const icerik = sayfa.node.Contents();
  if (!icerik) return '';
  const akislar = 'asArray' in icerik ? (icerik as { asArray(): unknown[] }).asArray() : [icerik];
  return akislar
    .map((ref) => {
      const nesne = sayfa.doc.context.lookup(ref as never);
      if (!(nesne instanceof PDFRawStream)) return '';
      const ham = Buffer.from(nesne.contents);
      /* pdf-lib akışları Flate ile sıkıştırır; açmadan okunan bayt yalnız
         gürültüdür ve her iddia sessizce geçerdi. */
      return (isFlate(nesne) ? zlib.inflateSync(ham) : ham).toString('latin1');
    })
    .join(String.fromCharCode(10));
}

describe('PDF yalnız senaryoyu taşır', () => {
  it('yer imleri PDF baytlarını DEĞİŞTİRMİYOR', async () => {
    const bloklar = senaryo();

    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject(), 'load');
    M.setScript(doc, { name: 's', blocks: bloklar });
    /* Üç ayrı satıra, üç ayrı renkte im: biri sızsa bile fark ederdi. */
    M.yerImiKoy(doc, bloklar[0].id, { renk: 'kırmızı', etiket: 'buraya dön' });
    M.yerImiKoy(doc, bloklar[3].id, { renk: 'mavi', etiket: '' });
    M.yerImiKoy(doc, bloklar[4].id, { renk: 'yeşil', etiket: 'çekim değişecek' });

    expect(yerImleriMap(doc).size).toBe(3);

    const a = await pdfBaytlari(readScript(doc).blocks);
    const c = await pdfBaytlari(senaryo());
    expect(Buffer.from(a).equals(Buffer.from(c))).toBe(true);
  });

  /* Bayt karşılaştırması TEK BAŞINA yetmiyor: koşulsuz çizilen bir şerit
     iki belgede de aynı görünür ve testi geçer. ÖLÇÜLDÜ — sol marja sahte
     bir dikdörtgen ekleyen mutant yukarıdaki testten sağ çıktı. Bu yüzden
     kağıdın üstünde NE OLDUĞU ayrıca sorgulanıyor. */
  it('kağıtta metinden BAŞKA hiçbir çizim yok', async () => {
    const belge = await PDFDocument.load(await pdfBaytlari(senaryo()));
    for (const sayfa of belge.getPages()) {
      const akis = icerikAkisi(sayfa);
      /* `re` dikdörtgen, `m`/`l`/`c` yol, `Do` gömülü nesne (resim/form).
         Hiçbiri senaryo kağıdında olmamalı — orada yalnız metin var. */
      expect(akis).not.toMatch(/(^|\s)re(\s|$)/);
      expect(akis).not.toMatch(/(^|\s)[mlc](\s|$)/);
      expect(akis).not.toMatch(/(^|\s)Do(\s|$)/);
      /* Ve gerçekten metin çizilmiş olmalı: boş sayfa da yukarıdakileri
         geçerdi. */
      expect(akis).toMatch(/(^|\s)Tj(\s|$)/);
    }
  });
});
