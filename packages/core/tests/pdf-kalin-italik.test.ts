import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import * as Y from 'yjs';
import { PDFDict, PDFDocument, PDFName, PDFRawStream, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { fontlariGom, senaryoCiz } from '@storyboard/core/disa/pdf';
import { tipProfili, type FormatProfili } from '@storyboard/core/format/profil';
import type { ScriptBlock, ScriptBlockType } from '@storyboard/core/model/script';

/**
 * §17 borcu: "PDF'e yalnız DÜZ yazı tipi gömülüyor" iddiasını çiviliyor.
 *
 * `dizi` doküman tipinde `bolum` KALIN, `sahne-oyunu`'nda `sahne-yonergesi`
 * İTALİK (`format/profil.ts`). `yazitipi.ts` zaten üç ağırlığı getiriyor ve
 * `fontlariGom` verilirse gömüyor — ama bunu SÖYLEMEK yetmez, PDF'in
 * İÇERİK AKIŞINDA gerçekten farklı bir font kaynağı kullanıldığını ölçmek
 * gerekir: `stil.kalin` doğruyken yanlış fonta bağlanan bir mutant bayt
 * düzeyinde fark etmeden geçebilirdi.
 */

const gerek = createRequire(import.meta.url);
const fontOku = (altYol: string) => new Uint8Array(fs.readFileSync(gerek.resolve(altYol)));
const duz = fontOku('@expo-google-fonts/courier-prime/400Regular/CourierPrime_400Regular.ttf');
const kalin = fontOku('@expo-google-fonts/courier-prime/700Bold/CourierPrime_700Bold.ttf');
const italik = fontOku('@expo-google-fonts/courier-prime/400Regular_Italic/CourierPrime_400Regular_Italic.ttf');

let sayac = 0;
const b = (type: ScriptBlockType, text: string): ScriptBlock => ({
  id: `sb_${sayac++}`, fp: '', type, text, scene: '', sceneId: '',
});

/**
 * Bloklardan GERÇEKTEN kaydedilmiş bir PDF üretir ve yeniden yükler.
 *
 * `belge.save()` çağrılmadan önce sayfanın içerik akışı henüz bayta
 * dönüşmemiş dahili bir nesne — `PDFRawStream` değil. Kaydetmeden okumak
 * boş akış görmek demektir (ölçüldü: ilk yazışım `sayfa.node.Contents()`'i
 * save'siz okuyup her zaman boş dize aldı).
 */
async function pdfUret(profil: FormatProfili, bloklar: readonly ScriptBlock[]): Promise<PDFDocument> {
  const belge = await PDFDocument.create();
  belge.registerFontkit(fontkit);
  const fontlar = await fontlariGom(belge, { duz, kalin, italik });
  senaryoCiz(belge, bloklar, { profil, fontlar });
  return PDFDocument.load(await belge.save());
}

/** Sayfanın içerik akışını düz metin olarak verir (Flate açılarak). */
function icerikAkisi(sayfa: PDFPage): string {
  const icerik = sayfa.node.Contents();
  if (!icerik) return '';
  const akislar = 'asArray' in icerik ? (icerik as { asArray(): unknown[] }).asArray() : [icerik];
  return akislar
    .map((ref) => {
      const nesne = sayfa.doc.context.lookup(ref as never);
      if (!(nesne instanceof PDFRawStream)) return '';
      const ham = Buffer.from(nesne.contents);
      const flate = String(nesne.dict.get(PDFName.of('Filter')) ?? '').includes('FlateDecode');
      return (flate ? zlib.inflateSync(ham) : ham).toString('latin1');
    })
    .join('\n');
}

/**
 * Sayfadaki her metin çizim çağrısının kullandığı font KAYNAK ADI (`/F1`
 * gibi), ÇİZİM SIRASINA göre.
 *
 * Gömülü özel fontlarda pdf-lib metni HEX glif kimlikleriyle yazıyor
 * (`<...>`), Latin harfleriyle değil — bu yüzden metin İÇERİĞİYLE eşleştirme
 * YAPILAMIYOR. `senaryoCiz` blokları SIRAYLA çizdiği için (bkz. kaynak) sıra
 * numarası güvenilir bir eşleştirme: n'inci `Tj` çağrısı n'inci bloğa ait.
 * `Tf` işleci font DEĞİŞTİĞİNDE yazılır, her `Tj`'den önce değil — bu yüzden
 * her `Tj`'den GERİYE doğru en yakın `Tf` alınıyor.
 */
function cizimSirasiFontKaynaklari(ops: string): string[] {
  const tfKonumlari: { ad: string; konum: number }[] = [];
  /* Kaynak adı `/F1` gibi sayısal DEĞİL: pdf-lib font PostScript adını
     kaynak anahtarı olarak kullanıyor (ölçüldü — `/CourierPrime-Bold-…`,
     `/CourierPrime-Regular-…`). Bu aslında testi güçlendiriyor: kaynak adının
     kendisi ağırlığı zaten taşıyor. */
  for (const m of ops.matchAll(/\/([^\s/]+)\s+[\d.]+\s+Tf/g)) {
    tfKonumlari.push({ ad: m[1], konum: m.index });
  }
  const kaynaklar: string[] = [];
  for (const m of ops.matchAll(/(?:<[0-9A-Fa-f]*>|\((?:[^()\\]|\\.)*\))\s*Tj/g)) {
    const sonTf = [...tfKonumlari].reverse().find((tf) => tf.konum < m.index);
    if (!sonTf) throw new Error('Tj işlecinden önce Tf yok');
    kaynaklar.push(sonTf.ad);
  }
  return kaynaklar;
}

/** Kaynak adının işaret ettiği font sözlüğündeki `/BaseFont`. */
function kaynaginBaseFontu(sayfa: PDFPage, kaynakAdi: string): string {
  const kaynaklar = sayfa.node.Resources();
  const fontDict = kaynaklar?.lookup(PDFName.of('Font'), PDFDict);
  const fontRef = fontDict?.get(PDFName.of(kaynakAdi));
  const font = fontRef ? sayfa.node.context.lookup(fontRef, PDFDict) : undefined;
  return String(font?.get(PDFName.of('BaseFont')) ?? '');
}

describe('PDF kalın/italik blokları GERÇEKTEN kendi fontuyla basıyor', () => {
  it('dizi: bölüm başlığı KALIN fontla, aksiyon DÜZ fontla çiziliyor', async () => {
    const profil = tipProfili('dizi', 'letter', 'tr');
    const belge = await pdfUret(profil, [b('bolum', 'BİR'), b('action', 'Kapı açıldı.')]);
    const sayfa = belge.getPages()[0]!;
    const ops = icerikAkisi(sayfa);
    const [bolumKaynagi, aksiyonKaynagi] = cizimSirasiFontKaynaklari(ops);

    /* Aynı kaynak adı kullanılsaydı bölüm başlığı da düz fontla basılmış
       demektir — sessiz düşüş yeniden. */
    expect(bolumKaynagi).not.toBe(aksiyonKaynagi);

    const bolumBase = kaynaginBaseFontu(sayfa, bolumKaynagi);
    const aksiyonBase = kaynaginBaseFontu(sayfa, aksiyonKaynagi);
    expect(bolumBase).not.toBe(aksiyonBase);
    /* KALIN gömülen dosyanın PostScript adı Bold içerir (subset öneki hariç). */
    expect(bolumBase).toMatch(/Bold/);
    expect(aksiyonBase).not.toMatch(/Bold/);
  });

  it('sahne-oyunu: sahne yönergesi İTALİK fontla, diyalog DÜZ fontla çiziliyor', async () => {
    const profil = tipProfili('sahne-oyunu', 'letter', 'tr');
    const belge = await pdfUret(profil, [
      b('sahne-yonergesi', 'Perde yavaşça açılır.'),
      b('dialogue', 'Merhaba.'),
    ]);
    const sayfa = belge.getPages()[0]!;
    const ops = icerikAkisi(sayfa);
    const [yonergeKaynagi, diyalogKaynagi] = cizimSirasiFontKaynaklari(ops);

    expect(yonergeKaynagi).not.toBe(diyalogKaynagi);

    const yonergeBase = kaynaginBaseFontu(sayfa, yonergeKaynagi);
    const diyalogBase = kaynaginBaseFontu(sayfa, diyalogKaynagi);
    expect(yonergeBase).toMatch(/Italic/);
    expect(diyalogBase).not.toMatch(/Italic/);
  });

  /* Gerçek üretim yolu Yjs doküman → readScript üzerinden gelir; yukarıdaki
     iki test saf `senaryoCiz` çağırıyordu. Bu, boru hattının ucundan uca
     bağlı olduğunu (kalın stil doküman modelinden PDF'e kadar taşınıyor)
     doğruluyor. */
  it('uçtan uca: Yjs dokümanından okunan bölüm bloğu da KALIN basılıyor', async () => {
    const { loadProjectIntoDoc, readScript } = await import('@storyboard/core/doc/schema');
    const { createProject } = await import('@storyboard/core/model/factory');
    const M = await import('@storyboard/core/doc/mutations');

    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject(), 'load');
    M.setScript(doc, { name: 's', blocks: [b('bolum', 'İKİ'), b('action', 'Işıklar söner.')] });

    const profil = tipProfili('dizi', 'letter', 'tr');
    const belge = await pdfUret(profil, readScript(doc).blocks);
    const sayfa = belge.getPages()[0]!;
    const ops = icerikAkisi(sayfa);
    const [bolumKaynagi] = cizimSirasiFontKaynaklari(ops);
    const bolumBase = kaynaginBaseFontu(sayfa, bolumKaynagi);
    expect(bolumBase).toMatch(/Bold/);
  });
});
