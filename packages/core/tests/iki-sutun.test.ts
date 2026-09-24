import { describe, expect, it } from 'vitest';
import {
  IKI_SUTUN,
  girdiSatirlari,
  sayfalaIkiSutun,
  sesKelimeSayisi,
  sureTahmini,
  type CiftGirdi,
} from '@storyboard/core/format/iki-sutun';
import { IZGARA } from '@storyboard/core/format/izgara';
import { profilOlustur } from '@storyboard/core/format/profil';

const profil = profilOlustur('amerikan', 'letter', 'tr');

/** `n` satır sürecek metin — sütun genişliğini tam dolduran kelimeler. */
const satirlik = (n: number, sutun: number) =>
  Array.from({ length: n }, () => 'x'.repeat(sutun)).join(' ');

/* YERLEŞİM DÜZELTİLDİ: girdiler yan yana eşleşen çiftler değil, tek bir
   dikey akışta sıralanan tek sütunlu girdiler. Referans örnek (kullanıcının
   verdiği senaryonline.com belgesi) satır çifti kurmuyor — bu önceki
   oturumda ölçülmüş ama sapma "spec lehine" çözülmüştü; yanlış karardı.

   Eski yardımcı iki hücre alıyordu; şimdi her girdi TEK metin.
   Eski `cift(id, görüntü, ses)` çağrıları tek sütunlu `olay(id, metin)`a
   çevrildi: testlerin ölçtüğü şey (yükseklik, bölünmezlik, sayfa dağılımı)
   değişmedi, ama artık doğru modeli ölçüyorlar. Diyalog sütunu için ayrı
   testler aşağıda. */
const olay = (id: string, metin: string): CiftGirdi => ({ id, tip: 'action', metin });
const diyalog = (id: string, metin: string): CiftGirdi => ({ id, tip: 'dialogue', metin });
const sahne = (id: string, metin: string): CiftGirdi => ({ id, tip: 'scene', metin });

describe('ızgara bölünmesi — §6.3 ortak, içeriden bölünüyor', () => {
  /* Toplam 60 sütun DEĞİŞMEZ. Eksikse sayfa dar, fazlaysa taşar; iki
     durumda da sayfa sayısı yalancı çıkar. */
  it('sol + oluk + sağ = ızgara sütunu', () => {
    expect(IKI_SUTUN.sol + IKI_SUTUN.oluk + IKI_SUTUN.sag).toBe(IZGARA.sutun);
  });

  it('sütunlar EŞİT — referans örnekten alınan oran', () => {
    expect(IKI_SUTUN.sol).toBe(IKI_SUTUN.sag);
  });

  it('oluk gerçek bir ölçü, sıfır değil — 60 = 28 + 4 + 28', () => {
    expect(IKI_SUTUN.oluk).toBeGreaterThan(0);
    /* İlk üç iddia birlikte bile ÇÖZÜMÜ TEKLEŞTİRMİYORDU: 29/2/29 ya da
       20/20/20 da "toplam 60, sol=sağ, oluk>0" koşullarını sağlar ve
       referans örnekle hiç ilgisi olmayan bir yerleşim üretirdi. Üç sayı
       da çivileniyor — sütun genişliği sarma sınırıdır, yani sayfa sayısı. */
    expect(IKI_SUTUN).toEqual({ sol: 28, oluk: 4, sag: 28 });
  });
});

describe('girdi TEK sütun kaplar — yan yana eşleşme YOK', () => {
  /* YERLEŞİM DÜZELTİLDİ. Eski kural "çiftin yüksekliği uzun hücreden gelir"
     idi ve yan yana eşleşen iki hücre varsayıyordu. Referans örnek böyle
     değil: her girdi tek sütunda durur ve bir sonrakisi öncekinin bittiği
     satırdan başlar. */
  it('olay yalnız SOL sütunu doldurur, sağ boş kalır', () => {
    const satirlar = girdiSatirlari(olay('c1', satirlik(4, IKI_SUTUN.sol)), profil);
    expect(satirlar).toHaveLength(4);
    expect(satirlar.every((x) => x.sol.length > 0)).toBe(true);
    expect(satirlar.every((x) => x.sag === '')).toBe(true);
  });

  it('diyalog yalnız SAĞ sütunu doldurur, sol boş kalır', () => {
    const satirlar = girdiSatirlari(diyalog('c1', satirlik(3, IKI_SUTUN.sag)), profil);
    expect(satirlar).toHaveLength(3);
    expect(satirlar.every((x) => x.sag.length > 0)).toBe(true);
    expect(satirlar.every((x) => x.sol === '')).toBe(true);
  });

  /* KASKAT AKIŞ: bu formatın tanımı. Solda dört satırlık bir olay varsa,
     ardından gelen diyalog BEŞİNCİ satırdan başlar — aynı hizadan değil.
     Satırlar sıralı üretildiği için akış kendiliğinden doğru; bu test onu
     bir daha eşleştirmeye çeviren bir değişikliği yakalar. */
  it('sonraki girdi, öncekinin bittiği satırdan başlıyor', () => {
    const sayfalar = sayfalaIkiSutun(
      [olay('a', satirlik(4, IKI_SUTUN.sol)), diyalog('b', satirlik(2, IKI_SUTUN.sag))],
      profil,
    );
    const satirlar = sayfalar[0].satirlar.filter((x) => x.satirIndex >= 0);
    /* 4 olay + 2 diyalog = 6 satır; ÜST ÜSTE, yan yana değil. */
    expect(satirlar).toHaveLength(6);
    expect(satirlar.slice(0, 4).every((x) => x.sol !== '' && x.sag === '')).toBe(true);
    expect(satirlar.slice(4).every((x) => x.sag !== '' && x.sol === '')).toBe(true);
  });

  it('her satır kendi çift kimliğini taşıyor (F0)', () => {
    const satirlar = girdiSatirlari(olay('c9', 'gör'), profil);
    expect(satirlar.every((s) => s.ciftId === 'c9')).toBe(true);
  });

  it('hücreler kendi sütun genişliğini AŞMIYOR', () => {
    const satirlar = girdiSatirlari(
      olay('c1', satirlik(4, IKI_SUTUN.sol)),
      profil,
    );
    expect(Math.max(...satirlar.map((s) => s.sol.length))).toBeLessThanOrEqual(IKI_SUTUN.sol);
    expect(Math.max(...satirlar.map((s) => s.sag.length))).toBeLessThanOrEqual(IKI_SUTUN.sag);
  });
});

describe('sahne başlığı İKİ SÜTUNA YAYILIR (§6.6 "ortak")', () => {
  it('tüm ızgara genişliğini kullanıyor, sol sütunla sınırlı değil', () => {
    const uzun = satirlik(1, IZGARA.sutun);
    const satirlar = girdiSatirlari(sahne('s1', uzun), profil);
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0].sol.length).toBe(IZGARA.sutun);
    expect(satirlar[0].sol.length).toBeGreaterThan(IKI_SUTUN.sol);
  });

  it('sağ sütun her zaman boş — başlık ses değildir', () => {
    expect(girdiSatirlari(sahne('s1', 'iç. oda - gece'), profil).every((s) => s.sag === '')).toBe(true);
  });

  it('Türkçe büyük harfe çevriliyor', () => {
    expect(girdiSatirlari(sahne('s1', 'iç. ışıklı oda'), profil)[0].sol).toBe('İÇ. IŞIKLI ODA');
    /* NFD girdi de AYNI sonucu vermeli: `ş` iki kod noktasıyken büyük harf
       dönüşümü birleştiriciyi düşürürse başlık sessizce değişir ve satır
       genişliği de ıraksar. Bu yol hiç sınanmamıştı. */
    const nfd = girdiSatirlari(sahne('s1', 'iç. ışıklı oda'.normalize('NFD')), profil);
    expect(nfd.map((s) => s.sol.normalize('NFC'))).toEqual(['İÇ. IŞIKLI ODA']);
    // Emoji ve astral düzlem yarım kesilmiyor.
    expect(girdiSatirlari(sahne('s1', 'iç. 😀 oda'), profil)[0].sol).toBe('İÇ. 😀 ODA');
  });

  /* Boş metinli girdi: kullanıcı yeni bir satır açıp yazmadan bırakınca
     oluşuyor. Hiç satır üretmemek onu belgeden SİLER, ikiden fazla üretmek
     sayfa sayısını yalanlar. */
  it('boş metinli girdi TEK boş satır üretiyor — ne siliniyor ne çoğalıyor', () => {
    const satirlar = girdiSatirlari(olay('bos', ''), profil);
    expect(satirlar).toEqual([{ ciftId: 'bos', tip: 'action', satirIndex: 0, sol: '', sag: '' }]);
  });
});

describe('SATIR ÇİFTİ BÖLÜNMEZ — F1d bitiş kriteri', () => {
  /* Sığmayan çiftin TÜMÜ sonraki sayfaya geçer. Satır bazlı bir motor onu
     sayfa sınırından keser ve görüntü hücresi bir sayfada, ses hücresi
     ötekinde kalırdı — eşleşme yok olur. */
  it('sığmayan çift bölünmeden sonraki sayfaya geçiyor', () => {
    const dolgu = olay('d', satirlik(50, IKI_SUTUN.sol));
    const tasan = olay('t', satirlik(10, IKI_SUTUN.sol));
    const sayfalar = sayfalaIkiSutun([dolgu, tasan], profil);

    expect(sayfalar).toHaveLength(2);
    // Taşan çiftin HİÇBİR satırı ilk sayfada olmamalı.
    expect(sayfalar[0].satirlar.some((s) => s.ciftId === 't')).toBe(false);
    expect(sayfalar[1].satirlar.filter((s) => s.ciftId === 't')).toHaveLength(10);
  });

  it('sayfaya sığan HER çift tek sayfada kalıyor (rastgele boyutlarla)', () => {
    const girdiler: CiftGirdi[] = [];
    for (let i = 0; i < 40; i++) {
      const gy = 1 + ((i * 7) % 9);
      const sy = 1 + ((i * 5) % 6);
      girdiler.push(olay(`c${i}`, satirlik(gy, IKI_SUTUN.sol)));
    }
    const sayfalar = sayfalaIkiSutun(girdiler, profil);
    const sayfaNo = new Map<string, Set<number>>();
    for (const s of sayfalar) {
      for (const satir of s.satirlar) {
        if (!sayfaNo.has(satir.ciftId)) sayfaNo.set(satir.ciftId, new Set());
        sayfaNo.get(satir.ciftId)!.add(s.no);
      }
    }
    for (const [id, sayfaKumesi] of sayfaNo) {
      expect(sayfaKumesi.size, `${id} birden çok sayfaya yayıldı`).toBe(1);
    }
    /* Döngü, HİÇ çift basılmasa da (boş `sayfaNo`) sessizce geçerdi:
       "her çift tek sayfada" iddiası sıfır çift için de doğrudur. Kırk
       çiftin kırkı da GERÇEKTEN basılmış olmalı. */
    expect(sayfaNo.size, 'düşen çift var').toBe(40);
    expect([...sayfaNo.keys()].sort()).toEqual(
      Array.from({ length: 40 }, (_, i) => `c${i}`).sort(),
    );
  });

  /* ÖLÇEK: kırk çift yalnız birkaç sayfa dolduruyor. Beş yüz çiftte
     bölünmezlik, satır korunumu ve sayfa doluluğu birlikte sınanıyor —
     sayfa geçişi mantığı ancak burada onlarca kez çalışıyor. */
  it('ÖLÇEK: 500 çiftte bölünmezlik, sayfa sınırı ve satır korunumu', () => {
    const girdiler = Array.from({ length: 500 }, (_, i) =>
      olay(`c${i}`, satirlik(1 + ((i * 7) % 9), IKI_SUTUN.sol)));
    const sayfalar = sayfalaIkiSutun(girdiler, profil);
    expect(sayfalar).toHaveLength(56);

    const sayfaNo = new Map<string, Set<number>>();
    for (const s of sayfalar) {
      expect(s.satirlar.length, `sayfa ${s.no} taştı`).toBeLessThanOrEqual(IZGARA.satir);
      for (const satir of s.satirlar) {
        if (!sayfaNo.has(satir.ciftId)) sayfaNo.set(satir.ciftId, new Set());
        sayfaNo.get(satir.ciftId)!.add(s.no);
      }
    }
    expect(sayfaNo.size, 'düşen çift var').toBe(500);
    for (const [id, kume] of sayfaNo) expect(kume.size, `${id} bölündü`).toBe(1);

    const beklenen = girdiler.reduce((n, g) => n + girdiSatirlari(g, profil).length, 0);
    const basilan = sayfalar.flatMap((s) => s.satirlar).filter((s) => s.satirIndex >= 0).length;
    expect(basilan).toBe(beklenen);
    // Çift sırası KORUNUYOR: sayfa numaraları monoton artıyor.
    const ilkSayfalar = girdiler.map((g) => [...sayfaNo.get(g.id)!][0]!);
    expect(ilkSayfalar).toEqual([...ilkSayfalar].sort((a, b) => a - b));
  });

  it('hiçbir sayfa ızgara satır sayısını aşmıyor', () => {
    const girdiler = Array.from({ length: 30 }, (_, i) =>
      i % 2 ? diyalog(`c${i}`, satirlik(1 + (i % 4), IKI_SUTUN.sag))
            : olay(`c${i}`, satirlik(1 + (i % 11), IKI_SUTUN.sol)),
    );
    for (const s of sayfalaIkiSutun(girdiler, profil)) {
      expect(s.satirlar.length).toBeLessThanOrEqual(IZGARA.satir);
    }
  });

  it('hiçbir satır KAYBOLMUYOR', () => {
    const girdiler = Array.from({ length: 25 }, (_, i) =>
      i % 2 ? diyalog(`c${i}`, satirlik(1 + (i % 5), IKI_SUTUN.sag))
            : olay(`c${i}`, satirlik(1 + (i % 8), IKI_SUTUN.sol)),
    );
    const beklenen = girdiler.reduce((n, g) => n + girdiSatirlari(g, profil).length, 0);
    const basilan = sayfalaIkiSutun(girdiler, profil)
      .flatMap((s) => s.satirlar)
      .filter((s) => s.satirIndex >= 0).length;
    expect(basilan).toBe(beklenen);
  });

  it('sayfa boş ayırıcı satırla BAŞLAMIYOR', () => {
    const girdiler = Array.from({ length: 20 }, (_, i) =>
      olay(`c${i}`, satirlik(7, IKI_SUTUN.sol)),
    );
    for (const s of sayfalaIkiSutun(girdiler, profil)) {
      expect(s.satirlar[0].satirIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it('boş girdi listesi tek boş sayfa verir', () => {
    const sayfalar = sayfalaIkiSutun([], profil);
    expect(sayfalar).toHaveLength(1);
    expect(sayfalar[0].satirlar).toEqual([]);
  });
});

describe('SAYFADAN UZUN ÇİFT — donma yolu (§15)', () => {
  /* Boş sayfaya bile sığmayan bir çift "sonraki sayfaya geç" kuralıyla
     ÇÖZÜLEMEZ: kural onu sonsuza erteler ya da satırlar sayfayı taşırıp
     sessizce kaybolur. Bölünmezlik, bölünmemenin MÜMKÜN olduğu yerde
     geçerli bir sözdür. */
  it('60 satırlık çift donmuyor, bölünüyor', () => {
    const dev = olay('dev', satirlik(60, IKI_SUTUN.sol));
    const sayfalar = sayfalaIkiSutun([dev], profil);
    expect(sayfalar.length).toBeGreaterThan(1);
    expect(sayfalar.every((s) => s.satirlar.length <= IZGARA.satir)).toBe(true);
    /* `> 1` altmış ayrı sayfaya bölen (satır başına bir sayfa) bir mutantı
       da geçirirdi. Bölme AÇGÖZLÜ olmalı: ilk sayfa ızgarayı doldurur,
       artan beş satır ikinci sayfaya iner. */
    expect(sayfalar).toHaveLength(2);
    expect(sayfalar.map((s) => s.satirlar.length)).toEqual([55, 5]);
  });

  it('bölünse bile TEK BİR satır bile kaybolmuyor', () => {
    const dev = olay('dev', satirlik(200, IKI_SUTUN.sol));
    const beklenen = girdiSatirlari(dev, profil).length;
    const basilan = sayfalaIkiSutun([dev], profil).flatMap((s) => s.satirlar).length;
    expect(beklenen).toBe(200);
    expect(basilan).toBe(200);
  });

  it('dev çiftten sonraki normal çift yine bölünmüyor', () => {
    const dev = olay('dev', satirlik(70, IKI_SUTUN.sol));
    const normal = olay('n', satirlik(4, IKI_SUTUN.sol));
    const sayfalar = sayfalaIkiSutun([dev, normal], profil);
    const nSayfalari = new Set(
      sayfalar.filter((s) => s.satirlar.some((x) => x.ciftId === 'n')).map((s) => s.no),
    );
    expect(nSayfalari.size).toBe(1);
  });
});

describe('süre — sayfa=dakika GEÇERSİZ (§6.6)', () => {
  const girdiler: CiftGirdi[] = [
    sahne('s1', 'iç. oda - gece'),
    olay('c1', 'Uzun uzun bir olay betimi burada duruyor ve epey kelime içeriyor'),
    diyalog('d1', 'Bir iki üç'),
    olay('c2', 'Başka bir olay'),
    diyalog('d2', 'Dört beş altı yedi'),
  ];

  /* Süre YALNIZ sağ sütundan: sol sütun ne olduğunu anlatır, ekranda zaman
     almaz. */
  it('sol sütun (olay) süreye KATKI VERMİYOR', () => {
    // Yalnız diyaloglar: 3 + 4 = 7 kelime.
    expect(sesKelimeSayisi(girdiler)).toBe(7);
  });

  it('sahne başlığı süreye katkı vermiyor', () => {
    expect(sesKelimeSayisi([sahne('s1', 'iç. çok uzun bir sahne başlığı burada')])).toBe(0);
  });

  /* §6.6: "Katsayı kalibre edilmeden süre gösterilmez — yanlış süre
     göstermek hiç göstermemekten kötüdür." Varsayılan bir sayı koymak tam
     olarak bu yasağı çiğnerdi. */
  it('kalibre edilmemişse süre YOK — uydurulmuş katsayı kullanılmıyor', () => {
    expect(sureTahmini(girdiler, { kelimeHizi: null })).toBeNull();
  });

  it('kalibre edilmişse saniye cinsinden süre veriyor', () => {
    // 7 kelime / 140 kel-dk = 0,05 dk = 3 sn.
    expect(sureTahmini(girdiler, { kelimeHizi: 140 })).toBeCloseTo(3, 6);
  });

  /* Sıfır ya da negatif hız sonsuz/negatif süre üretir; katsayı kullanıcı
     ayarından geliyor, yani güven sınırı. */
  it('geçersiz hız sessizce kabul edilmiyor', () => {
    expect(() => sureTahmini(girdiler, { kelimeHizi: 0 })).toThrow(/pozitif/);
    expect(() => sureTahmini(girdiler, { kelimeHizi: -5 })).toThrow(/pozitif/);
    expect(() => sureTahmini(girdiler, { kelimeHizi: Number.NaN })).toThrow(/pozitif/);
  });

  it('sessiz senaryo sıfır süre verir, null değil', () => {
    expect(sureTahmini([olay('c', 'yalnız görüntü')], { kelimeHizi: 140 })).toBe(0);
  });
});

describe('çiftler arası AYIRICI gerçekten çiziliyor', () => {
  /* Ayırıcı satır hiçbir testte iddia edilmiyordu: testler ya
     `satirIndex >= 0` diye süzüyor ya da yalnız sayfa başında OLMADIĞINA
     bakıyordu. Ayırıcıyı düşüren mutant sayfa başına düşen satır sayısını
     değiştirir — yani `sayfaSayisi` sözleşmesini. */
  const c = (id: string, n = 1): CiftGirdi =>
    olay(id, satirlik(n, IKI_SUTUN.sol));

  it('ardışık çiftlerin ARASINDA bir ayırıcı satır var', () => {
    const sayfalar = sayfalaIkiSutun([c('a'), c('b')], profil);
    const satirlar = sayfalar[0].satirlar;
    const ayiricilar = satirlar.filter((l) => l.satirIndex < 0);
    expect(ayiricilar).toHaveLength(1);
    expect(ayiricilar[0].ciftId).toBe('b');
  });

  it('ayırıcı BOŞ — içerik taşımıyor', () => {
    const sayfalar = sayfalaIkiSutun([c('a'), c('b')], profil);
    const ayirac = sayfalar[0].satirlar.find((l) => l.satirIndex < 0)!;
    expect(ayirac.sol).toBe('');
    expect(ayirac.sag).toBe('');
  });

  it('İLK çift ayırıcı almıyor — sayfa boş satırla başlamaz', () => {
    const sayfalar = sayfalaIkiSutun([c('a')], profil);
    expect(sayfalar[0].satirlar.filter((l) => l.satirIndex < 0)).toHaveLength(0);
  });

  it('ayırıcı sayfa doluluğuna SAYILIYOR — sayfa ızgarayı aşmıyor', () => {
    const ciftler = Array.from({ length: 40 }, (_, i) => c(`c${i}`));
    for (const sy of sayfalaIkiSutun(ciftler, profil)) {
      expect(sy.satirlar.length).toBeLessThanOrEqual(IZGARA.satir);
    }
  });
});
