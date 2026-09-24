import { describe, expect, it } from 'vitest';
import { taslakUret, type TuretmeGirdisi } from '@storyboard/core/fon/turet';
import { senaryoyuCozumle } from '@storyboard/core/model/analiz';
import { yapiIstatistigiCikar } from '@storyboard/core/model/yapi';
import { DOKUMAN_TIPLERI } from '@storyboard/core/model/dokuman-tipi';
import { tipProfili } from '@storyboard/core/format/profil';
import type { ScriptBlock } from '@storyboard/core/model/script';
import type { BreakdownEki } from '@storyboard/core/model/breakdown';

/**
 * TÜRETİCİLER — deterministik, LLM yok.
 *
 * Testlerin ağırlık merkezi "ne üretiliyor" değil, **ne ÜRETİLMİYOR**:
 * sinopsis türetilemez ve türetiliyormuş gibi yapmak kullanıcıya kendi
 * projesi hakkında uydurma metin vermek olurdu.
 */

let sayac = 0;
const b = (tip: ScriptBlock['type'], text: string, sceneId = 'sc1'): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: text, type: tip, text, scene: '', sceneId });

const SENARYO: ScriptBlock[] = [
  b('scene', 'İÇ. MUTFAK - GECE', 'sc1'),
  b('action', 'Ayşe masaya oturur.', 'sc1'),
  b('character', 'AYŞE', 'sc1'),
  b('dialogue', 'Bu iş burada bitmez.', 'sc1'),
  b('scene', 'DIŞ. SOKAK - GÜN', 'sc2'),
  b('action', 'Yağmur yağıyor.', 'sc2'),
  b('character', 'MEHMET', 'sc2'),
  b('dialogue', 'Geç kaldık.', 'sc2'),
];

const EKLER: Record<string, BreakdownEki> = {
  sc1: {
    ozelEsya: ['eski radyo', ' '], kostum: ['yağmurluk'], efekt: [],
    notlar: '', sureTahmini: null, zamanKatmani: 'simdi', hikayeSirasi: null,
  },
  sc2: {
    ozelEsya: ['eski radyo'], kostum: [], efekt: ['yağmur makinesi'],
    notlar: '', sureTahmini: null, zamanKatmani: 'simdi', hikayeSirasi: null,
  },
};

/* Roman fixture'ı AYRI olmak zorunda: senaryo blokları roman profilinde
   sayfalanamıyor (`scene` o profilde tanımsız) ve sayfalayıcı bunu doğru
   biçimde fırlatıyor. Aynı blokları iki tipe birden vermek, motorun
   reddettiği bir belgeyi test etmek olurdu. */
const ROMAN: ScriptBlock[] = [
  b('bolum', 'Birinci Bölüm', 'ch1'),
  b('paragraf', 'Kapı çalındığında masadaydı.', 'ch1'),
  b('paragraf', 'Açmadı.', 'ch1'),
];

function girdi(tipAdi: keyof typeof DOKUMAN_TIPLERI = 'senaryo'): TuretmeGirdisi {
  const tip = DOKUMAN_TIPLERI[tipAdi];
  const profil = tipProfili(tip.id, 'letter', 'tr');
  const bloklar = tipAdi === 'roman' ? ROMAN : SENARYO;
  return {
    bloklar,
    analiz: senaryoyuCozumle(bloklar, { dil: 'tr' }),
    yapi: yapiIstatistigiCikar(bloklar, tip, profil),
    tip,
    baslikSayfasi: { baslik: 'Bavul', yazar: 'Alp Cavas', tarih: '2026-03-12' },
    meta: {
      id: 'p1', name: 'Bavul', createdAt: 0, updatedAt: 1_700_000_000_000,
      author: 'Alp Cavas', description: '',
    },
    breakdown: EKLER,
    karakterler: [
      { ad: 'AYŞE', aciklama: 'Kırk yaşında, hâlâ bekliyor.' },
      { ad: 'KOMŞU', aciklama: 'Hiç konuşmaz.' },
    ],
    lokasyonlar: [
      { ad: 'MUTFAK', tip: 'ic', aciklama: '' },
      { ad: 'SOKAK', tip: 'dis', aciklama: '' },
    ],
    dil: 'tr',
  };
}

describe('türetilemeyen bölüm', () => {
  /* EN ÖNEMLİ TEST. `null` dönmezse arayüz "Taslak üret" düğmesini çizer
     ve kullanıcı sinopsisini programın yazmasını bekler. */
  it('elle yazılan bölüm için null döner — uydurma metin YOK', () => {
    expect(taslakUret('elle', girdi())).toBeNull();
  });
});

describe('künye', () => {
  it('başlık, yazar, tarih ve toplam sayfa var', () => {
    const satirlar = taslakUret('kunye', girdi())!;
    expect(satirlar[0]).toBe('Bavul');
    expect(satirlar).toContain('Yazan: Alp Cavas');
    expect(satirlar).toContain('Tarih: 2026-03-12');
    expect(satirlar.some((s) => s.startsWith('Toplam sayfa: '))).toBe(true);
  });

  /* SAYFA=DAKİKA GEÇERLİYSE süre yazılır, değilse YAZILMAZ. Romanda sayfa
     sayısını dakikaya çevirmek yazara olmayan bir bilgi vermektir. */
  it('senaryoda süre var', () => {
    expect(taslakUret('kunye', girdi('senaryo'))!.some((s) => s.includes('Süre (tahmini)'))).toBe(true);
  });

  it('romanda süre YOK, yerine neden yazıyor', () => {
    const satirlar = taslakUret('kunye', girdi('roman'))!;
    expect(satirlar.some((s) => s.startsWith('Süre (tahmini)'))).toBe(false);
    expect(satirlar.some((s) => s.includes('sayfa süreyi ölçmez'))).toBe(true);
  });

  it('tarih yoksa güncelleme tarihinden türüyor — yerel saat dilimine bağlı değil', () => {
    const g = girdi();
    const satirlar = taslakUret('kunye', { ...g, baslikSayfasi: { baslik: 'Bavul' } })!;
    expect(satirlar).toContain('Tarih: 2023-11-14');
  });
});

describe('sahne listesi — tretman İSKELETİ', () => {
  const satirlar = taslakUret('sahne-listesi', girdi())!;

  it('her sahne için ölçüm satırı ve doldurulacak bir soru var', () => {
    expect(satirlar[0]).toBe('Sahne listesi');
    expect(satirlar[1]).toContain('1. İÇ. MUTFAK - GECE');
    expect(satirlar[1]).toContain('İÇ');
    expect(satirlar[1]).toContain('GECE');
    expect(satirlar[2]).toBe('[bu sahnede ne oluyor?]');
    expect(satirlar[3]).toContain('2. DIŞ. SOKAK - GÜN');
    expect(satirlar[4]).toBe('[bu sahnede ne oluyor?]');
  });

  /* ÖZET DEĞİL: sahnenin diyaloğu ya da aksiyon metni taslağa GİRMEZ.
     Girseydi "tretman" diye kopyalanmış bir senaryo teslim edilirdi. */
  it('sahnenin metni kopyalanmıyor', () => {
    expect(satirlar.join('\n')).not.toContain('Bu iş burada bitmez');
    expect(satirlar.join('\n')).not.toContain('Ayşe masaya oturur');
  });
});

describe('karakter dosyası', () => {
  const satirlar = taslakUret('karakterler', girdi())!;

  it('konuşan karakterin ölçümü ve açıklaması var', () => {
    expect(satirlar[0]).toBe('Karakterler');
    const ayse = satirlar.find((s) => s.startsWith('AYŞE —'))!;
    expect(ayse).toContain('1 replik');
    expect(ayse).toContain('sahne 1–1');
    expect(satirlar).toContain('Kırk yaşında, hâlâ bekliyor.');
  });

  /* Senaryoda hiç konuşmayan ama KAYITLI karakter düşmüyor: sessiz rol de
     başvuruda vardır ve `karakterSatirlari` zaten iki yönlü birleştiriyor. */
  it('hiç konuşmayan kayıtlı karakter de listede', () => {
    expect(satirlar.some((s) => s.startsWith('KOMŞU'))).toBe(true);
  });
});

describe('mekân listesi', () => {
  it('iç/dış ve sahne sayısı ile', () => {
    const satirlar = taslakUret('mekanlar', girdi())!;
    expect(satirlar[0]).toBe('Mekânlar');
    expect(satirlar.find((s) => s.startsWith('MUTFAK'))).toContain('İÇ');
    expect(satirlar.find((s) => s.startsWith('SOKAK'))).toContain('DIŞ');
    expect(satirlar.find((s) => s.startsWith('MUTFAK'))).toContain('1 sahne');
  });
});

describe('bütçe sinyalleri', () => {
  const satirlar = taslakUret('butce-sinyalleri', girdi())!;

  /* İLK İŞ UYARI. Kuruma giden dosyada "bütçe" başlığı altında rakamsız
     bir liste duruyor; yanlış okunması pahalı. */
  it('bütçe olmadığını ilk satırlarda söylüyor', () => {
    expect(satirlar[0]).toBe('Bütçe sinyalleri');
    expect(satirlar[1]).toContain('bütçe DEĞİLDİR');
  });

  it('ölçülen sinyaller var', () => {
    expect(satirlar).toContain('Toplam mekân: 2');
    expect(satirlar).toContain('İç / Dış: 1 / 1');
    expect(satirlar.some((s) => s.startsWith('Gece kümesi: '))).toBe(true);
  });

  /* Aynı eşya iki sahnede geçiyor — listede BİR KEZ. Yinelenmiş bir
     dökümde "iki radyo" okunurdu. Boş dizge de elenmeli. */
  it('sahneler arası tekrar tekilleşiyor, boş değer düşüyor', () => {
    expect(satirlar).toContain('Özel eşya: eski radyo');
    expect(satirlar).toContain('Kostüm: yağmurluk');
    expect(satirlar).toContain('Efekt: yağmur makinesi');
  });

  it('hiç veri yoksa "yok" yazıyor, boş satır bırakmıyor', () => {
    const satirlar2 = taslakUret('butce-sinyalleri', { ...girdi(), breakdown: {} })!;
    expect(satirlar2).toContain('Özel eşya: yok');
    expect(satirlar2).toContain('Kostüm: yok');
    expect(satirlar2).toContain('Efekt: yok');
  });
});

describe('belge dili', () => {
  /* Etiketler ARAYÜZ dilinden değil BELGE dilinden: Eurimages dosyası
     İngilizce çıkıyor, kullanıcı Auteur'ü Türkçe kurmuş olsa bile. */
  it('İngilizce şablonda etiketler İngilizce', () => {
    const satirlar = taslakUret('kunye', { ...girdi(), dil: 'en' })!;
    expect(satirlar.some((s) => s.startsWith('Written by: '))).toBe(true);
    expect(satirlar.some((s) => s.startsWith('Total pages: '))).toBe(true);
    expect(satirlar.some((s) => s.startsWith('Yazan'))).toBe(false);
  });
});
