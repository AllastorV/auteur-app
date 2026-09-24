import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import {
  ayiracSolMm,
  ikiSutunPdfYaz,
  sutunSolMm,
} from '@storyboard/core/disa/iki-sutun-pdf';
import { IKI_SUTUN, sayfalaIkiSutun, type CiftGirdi } from '@storyboard/core/format/iki-sutun';
import { IZGARA, KARAKTER_MM, SATIR_MM } from '@storyboard/core/format/izgara';
import { profilOlustur } from '@storyboard/core/format/profil';
import { metinKonumlari } from './yardim/pdf-konum';

const MM_PT = 72 / 25.4;

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

const profil = (kagit: 'letter' | 'a4' = 'letter') => profilOlustur('amerikan', kagit, 'tr');
const secenekler = (kagit: 'letter' | 'a4' = 'letter') => ({
  profil: profil(kagit),
  yaziTipleri: { duz },
});

const satirlik = (n: number, sutun: number) =>
  Array.from({ length: n }, () => 'x'.repeat(sutun)).join(' ');

const senaryo = (n: number): CiftGirdi[] =>
  Array.from({ length: n }, (_, i) =>
    i % 6 === 0
      ? { id: `s${i}`, tip: 'scene' as const, metin: `iç. oda ${i} - gece` }
      : {
          id: `c${i}`,
          tip: 'action' as const,
          metin: satirlik(1 + (i % 5), IKI_SUTUN.sol),
          ses: satirlik(1 + (i % 3), IKI_SUTUN.sag),
        },
  );

describe('sütun geometrisi IZGARADAN türetiliyor', () => {
  /* Ölçüden değil ızgaradan: yazı tipinin gerçek ilerlemesi ızgara
     sabitinden azıcık farklı (0,59961 em ölçüldü) ve metrik kullanmak sağ
     sütunu karakter hizasından kaydırırdı. */
  it('sol sütun sayfa sol marjında başlıyor', () => {
    const g = profil().geometri;
    expect(sutunSolMm(g, 'sol')).toBe(g.solMm);
  });

  it('sağ sütun sol sütun + oluk kadar sağda', () => {
    const g = profil().geometri;
    expect(sutunSolMm(g, 'sag') - sutunSolMm(g, 'sol')).toBeCloseTo(
      (IKI_SUTUN.sol + IKI_SUTUN.oluk) * KARAKTER_MM,
      9,
    );
  });

  it('sağ sütun metin bloğunun içinde KALIYOR', () => {
    const g = profil().geometri;
    const sagBiter = sutunSolMm(g, 'sag') + IKI_SUTUN.sag * KARAKTER_MM;
    expect(sagBiter).toBeCloseTo(g.solMm + IZGARA.sutun * KARAKTER_MM, 9);
    expect(sagBiter).toBeLessThanOrEqual(g.solMm + g.metinGenislikMm + 1e-9);
  });

  it('ayıraç oluğun ORTASINDA — bir sütuna yapışmıyor', () => {
    const g = profil().geometri;
    const ayirac = ayiracSolMm(g);
    const solBiter = sutunSolMm(g, 'sol') + IKI_SUTUN.sol * KARAKTER_MM;
    const sagBaslar = sutunSolMm(g, 'sag');
    expect(ayirac).toBeGreaterThan(solBiter);
    expect(ayirac).toBeLessThan(sagBaslar);
    expect(ayirac - solBiter).toBeCloseTo(sagBaslar - ayirac, 9);
  });

  it('kağıt değişince sütunlar da kayıyor — marj esner, ızgara sabit', () => {
    const l = profil('letter').geometri;
    const a = profil('a4').geometri;
    // Aralarındaki MESAFE ızgaradan gelir, yani kağıttan bağımsızdır.
    expect(sutunSolMm(a, 'sag') - sutunSolMm(a, 'sol')).toBeCloseTo(
      sutunSolMm(l, 'sag') - sutunSolMm(l, 'sol'),
      9,
    );
  });
});

describe('PDF sayfa sayısı MOTORDAN geliyor', () => {
  it('çıktı sayfa sayısı sayfalayıcıyla aynı', async () => {
    for (const n of [1, 12, 60, 200]) {
      const girdiler = senaryo(n);
      const beklenen = sayfalaIkiSutun(girdiler, profil()).length;
      const cikti = await ikiSutunPdfYaz(girdiler, secenekler());
      expect(cikti.sayfaSayisi, `n=${n}`).toBe(beklenen);
      expect((await PDFDocument.load(cikti.pdf)).getPageCount(), `n=${n}`).toBe(beklenen);
    }
  }, 120_000);

  it('boş senaryo tek sayfa — motor da öyle diyor', async () => {
    const cikti = await ikiSutunPdfYaz([], secenekler());
    expect(cikti.sayfaSayisi).toBe(sayfalaIkiSutun([], profil()).length);
    expect((await PDFDocument.load(cikti.pdf)).getPageCount()).toBe(1);
  }, 60_000);

  it('kağıt değişince sayfa BOYUTU değişir, SAYISI değişmez', async () => {
    const girdiler = senaryo(60);
    const l = await ikiSutunPdfYaz(girdiler, secenekler('letter'));
    const a = await ikiSutunPdfYaz(girdiler, secenekler('a4'));
    expect(a.sayfaSayisi).toBe(l.sayfaSayisi);

    const lB = (await PDFDocument.load(l.pdf)).getPage(0).getSize();
    const aB = (await PDFDocument.load(a.pdf)).getPage(0).getSize();
    expect(Math.round(lB.width)).not.toBe(Math.round(aB.width));
  }, 120_000);
});

describe('çıktı bütünlüğü', () => {
  it('yazı tipi GÖMÜLÜ — Türkçe sahne başlığı taşınıyor', async () => {
    const cikti = await ikiSutunPdfYaz(
      [{ id: 's', tip: 'scene', metin: 'dış. ığdır çöreği fırını - şafak' }],
      secenekler(),
    );
    const okunan = await PDFDocument.load(cikti.pdf);
    const dizgeler = okunan.context.enumerateIndirectObjects().map(([, n]) => String(n)).join(' ');
    expect(dizgeler).toContain('/FontFile2');
  }, 60_000);

  it('Türkçe metin PDF üretimini düşürmüyor', async () => {
    const cikti = await ikiSutunPdfYaz(
      [{ id: 'c', tip: 'action', metin: 'Şişli’de ığdır' }],
      secenekler(),
    );
    expect(cikti.sayfaSayisi).toBe(1);
  }, 60_000);

  it('başlık ve yazar üstveriye yazılıyor', async () => {
    const cikti = await ikiSutunPdfYaz(senaryo(3), {
      ...secenekler(),
      baslik: 'Reklam Filmi',
      yazar: 'Yazar Adı',
    });
    const okunan = await PDFDocument.load(cikti.pdf);
    expect(okunan.getTitle()).toBe('Reklam Filmi');
    expect(okunan.getAuthor()).toBe('Yazar Adı');
  }, 60_000);
});

describe('metin GERÇEKTEN doğru yere çiziliyor', () => {
  /* Saf geometri fonksiyonunu test etmek yetmez: fonksiyon doğru olup çizim
     çağrısı yanlış koordinatı kullanabilir. Konumlar içerik akışından
     birebir okunuyor. */
  it('ilk satır üst marjın ALTINDA — kağıdın dışına düşmüyor', async () => {
    const g = profil().geometri;
    const cikti = await ikiSutunPdfYaz(senaryo(4), secenekler());
    const konumlar = metinKonumlari(await PDFDocument.load(cikti.pdf), 0);
    expect(konumlar.length).toBeGreaterThan(0);

    const enUst = Math.max(...konumlar.map((k) => k.y));
    const metinUstu = (g.sayfaYukseklikMm - g.ustMm) * MM_PT;
    // Taban çizgisi metin bloğunun üst kenarının ALTINDA olmalı.
    expect(enUst).toBeLessThanOrEqual(metinUstu);
    // Ama ilk satırın hemen orada olmalı — bir satırdan fazla aşağıda değil.
    expect(metinUstu - enUst).toBeCloseTo(SATIR_MM * MM_PT, 6);
  }, 60_000);

  it('hiçbir satır alt marjın altına taşmıyor', async () => {
    const g = profil().geometri;
    const cikti = await ikiSutunPdfYaz(senaryo(120), secenekler());
    const belge = await PDFDocument.load(cikti.pdf);
    for (let i = 0; i < belge.getPageCount(); i++) {
      for (const k of metinKonumlari(belge, i)) {
        expect(k.y).toBeGreaterThanOrEqual(g.altMm * MM_PT - 1e-6);
      }
    }
  }, 120_000);

  it('metin YALNIZ iki sütun x konumunda — arada hiçbir şey yok', async () => {
    const g = profil().geometri;
    const cikti = await ikiSutunPdfYaz(senaryo(30), secenekler());
    const belge = await PDFDocument.load(cikti.pdf);
    const beklenen = [sutunSolMm(g, 'sol') * MM_PT, sutunSolMm(g, 'sag') * MM_PT];
    for (let i = 0; i < belge.getPageCount(); i++) {
      for (const k of metinKonumlari(belge, i)) {
        expect(beklenen.some((b) => Math.abs(b - k.x) < 1e-6), `x=${k.x}`).toBe(true);
      }
    }
  }, 120_000);

  /* YERLEŞİM DÜZELTİLDİ. Eski test "aynı çiftin iki hücresi AYNI satırda"
     diyordu — yan yana eşleşme varsayımı. Referans örnek böyle değil: her
     girdi tek sütunda ve bir sonrakisi öncekinin bittiği satırdan başlıyor.
     Bu test artık KASKATLIĞI PDF'te ölçüyor; eşleştirmeye geri dönen bir
     değişiklik onu kırar. */
  it('olay solda, diyalog sağda ve ALT SATIRDA çiziliyor', async () => {
    const g = profil().geometri;
    const cikti = await ikiSutunPdfYaz(
      [
        { id: 'a', tip: 'action', metin: 'gorulen' },
        { id: 'b', tip: 'dialogue', metin: 'duyulan' },
      ],
      secenekler(),
    );
    const konumlar = metinKonumlari(await PDFDocument.load(cikti.pdf), 0);
    expect(konumlar).toHaveLength(2);
    const [sol, sag] = konumlar.sort((a, b) => a.x - b.x);
    expect(sol.x).toBeCloseTo(sutunSolMm(g, 'sol') * MM_PT, 6);
    expect(sag.x).toBeCloseTo(sutunSolMm(g, 'sag') * MM_PT, 6);
    /* Diyalog, olayın ALTINDA: PDF'te y AŞAĞI doğru azalır. Aynı hizada
       olsalardı eşleşme modeline geri dönmüş olurduk. */
    expect(sag.y).toBeLessThan(sol.y);
  }, 60_000);

  it('tek başına bir olay YALNIZ sol sütuna çiziliyor', async () => {
    const g = profil().geometri;
    const cikti = await ikiSutunPdfYaz(
      [{ id: 'a', tip: 'action', metin: 'gorulen' }],
      secenekler(),
    );
    const konumlar = metinKonumlari(await PDFDocument.load(cikti.pdf), 0);
    expect(konumlar).toHaveLength(1);
    expect(konumlar[0].x).toBeCloseTo(sutunSolMm(g, 'sol') * MM_PT, 6);
  }, 60_000);

  it('ardışık satırlar tam bir ızgara satırı aralıklı', async () => {
    const cikti = await ikiSutunPdfYaz(
      [{ id: 'c', tip: 'action', metin: satirlik(3, IKI_SUTUN.sol) }],
      secenekler(),
    );
    const ys = metinKonumlari(await PDFDocument.load(cikti.pdf), 0)
      .map((k) => k.y)
      .sort((a, b) => b - a);
    expect(ys).toHaveLength(3);
    expect(ys[0] - ys[1]).toBeCloseTo(SATIR_MM * MM_PT, 6);
    expect(ys[1] - ys[2]).toBeCloseTo(SATIR_MM * MM_PT, 6);
  }, 60_000);

  it('sahne başlığı sol kenardan başlıyor, sağ sütuna kaymıyor', async () => {
    const g = profil().geometri;
    const cikti = await ikiSutunPdfYaz(
      [{ id: 's', tip: 'scene', metin: satirlik(1, IZGARA.sutun) }],
      secenekler(),
    );
    const konumlar = metinKonumlari(await PDFDocument.load(cikti.pdf), 0);
    expect(konumlar).toHaveLength(1);
    expect(konumlar[0].x).toBeCloseTo(sutunSolMm(g, 'sol') * MM_PT, 6);
  }, 60_000);
});
