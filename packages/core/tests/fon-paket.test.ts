import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { fonDenetle } from '@storyboard/core/fon/denetle';
import { fonPaketiKur } from '@storyboard/core/fon/paket';
import { fonSablonu } from '@storyboard/core/fon/sablon';
import { fonBloklariKur } from '@storyboard/core/fon/kur';
import type { TuretmeGirdisi } from '@storyboard/core/fon/turet';
import { senaryoyuCozumle } from '@storyboard/core/model/analiz';
import { yapiIstatistigiCikar } from '@storyboard/core/model/yapi';
import { DOKUMAN_TIPLERI } from '@storyboard/core/model/dokuman-tipi';
import { tipProfili } from '@storyboard/core/format/profil';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * KONTROL LİSTESİ VE PAKET.
 *
 * İki söz ölçülüyor: sınırı aşan bölüm YİNE ÜRETİLİYOR (kullanıcının
 * yazdığını reddetmek kayıptır) ve aşım SESSİZ KALMIYOR — rapora giriyor.
 */

let sayac = 0;
const b = (tip: ScriptBlock['type'], text: string, sceneId = 'sc1'): ScriptBlock =>
  ({ id: `s${sayac++}`, fp: text, type: tip, text, scene: '', sceneId });

const SENARYO: ScriptBlock[] = [
  b('scene', 'İÇ. MUTFAK - GECE', 'sc1'),
  b('action', 'Ayşe masaya oturur.', 'sc1'),
  b('character', 'AYŞE', 'sc1'),
  b('dialogue', 'Bu iş burada bitmez.', 'sc1'),
];

/* Font DOSYADAN okunuyor: `pdfYaziTipleri()` Vite varlık URL'lerini
   `fetch` ediyor ve node ortamında o URL çözülmüyor. Aynı çözüm
   `revizyon-pdf.test.ts`te de var. */
const gerek = createRequire(import.meta.url);
const FONT = new Uint8Array(fs.readFileSync(path.join(
  path.dirname(gerek.resolve('@expo-google-fonts/courier-prime/400Regular/CourierPrime_400Regular.ttf')),
  'CourierPrime_400Regular.ttf',
)));
const YAZI = { duz: FONT };

const SENARYO_TIPI = DOKUMAN_TIPLERI.senaryo;
const FON_TIPI = DOKUMAN_TIPLERI['fon-dosyasi'];
const FON_PROFIL = tipProfili(FON_TIPI.id, 'a4', 'tr');

function girdi(): TuretmeGirdisi {
  return {
    bloklar: SENARYO,
    analiz: senaryoyuCozumle(SENARYO, { dil: 'tr' }),
    yapi: yapiIstatistigiCikar(SENARYO, SENARYO_TIPI, tipProfili(SENARYO_TIPI.id, 'a4', 'tr')),
    tip: SENARYO_TIPI,
    baslikSayfasi: { baslik: 'Bavul' },
    meta: {
      id: 'p1', name: 'Bavul', createdAt: 0, updatedAt: 1_700_000_000_000,
      author: 'Alp Cavas', description: '',
    },
    breakdown: {},
    karakterler: [],
    lokasyonlar: [],
    dil: 'tr',
  };
}

/** Belgenin bloklarını kurar; `ekle` ile bir bölümün gövdesi doldurulur. */
function belge(sablonId: string, ekle: Record<string, string[]> = {}): ScriptBlock[] {
  const sablon = fonSablonu(sablonId)!;
  const temel = fonBloklariKur(sablon, girdi(), (() => { let n = 0; return () => `fb${n++}`; })());
  const cikti: ScriptBlock[] = [];
  for (const blok of temel) {
    cikti.push(blok);
    if (blok.type !== 'bolum') continue;
    for (const satir of ekle[blok.text] ?? []) {
      cikti.push({ ...blok, id: `${blok.id}-p${cikti.length}`, type: 'paragraf', text: satir });
    }
  }
  return cikti;
}

describe('kontrol listesi', () => {
  const sablon = fonSablonu('sgm-senaryo')!;

  it('boş zorunlu bölüm eksik sayılıyor', () => {
    const d = fonDenetle(sablon, belge('sgm-senaryo'), FON_TIPI, FON_PROFIL);
    const sinopsis = d.durumlar.find((x) => x.ornek.id === 'sinopsis')!;
    expect(sinopsis.belgede).toBe(true);
    expect(sinopsis.dolu).toBe(false);
    expect(d.eksikler.map((x) => x.ornek.id)).toContain('sinopsis');
  });

  it('gövdesi olan bölüm dolu sayılıyor', () => {
    const d = fonDenetle(
      sablon,
      belge('sgm-senaryo', { Sinopsis: ['Bir kadın bavulunu topluyor.'] }),
      FON_TIPI, FON_PROFIL,
    );
    const sinopsis = d.durumlar.find((x) => x.ornek.id === 'sinopsis')!;
    expect(sinopsis.dolu).toBe(true);
    expect(sinopsis.kelime).toBe(4);
    expect(d.eksikler.map((x) => x.ornek.id)).not.toContain('sinopsis');
  });

  /* Türetilen bölüm zaten dolu geliyor: kurulum onu senaryodan yazdı. */
  it('türetilen bölüm kurulumdan dolu geliyor', () => {
    const d = fonDenetle(sablon, belge('sgm-senaryo'), FON_TIPI, FON_PROFIL);
    expect(d.durumlar.find((x) => x.ornek.id === 'tretman')!.dolu).toBe(true);
  });

  /* Başlık DEĞİŞTİRİLİRSE bölüm "belgede yok" görünür — bilinen tavan ve
     sessiz değil: rapor gerekçesini yazıyor. */
  it('başlığı değiştirilen bölüm belgede bulunamıyor', () => {
    const bloklar = belge('sgm-senaryo').map((x) =>
      x.type === 'bolum' && x.text === 'Sinopsis' ? { ...x, text: 'Özet' } : x);
    const d = fonDenetle(sablon, bloklar, FON_TIPI, FON_PROFIL);
    expect(d.durumlar.find((x) => x.ornek.id === 'sinopsis')!.belgede).toBe(false);
  });

  it('dışarıdan alınacak ekler ayrı listede', () => {
    const d = fonDenetle(sablon, belge('sgm-senaryo'), FON_TIPI, FON_PROFIL);
    expect(d.harici.map((x) => x.id)).toContain('imza-beyannamesi');
    expect(d.durumlar.map((x) => x.ornek.id)).not.toContain('imza-beyannamesi');
  });

  /* SGM'de sınır YOK: kurum belirtmediği için hiçbir bölüm aşamaz. */
  it('sınırı olmayan kurumda aşım olmuyor', () => {
    const uzun = Array.from({ length: 400 }, (_, i) => `Satır ${i}.`);
    const d = fonDenetle(sablon, belge('sgm-senaryo', { Sinopsis: uzun }), FON_TIPI, FON_PROFIL);
    expect(d.asanlar).toEqual([]);
  });

  /* Eurimages sinopsisi en fazla ÜÇ sayfa — yazılı kural. */
  it('Eurimages sinopsisi üç sayfayı aşınca yakalanıyor', () => {
    const eu = fonSablonu('eurimages-coprod')!;
    const uzun = Array.from({ length: 400 }, (_, i) => `Line ${i} of the synopsis text.`);
    const d = fonDenetle(eu, belge('eurimages-coprod', { 'Synopsis — English': uzun }), FON_TIPI, FON_PROFIL);
    const s = d.durumlar.find((x) => x.ornek.id === 'synopsis:en')!;
    expect(s.sayfa).toBeGreaterThan(3);
    expect(d.asanlar.map((x) => x.ornek.id)).toContain('synopsis:en');
  });
});

describe('paket', () => {
  it('dolu bölümler dosya oluyor, boşlar olmuyor', async () => {
    const sablon = fonSablonu('sgm-senaryo')!;
    const d = fonDenetle(
      sablon,
      belge('sgm-senaryo', { Sinopsis: ['Bir kadın bavulunu topluyor.'] }),
      FON_TIPI, FON_PROFIL,
    );
    const paket = await fonPaketiKur({
      sablon, denetim: d, profil: FON_PROFIL,
      yaziTipleri: YAZI, baslik: 'Bavul', yazar: 'Alp Cavas',
    });
    const zip = await JSZip.loadAsync(paket.zip);
    const adlar = Object.keys(zip.files).sort();

    expect(adlar).toContain('RAPOR.txt');
    expect(paket.dosyalar[0]).toMatch(/^01-/);
    /* Yazar görüşü boş: dosyası ÜRETİLMİYOR ama rapora eksik olarak
       giriyor — boş bir PDF teslim etmek eksik teslim etmekten kötüdür. */
    expect(paket.dosyalar.some((a) => a.includes('gorusu'))).toBe(false);
    expect(paket.rapor).toContain('Senaryo ve diyalog yazarı görüşü');
  }, 60_000);

  /* SGM'nin kendi yazdığı şart: biyografi/filmografi "MS Word formatında
     hazırlanmalıdır". Bölümün biçim şartı kurumun genel biçiminden
     ÖNCE geliyor. */
  it('DOCX şartlı bölüm docx, ötekiler pdf çıkıyor', async () => {
    const sablon = fonSablonu('sgm-uzun-metraj')!;
    const d = fonDenetle(
      sablon,
      belge('sgm-uzun-metraj', {
        Sinopsis: ['Bir kadın bavulunu topluyor.'],
        'Yönetmenin biyografisi ve filmografisi': ['1978 doğumlu.'],
      }),
      FON_TIPI, FON_PROFIL,
    );
    const paket = await fonPaketiKur({
      sablon, denetim: d, profil: FON_PROFIL,
      yaziTipleri: YAZI, baslik: 'Bavul',
    });
    expect(paket.dosyalar.some((a) => a.endsWith('.docx'))).toBe(true);
    expect(paket.dosyalar.some((a) => a.endsWith('.pdf'))).toBe(true);
  }, 60_000);

  /* Sınırı aşan bölüm YİNE üretiliyor — reddetmek kayıptır — ama aşım
     rapora giriyor ve ölçümün PDF'ten geldiği yazıyor. */
  it('sınır aşımı dosyayı engellemiyor, rapora giriyor', async () => {
    const eu = fonSablonu('eurimages-coprod')!;
    const uzun = Array.from({ length: 400 }, (_, i) => `Line ${i} of the synopsis text.`);
    const d = fonDenetle(eu, belge('eurimages-coprod', { 'Synopsis — English': uzun }), FON_TIPI, FON_PROFIL);
    const paket = await fonPaketiKur({
      sablon: eu, denetim: d, profil: FON_PROFIL,
      yaziTipleri: YAZI, baslik: 'The Suitcase',
    });
    expect(paket.dosyalar.some((a) => a.includes('Synopsis'))).toBe(true);
    expect(paket.rapor).toContain('SINIR AŞIMI');
    expect(paket.rapor).toContain('Sayfa ölçümü PDF üzerinden');
  }, 120_000);

  /* Eurimages'ın yazılı kuralları rapora BİREBİR giriyor: eksik ek
     başvuruyu eliyor ve kullanıcı bunu paketi açtığında görmeli. */
  it('rapor kurumun teslim kurallarını taşıyor', async () => {
    const eu = fonSablonu('eurimages-coprod')!;
    const d = fonDenetle(eu, belge('eurimages-coprod'), FON_TIPI, FON_PROFIL);
    const paket = await fonPaketiKur({
      sablon: eu, denetim: d, profil: FON_PROFIL,
      yaziTipleri: YAZI, baslik: 'The Suitcase',
    });
    expect(paket.rapor).toContain('6 MB');
    expect(paket.rapor).toContain('Eksik ek başvuruyu doğrudan eler.');
    expect(paket.rapor).toContain('2026');
    expect(paket.rapor).toContain('coe.int');
  }, 60_000);
});
