import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import { pdfPaketiKur } from '@storyboard/core/disa/paket';
import { profilOlustur } from '@storyboard/core/format/profil';
import { sayfalaIkiSutun, type CiftGirdi } from '@storyboard/core/format/iki-sutun';
import type { ScriptBlock } from '@storyboard/core/model/script';
import { metinKonumlari } from './yardim/pdf-konum';

/**
 * FRANSIZ (İKİ SÜTUNLU) FORMATIN DIŞA AKTARIMI — §15.4 karşılığı.
 *
 * Bulunan hata: iki sütunlu belgenin metni `project.ciftler`'de yaşıyor ama
 * dışa aktarım `script.blocks` veriyordu; `pdfPaketiKur` da her zaman tek
 * sütunlu çiziciye gidiyordu. Sonuç: Fransız formatındaki belge PDF'e
 * aktarılınca METİN ÇIKMIYORDU ve uyarı da yoktu.
 *
 * Bu testler "bir PDF üretildi" demiyor — üretilen PDF'te METNİN GERÇEKTEN
 * ÇİZİLDİĞİNİ okuyor. Sayfa üretip içini boş bırakmak tam da kaçırılan
 * hataydı.
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

const profil = () => profilOlustur('amerikan', 'letter', 'tr');

const ciftler: CiftGirdi[] = [
  { id: 'c1', tip: 'scene', metin: 'DIŞ. İSKELE - SABAH' },
  { id: 'c2', tip: 'action', metin: 'Martılar. Uzakta bir tekne.' },
  { id: 'c3', tip: 'dialogue', metin: 'Nalan gelir, yanına oturur.' },
];

/** İki sütunlu belgede blok deposu BOŞTUR — hatanın kaynağı buydu. */
const bosBloklar: readonly ScriptBlock[] = [];

const ortak = {
  kapsam: 'senaryo' as const,
  yaziTipleri: { duz },
  kareler: [],
};

describe('iki sütunlu PDF gerçekten metin taşıyor', () => {
  it('doküman tipi iki sütunluysa ciftler çiziliyor', async () => {
    const paket = await pdfPaketiKur({
      ...ortak,
      profil: profil(),
      dokumanTipi: 'goruntu-ses',
      ciftler,
      bloklar: bosBloklar,
    });
    const belge = await PDFDocument.load(paket.pdf);
    expect(belge.getPageCount()).toBeGreaterThan(0);

    const konumlar = metinKonumlari(belge, 0);
    expect(
      konumlar.length,
      'iki sütunlu PDF sayfa üretti ama üstüne hiç metin çizmedi — §15.4',
    ).toBeGreaterThan(0);
  });

  it('sayfa sayısı SAYFALAYICIDAN geliyor, ikinci bir hesap yok (Karar 34)', async () => {
    const beklenen = sayfalaIkiSutun(ciftler, profil()).length;
    const paket = await pdfPaketiKur({
      ...ortak,
      profil: profil(),
      dokumanTipi: 'goruntu-ses',
      ciftler,
      bloklar: bosBloklar,
    });
    expect(paket.senaryoSayfa).toBe(beklenen);
  });

  it('tek sütunlu belge ESKİ yoldan gidiyor — ciftler yok sayılıyor', async () => {
    const bloklar: ScriptBlock[] = [
      { id: 'b1', fp: 'f1', type: 'scene', text: 'İÇ. MUTFAK - GÜN', scene: '1', sceneId: 's1' },
      { id: 'b2', fp: 'f2', type: 'action', text: 'Demir masaya oturur.', scene: '', sceneId: 's1' },
    ];
    const paket = await pdfPaketiKur({
      ...ortak,
      profil: profil(),
      dokumanTipi: 'senaryo',
      ciftler,
      bloklar,
    });
    const belge = await PDFDocument.load(paket.pdf);
    expect(metinKonumlari(belge, 0).length).toBeGreaterThan(0);
  });

  it('iki sütunlu belge tek sütunlu çiziciye DÜŞMÜYOR', async () => {
    /* Aynı girdiyle iki tip: çıktılar aynı olsaydı dallanma çalışmıyor
       demekti — hata tam olarak "her zaman tek sütuna gitmek"ti. */
    const ikiSutun = await pdfPaketiKur({
      ...ortak, profil: profil(), dokumanTipi: 'goruntu-ses', ciftler, bloklar: bosBloklar,
    });
    const tekSutun = await pdfPaketiKur({
      ...ortak, profil: profil(), dokumanTipi: 'senaryo', ciftler, bloklar: bosBloklar,
    });
    const a = await PDFDocument.load(ikiSutun.pdf);
    const b = await PDFDocument.load(tekSutun.pdf);
    expect(metinKonumlari(a, 0).length).toBeGreaterThan(0);
    /* Tek sütunlu yol boş blok listesi aldı: sayfa üretse bile METİN
       çizmemeli. Hata sürerken iki sütunlu belge tam olarak buraya
       düşüyordu — boş sayfa, uyarı yok. */
    const tekSutunMetin = b.getPageCount() === 0 ? [] : metinKonumlari(b, 0);
    expect(tekSutunMetin.length).toBe(0);
  });

  it('boş iki sütunlu belge çökmüyor', async () => {
    const paket = await pdfPaketiKur({
      ...ortak, profil: profil(), dokumanTipi: 'goruntu-ses', ciftler: [], bloklar: bosBloklar,
    });
    expect(paket.senaryoSayfa).toBe(sayfalaIkiSutun([], profil()).length);
  });
});

describe('dışa aktarım ekranı iki sütunlu metni GERÇEKTEN veriyor', () => {
  const kaynak = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'components', 'dialogs', 'ExportDialog.tsx'),
    'utf8',
  );

  it('ciftler ve doküman tipi pakete geçiyor', () => {
    expect(kaynak, 'ExportDialog iki sütunlu metni geçirmezse PDF boş çıkar').toContain('ciftler,');
    expect(kaynak).toContain('dokumanTipi: project.meta.dokumanTipi');
  });
});
