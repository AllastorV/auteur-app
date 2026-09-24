import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import { profilOlustur } from '@storyboard/core/format/profil';
import { IZGARA, KARAKTER_MM, SATIR_MM } from '@storyboard/core/format/izgara';
import { sayfala } from '@storyboard/core/format/sayfala';
import { sayfaSinirlari } from '@storyboard/core/format/ekran';
import { sayfalaIkiSutun, IKI_SUTUN } from '@storyboard/core/format/iki-sutun';
import { pdfPaketiKur } from '@storyboard/core/disa/paket';
import { ikiSutunPdfYaz, sutunSolMm } from '@storyboard/core/disa/iki-sutun-pdf';
import { fountainYaz } from '@storyboard/core/disa/fountain';
import { metinKonumlari } from './yardim/pdf-konum';
import { sayfayaGoreBloklar, sayfayaGoreGirdiler } from './yardim/agir-senaryo';

/**
 * TEST 1 — İKİ FORMATTA 10'AR SAYFA (kullanıcı isteği).
 *
 * Soru üç parçalı ve üçü ayrı ölçülüyor:
 *   1. Sayfa sayısı motorun dediğiyle tutuyor mu?
 *   2. Sayfa sınırları doğru yerde mi?
 *   3. PDF çıktısı ekranla aynı mı?
 *
 * Üçüncüsü için PDF'in İÇİNE bakılıyor (`metinKonumlari`): sayfa sayısını
 * karşılaştırmak yetmez — doğru sayıda sayfa üretip metni yanlış satıra
 * çizmek mümkündür ve o hata ekranla PDF'i ayırır.
 *
 * Üretilen belgeler `test-results/agir/` altına YAZILIYOR: kullanıcı isteği
 * "üret ve yaz". Klasör `.gitignore`'da (`test-results/`) — üretilmiş çıktı
 * depoya girmez.
 */

const MM_PT = 72 / 25.4;
const gerek = createRequire(import.meta.url);
const FONT_DIZIN = path.dirname(
  gerek.resolve('@expo-google-fonts/courier-prime/400Regular/CourierPrime_400Regular.ttf'),
);
const duz = new Uint8Array(fs.readFileSync(path.join(FONT_DIZIN, 'CourierPrime_400Regular.ttf')));

const CIKTI = path.resolve(__dirname, '../../../test-results/agir');
function yaz(ad: string, veri: string | Uint8Array): string {
  fs.mkdirSync(CIKTI, { recursive: true });
  const hedef = path.join(CIKTI, ad);
  fs.writeFileSync(hedef, veri);
  return hedef;
}

const profil = profilOlustur('amerikan', 'a4', 'tr');
const HEDEF = 10;

describe('TEST 1a — Amerikan format, 10 sayfa', () => {
  const bloklar = sayfayaGoreBloklar(HEDEF, profil);
  const sayfalar = sayfala(bloklar, profil);

  it('fikstür gerçekten 10 sayfa — motor öyle diyor', () => {
    expect(sayfalar).toHaveLength(HEDEF);
    /* ÖN KOŞUL: fikstür anlamlı büyüklükte olmalı. Bir avuç blok 10 sayfa
       yapamaz; yaparsa üreteç bozulmuştur ve testin geri kalanı boşa çalışır. */
    expect(bloklar.length).toBeGreaterThan(120);
  });

  it('hiçbir sayfa ızgarayı aşmıyor (55 satır)', () => {
    for (const s of sayfalar) {
      expect(s.satirlar.length, `sayfa ${s.no}`).toBeLessThanOrEqual(profil.satirSayisi);
    }
    expect(profil.satirSayisi).toBe(IZGARA.satir);
  });

  it('hiçbir sayfa ayırıcı boş satırla BAŞLAMIYOR (§6.2)', () => {
    for (const s of sayfalar) {
      expect(s.satirlar[0].satirIndex, `sayfa ${s.no}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('sayfa sınırları doğru yerde — ofsetler fiziksel sayfa tepesinde', () => {
    /* SÖZLEŞME 2026-08-30'da değişti: ofset akan satır toplamı DEĞİL,
       fiziksel sayfa tepesi. Erken kapanan sayfanın kalan satırları artık
       ekranda da yer kaplıyor (`sayfaDolgulari`), yani çizgi kağıdın
       gerçek sayfa sınırına oturuyor. */
    const sinirlar = sayfaSinirlari(sayfalar, profil.satirSayisi);
    expect(sinirlar).toHaveLength(HEDEF - 1);
    for (let i = 0; i < sayfalar.length - 1; i++) {
      expect(sinirlar[i].satirOfseti, `sınır ${i + 1}`).toBe((i + 1) * profil.satirSayisi);
      expect(sinirlar[i].sayfaNo).toBe(i + 2);
      /* Sınırın işaret ettiği blok, sonraki sayfanın İLK satırının bloğu
         olmalı — yoksa ekrandaki çizgi başka bir bloğun üstüne düşer. */
      expect(sinirlar[i].blockId).toBe(sayfalar[i + 1].satirlar[0].blockId);
    }
  });

  it('sahne başlığı ve karakter adı sayfa dibinde YALNIZ kalmıyor', () => {
    for (const s of sayfalar.slice(0, -1)) {
      const son = s.satirlar[s.satirlar.length - 1];
      expect(['scene', 'character'], `sayfa ${s.no} son satır`).not.toContain(son.tip);
    }
  });

  it('bloklar sırayla ve eksiksiz — sayfalama blok DÜŞÜRMÜYOR', () => {
    const gorulen: string[] = [];
    for (const s of sayfalar) {
      for (const satir of s.satirlar) {
        if (gorulen[gorulen.length - 1] !== satir.blockId) gorulen.push(satir.blockId);
      }
    }
    expect(gorulen).toEqual(bloklar.map((b) => b.id));
  });

  it('PDF ekranla AYNI: sayfa sayısı, satır sayısı ve her satırın Y konumu', async () => {
    const paket = await pdfPaketiKur({
      profil, yaziTipleri: { duz }, bloklar, kareler: [], kapsam: 'senaryo',
      baslik: 'Ağır Test — Amerikan 10 Sayfa',
    });
    expect(paket.senaryoSayfa).toBe(HEDEF);

    const belge = await PDFDocument.load(paket.pdf);
    expect(belge.getPageCount()).toBe(HEDEF);

    const g = profil.geometri;
    for (let i = 0; i < HEDEF; i++) {
      const konumlar = metinKonumlari(belge, i);
      /* Boş satır ÇİZİLMEZ (`satiriCiz` erken döner) ama ızgarada YER
         KAPLAR. Bu yüzden beklenen konumlar boş olmayan satırların ÖZGÜN
         indekslerinden türetiliyor: bir boş satır yutulsaydı ondan sonraki
         bütün satırlar bir satır yukarı kayardı ve ekran ile PDF ayrışırdı —
         beklenen listeyi çizim sırasından üretmek tam bu hatayı gizlerdi. */
      const beklenen = sayfalar[i].satirlar
        .map((s, satir) => ({ satir, bos: s.metin === '' }))
        .filter((s) => !s.bos)
        .map((s) => (g.sayfaYukseklikMm - g.ustMm - (s.satir + 1) * SATIR_MM) * MM_PT);
      expect(konumlar.length, `sayfa ${i + 1} çizilen satır sayısı`).toBe(beklenen.length);
      konumlar.forEach((k, n) => {
        expect(k.y, `sayfa ${i + 1} çizim ${n} Y`).toBeCloseTo(beklenen[n], 3);
      });
    }

    yaz('amerikan-10-sayfa.fountain', fountainYaz(bloklar).metin);
    yaz('amerikan-10-sayfa.pdf', paket.pdf);
  });
});

describe('TEST 1b — Fransız (iki sütun), 10 sayfa', () => {
  const girdiler = sayfayaGoreGirdiler(HEDEF, profil);
  const sayfalar = sayfalaIkiSutun(girdiler, profil);

  it('fikstür gerçekten 10 sayfa — motor öyle diyor', () => {
    expect(sayfalar).toHaveLength(HEDEF);
    expect(girdiler.length).toBeGreaterThan(60);
  });

  it('hiçbir sayfa ızgarayı aşmıyor', () => {
    for (const s of sayfalar) {
      expect(s.satirlar.length, `sayfa ${s.no}`).toBeLessThanOrEqual(IZGARA.satir);
    }
  });

  it('bir GİRDİ iki sayfaya BÖLÜNMÜYOR (§6.6 bölünmezlik)', () => {
    const sayfaninIdleri = sayfalar.map((s) => new Set(s.satirlar.map((r) => r.ciftId)));
    for (let i = 0; i < sayfalar.length; i++) {
      for (const id of sayfaninIdleri[i]) {
        for (let j = i + 1; j < sayfalar.length; j++) {
          /* İstisna yalnız sayfadan UZUN girdi olabilirdi; bu fikstürde yok
             ve olmadığı yukarıdaki satır sayısı iddiasıyla birlikte geçerli. */
          expect(sayfaninIdleri[j].has(id), `girdi ${id} sayfa ${i + 1}→${j + 1} bölündü`).toBe(false);
        }
      }
    }
  });

  it('her satır yalnız TEK sütun taşıyor — sahne başlığı hariç', () => {
    for (const s of sayfalar) {
      for (const r of s.satirlar) {
        if (r.tip === 'scene') expect(r.sag).toBe('');
        else expect(r.sol === '' || r.sag === '', `${r.ciftId}/${r.satirIndex}`).toBe(true);
      }
    }
  });

  it('sütun genişlikleri ızgarayı tüketiyor ve hiçbir hücre taşmıyor', () => {
    expect(IKI_SUTUN.sol + IKI_SUTUN.oluk + IKI_SUTUN.sag).toBe(IZGARA.sutun);
    for (const s of sayfalar) {
      for (const r of s.satirlar) {
        expect(r.sol.length).toBeLessThanOrEqual(IZGARA.sutun);
        expect(r.sag.length).toBeLessThanOrEqual(IKI_SUTUN.sag);
      }
    }
  });

  it('PDF ekranla AYNI: sayfa sayısı, çizilen hücre sayısı ve X/Y konumları', async () => {
    const cikti = await ikiSutunPdfYaz(girdiler, {
      profil, yaziTipleri: { duz }, baslik: 'Ağır Test — Fransız 10 Sayfa',
    });
    expect(cikti.sayfaSayisi).toBe(HEDEF);

    const belge = await PDFDocument.load(cikti.pdf);
    expect(belge.getPageCount()).toBe(HEDEF);

    const g = profil.geometri;
    const solX = sutunSolMm(g, 'sol') * MM_PT;
    const sagX = sutunSolMm(g, 'sag') * MM_PT;

    for (let i = 0; i < HEDEF; i++) {
      const konumlar = metinKonumlari(belge, i);
      const beklenen = sayfalar[i].satirlar.reduce(
        (t, r) => t + (r.sol ? 1 : 0) + (r.sag ? 1 : 0), 0,
      );
      expect(konumlar.length, `sayfa ${i + 1} hücre sayısı`).toBe(beklenen);

      /* Her çizim ya sol ya sağ sütunun BAŞINDA olmalı: aradaki bir X
         değeri, hücrenin oluğa taştığı anlamına gelir. */
      for (const k of konumlar) {
        const solMu = Math.abs(k.x - solX) < 0.01;
        const sagMu = Math.abs(k.x - sagX) < 0.01;
        expect(solMu || sagMu, `x=${k.x} sol=${solX} sag=${sagX}`).toBe(true);
        const satir = Math.round(
          (g.sayfaYukseklikMm - g.ustMm - k.y / MM_PT) / SATIR_MM,
        ) - 1;
        expect(satir).toBeGreaterThanOrEqual(0);
        expect(satir).toBeLessThan(IZGARA.satir);
      }
    }

    const duzMetin = sayfalar
      .map((s) => `--- sayfa ${s.no} ---\n` + s.satirlar
        .map((r) => (r.sol.padEnd(IKI_SUTUN.sol + IKI_SUTUN.oluk) + r.sag).replace(/\s+$/, ''))
        .join('\n'))
      .join('\n');
    yaz('fransiz-10-sayfa.txt', duzMetin);
    yaz('fransiz-10-sayfa.pdf', cikti.pdf);
  });
});

describe('TEST 1c — iki yerleşim aynı metni FARKLI sayfalıyor (beklenen)', () => {
  it('kağıt değişimi sayfa sayısını KAYDIRMIYOR (§6.3)', () => {
    const letter = profilOlustur('amerikan', 'letter', 'tr');
    const bloklar = sayfayaGoreBloklar(HEDEF, profil);
    expect(sayfala(bloklar, letter)).toHaveLength(sayfala(bloklar, profil).length);
    expect(KARAKTER_MM * IZGARA.sutun).toBeCloseTo(letter.geometri.metinGenislikMm, 6);
  });
});
