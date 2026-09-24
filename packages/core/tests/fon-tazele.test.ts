import { describe, expect, it } from 'vitest';
import { fonBloklariKur } from '@storyboard/core/fon/kur';
import { fonTazele } from '@storyboard/core/fon/tazele';
import { fonSablonu } from '@storyboard/core/fon/sablon';
import type { TuretmeGirdisi } from '@storyboard/core/fon/turet';
import { senaryoyuCozumle } from '@storyboard/core/model/analiz';
import { yapiIstatistigiCikar } from '@storyboard/core/model/yapi';
import { DOKUMAN_TIPLERI } from '@storyboard/core/model/dokuman-tipi';
import { tipProfili } from '@storyboard/core/format/profil';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * FON DOSYASINI SENARYODAN TAZELEME.
 *
 * Bu özelliğin tek gerçek riski elle yazılan metni ezmek: sinopsis ve
 * yönetmen görüşü haftalarca yazılıyor ve "güncelle" düğmesi onları
 * silerse kullanıcı bir daha o düğmeye dokunmaz. Testin ağırlığı bu yüzden
 * "elle yazılan duruyor mu" tarafında.
 */

const SABLON = fonSablonu('sgm-senaryo')!;
const TIP_KAYNAK = DOKUMAN_TIPLERI.senaryo;
const TIP_FON = DOKUMAN_TIPLERI['fon-dosyasi'];
const PROFIL_KAYNAK = tipProfili(TIP_KAYNAK.id, 'letter', 'tr');
const PROFIL_FON = tipProfili(TIP_FON.id, 'letter', 'tr');

let sayac = 0;
const b = (tip: ScriptBlock['type'], text: string, sceneId = 'sc1'): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `fp-${sayac}`, type: tip, text, scene: '', sceneId });

const ILK: ScriptBlock[] = [
  b('scene', 'İÇ. MUTFAK - GECE', 'sc1'),
  b('action', 'Ayşe masaya oturur.', 'sc1'),
];

/** Senaryoya ikinci bir sahne eklenmiş hâli — tazelemenin görmesi gereken. */
const SONRA: ScriptBlock[] = [
  ...ILK,
  b('scene', 'DIŞ. SOKAK - GÜN', 'sc2'),
  b('action', 'Yağmur başlar.', 'sc2'),
];

function girdi(bloklar: ScriptBlock[]): TuretmeGirdisi {
  return {
    bloklar,
    analiz: senaryoyuCozumle(bloklar, { dil: 'tr' }),
    yapi: yapiIstatistigiCikar(bloklar, TIP_KAYNAK, PROFIL_KAYNAK),
    tip: TIP_KAYNAK,
    baslikSayfasi: { baslik: 'Bavul', yazar: 'Alp Cavas' },
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

function kimlikUretici(onek: string) {
  let n = 0;
  return () => `${onek}${n++}`;
}

/** Kurulmuş fon belgesi + kullanıcının elle yazdığı sinopsis. */
function belge(): ScriptBlock[] {
  const bloklar = fonBloklariKur(SABLON, girdi(ILK), kimlikUretici('k'));
  const i = bloklar.findIndex((x) => x.type === 'bolum' && x.text === 'Sinopsis');
  const elle = b('paragraf', 'Bavul, bir kadının evden çıkışının hikâyesidir.');
  return [...bloklar.slice(0, i + 1), elle, ...bloklar.slice(i + 1)];
}

/** Bir bölümün başlığından sonraki gövde satırları. */
function govde(bloklar: readonly ScriptBlock[], baslik: string): string[] {
  const i = bloklar.findIndex((x) => x.type === 'bolum' && x.text === baslik);
  const cikti: string[] = [];
  for (let j = i + 1; j < bloklar.length && bloklar[j].type !== 'bolum'; j++) {
    cikti.push(bloklar[j].text);
  }
  return cikti;
}

describe('tazeleme', () => {
  const once = belge();
  const sonuc = fonTazele(SABLON, once, girdi(SONRA), TIP_FON, PROFIL_FON, kimlikUretici('y'));

  /* EN ÖNEMLİ SÖZ. Elle yazılan bölüm HİÇ değişmiyor — metni de, blok
     kimliği de. Kimlik korunmasaydı kullanıcının yer imleri ve revizyon
     izleri kopardı. */
  it('elle yazılan sinopsis olduğu gibi duruyor', () => {
    expect(govde(sonuc.bloklar, 'Sinopsis')).toEqual([
      'Bavul, bir kadının evden çıkışının hikâyesidir.',
    ]);
    const oncekiBlok = once.find((x) => x.text.startsWith('Bavul, bir kadının'))!;
    const sonrakiBlok = sonuc.bloklar.find((x) => x.text.startsWith('Bavul, bir kadının'))!;
    expect(sonrakiBlok.id).toBe(oncekiBlok.id);
  });

  it('türetilen tretman yeni sahneyi alıyor', () => {
    const yeni = govde(sonuc.bloklar, 'Tretman').join('\n');
    expect(govde(once, 'Tretman').join('\n')).not.toContain('SOKAK');
    expect(yeni).toContain('SOKAK');
    expect(yeni).toContain('MUTFAK');
  });

  /* Bölüm BAŞLIKLARI çapadır: kullanıcı oraya yer imi koyuyor, panele
     bağlıyor, revizyonda izliyor. Tazeleme başlığın kimliğine dokunmuyor. */
  it('bölüm başlıklarının kimliği korunuyor', () => {
    const kimlik = (l: readonly ScriptBlock[]) =>
      l.filter((x) => x.type === 'bolum').map((x) => x.id);
    expect(kimlik(sonuc.bloklar)).toEqual(kimlik(once));
  });

  it('şablonun bölüm sırası bozulmuyor', () => {
    const ad = (l: readonly ScriptBlock[]) =>
      l.filter((x) => x.type === 'bolum').map((x) => x.text);
    expect(ad(sonuc.bloklar)).toEqual(ad(once));
  });

  /* NE YENİLENDİĞİ SAYILIYOR: arayüz bunu kullanıcıya gösteriyor.
     "Tazelendi" deyip hiçbir şey değiştirmemiş olmak sessiz
     başarısızlığın kibar hâli. */
  it('yenilenen bölümler adıyla raporlanıyor ve elle bölüm listede yok', () => {
    expect(sonuc.yenilenen).toContain('Tretman');
    expect(sonuc.yenilenen).not.toContain('Sinopsis');
  });

  /* Parmak izleri belge sırasında tek sayaçla üretiliyor; tekrar eden bir
     `fp`, `reconcileScript`i yanlış çapaya bağlar. */
  it('parmak izleri tekil', () => {
    const fps = sonuc.bloklar.map((x) => x.fp);
    expect(new Set(fps).size).toBe(fps.length);
  });
});

describe('silinmiş bölüm', () => {
  /* Kullanıcı bir bölümü sildiyse bu bir KARARDIR. Tazeleme onu geri
     getirseydi silme işlemi hiçbir zaman kalıcı olmazdı. */
  it('geri eklenmiyor, ama sessiz de kalınmıyor', () => {
    const once = belge().filter((x) => !(x.type === 'bolum' && x.text === 'Tretman'));
    const sonuc = fonTazele(SABLON, once, girdi(SONRA), TIP_FON, PROFIL_FON, kimlikUretici('y'));
    expect(sonuc.bloklar.some((x) => x.type === 'bolum' && x.text === 'Tretman')).toBe(false);
    expect(sonuc.bulunamayan).toContain('Tretman');
    expect(sonuc.yenilenen).not.toContain('Tretman');
  });
});

describe('çok dilli ek', () => {
  /* ÇEVİRİ BÖLÜMÜ BOŞ KALIYOR: SGM ortak yapımda tretman "özgün dil" ve
     "Türkçe" olarak İKİ bölüm açıyor ve taslak yalnız özgün dilde
     yazılıyor. Tazeleme çeviri bölümüne özgün dildeki metni yazsaydı,
     kuruma "tercüme" diye denetlenmemiş bir kopya giderdi. */
  it('çeviri bölümü tazelemede de boş kalıyor', () => {
    const ortak = fonSablonu('sgm-ortak-yapim')!;
    const once = fonBloklariKur(ortak, girdi(ILK), kimlikUretici('k'));
    const sonuc = fonTazele(ortak, once, girdi(SONRA), TIP_FON, PROFIL_FON, kimlikUretici('y'));
    expect(sonuc.yenilenen).toContain('Tretman ve Türkçe tercümesi — özgün dil');
    expect(sonuc.yenilenen).not.toContain('Tretman ve Türkçe tercümesi — Türkçe');
    expect(govde(sonuc.bloklar, 'Tretman ve Türkçe tercümesi — Türkçe')).toEqual([]);
    expect(govde(sonuc.bloklar, 'Tretman ve Türkçe tercümesi — özgün dil').join(' ')).toContain('SOKAK');
  });
});

describe('tekrarlanan tazeleme', () => {
  /* İkinci tazeleme, aynı senaryodan tekrar çalıştırıldığında gövdeyi
     BÜYÜTMEMELİ. Eski gövde atlanmasaydı her tıklama tretmanı bir kat
     daha uzatırdı — kullanıcının fark etmesi günler sürecek bir hata. */
  it('gövdeyi çoğaltmıyor', () => {
    const bir = fonTazele(SABLON, belge(), girdi(SONRA), TIP_FON, PROFIL_FON, kimlikUretici('y'));
    const iki = fonTazele(SABLON, bir.bloklar, girdi(SONRA), TIP_FON, PROFIL_FON, kimlikUretici('z'));
    expect(govde(iki.bloklar, 'Tretman')).toEqual(govde(bir.bloklar, 'Tretman'));
    expect(iki.bloklar.length).toBe(bir.bloklar.length);
  });
});
