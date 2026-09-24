import { describe, expect, it } from 'vitest';
import { senaryoyuCozumle, enUzunYokluk } from '@storyboard/core/model/analiz';
import { breakdownEkiDuzelt, BOS_BREAKDOWN_EKI } from '@storyboard/core/model/breakdown';
import { katmanCoz, hikayeSirasiCoz } from '@storyboard/core/model/zaman-katmani';
import type { ScriptBlock, ScriptBlockType } from '@storyboard/core/model/script';

/**
 * Analiz motorunun YENİ ölçüleri (F-analiz).
 *
 * Motor saf: burada ProseMirror, Yjs ve React yok — girdi blok dizisi,
 * çıktı sayı. Testler sayının KENDİSİNİ doğruluyor, "bir şey döndü" değil.
 */

let sayac = 0;
function blok(type: ScriptBlockType, text: string, sceneId: string): ScriptBlock {
  sayac++;
  return { id: 'b' + sayac, fp: 'f' + sayac, type, text, scene: '', sceneId };
}

/** Kısa yazım: sahne başlığı + gövde blokları tek çağrıda. */
function sahne(no: number, baslik: string, govde: [ScriptBlockType, string][]): ScriptBlock[] {
  const sid = 's' + no;
  return [blok('scene', baslik, sid), ...govde.map(([t, m]) => blok(t, m, sid))];
}

const SENARYO: ScriptBlock[] = [
  ...sahne(1, 'İÇ. MUTFAK - GÜN', [
    ['action', 'Demir masaya oturur.'],
    ['character', 'DEMİR'], ['dialogue', 'Bugün gitmiyorum.'],
    ['character', 'NALAN'], ['dialogue', 'Neden peki bu sefer de kalıyorsun burada.'],
  ]),
  ...sahne(2, 'DIŞ. İSKELE - GECE', [
    ['character', 'DEMİR'], ['dialogue', 'Geç oldu.'],
    ['character', 'NALAN'], ['dialogue', 'Biliyorum.'],
  ]),
  ...sahne(3, 'DIŞ. İSKELE - GECE', [
    ['action', 'Dalgalar.'],
    ['character', 'HAKKI'], ['dialogue', 'Kimse yok.'],
  ]),
  ...sahne(4, 'İÇ. MUTFAK - GÜN', [
    ['character', 'NALAN'], ['dialogue', 'Sabah oldu.'],
  ]),
];

describe('mekân ekonomisi', () => {
  it('aynı mekân TEK satırda toplanıyor, kaç kez ve ne kadar yer ayrı', () => {
    const a = senaryoyuCozumle(SENARYO);
    const mutfak = a.mekanlar.find((m) => m.yer === 'MUTFAK')!;
    const iskele = a.mekanlar.find((m) => m.yer === 'İSKELE')!;
    expect(mutfak.sahneSayisi).toBe(2);
    expect(iskele.sahneSayisi).toBe(2);
    expect(mutfak.sahneler).toEqual([0, 3]);
    expect(iskele.sahneler).toEqual([1, 2]);
  });

  it('paylar toplamı 1 — hiçbir sahne mekânsız kalmıyor', () => {
    const a = senaryoyuCozumle(SENARYO);
    const toplam = a.mekanlar.reduce((t, m) => t + m.pay, 0);
    expect(toplam).toBeCloseTo(1, 9);
  });

  it('başlıksız sahne KAYBOLMUYOR — boş yer adıyla sayılıyor', () => {
    const bloklar = [...SENARYO, blok('action', 'Kapı çarpar.', 's5')];
    const a = senaryoyuCozumle(bloklar);
    const bos = a.mekanlar.find((m) => m.yer === '');
    expect(bos, 'başlıksız sahne mekân dökümünden düşmemeli').toBeDefined();
    expect(bos!.sahneSayisi).toBe(1);
    expect(a.mekanlar.reduce((t, m) => t + m.sahneSayisi, 0)).toBe(a.sahneler.length);
  });

  it('sıra AĞIRLIĞA göre — eşitlikte ada göre, yani kararlı', () => {
    const a = senaryoyuCozumle(SENARYO);
    const kelimeler = a.mekanlar.map((m) => m.kelime);
    expect([...kelimeler].sort((x, y) => y - x)).toEqual(kelimeler);
  });
});

describe('günün saati ve gece kümeleri', () => {
  it('zaman başlıktan okunuyor', () => {
    const a = senaryoyuCozumle(SENARYO);
    expect(a.zamanDagilimi.gunduz).toBe(2);
    expect(a.zamanDagilimi.gece).toBe(2);
    expect(a.zamanDagilimi.bilinmiyor).toBe(0);
  });

  it('GÜNDÜZ, SABAH, AKŞAMÜSTÜ gibi yaygın yazımlar da okunuyor', () => {
    /* ÖLÇÜLDÜ: ayrıştırıcı yalnız YAZDIĞIMIZ dört terime bakıyordu; 'GÜNDÜZ'
       yazan başlığın zamanı sessizce kayboluyor ve dahası metin mekân adına
       yapışıp aynı mekânı ikiye bölüyordu. */
    const a = senaryoyuCozumle([
      ...sahne(1, 'DIŞ. İSKELE - GÜNDÜZ', [['action', 'a']]),
      ...sahne(2, 'DIŞ. İSKELE - GECE', [['action', 'b']]),
      ...sahne(3, 'İÇ. EV - SABAH', [['action', 'c']]),
      ...sahne(4, 'İÇ. EV - AKŞAMÜSTÜ', [['action', 'd']]),
    ]);
    expect(a.zamanDagilimi.gunduz).toBe(1);
    expect(a.zamanDagilimi.gece).toBe(1);
    expect(a.zamanDagilimi.safak).toBe(1);
    expect(a.zamanDagilimi.aksam).toBe(1);
    expect(a.zamanDagilimi.bilinmiyor).toBe(0);
    /* Aynı iskele TEK mekân — zaman adı yere yapışmıyor. */
    expect(a.mekanlar.find((m) => m.yer === 'İSKELE')!.sahneSayisi).toBe(2);
  });

  it('zaman yazılmamışsa BİLİNMİYOR — gündüze sayılmıyor', () => {
    const a = senaryoyuCozumle(sahne(1, 'İÇ. MUTFAK', [['action', 'Sessizlik.']]));
    expect(a.zamanDagilimi.bilinmiyor).toBe(1);
    expect(a.zamanDagilimi.gunduz).toBe(0);
  });

  it('ardışık gece sahneleri TEK küme sayılıyor', () => {
    const a = senaryoyuCozumle(SENARYO);
    /* Sahne 2 ve 3 ardışık gece → bir küme. */
    expect(a.geceKumeleri).toBe(1);
  });

  it('dağınık gece sahneleri AYRI kümeler', () => {
    const bloklar = [
      ...sahne(1, 'DIŞ. YOL - GECE', [['action', 'a']]),
      ...sahne(2, 'İÇ. EV - GÜN', [['action', 'b']]),
      ...sahne(3, 'DIŞ. YOL - GECE', [['action', 'c']]),
    ];
    expect(senaryoyuCozumle(bloklar).geceKumeleri).toBe(2);
  });
});

describe('kim kiminle', () => {
  it('aynı sahnede KONUŞAN çiftler sayılıyor', () => {
    const a = senaryoyuCozumle(SENARYO);
    const dn = a.ciftler.find((c) => c.a === 'DEMİR' && c.b === 'NALAN')!;
    expect(dn.ortak).toBe(2);
    expect(dn.sahneler).toEqual([0, 1]);
  });

  it('hiç karşılaşmayan çift bulunuyor', () => {
    const a = senaryoyuCozumle(SENARYO);
    const eslesen = a.hicKarsilasmayan.map((c) => c.join('–'));
    expect(eslesen).toContain('DEMİR–HAKKI');
    expect(eslesen).toContain('HAKKI–NALAN');
    expect(eslesen).not.toContain('DEMİR–NALAN');
  });

  it('çift + hiç karşılaşmayan = bütün olası çiftler', () => {
    const a = senaryoyuCozumle(SENARYO);
    const n = a.karakterler.length;
    expect(a.ciftler.length + a.hicKarsilasmayan.length).toBe((n * (n - 1)) / 2);
  });

  it('tek karakterli sahne çift üretmiyor', () => {
    const a = senaryoyuCozumle(sahne(1, 'İÇ. EV - GÜN', [
      ['character', 'DEMİR'], ['dialogue', 'Yalnızım.'],
    ]));
    expect(a.ciftler).toEqual([]);
    expect(a.hicKarsilasmayan).toEqual([]);
  });
});

describe('replik uzunluğu', () => {
  it('MEDYAN — tek uzun tirat ölçüyü yukarı çekmiyor', () => {
    const a = senaryoyuCozumle(sahne(1, 'İÇ. EV - GÜN', [
      ['character', 'DEMİR'], ['dialogue', 'Evet.'],
      ['character', 'DEMİR'], ['dialogue', 'Hayır.'],
      ['character', 'DEMİR'], ['dialogue', 'bir iki üç dört beş altı yedi sekiz dokuz on'],
    ]));
    const d = a.karakterler.find((k) => k.ad === 'DEMİR')!;
    expect(d.replikMedyan).toBe(1);
    /* Ortalama 4 olurdu — medyan olduğunu kanıtlayan sayı budur. */
    expect(d.kelime / d.replik).toBeCloseTo(4, 9);
  });

  it('çift sayıda replikte iki ortancanın ortalaması', () => {
    const a = senaryoyuCozumle(sahne(1, 'İÇ. EV - GÜN', [
      ['character', 'X'], ['dialogue', 'bir'],
      ['character', 'X'], ['dialogue', 'bir iki'],
      ['character', 'X'], ['dialogue', 'bir iki üç'],
      ['character', 'X'], ['dialogue', 'bir iki üç dört'],
    ]));
    expect(a.karakterler[0].replikMedyan).toBe(2.5);
  });

  it('replik payları toplamı 1', () => {
    const a = senaryoyuCozumle(SENARYO);
    expect(a.karakterler.reduce((t, k) => t + k.replikPayi, 0)).toBeCloseTo(1, 9);
  });
});

describe('zaman katmanı', () => {
  it('etiketlenmemiş senaryo tümüyle ŞİMDİ', () => {
    const a = senaryoyuCozumle(SENARYO);
    expect(a.katmanDagilimi.simdi).toBe(4);
    expect(a.katmanDagilimi.geri).toBe(0);
    expect(a.sahneler.every((s) => s.katman === 'simdi')).toBe(true);
  });

  it('etiket sahneye iniyor ve dağılıma yansıyor', () => {
    const a = senaryoyuCozumle(SENARYO, { katmanlar: { s2: 'geri', s3: 'geri' } });
    expect(a.katmanDagilimi.geri).toBe(2);
    expect(a.katmanDagilimi.simdi).toBe(2);
    expect(a.sahneler[1].katman).toBe('geri');
  });

  it('hikâye sırası verilmemişse null, verilmişse sahneye iniyor', () => {
    const a = senaryoyuCozumle(SENARYO, { hikayeSiralari: { s2: 0 } });
    expect(a.sahneler[1].hikayeSirasi).toBe(0);
    expect(a.sahneler[0].hikayeSirasi).toBeNull();
  });

  it('tanınmayan etiket VARSAYILANA düşüyor, fırlatmıyor', () => {
    expect(katmanCoz('uzay')).toBe('simdi');
    expect(katmanCoz(42)).toBe('simdi');
    expect(katmanCoz(undefined)).toBe('simdi');
    expect(katmanCoz('geri')).toBe('geri');
  });

  it('hikâye sırasında SIFIR geçerli bir cevap, boşluk değil', () => {
    expect(hikayeSirasiCoz(0)).toBe(0);
    expect(hikayeSirasiCoz(NaN)).toBeNull();
    expect(hikayeSirasiCoz('3')).toBeNull();
  });
});

describe('breakdown eki katmanı taşıyor', () => {
  it('boş ek varsayılan katmanı taşıyor', () => {
    expect(BOS_BREAKDOWN_EKI.zamanKatmani).toBe('simdi');
    expect(BOS_BREAKDOWN_EKI.hikayeSirasi).toBeNull();
  });

  it('bozuk değer belgeyi açılmaz yapmıyor', () => {
    const e = breakdownEkiDuzelt({ zamanKatmani: { kotu: true }, hikayeSirasi: 'x' });
    expect(e.zamanKatmani).toBe('simdi');
    expect(e.hikayeSirasi).toBeNull();
  });

  it('geçerli değer korunuyor', () => {
    const e = breakdownEkiDuzelt({ zamanKatmani: 'hayal', hikayeSirasi: 7 });
    expect(e.zamanKatmani).toBe('hayal');
    expect(e.hikayeSirasi).toBe(7);
  });
});

describe('boş senaryo çökmüyor', () => {
  it('hiçbir ölçü NaN üretmiyor', () => {
    const a = senaryoyuCozumle([]);
    expect(a.sahneler).toEqual([]);
    expect(a.mekanlar).toEqual([]);
    expect(a.ciftler).toEqual([]);
    expect(a.hicKarsilasmayan).toEqual([]);
    expect(a.geceKumeleri).toBe(0);
    expect(a.katmanDagilimi.simdi).toBe(0);
    expect(Object.values(a.zamanDagilimi).every((v) => v === 0)).toBe(true);
  });

  it('hiç konuşmayan karakterde yokluk sıfır', () => {
    expect(enUzunYokluk({
      ad: 'X', replik: 0, kelime: 0, sahneler: [], ilkSahne: 0, sonSahne: 0,
      replikMedyan: 0, replikPayi: 0,
    })).toBe(0);
  });
});
