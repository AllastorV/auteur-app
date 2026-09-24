import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { fontlariGom } from '@storyboard/core/disa/pdf';
const require = createRequire(import.meta.url);
const font = (variant: string, name: string) => new Uint8Array(readFileSync(require.resolve('@expo-google-fonts/tinos/'+variant+'/'+name+'.ttf')));

describe('Tinos PDF glif bütünlüğü', () => {
  it('düz, kalın ve italik Türkçe glifler gömüldükten sonra da çizilebilir', async () => {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const fonts = await fontlariGom(pdf, {
      duz: font('400Regular', 'Tinos_400Regular'),
      kalin: font('700Bold', 'Tinos_700Bold'),
      italik: font('400Regular_Italic', 'Tinos_400Regular_Italic'),
    });
    const text = 'Öykü pencereden yürüdü. Yağmur, İstanbul Çiçek. ĞÜŞİÖÇ ğüşiöç';
    const page = pdf.addPage();
    Object.values(fonts).forEach((f, i) => page.drawText(text, { font: f, size: 12, y: 600-i*25 }));
    const loaded = await PDFDocument.load(await pdf.save());
    const entries = loaded.getPage(0).node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
    expect(entries.entries().length).toBe(3);
    for (const [, ref] of entries.entries()) {
      const f = loaded.context.lookup(ref, PDFDict);
      const descendant = f.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict);
      const descriptor = descendant.lookup(PDFName.of('FontDescriptor'), PDFDict);
      const bytes = decodePDFRawStream(descriptor.lookup(PDFName.of('FontFile2')) as PDFRawStream).decode();
      const embedded = fontkit.create(Buffer.from(bytes));
      const cmap = Buffer.from(decodePDFRawStream(f.lookup(PDFName.of('ToUnicode')) as PDFRawStream).decode()).toString();
      const mappings = [...cmap.matchAll(/<([A-Fa-f0-9]{4})> <([A-Fa-f0-9]{4})>/g)];
      expect(mappings.length).toBeGreaterThan(20);
      for (const [, gid, unicode] of mappings) {
        const cp = parseInt(unicode, 16);
        if (cp === 32 || !text.includes(String.fromCodePoint(cp))) continue;
        expect(embedded.getGlyph(parseInt(gid, 16)).path.toSVG().length, String.fromCodePoint(cp)).toBeGreaterThan(0);
      }
    }
  });
});
