import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { pdfPaketiKur } from '@storyboard/core/disa/paket';
import { profilOlustur } from '@storyboard/core/format/profil';
import { sayfala } from '@storyboard/core/format/sayfala';
import { KARAKTER_MM, SATIR_MM } from '@storyboard/core/format/izgara';
import type { ScriptBlock, ScriptBlockType } from '@storyboard/core/model/script';
import { metinKonumlari } from './yardim/pdf-konum';

const MM_PT = 72 / 25.4;

const gerek = createRequire(import.meta.url);
const FONT_DIZIN = path.dirname(
  gerek.resolve('@expo-google-fonts/courier-prime/400Regular/CourierPrime_400Regular.ttf'),
);
const duz = new Uint8Array(fs.readFileSync(path.join(FONT_DIZIN, 'CourierPrime_400Regular.ttf')));

const profil = (kagit: 'letter' | 'a4' = 'letter') => profilOlustur('amerikan', kagit, 'tr');
const secenekler = (kagit: 'letter' | 'a4' = 'letter') => ({
  profil: profil(kagit),
  yaziTipleri: { duz },
});

/* ÜRETİMDEKİ yola bağlanır: `pdfPaketiKur`. Ayrı bir `pdfYaz` vardı ve aynı
   sırayı (create → fontkit → metadata → font gömme → çizim → save) ikinci kez
   kuruyordu; testler ölü kopyayı koruyordu, yani metadata ya da font gömmede
   bir regresyon `pdfPaketiKur`'da olsa bu dosya yeşil kalırdı (Karar 2). */
async function pdfYaz(
  bloklar: readonly ScriptBlock[],
  s: { profil: ReturnType<typeof profil>; yaziTipleri: { duz: Uint8Array }; baslik?: string; yazar?: string },
) {
  const paket = await pdfPaketiKur({ ...s, bloklar, kareler: [], kapsam: 'senaryo' });
  return { pdf: paket.pdf, sayfaSayisi: paket.senaryoSayfa };
}

let sayac = 0;
const b = (type: ScriptBlockType, text: string): ScriptBlock => ({
  id: `sb_${sayac++}`, fp: '', type, text, scene: '', sceneId: '',
});

const uzunSenaryo = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    b(i % 5 === 0 ? 'scene' : 'action', i % 5 === 0 ? `İÇ. MEKAN ${i} - GECE` : `Satır ${i} biraz metin taşır.`),
  );

describe('§12 — dışa aktarılan sayfa sayısı EDİTÖRDEKİYLE AYNI', () => {
  /* Garanti YAPISAL: sayfalar doğrudan `sayfala()`'dan geliyor ve her sayfa
     için tam bir PDF sayfası çiziliyor. İkinci bir sayfalama hesabı yok. */
  it('PDF sayfa sayısı motorun sayfa sayısına eşit', async () => {
    for (const n of [1, 30, 120, 400]) {
      const bloklar = uzunSenaryo(n);
      const beklenen = sayfala(bloklar, profil()).length;
      const cikti = await pdfYaz(bloklar, secenekler());
      expect(cikti.sayfaSayisi, `n=${n}`).toBe(beklenen);

      const okunan = await PDFDocument.load(cikti.pdf);
      expect(okunan.getPageCount(), `n=${n}`).toBe(beklenen);
    }
  }, 120_000);

  it('boş senaryo tek sayfa verir — motor da öyle diyor', async () => {
    const cikti = await pdfYaz([], secenekler());
    expect(cikti.sayfaSayisi).toBe(sayfala([], profil()).length);
    expect((await PDFDocument.load(cikti.pdf)).getPageCount()).toBe(1);
  });

  it('kağıt değişince sayfa BOYUTU değişir, sayfa SAYISI değişmez (§6.3)', async () => {
    const bloklar = uzunSenaryo(120);
    const letter = await pdfYaz(bloklar, secenekler('letter'));
    const a4 = await pdfYaz(bloklar, secenekler('a4'));
    expect(a4.sayfaSayisi).toBe(letter.sayfaSayisi);

    const lBoyut = (await PDFDocument.load(letter.pdf)).getPage(0).getSize();
    const aBoyut = (await PDFDocument.load(a4.pdf)).getPage(0).getSize();
    expect(Math.round(lBoyut.width)).not.toBe(Math.round(aBoyut.width));
    // US Letter 215,9 mm · A4 210 mm → punto karşılıkları.
    expect(Math.round(lBoyut.width)).toBe(Math.round((215.9 * 72) / 25.4));
    expect(Math.round(aBoyut.width)).toBe(Math.round((210 * 72) / 25.4));
  }, 60_000);
});

describe('yazı tipi GÖMÜLÜ ve Türkçe taşıyor', () => {
  /* Ölçüldü: ğ Ğ ş Ş ı İ Latin-1'in dışında. Base-14 Courier ile taşınamaz;
     gömme, doğrulanamaz bir riski (görüntüleyici ne kullanıyor?) yapısal
     olarak doğrulanabilir bir olguya çeviriyor. */
  it('ÖN KOŞUL: kullanılan TTF bütün Türkçe gliflere sahip', () => {
    const f = fontkit.create(Buffer.from(duz));
    const eksik = [...'ğĞşŞıİçÇöÖüÜ'].filter((c) => !f.hasGlyphForCodePoint(c.codePointAt(0)!));
    expect(eksik).toEqual([]);
  });

  it('PDF gömülü yazı tipi taşıyor, base-14 adına yaslanmıyor', async () => {
    const cikti = await pdfYaz([b('action', 'Işık söndü.')], secenekler());
    /* Ham baytta aramak YETMEZ: pdf-lib nesneleri sıkıştırılmış akışlara
       koyuyor ve `/FontFile2` düz metinde görünmüyor (ölçüldü). Belge
       çözümlenip nesne grafiği taranıyor. */
    const okunan = await PDFDocument.load(cikti.pdf);
    const nesneler = okunan.context.enumerateIndirectObjects();
    const dizgeler = nesneler.map(([, n]) => String(n)).join(' ');
    // FontFile2 = gömülü TrueType akışı. Base-14 kullanılsaydı hiç olmazdı.
    expect(dizgeler).toContain('/FontFile2');
    expect(dizgeler).toMatch(/CourierPrime/);
  }, 60_000);

  it('Türkçe metin PDF üretimini düşürmüyor', async () => {
    const metin = 'Şişli’de ığdır çöreği — ĞÜŞİÖÇ ğüşiöç';
    const cikti = await pdfYaz([b('action', metin)], secenekler());
    expect(cikti.sayfaSayisi).toBe(1);
    expect((await PDFDocument.load(cikti.pdf)).getPageCount()).toBe(1);
  }, 60_000);
});

describe('üstveri ve içerik', () => {
  it('başlık ve yazar PDF üstverisine yazılır', async () => {
    const cikti = await pdfYaz([b('action', 'x')], {
      ...secenekler(),
      baslik: 'Bir Şehrin Perdeleri',
      yazar: 'Yazar Adı',
    });
    const okunan = await PDFDocument.load(cikti.pdf);
    expect(okunan.getTitle()).toBe('Bir Şehrin Perdeleri');
    expect(okunan.getAuthor()).toBe('Yazar Adı');
  }, 60_000);

  it('çok sayfalı belgede her sayfa aynı boyutta', async () => {
    const cikti = await pdfYaz(uzunSenaryo(200), secenekler());
    const okunan = await PDFDocument.load(cikti.pdf);
    const ilk = okunan.getPage(0).getSize();
    for (let i = 1; i < okunan.getPageCount(); i++) {
      const s = okunan.getPage(i).getSize();
      expect(s.width).toBeCloseTo(ilk.width, 3);
      expect(s.height).toBeCloseTo(ilk.height, 3);
    }
  }, 120_000);
});

describe('metin GERÇEKTEN doğru yere çiziliyor', () => {
  /* Bu boşluk iki sütunlu yolda mutasyonla bulundu (E-5, `+1` kaydırması
     sağ kalmıştı) ve aynı `+1` burada da duruyordu: saf geometriyi test
     etmek yetmez, çizim çağrısının onu KULLANDIĞI da ölçülmeli. */
  it('ilk satır üst marjın ALTINDA — kağıdın dışına düşmüyor', async () => {
    const g = profil().geometri;
    const konumlar = metinKonumlari(
      await PDFDocument.load((await pdfYaz(uzunSenaryo(10), secenekler())).pdf),
      0,
    );
    expect(konumlar.length).toBeGreaterThan(0);
    const enUst = Math.max(...konumlar.map((k) => k.y));
    const metinUstu = (g.sayfaYukseklikMm - g.ustMm) * MM_PT;
    expect(enUst).toBeLessThanOrEqual(metinUstu);
    expect(metinUstu - enUst).toBeCloseTo(SATIR_MM * MM_PT, 6);
  }, 60_000);

  it('hiçbir satır alt marjın altına taşmıyor', async () => {
    const g = profil().geometri;
    const belge = await PDFDocument.load((await pdfYaz(uzunSenaryo(200), secenekler())).pdf);
    for (let i = 0; i < belge.getPageCount(); i++) {
      for (const k of metinKonumlari(belge, i)) {
        expect(k.y).toBeGreaterThanOrEqual(g.altMm * MM_PT - 1e-6);
      }
    }
  }, 120_000);

  /* Geçiş SAĞA yaslanır ve bu, hizanın yazı tipi metriğinden DEĞİL ızgaradan
     hesaplandığının kanıtı: Courier Prime'ın gerçek ilerlemesi 0,59961 em,
     ızgara sabiti 0,6 (ölçüldü). Metrik kullanılsaydı sonuç kaymış olurdu. */
  it('sağa yaslı geçiş ızgara sütununa oturuyor', async () => {
    const g = profil().geometri;
    const metin = 'KES';
    const konumlar = metinKonumlari(
      await PDFDocument.load((await pdfYaz([b('transition', metin)], secenekler())).pdf),
      0,
    );
    expect(konumlar).toHaveLength(1);
    const stil = profil().bloklar.transition!;
    const metinGenislikMm = g.metinGenislikMm - stil.solMm - stil.sagMm;
    const beklenen =
      (g.solMm + stil.solMm + metinGenislikMm - metin.length * KARAKTER_MM) * MM_PT;
    expect(konumlar[0].x).toBeCloseTo(beklenen, 6);
  }, 60_000);
});
