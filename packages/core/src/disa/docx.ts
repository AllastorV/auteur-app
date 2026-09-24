import JSZip from 'jszip';
import type { ScriptBlock, ScriptBlockType } from '../model/script';
import type { BlokStili, FormatProfili } from '../format/profil';
import { buyut } from '../format/terim';

/**
 * DOCX dışa aktarımı (§16.2 borcu).
 *
 * ## Neden elle üretiliyor, kütüphaneyle değil
 *
 * DOCX bir ZIP içinde birkaç XML dosyasıdır ve `jszip` ZATEN bağımlılık
 * (PNG paketi onu kullanıyor). Genel amaçlı bir DOCX kütüphanesi bize
 * gerekmeyen yüzlerce özellik ve yeni bir bağımlılık getirirdi; buradaki
 * ihtiyaç dar ve KESİN: sabit yazı tipi, tam ölçülü girintiler, doğru satır
 * aralığı. Ölçüler zaten profilde ve onları bir kütüphanenin kendi
 * soyutlamasına çevirmek, sayfa sayısının ıraksadığı bir katman daha
 * eklemek olurdu.
 *
 * ## Ölçü birimi TWIP
 *
 * Word içeride 1/20 punto (twip) sayar: 1 inç = 1440 twip. Milimetreyi
 * twip'e çeviren tek bir fonksiyon var; iki yerde yazılsaydı girintiler
 * sessizce kayardı.
 *
 * ⚠ Tavan: bu yazıcı SAYFALAMA yapmıyor — Word kendi sayfalamasını yapıyor.
 * Ölçüler (yazı, punto, satır aralığı, girinti, kağıt) motorunkiyle aynı
 * verildiği için sayfa sayısı pratikte tutuyor ama GARANTİ EDİLMİYOR; garanti
 * edilen çıktı PDF'tir (Karar 34). Sayfa sayısı sözleşmesi gereken yerde PDF
 * kullanılmalı.
 */

/** 1 inç = 1440 twip; 1 inç = 25.4 mm. */
const TWIP_MM = 1440 / 25.4;
const twip = (mm: number) => Math.round(mm * TWIP_MM);

/** XML'de anlam taşıyan beş karakter. Kaçırılmazsa dosya AÇILMAZ. */
function kacir(metin: string): string {
  return metin
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

const HIZA: Record<BlokStili['hiza'], string> = { sol: 'left', orta: 'center', sag: 'right' };

/**
 * Bir bloğun paragraf XML'i.
 *
 * `xml:space="preserve"` ŞART: Word varsayılan olarak baştaki ve sondaki
 * boşlukları atar ve bir senaryoda hizalama için bırakılmış boşluk sessizce
 * kaybolurdu.
 */
function paragraf(
  b: ScriptBlock,
  stil: BlokStili,
  profil: FormatProfili,
  puntoYarim: number,
): string {
  const metin = stil.buyukHarf
    ? buyut(b.text.normalize('NFC'), profil.dil)
    : b.text.normalize('NFC');

  const once = stil.oncekiBosSatir * puntoYarim * 10 * profil.yazi.satirEm;
  const ozellikler = [
    `<w:ind w:left="${twip(stil.solMm)}" w:right="${twip(stil.sagMm)}"/>`,
    `<w:jc w:val="${HIZA[stil.hiza]}"/>`,
    `<w:spacing w:before="${Math.round(once)}" w:after="0" w:line="${Math.round(240 * profil.yazi.satirEm)}" w:lineRule="auto"/>`,
    /* Elle konan sayfa başı da Word'e GEÇER: `sayfala` PDF'te uyguluyor,
       burası uygulamasaydı aynı senaryo iki biçimde farklı sayfalanırdı. */
    stil.yeniSayfada || b.yeniSayfada ? '<w:pageBreakBefore/>' : '',
  ].join('');

  const bicim = [
    `<w:rFonts w:ascii="${kacir(profil.yazi.aile)}" w:hAnsi="${kacir(profil.yazi.aile)}"/>`,
    `<w:sz w:val="${puntoYarim}"/>`,
    stil.kalin ? '<w:b/>' : '',
    stil.italik ? '<w:i/>' : '',
  ].join('');

  /* Satır sonu `<w:br/>`YE ÇEVRİLİYOR: ham `\n` Word'de beyaz boşluk sayılır
     ve satır kırılması GÖSTERMEZ — çok satırlı bir paragraf tek satıra
     yapışırdı (sessiz biçim kaybı). Aynı çalışma (`<w:r>`) içinde art arda
     `<w:t>`/`<w:br/>` sıralamak Word'ün desteklediği yol; her satır kendi
     `xml:space="preserve"` bayrağını taşıyor. */
  const govde = metin
    .split(/\r\n|\n/u)
    .map((satir) => `<w:t xml:space="preserve">${kacir(satir)}</w:t>`)
    .join('<w:br/>');

  return `<w:p><w:pPr>${ozellikler}<w:rPr>${bicim}</w:rPr></w:pPr>`
    + `<w:r><w:rPr>${bicim}</w:rPr>`
    + `${govde}</w:r></w:p>`;
}

export interface DocxSecenek {
  baslik?: string;
  yazar?: string;
}

/**
 * Blokları DOCX baytlarına çevirir.
 *
 * Tanımsız blok tipi FIRLATIYOR — `sayfala` ile aynı kapı. Sessizce
 * atlansaydı kullanıcı eksik bir dosya teslim eder ve bunu ancak karşı taraf
 * fark ederdi.
 */
export async function docxYaz(
  bloklar: readonly ScriptBlock[],
  profil: FormatProfili,
  secenek: DocxSecenek = {},
): Promise<Uint8Array> {
  /* Word yarım punto sayıyor: 12pt → 24. */
  const puntoYarim = 24;
  const g = profil.geometri;

  const govde = bloklar.map((b) => {
    const stil = profil.bloklar[b.type as ScriptBlockType];
    if (!stil) throw new Error(`Profilde tanimsiz blok tipi: ${b.type} (blok ${b.id})`);
    return paragraf(b, stil, profil, puntoYarim);
  }).join('');

  const sayfaOzellikleri =
    `<w:sectPr>`
    + `<w:pgSz w:w="${twip(g.sayfaGenislikMm)}" w:h="${twip(g.sayfaYukseklikMm)}"/>`
    + `<w:pgMar w:top="${twip(g.ustMm)}" w:right="${twip(g.sagMm)}"`
    + ` w:bottom="${twip(g.altMm)}" w:left="${twip(g.solMm)}"`
    + ` w:header="0" w:footer="0" w:gutter="0"/>`
    + `</w:sectPr>`;

  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
    + `<w:body>${govde}${sayfaOzellikleri}</w:body></w:document>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
    + `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`
    + `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`
    + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>`
    + `</Relationships>`;

  /* Başlık ve yazar belgenin ÖZELLİKLERİNE yazılıyor: Word'ün "Yazar" alanı
     ajansların ve yayıncıların baktığı yer ve boş bırakılırsa dosya
     "Bilinmeyen" olarak görünürdü. */
  const core =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"`
    + ` xmlns:dc="http://purl.org/dc/elements/1.1/">`
    + `<dc:title>${kacir(secenek.baslik ?? '')}</dc:title>`
    + `<dc:creator>${kacir(secenek.yazar ?? '')}</dc:creator>`
    + `</cp:coreProperties>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rels);
  zip.file('word/document.xml', document);
  zip.file('docProps/core.xml', core);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
