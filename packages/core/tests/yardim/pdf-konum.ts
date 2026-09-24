import zlib from 'node:zlib';
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';

/**
 * Üretilen PDF'te metnin GERÇEKTEN nereye çizildiğini okur.
 *
 * Saf geometri fonksiyonunu test etmek yetmez: fonksiyon doğru olup çizim
 * çağrısı yanlış koordinatı kullanabilir. `pdf-lib` her `drawText` için
 * `1 0 0 1 x y Tm` yazıyor (ölçüldü), yani konum içerik akışından birebir
 * okunabiliyor.
 */
export interface MetinKonumu {
  x: number;
  y: number;
}

/**
 * Sayfanın ham içerik akışı — çizim komutlarının kendisi.
 *
 * Metin konumu yetmediği durumlar için: zemin dikdörtgeni bir `re ... f`
 * komutudur, hiçbir metin üretmez. "Sayfa renkli mi" sorusu ancak akışa
 * bakarak ölçülebilir.
 */
export function icerikAkisi(belge: PDFDocument, sayfaNo: number): string {
  const sayfa = belge.getPage(sayfaNo);
  const ham = sayfa.node.context.lookup(sayfa.node.get(PDFName.of('Contents')));
  const akislar =
    ham instanceof PDFArray
      ? ham.asArray().map((r) => sayfa.node.context.lookup(r))
      : [ham];

  let ops = '';
  for (const s of akislar) {
    if (!(s instanceof PDFRawStream)) continue;
    const bayt = Buffer.from(s.getContents());
    ops += String(s.dict.get(PDFName.of('Filter')) ?? '').includes('FlateDecode')
      ? zlib.inflateSync(bayt).toString('latin1')
      : bayt.toString('latin1');
  }
  return ops;
}

export function metinKonumlari(belge: PDFDocument, sayfaNo: number): MetinKonumu[] {
  const ops = icerikAkisi(belge, sayfaNo);

  const konumlar: MetinKonumu[] = [];
  /* Yalnız metin ÇİZEN blokları say: `Tm` tek başına konum kurar ama ardından
     `Tj` gelmezse sayfada görünen bir şey yoktur. */
  const re = /1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm\s*(?:<[0-9A-Fa-f]*>|\((?:[^()\\]|\\.)*\))\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ops))) {
    konumlar.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
  }
  return konumlar;
}
