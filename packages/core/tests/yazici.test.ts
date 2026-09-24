import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  CIPA_ARALIK_MS,
  CIPA_EN_KISA_MS,
  CIPA_EN_UZUN_MS,
  GunlukYazici,
  cipaAraligiKisitla,
  type YaziciKabugu,
} from '@storyboard/core/veri/yazici';
import { gunlukBasligi, gunlukCozumle } from '@storyboard/core/veri/gunluk';
import { durumOzdes, kurtar } from '@storyboard/core/veri/kurtarma';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import type { YazarlikKaydi } from '@storyboard/core/veri/yazarlik';

/** Diski taklit eden kabuk; günlüğü bellekte biriktirir. */
function sahteKabuk() {
  const durum = {
    gunluk: [...gunlukBasligi()] as number[],
    cipalar: [] as Uint8Array[],
    kesmeSayisi: 0,
    ekleHatasi: null as string | null,
    cipaHatasi: null as string | null,
    yazarlikHatasi: null as string | null,
    yazarlikKayitlari: [] as YazarlikKaydi[],
  };
  const kabuk: YaziciKabugu = {
    async gunlugeEkle(cerceveler) {
      if (durum.ekleHatasi) throw new Error(durum.ekleHatasi);
      durum.gunluk.push(...cerceveler);
    },
    async cipaYazVeGunlugeKes(cipa) {
      if (durum.cipaHatasi) throw new Error(durum.cipaHatasi);
      durum.cipalar.push(cipa);
      durum.gunluk = [...gunlukBasligi()];
      durum.kesmeSayisi++;
    },
    async yazarlikEkle(kayitlar) {
      if (durum.yazarlikHatasi) throw new Error(durum.yazarlikHatasi);
      durum.yazarlikKayitlari.push(...kayitlar);
    },
  };
  return { kabuk, durum, baytlar: () => new Uint8Array(durum.gunluk) };
}

function proje(): Y.Doc {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  return doc;
}

let zaman = 1_700_000_000_000;
const simdi = () => (zaman += 100);

beforeEach(() => {
  vi.useFakeTimers();
  zaman = 1_700_000_000_000;
});
afterEach(() => vi.useRealTimers());

describe('§15.2 — yazdıkların bir saniye içinde günlüğe işleniyor', () => {
  it('düzenleme bir saniye içinde diske düşer', async () => {
    const doc = proje();
    const { kabuk, baytlar } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi });
    yazici.baslat();

    doc.getMap('meta').set('title', 'yeni');
    expect(gunlukCozumle(baytlar()).guncellemeler).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(gunlukCozumle(baytlar()).guncellemeler.length).toBeGreaterThan(0);
    expect(yazici.durum().bekleyen).toBe(0);
    yazici.durdur();
  });

  it('aynı turdaki birden çok düzenleme TEK yazımda gider', async () => {
    const doc = proje();
    const { kabuk, durum } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi });
    const ekleme = vi.spyOn(kabuk, 'gunlugeEkle');
    yazici.baslat();

    doc.getMap('meta').set('a', 1);
    doc.getMap('meta').set('b', 2);
    doc.getMap('meta').set('c', 3);
    await vi.advanceTimersByTimeAsync(1000);

    expect(ekleme).toHaveBeenCalledTimes(1);
    expect(durum.gunluk.length).toBeGreaterThan(gunlukBasligi().length);
    yazici.durdur();
  });

  it('günlüğe yazılanlar durumu birebir geri getiriyor', async () => {
    const doc = new Y.Doc();
    const { kabuk, baytlar } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi });
    yazici.baslat();

    loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
    doc.getMap('meta').set('title', 'çökmeden önce');
    await vi.advanceTimersByTimeAsync(1000);

    expect(durumOzdes(kurtar(null, baytlar()).doc, doc)).toBe(true);
    yazici.durdur();
  });

  it('durdurulan yazıcı artık yazmaz', async () => {
    const doc = proje();
    const { kabuk, baytlar } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi });
    yazici.baslat();
    await vi.advanceTimersByTimeAsync(1000);
    const once = gunlukCozumle(baytlar()).guncellemeler.length;

    yazici.durdur();
    doc.getMap('meta').set('title', 'sonra');
    await vi.advanceTimersByTimeAsync(5000);
    expect(gunlukCozumle(baytlar()).guncellemeler).toHaveLength(once);
  });
});

describe('§15.5 — disk hatası SESSİZ geçmiyor', () => {
  it('ilk hata bildirilir, ARKA ARKAYA ikinci hata engelleyici şerit açar', async () => {
    const doc = proje();
    const { kabuk, durum } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi });
    yazici.baslat();
    durum.ekleHatasi = 'ENOSPC: disk dolu';

    doc.getMap('meta').set('a', 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(yazici.durum().ardArdaHata).toBe(1);
    expect(yazici.durum().sonHata).toContain('disk dolu');
    // İlk hata henüz engelleyici değil — bildirim yeter (§15.4).
    expect(yazici.durum().engelleyici).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(yazici.durum().ardArdaHata).toBe(2);
    expect(yazici.durum().engelleyici).toBe(true);
    yazici.durdur();
  });

  /* Kritik: hata geçici olabilir (ağ sürücüsü, kilit, anlık dolu disk).
     Çerçeveler düşürülseydi kullanıcının o saniyedeki yazısı sessizce yok
     olurdu — §15'in yasakladığı tam olarak bu. */
  it('başarısız yazımda çerçeveler KAYBOLMAZ, sonraki turda gider', async () => {
    const doc = new Y.Doc();
    const { kabuk, durum, baytlar } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi });
    yazici.baslat();

    durum.ekleHatasi = 'ENOSPC';
    loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
    doc.getMap('meta').set('title', 'kaybolmamalı');
    await vi.advanceTimersByTimeAsync(2000);
    expect(gunlukCozumle(baytlar()).guncellemeler).toHaveLength(0);
    expect(yazici.durum().bekleyen).toBeGreaterThan(0);

    durum.ekleHatasi = null;
    await vi.advanceTimersByTimeAsync(1000);
    expect(yazici.durum().bekleyen).toBe(0);
    expect(durumOzdes(kurtar(null, baytlar()).doc, doc)).toBe(true);
    yazici.durdur();
  });

  it('başarılı yazım arka arkaya sayacını ve şeridi sıfırlar', async () => {
    const doc = proje();
    const { kabuk, durum } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi });
    yazici.baslat();

    durum.ekleHatasi = 'ENOSPC';
    doc.getMap('meta').set('a', 1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(yazici.durum().engelleyici).toBe(true);

    durum.ekleHatasi = null;
    await vi.advanceTimersByTimeAsync(1000);
    expect(yazici.durum().ardArdaHata).toBe(0);
    expect(yazici.durum().engelleyici).toBe(false);
    expect(yazici.durum().sonHata).toBeNull();
    yazici.durdur();
  });

  it('durum değişimi abonelere bildirilir', async () => {
    const doc = proje();
    const { kabuk } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi });
    const gorulen: number[] = [];
    const birak = yazici.onDurum((d) => gorulen.push(d.bekleyen));
    yazici.baslat();

    doc.getMap('meta').set('a', 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(gorulen.length).toBeGreaterThan(1);
    expect(gorulen.at(-1)).toBe(0);
    birak();
    yazici.durdur();
  });
});

describe('§15.2 — çıpa ve günlük kesme', () => {
  it('çıpa aralığında çıpa yazılır ve günlük kesilir', async () => {
    const doc = proje();
    const { kabuk, durum, baytlar } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi, cipaMs: CIPA_EN_KISA_MS });
    yazici.baslat();

    doc.getMap('meta').set('a', 1);
    await vi.advanceTimersByTimeAsync(CIPA_EN_KISA_MS);
    expect(durum.cipalar).toHaveLength(1);
    expect(durum.kesmeSayisi).toBe(1);
    expect(gunlukCozumle(baytlar()).guncellemeler).toHaveLength(0);

    // Çıpa tek başına durumu taşıyor.
    expect(durumOzdes(kurtar(durum.cipalar[0], baytlar()).doc, doc)).toBe(true);
    yazici.durdur();
  });

  /* Sıra sözleşmesi: bekleyen çerçeveler yazılamadıysa günlük KESİLMEZ.
     Kesilseydi, çıpa da yazılamadığı için o aralıktaki iş tamamen giderdi. */
  it('günlük yazılamıyorsa çıpa alınmaz ve günlük KESİLMEZ', async () => {
    const doc = proje();
    const { kabuk, durum } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi, cipaMs: CIPA_EN_KISA_MS });
    yazici.baslat();

    durum.ekleHatasi = 'ENOSPC';
    doc.getMap('meta').set('a', 1);
    await vi.advanceTimersByTimeAsync(CIPA_EN_KISA_MS);

    expect(durum.cipalar).toHaveLength(0);
    expect(durum.kesmeSayisi).toBe(0);
    expect(yazici.durum().bekleyen).toBeGreaterThan(0);
    yazici.durdur();
  });

  it('çıpa yazımı başarısız olursa da şerit tırmanır', async () => {
    const doc = proje();
    const { kabuk, durum } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi, cipaMs: CIPA_EN_KISA_MS });
    yazici.baslat();
    durum.cipaHatasi = 'izin reddedildi';

    await vi.advanceTimersByTimeAsync(CIPA_EN_KISA_MS);
    expect(yazici.durum().ardArdaHata).toBe(1);
    expect(yazici.durum().engelleyici).toBe(false);
    await vi.advanceTimersByTimeAsync(CIPA_EN_KISA_MS);
    expect(yazici.durum().engelleyici).toBe(true);
    yazici.durdur();
  });
});

describe('§15.2.1 — çıpa aralığı ayarlanabilir ama KAPATILAMAZ', () => {
  it('sınırların dışındaki değerler kırpılır', () => {
    expect(cipaAraligiKisitla(0)).toBe(CIPA_EN_KISA_MS);
    expect(cipaAraligiKisitla(-5)).toBe(CIPA_EN_KISA_MS);
    expect(cipaAraligiKisitla(Number.POSITIVE_INFINITY)).toBe(CIPA_ARALIK_MS);
    expect(cipaAraligiKisitla(Number.NaN)).toBe(CIPA_ARALIK_MS);
    expect(cipaAraligiKisitla(999 * 60_000)).toBe(CIPA_EN_UZUN_MS);
  });

  it('geçerli aralık olduğu gibi kalır', () => {
    expect(cipaAraligiKisitla(CIPA_ARALIK_MS)).toBe(CIPA_ARALIK_MS);
    expect(cipaAraligiKisitla(10 * 60_000)).toBe(10 * 60_000);
  });
});

describe('§15.4 — ASILI kalan yazım sessiz geçmiyor', () => {
  /** Ne çözülen ne reddedilen bir kabuk: ağ sürücüsü uykuya dalmış gibi. */
  function asiliKabuk(): { kabuk: YaziciKabugu } {
    return {
      kabuk: {
        gunlugeEkle: () => new Promise<void>(() => {}),
        cipaYazVeGunlugeKes: () => new Promise<void>(() => {}),
      },
    };
  }

  it('zaman aşımı hataya dönüyor — sayaç artıyor, şerit açılıyor', async () => {
    const doc = proje();
    const yazici = new GunlukYazici(doc, asiliKabuk().kabuk, { simdi, zamanAsimiMs: 5000 });
    yazici.baslat();
    doc.getMap('meta').set('title', 'yazıldı');

    await vi.advanceTimersByTimeAsync(1000);   // boşaltma başlar, asılı kalır
    await vi.advanceTimersByTimeAsync(6000);   // zaman aşımı
    expect(yazici.durum().ardArdaHata).toBeGreaterThan(0);
    expect(yazici.durum().sonHata).toMatch(/yanıt vermedi/);

    // İkinci hata engelleyici şeridi açar (§15.4).
    doc.getMap('meta').set('title', 'yine');
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(6000);
    expect(yazici.durum().engelleyici).toBe(true);
    yazici.durdur();
  });

  /* En pahalı yalan: disk yazılamazken arayüzün "günlüğe işlendi 14:32"
     demeye devam etmesi. Kullanıcı korunduğunu sanar. */
  it('asılı yazımda `sonYazim` GÜNCELLENMİYOR', async () => {
    const doc = proje();
    const yazici = new GunlukYazici(doc, asiliKabuk().kabuk, { simdi, zamanAsimiMs: 5000 });
    yazici.baslat();
    doc.getMap('meta').set('title', 'x');
    await vi.advanceTimersByTimeAsync(7000);
    expect(yazici.durum().sonYazim).toBeNull();
    yazici.durdur();
  });

  /* Asılı kalan çağrı `yaziyor` bayrağını kilitleseydi sonraki her boşaltma
     sessizce erken dönerdi ve çıpa da hiç atılmazdı. */
  it('kilit çözülüyor — sonraki boşaltma çalışabiliyor', async () => {
    const doc = proje();
    let asili = true;
    const kabuk: YaziciKabugu = {
      gunlugeEkle: () => (asili ? new Promise<void>(() => {}) : Promise.resolve()),
      async cipaYazVeGunlugeKes() {},
    };
    const yazici = new GunlukYazici(doc, kabuk, { simdi, zamanAsimiMs: 5000 });
    yazici.baslat();
    doc.getMap('meta').set('title', 'x');
    await vi.advanceTimersByTimeAsync(7000);
    expect(yazici.durum().ardArdaHata).toBe(1);

    /* Bu sırada İKİNCİ bir boşaltma da asılı; kilidin çözülmesi için onun da
       zaman aşımına düşmesi gerekiyor. Sürekli asılı bir diskte davranış
       budur: aralık başına bir zaman aşımı, sessizlik değil. */
    asili = false;
    await vi.advanceTimersByTimeAsync(8000);
    expect(yazici.durum().ardArdaHata).toBe(0);
    expect(yazici.durum().sonYazim).not.toBeNull();
    yazici.durdur();
  });

  it('hata yolunda `sonYazim` DEĞİŞMİYOR — başarılı yazımdan sonra da', async () => {
    const doc = proje();
    const { kabuk, durum } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi });
    yazici.baslat();
    doc.getMap('meta').set('title', 'ilk');
    await vi.advanceTimersByTimeAsync(1000);
    const basariliAn = yazici.durum().sonYazim;
    expect(basariliAn).not.toBeNull();

    durum.ekleHatasi = 'disk dolu';
    doc.getMap('meta').set('title', 'ikinci');
    await vi.advanceTimersByTimeAsync(1000);
    expect(yazici.durum().sonHata).toBe('disk dolu');
    // Arayüz "az önce kaydedildi" yalanını söylemiyor.
    expect(yazici.durum().sonYazim).toBe(basariliAn);
    yazici.durdur();
  });
});

describe('yazarlık — editörden bildirilen bloklar yazıcının döngüsünden türetiliyor', () => {
  it('yazar boşsa (varsayılan) hiçbir kayıt gönderilmez', async () => {
    const doc = proje();
    const { kabuk, durum } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi }); // yazar VERİLMEDİ
    yazici.baslat();

    yazici.blokDokunusuBildir(['sb_1']);
    doc.getMap('meta').set('a', 1);
    await vi.advanceTimersByTimeAsync(1000);

    expect(durum.yazarlikKayitlari).toEqual([]);
    yazici.durdur();
  });

  it('kabuk yazarlikEkle DESTEKLEMİYORSA sessizce atlanır, çöküş olmaz', async () => {
    const doc = proje();
    const kabuk: YaziciKabugu = {
      async gunlugeEkle() {},
      async cipaYazVeGunlugeKes() {},
      // yazarlikEkle YOK.
    };
    const yazici = new GunlukYazici(doc, kabuk, { simdi, yazar: () => 'Ayşe' });
    yazici.baslat();
    yazici.blokDokunusuBildir(['sb_1']);
    doc.getMap('meta').set('a', 1);
    await expect(vi.advanceTimersByTimeAsync(1000)).resolves.not.toThrow();
    yazici.durdur();
  });

  /* Açık kayıt bilerek bellekte tutulur (bir sonraki boşaltmada genişleyebilir
     diye) — kapanışta zorla yazılmazsa son birkaç saniyenin bilgisi kaybolur. */
  it('tek dokunuş, boşaltmadan SONRA hâlâ diske YAZILMAMIŞ — açık kayıt', async () => {
    const doc = proje();
    const { kabuk, durum } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi, yazar: () => 'Ayşe' });
    yazici.baslat();

    yazici.blokDokunusuBildir(['sb_1']);
    doc.getMap('meta').set('a', 1);
    await vi.advanceTimersByTimeAsync(1000);

    expect(durum.yazarlikKayitlari).toEqual([]);
    await yazici.yazarlikZorlaBosalt();
    expect(durum.yazarlikKayitlari).toEqual([{ zaman: expect.any(Number), yazar: 'Ayşe', bloklar: ['sb_1'] }]);
    yazici.durdur();
  });

  it('aynı bloğa ART ARDA dokunuş TEK kayıtta birikir — blok DEĞİŞİNCE öncekini diske yazar', async () => {
    const doc = proje();
    const { kabuk, durum } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi, yazar: () => 'Ayşe' });
    yazici.baslat();

    // Üç ardışık boşaltma, hepsi AYNI bloğa.
    for (let i = 0; i < 3; i++) {
      yazici.blokDokunusuBildir(['sb_1']);
      doc.getMap('meta').set(`k${i}`, i);
      await vi.advanceTimersByTimeAsync(1000);
    }
    // Hâlâ AÇIK — hiçbiri diske gitmedi.
    expect(durum.yazarlikKayitlari).toEqual([]);

    // Farklı bloğa dokunuş: zincir kırılır, sb_1 kaydı KESİNLEŞİR ve gider.
    yazici.blokDokunusuBildir(['sb_2']);
    doc.getMap('meta').set('degisti', 1);
    await vi.advanceTimersByTimeAsync(1000);

    expect(durum.yazarlikKayitlari).toHaveLength(1);
    expect(durum.yazarlikKayitlari[0]).toMatchObject({ yazar: 'Ayşe', bloklar: ['sb_1'] });

    // sb_2 hâlâ açık; zorla boşaltınca o da gelir.
    await yazici.yazarlikZorlaBosalt();
    expect(durum.yazarlikKayitlari).toHaveLength(2);
    expect(durum.yazarlikKayitlari[1]).toMatchObject({ yazar: 'Ayşe', bloklar: ['sb_2'] });
    yazici.durdur();
  });

  it('FARKLI yazar aynı bloğa dokununca da zincir kırılır', async () => {
    const doc = proje();
    const { kabuk, durum } = sahteKabuk();
    let ad = 'Ayşe';
    const yazici = new GunlukYazici(doc, kabuk, { simdi, yazar: () => ad });
    yazici.baslat();

    yazici.blokDokunusuBildir(['sb_1']);
    doc.getMap('meta').set('a', 1);
    await vi.advanceTimersByTimeAsync(1000);

    ad = 'Deniz';
    yazici.blokDokunusuBildir(['sb_1']);
    doc.getMap('meta').set('b', 2);
    await vi.advanceTimersByTimeAsync(1000);

    expect(durum.yazarlikKayitlari).toHaveLength(1);
    expect(durum.yazarlikKayitlari[0]).toMatchObject({ yazar: 'Ayşe', bloklar: ['sb_1'] });
    await yazici.yazarlikZorlaBosalt();
    expect(durum.yazarlikKayitlari[1]).toMatchObject({ yazar: 'Deniz', bloklar: ['sb_1'] });
    yazici.durdur();
  });

  /* Yazarlık best-effort: İÇERİK yazımını bloklamamalı, ardArdaHata sayacını
     (§15.4'ün engelleyici şeridi) tetiklememeli. */
  it('yazarlik yazımı BAŞARISIZ olsa da içerik yazımı ve durum ETKİLENMEZ', async () => {
    const doc = proje();
    const { kabuk, durum, baytlar } = sahteKabuk();
    durum.yazarlikHatasi = 'yazarlik diski dolu';
    const yazici = new GunlukYazici(doc, kabuk, { simdi, yazar: () => 'Ayşe' });
    yazici.baslat();

    yazici.blokDokunusuBildir(['sb_1']);
    doc.getMap('meta').set('a', 1);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(yazici.yazarlikZorlaBosalt()).resolves.not.toThrow();

    expect(gunlukCozumle(baytlar()).guncellemeler.length).toBeGreaterThan(0);
    expect(yazici.durum().ardArdaHata).toBe(0);
    expect(yazici.durum().engelleyici).toBe(false);
    yazici.durdur();
  });

  it('blokDokunusuBildir çağrılmazsa hiç kayıt üretilmez', async () => {
    const doc = proje();
    const { kabuk, durum } = sahteKabuk();
    const yazici = new GunlukYazici(doc, kabuk, { simdi, yazar: () => 'Ayşe' });
    yazici.baslat();

    doc.getMap('meta').set('a', 1);
    await vi.advanceTimersByTimeAsync(1000);
    await yazici.yazarlikZorlaBosalt();

    expect(durum.yazarlikKayitlari).toEqual([]);
    yazici.durdur();
  });
});
