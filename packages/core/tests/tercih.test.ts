// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  VARSAYILAN_TERCIH,
  tercihOku,
  tercihKaydet,
  tercihiCoz,
  tercihiYaz,
} from '@storyboard/core/format/tercih';

/**
 * KULLANICI FORMAT PROFİLİ (§16.3 · §17 borcu).
 *
 * > "Preset değişiklikleri format profiline yazılır, PROJEYE değil."
 *
 * Böyle bir depo yoktu: kağıt/dil/preset `ui` mağazasında oturumla sınırlıydı
 * ve her açılışta sıfırlanıyordu. Kağıdını A4 yapan yazar programı her
 * açtığında Letter buluyordu.
 */

/**
 * Bellek içi `Storage`. Bu kurulumda jsdom `localStorage` VERMİYOR (ölçüldü:
 * `typeof localStorage === 'undefined'`), yani gerçek kod yolu — JSON
 * çözümü, güven sınırı, kotanın dolması — hiç koşmazdı ve testler yalnız
 * varsayılanı ölçerdi. Sahte depo o yolu açıyor; ölçülen şey depo değil,
 * ONUN ÜSTÜNDEKİ kurallar.
 */
function sahteDepo(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, v); },
  } as Storage;
}

beforeEach(() => { (globalThis as any).localStorage = sahteDepo(); });
afterEach(() => { delete (globalThis as any).localStorage; });

describe('yuvarlak gidiş', () => {
  it('kaydedilen tercih aynen geri okunuyor', () => {
    /* VARSAYILAN üzerinden kuruluyor: alan listesi büyüdükçe test elle
       güncellenmek zorunda kalmasın — yuvarlak gidişin iddiası "ne
       yazıldıysa o okunuyor", alanların TAM LİSTESİ değil. */
    const t = {
      ...VARSAYILAN_TERCIH,
      kagit: 'a4' as const, dil: 'en' as const,
      presetler: { action: { kalin: true } },
      yazi: 'courier-prime' as const, solSutun: 24, kelimeHizi: 160,
      sayfaRengi: 'siyah' as const,
    };
    tercihKaydet(t);
    expect(tercihOku()).toEqual(t);
  });

  it('hiç kayıt yokken VARSAYILAN dönüyor', () => {
    expect(tercihOku()).toEqual(VARSAYILAN_TERCIH);
  });

  it('yazma ve okuma AYNI biçimi konuşuyor', () => {
    const t = {
      ...VARSAYILAN_TERCIH,
      kagit: 'a4' as const, dil: 'tr' as const,
      presetler: { scene: { buyukHarf: false } },
      yazi: 'tinos' as const, solSutun: 28, kelimeHizi: null,
      sayfaRengi: 'gri' as const,
    };
    expect(tercihiCoz(tercihiYaz(t))).toEqual(t);
  });
});

describe('güven sınırı — depo kullanıcının elinde', () => {
  /* `localStorage` elle düzenlenebilir, eski bir sürümden kalmış olabilir,
     başka bir uygulama yazmış olabilir. Tanınmayan her şey varsayılana
     düşer — ama sessizce YANLIŞ değer de kullanılmaz. */
  /* İDDİA ÇÖZÜCÜYE DOĞRUDAN: `tercihOku` üzerinden ölçülünce DIŞTAKİ
     try/catch içtekini maskeliyordu ve `JSON.parse` korumasını söken mutant
     hayatta kalıyordu (ölçüldü). Her koruma kendi katmanında ısırılmalı. */
  it('bozuk JSON çözücüyü düşürmüyor', () => {
    expect(tercihiCoz('{bu json değil')).toEqual(VARSAYILAN_TERCIH);
  });

  it('bozuk JSON depodan okununca da düşürmüyor', () => {
    globalThis.localStorage.setItem('mizansen.format.v1', '{bu json değil');
    expect(tercihOku()).toEqual(VARSAYILAN_TERCIH);
  });

  it('boş kayıt varsayılan — JSON çözümüne hiç girmiyor', () => {
    expect(tercihiCoz(null)).toEqual(VARSAYILAN_TERCIH);
    expect(tercihiCoz('')).toEqual(VARSAYILAN_TERCIH);
  });

  it('JSON ama nesne değilse varsayılan', () => {
    for (const ham of ['3', '"metin"', 'null', '[1,2]']) {
      expect(tercihiCoz(ham).kagit, ham).toBe('letter');
    }
  });

  /* Tanınmayan kağıt `kagitGeometrisi`'ne kadar gitseydi orada AÇIKÇA
     fırlardı — tercih dosyasındaki bir çöp yüzünden program hiç açılmazdı. */
  it('tanınmayan kağıt ve dil varsayılana düşüyor', () => {
    const t = tercihiCoz(JSON.stringify({ kagit: 'a3', dil: 'de', presetler: {} }));
    expect(t.kagit).toBe('letter');
    expect(t.dil).toBe('tr');
  });

  it('tanınmayan blok tipi presetten ATILIYOR', () => {
    const t = tercihiCoz(JSON.stringify({ presetler: { yokBoyleBlok: { kalin: true }, action: { kalin: true } } }));
    expect(Object.keys(t.presetler)).toEqual(['action']);
  });

  it('yanlış TİPTEKİ preset alanı alınmıyor', () => {
    const t = tercihiCoz(JSON.stringify({ presetler: { action: { kalin: 'evet', hiza: 'yok', oncekiBosSatir: 'iki' } } }));
    expect(t.presetler.action).toBeUndefined();
  });

  it('geçerli alanlar alınıp geçersizler atılıyor — hepsi ya da hiçbiri DEĞİL', () => {
    const t = tercihiCoz(JSON.stringify({ presetler: { action: { kalin: true, hiza: 'yok' } } }));
    expect(t.presetler.action).toEqual({ kalin: true });
  });

  it('NaN ve Infinity sayı sayılmıyor', () => {
    /* JSON bunları `null` olarak taşır; yine de doğrudan çözüme verildiğinde
       de düşmeliler — sayfa ızgarası sonsuz bir girintiyle çizilemez. */
    const t = tercihiCoz('{"presetler":{"action":{"solMm":null,"sagMm":1e999}}}');
    expect(t.presetler.action).toBeUndefined();
  });
});

describe('ezilemez alanlar depodan DİRİLMİYOR', () => {
  /* `yaziTipi`/`punto`/`satirAraligi` `presetUygula` tarafından zaten
     reddediliyor. Depodan geri okunsalardı reddedilecek bir değer her
     açılışta dirilir ve kullanıcı her seferinde aynı red gerekçesini
     görürdü. */
  it('yaziTipi, punto ve satirAraligi okunmuyor', () => {
    const t = tercihiCoz(JSON.stringify({
      presetler: { action: { yaziTipi: 'Arial', punto: 18, satirAraligi: 2 } },
    }));
    expect(t.presetler.action).toBeUndefined();
  });

  it('ezilemez alanla birlikte gelen GEÇERLİ alan yine de alınıyor', () => {
    const t = tercihiCoz(JSON.stringify({ presetler: { action: { yaziTipi: 'Arial', italik: true } } }));
    expect(t.presetler.action).toEqual({ italik: true });
  });
});

describe('boş preset saklanmıyor', () => {
  /* Tablo `Partial`: boş bir girdi ile girdinin hiç olmaması aynı şey.
     İkisini de tutmak "kullanıcı bu bloğa dokundu mu" sorusuna iki farklı
     cevap üretirdi. */
  it('hiç geçerli alanı olmayan preset tabloya girmiyor', () => {
    const t = tercihiCoz(JSON.stringify({ presetler: { action: {} } }));
    expect(t.presetler).toEqual({});
  });
});

describe('depo yokken program çalışmaya devam ediyor', () => {
  /* `localStorage` bazı bağlamlarda ERİŞİLDİĞİ ANDA fırlatır: gizli pencere,
     site verisi engelli tarayıcı, bu test ortamı. Tercih okunamadı diye
     program açılmamak, kaydedilmemiş bir tercihten çok pahalı olurdu. */
  it('depo tanımsızken varsayılan dönüyor ve kayıt SESSİZ', () => {
    delete (globalThis as any).localStorage;
    expect(tercihOku()).toEqual(VARSAYILAN_TERCIH);
    expect(() => tercihKaydet({ ...VARSAYILAN_TERCIH, kagit: 'a4', dil: 'en' })).not.toThrow();
  });

  it('depo ERİŞİLDİĞİNDE fırlatıyorsa da düşmüyor', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('site verisi engelli'); },
    });
    expect(tercihOku()).toEqual(VARSAYILAN_TERCIH);
    expect(() => tercihKaydet(VARSAYILAN_TERCIH)).not.toThrow();
  });

  /* Dıştaki koruma AYRI: depo var ama `getItem` fırlatıyor (bazı gizlilik
     eklentileri böyle davranıyor). İçteki JSON korumasıyla aynı test
     ölçemez. */
  it('okuma fırlatıyorsa varsayılan dönüyor', () => {
    const bozuk = sahteDepo();
    bozuk.getItem = () => { throw new Error('okuma engelli'); };
    (globalThis as any).localStorage = bozuk;
    expect(tercihOku()).toEqual(VARSAYILAN_TERCIH);
  });

  it('yazma kotası dolarsa kullanıcının işi bölünmüyor', () => {
    const bozuk = sahteDepo();
    bozuk.setItem = () => { throw new Error('QuotaExceeded'); };
    (globalThis as any).localStorage = bozuk;
    expect(() => tercihKaydet({ ...VARSAYILAN_TERCIH, kagit: 'a4', dil: 'tr' })).not.toThrow();
  });
});

describe('yazı tipi tercihi', () => {
  it('tanınmayan yazı tipi VARSAYILANA düşüyor', () => {
    expect(tercihiCoz(JSON.stringify({ yazi: 'comic-sans' })).yazi).toBe('tinos');
  });

  /* Varsayılan Tinos çünkü roman ve düz metnin el yazması standardı Times ve
     Tinos onunla metrik uyumlu. Courier varsayılan olsaydı yeni bir roman
     sektörün beklemediği bir sayfa sayısıyla açılırdı. */
  it('varsayılan Tinos — roman el yazması standardı', () => {
    expect(VARSAYILAN_TERCIH.yazi).toBe('tinos');
  });

  it('geçerli yazı tipi korunuyor', () => {
    expect(tercihiCoz(JSON.stringify({ yazi: 'courier-prime' })).yazi).toBe('courier-prime');
  });
});

describe('iki sütun ve kelime hızı tercihi', () => {
  /* §6.6 kalibrasyon borcu: sütun oranı için YAYIMLANMIŞ BİR STANDART YOK
     (kaynaklar biçimin esnek olduğunu söylüyor), o yüzden ölçüm değil AYAR.
     Kelime hızı ise ölçülebilir bir büyüklük ve kalibre edildi. */
  it('varsayılan hız 150 kel/dk — Türkçe seslendirme ortalaması', () => {
    expect(VARSAYILAN_TERCIH.kelimeHizi).toBe(150);
  });

  it('aralık dışı hız SINIRA çekiliyor', () => {
    expect(tercihiCoz(JSON.stringify({ kelimeHizi: 5 })).kelimeHizi).toBe(120);
    expect(tercihiCoz(JSON.stringify({ kelimeHizi: 900 })).kelimeHizi).toBe(200);
  });

  /* `null` bilinçli bir seçim: kullanıcı süreyi kapatabilmeli ve "yanlış süre
     göstermek hiç göstermemekten kötü" kuralı kalibrasyondan sonra da
     geçerli. */
  it('null hız KORUNUYOR — süre kapatılabilir', () => {
    expect(tercihiCoz(JSON.stringify({ kelimeHizi: null })).kelimeHizi).toBeNull();
  });

  it('sayı olmayan hız varsayılana düşüyor', () => {
    expect(tercihiCoz(JSON.stringify({ kelimeHizi: 'hızlı' })).kelimeHizi).toBe(150);
  });

  /* Depodan gelen çöp sütun değeri sayfayı taşırır ya da boş bırakır ve
     sayfa sayısı yalan söylerdi. */
  it('sütun genişliği ızgaraya oturtuluyor', () => {
    expect(tercihiCoz(JSON.stringify({ solSutun: 999 })).solSutun).toBeLessThan(60);
    expect(tercihiCoz(JSON.stringify({ solSutun: -4 })).solSutun).toBeGreaterThan(0);
  });
});
