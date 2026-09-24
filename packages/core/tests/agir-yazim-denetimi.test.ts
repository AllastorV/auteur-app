import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  kelimeleriAyir,
  sozlukAnahtari,
  sozlukBirlestir,
  sozlugeUygun,
  sozlukteVar,
  type SozlukKaydi,
} from '@storyboard/core/dil/sozluk';
import { denetimDilleri, gecerliDilleri } from '@storyboard/core/dil/denetim';
import { baglamMenusu } from '@storyboard/core/dil/menu';
import { sozlugeEkle, sozlugeTopluEkle } from '@storyboard/core/doc/mutations';
import { sozlukMap } from '@storyboard/core/doc/schema';

/**
 * AĞIR TEST 7 — yazım denetimi, HER DİLDE.
 *
 * ## Neyin test EDİLEBİLDİĞİ, neyin edilemediği
 *
 * Denetleyicinin KENDİSİ Electron'a (Chromium/Hunspell) ait ve Node'da yok:
 * `DilKabugu` web'de `null`, testte de öyle. Yani "Chromium `şşşş`'yi yanlış
 * sayıyor mu" BU DOSYADA ÖLÇÜLEMEZ — o Chromium'un derlenmiş sözlüğüne bağlı.
 *
 * ÖLÇÜLEBİLEN ve burada ölçülen şey, kendi kodumuzun denetleyiciyle kurduğu
 * SÖZLEŞME: hangi diller kabuğa gidiyor, sözlük anahtarı kelimeyi hangi
 * dilde nereye düşürüyor, sözlüğe eklenen kelime denetleyiciye HANGİ biçimde
 * taşınıyor, menü ne gösteriyor. Kabuk yerine, gerçek bir Hunspell gibi
 * davranan (sözlük + düzenleme-uzaklığı önerisi) SAHTE denetleyici konuyor;
 * böylece "ekledim ama hâlâ kırmızı" döngüsü uçtan uca sürülebiliyor.
 */

/* ------------------------------------------------------------------ */
/* Sahte denetleyici — gerçek bir Hunspell'in yaptığı iki işi yapar    */
/* ------------------------------------------------------------------ */

/** Dil başına küçük ama GERÇEK sözlükler. Yanlış yazımlar bilerek dışarıda. */
const SOZLUKLER: Record<string, string[]> = {
  tr: ['ışık', 'ısparta', 'istanbul', 'kapı', 'gece', 'iter', 'kimse', 'yok', 'şişli', 'ığdır'],
  'en-US': ['light', 'door', 'night', 'nobody', 'there', 'opens', 'color'],
  'en-GB': ['light', 'door', 'night', 'nobody', 'there', 'opens', 'colour'],
  de: ['licht', 'tür', 'nacht', 'niemand', 'straße', 'öffnet'],
  fr: ['lumière', 'porte', 'nuit', 'personne', 'ouvre', 'école'],
  ru: ['свет', 'дверь', 'ночь', 'никто', 'открывает'],
  uk: ['світло', 'двері', 'ніч', 'ніхто', 'київ', 'відчиняє'],
};

/** Düzenleme uzaklığı 1 mi — öneri üretimi için (gerçek denetleyicilerin ilk turu). */
function uzaklikBir(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return false;
  const [kisa, uzun] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let fark = 0;
  while (i < kisa.length && j < uzun.length) {
    if (kisa[i] === uzun[j]) {
      i += 1;
      j += 1;
      continue;
    }
    fark += 1;
    if (fark > 1) return false;
    if (kisa.length === uzun.length) i += 1;
    j += 1;
  }
  return fark + (uzun.length - j) + (kisa.length - i) <= 1;
}

interface Denetleyici {
  /** Kelime kabul ediliyor mu (dil sözlüğü ∪ eklenen özel kelimeler). */
  dogru(kelime: string): boolean;
  oneriler(kelime: string): string[];
  /** `DilKabugu.sozlugüYükle` karşılığı — kabuk sözlüğü uygulama geneli. */
  ozelEkle(kelimeler: readonly string[]): void;
  dilAyarla(kod: string): void;
  readonly etkinDil: string;
}

/**
 * Denetleyici, kabul kararını SÖZLÜK ANAHTARIYLA verir.
 *
 * Gerçek Hunspell de büyük/küçük harfi katlıyor: `AYŞE` eklenince `Ayşe`
 * de kabul edilir. Sahte denetleyicinin bunu taklit etmesi şart, yoksa
 * "sözlüğe ekledim ama hâlâ kırmızı" hatası testte GÖRÜNMEZ.
 */
function denetleyiciKur(dil = 'tr'): Denetleyici {
  let etkin = dil;
  const ozel = new Set<string>();
  return {
    get etkinDil() {
      return etkin;
    },
    dilAyarla(kod) {
      etkin = kod;
    },
    ozelEkle(kelimeler) {
      for (const k of kelimeler) ozel.add(sozlukAnahtari(k));
    },
    dogru(kelime) {
      const anahtar = sozlukAnahtari(kelime);
      if (ozel.has(anahtar)) return true;
      return (SOZLUKLER[etkin] ?? []).some((s) => sozlukAnahtari(s) === anahtar);
    },
    oneriler(kelime) {
      const anahtar = sozlukAnahtari(kelime);
      return (SOZLUKLER[etkin] ?? []).filter((s) => uzaklikBir(sozlukAnahtari(s), anahtar));
    },
  };
}

/** Metindeki yanlış yazılmış kelimeleri, gerçek denetim akışıyla bulur. */
function yanlislar(metin: string, d: Denetleyici): string[] {
  return kelimeleriAyir(metin).filter((k) => !d.dogru(k));
}

/* ------------------------------------------------------------------ */
/* 1. Yanlış kelime yakalanıyor mu, öneri geliyor mu — HER DİLDE       */
/* ------------------------------------------------------------------ */

describe('yanlış kelime yakalanıyor ve öneri geliyor — desteklenen HER dil', () => {
  /* Spec §16.4 / `dil/sozluk.ts`: Chromium'un listesinde tr, en-US, de, fr,
     ru, uk var. Her biri için tek tek ölçülüyor çünkü asıl risk dile ÖZGÜ:
     Türkçe'de ı/i, Almanca'da ß, Fransızca'da aksan, Kiril'de alfabe. */
  const ORNEKLER: { dil: string; dogruMetin: string; yanlis: string; beklenenOneri: string }[] = [
    { dil: 'tr', dogruMetin: 'kapı gece', yanlis: 'kapu', beklenenOneri: 'kapı' },
    { dil: 'en-US', dogruMetin: 'door night', yanlis: 'doar', beklenenOneri: 'door' },
    { dil: 'de', dogruMetin: 'Tür Nacht', yanlis: 'Türr', beklenenOneri: 'tür' },
    { dil: 'fr', dogruMetin: 'porte nuit', yanlis: 'porta', beklenenOneri: 'porte' },
    { dil: 'ru', dogruMetin: 'свет дверь', yanlis: 'двери', beklenenOneri: 'дверь' },
    { dil: 'uk', dogruMetin: 'світло ніч', yanlis: 'ніхта', beklenenOneri: 'ніхто' },
  ];

  for (const o of ORNEKLER) {
    it(`${o.dil}: doğru metin temiz, yanlış kelime işaretleniyor`, () => {
      const d = denetleyiciKur(o.dil);
      expect(yanlislar(o.dogruMetin, d)).toEqual([]);
      expect(yanlislar(`${o.dogruMetin} ${o.yanlis}`, d)).toEqual([o.yanlis]);
    });

    it(`${o.dil}: öneri üretiliyor ve menüye TAŞINIYOR`, () => {
      const d = denetleyiciKur(o.dil);
      const oneriler = d.oneriler(o.yanlis);
      expect(oneriler.map(sozlukAnahtari)).toContain(sozlukAnahtari(o.beklenenOneri));

      const gruplar = baglamMenusu({
        yanlisKelime: o.yanlis,
        oneriler,
        secimVar: false,
        panoDolu: false,
        duzenlenebilir: true,
        seciliSatir: 1,
        bagliPanelVar: false,
        denetimVar: true,
      });
      const yazim = gruplar[0];
      expect(yazim[0].eylem).toEqual({
        tur: 'oneri',
        kelime: o.yanlis,
        oneri: oneriler[0],
      });
      // "Sözlüğe ekle" ve "Yoksay" HER ZAMAN sonda: öneri yoksa tek çare o.
      expect(yazim.at(-1)!.eylem).toEqual({ tur: 'yoksay', kelime: o.yanlis });
    });
  }

  /* Denetim dili değişince AYNI kelime bir dilde doğru, ötekinde yanlış
     olmalı — yoksa "dil seçimi" süs olurdu. */
  it('en-US ve en-GB AYNI kelimeyi farklı yargılıyor (color/colour)', () => {
    const abd = denetleyiciKur('en-US');
    const uk = denetleyiciKur('en-GB');
    expect(abd.dogru('color')).toBe(true);
    expect(uk.dogru('color')).toBe(false);
    expect(uk.dogru('colour')).toBe(true);
    expect(abd.dogru('colour')).toBe(false);
  });

  it('dil değişince denetim gerçekten O DİLE göre yapılıyor', () => {
    const d = denetleyiciKur('tr');
    expect(d.dogru('kapı')).toBe(true);
    expect(d.dogru('porte')).toBe(false);
    d.dilAyarla('fr');
    expect(d.etkinDil).toBe('fr');
    expect(d.dogru('porte')).toBe(true);
    expect(d.dogru('kapı')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Türkçe İ/ı tuzağı — büyük/küçük katlaması HER DİLDE doğru mu     */
/* ------------------------------------------------------------------ */

describe('İ/ı tuzağı — anahtar HER dilde aynı yere düşüyor', () => {
  /* `sozlukAnahtari` katlamayı TÜRKÇE yerelle yapıyor ve bunu HER dile
     uyguluyor. Yani tuzak yalnız Türkçe metinde değil, Türkçe yerelin
     İngilizce/Almanca kelimeye dokunduğu yerde de var. */
  const CIFTLER: [string, string, string][] = [
    ['tr', 'IŞIK', 'ışık'],
    ['tr', 'İSTANBUL', 'istanbul'],
    ['tr', 'ISPARTA', 'ısparta'],
    ['en', 'INDIA', 'india'],
    ['en', 'DIGITAL', 'digital'],
    ['en', 'Title', 'TITLE'],
    ['de', 'LICHT', 'licht'],
    ['fr', 'LUMIÈRE', 'lumière'],
    ['ru', 'СВЕТ', 'свет'],
    ['uk', 'КИЇВ', 'київ'],
  ];

  for (const [dil, buyuk, kucuk] of CIFTLER) {
    it(`${dil}: ${buyuk} ↔ ${kucuk} aynı anahtar`, () => {
      expect(sozlukAnahtari(buyuk)).toBe(sozlukAnahtari(kucuk));
    });
  }

  /* KRİTİK: `'İSTANBUL'.toLowerCase()` (yerelsiz — tarayıcının, panonun,
     CSS `text-transform`ın ve JS'in VARSAYILAN yolu) `i` + U+0307 üretir,
     tek bir `i` değil. NFC bu ikiliyi birleştirmez (Unicode'da karşılığı
     yok), dolayısıyla anahtar `i̇stanbul` olur ve `istanbul`'u ISKALAR.
     Modülün kendi sözü: "dil değişince sözlük sessizce ıskalar" — tam da
     bu. Kullanıcı kelimeyi ekler, başka yerden yapıştırdığında yine
     kırmızı görür. */
  it('yerelsiz küçültmenin ürettiği birleşik nokta (U+0307) anahtarı BÖLMÜYOR', () => {
    const yerelsiz = 'İSTANBUL'.toLowerCase();
    expect(yerelsiz).not.toBe('istanbul'); // ölçüldü: 9 kod birimi
    expect(yerelsiz.includes('̇')).toBe(true);
    expect(sozlukAnahtari(yerelsiz)).toBe(sozlukAnahtari('İSTANBUL'));
    expect(sozlukAnahtari(yerelsiz)).toBe(sozlukAnahtari('istanbul'));
  });

  it('birleşik noktalı biçim sözlükte BULUNUYOR', () => {
    const sozluk: SozlukKaydi = {};
    sozluk[sozlukAnahtari('İSTANBUL')] = 'İSTANBUL';
    expect(sozlukteVar(sozluk, 'İSTANBUL'.toLowerCase())).toBe(true);
  });

  /* Ters yön: `I` + U+0307 (NFD'si `İ` olan dizi) NFC ile toparlanıyor. */
  it('NFD `İ` NFC ile aynı anahtara düşüyor', () => {
    const nfd = 'İSTANBUL'.normalize('NFD');
    expect(nfd).not.toBe('İSTANBUL');
    expect(sozlukAnahtari(nfd)).toBe(sozlukAnahtari('İSTANBUL'));
  });

  /* Katlama ı/i ile SINIRLI kalmalı: aksan, ß, yumuşak işaret korunuyor.
     Genişletilseydi farklı kelimeler sessizce birleşir ve kullanıcı
     eklemediği bir yazımın kabul edildiğini fark etmezdi. */
  it('katlama TAŞMIYOR — aksan, ß, Kiril ayrımı korunuyor', () => {
    expect(sozlukAnahtari('lumière')).not.toBe(sozlukAnahtari('lumiere'));
    expect(sozlukAnahtari('Straße')).not.toBe(sozlukAnahtari('Strasse'));
    expect(sozlukAnahtari('ніч')).not.toBe(sozlukAnahtari('нич'));
    expect(sozlukAnahtari('Ayşe')).not.toBe(sozlukAnahtari('Ayse'));
  });

  /* Bilinen ve KABUL EDİLEN bedel (`dil/sozluk.ts` yorumu): yalnız ı/i ile
     ayrılan iki Türkçe kelime aynı anahtara düşer. Ölçülmezse birileri
     bunu bir gün "hata" sanıp katlamayı kaldırır ve asıl tuzak geri gelir. */
  it('bilinen bedel: sıkı/siki aynı anahtar — bilerek', () => {
    expect(sozlukAnahtari('sıkı')).toBe(sozlukAnahtari('siki'));
  });
});

/* ------------------------------------------------------------------ */
/* 3. Sözlüğe eklenen kelime bir daha işaretlenmiyor — UÇTAN UCA       */
/* ------------------------------------------------------------------ */

describe('sözlüğe eklenen kelime BİR DAHA işaretlenmiyor', () => {
  /**
   * Döngünün tamamı: metin → yanlış kelime → menüden "sözlüğe ekle" →
   * belgeye (`Y.Doc`) yaz → kabuğa taşı → denetleyici artık kabul ediyor.
   *
   * Ara halkalardan biri kopsa (ör. kabuğa özgün yazım değil anahtar
   * gitse) kullanıcı kelimeyi listede görür ama kırmızı altçizgi sürerdi.
   */
  function dongu(dil: string, kelime: string) {
    const d = denetleyiciKur(dil);
    const doc = new Y.Doc();
    expect(d.dogru(kelime)).toBe(false);

    const gruplar = baglamMenusu({
      yanlisKelime: kelime,
      oneriler: d.oneriler(kelime),
      secimVar: false,
      panoDolu: false,
      duzenlenebilir: true,
      seciliSatir: 1,
      bagliPanelVar: false,
      denetimVar: true,
    });
    const ekle = gruplar[0].find((o) => o.eylem.tur === 'sozluge-ekle')!;
    expect(ekle.pasif).toBeFalsy();
    expect(sozlugeEkle(doc, (ekle.eylem as { kelime: string }).kelime)).toBe(true);

    // `useDilKabugu` kabuğa ÖZGÜN yazımları taşıyor (anahtarları değil).
    d.ozelEkle(Object.values(sozlukMap(doc).toJSON() as Record<string, string>));
    return d;
  }

  const OZEL: { dil: string; kelime: string; baskaBicim: string }[] = [
    { dil: 'tr', kelime: 'Ayşe', baskaBicim: 'AYŞE' },
    { dil: 'tr', kelime: 'Işıl', baskaBicim: 'IŞIL' },
    { dil: 'en-US', kelime: 'Shinjuku', baskaBicim: 'SHINJUKU' },
    { dil: 'de', kelime: 'Kreuzberg', baskaBicim: 'kreuzberg' },
    { dil: 'fr', kelime: 'Belleville', baskaBicim: 'BELLEVILLE' },
    { dil: 'ru', kelime: 'Арбат', baskaBicim: 'арбат' },
    { dil: 'uk', kelime: 'Поділ', baskaBicim: 'ПОДІЛ' },
  ];

  for (const o of OZEL) {
    it(`${o.dil}: "${o.kelime}" eklendikten sonra artık yanlış değil`, () => {
      const d = dongu(o.dil, o.kelime);
      expect(d.dogru(o.kelime)).toBe(true);
    });

    it(`${o.dil}: BAŞKA bir yazım biçimi de kabul ediliyor (${o.baskaBicim})`, () => {
      const d = dongu(o.dil, o.kelime);
      expect(d.dogru(o.baskaBicim)).toBe(true);
    });
  }

  /* Romanize Japonca: spec `ja` sözlüğü YOK diyor, çare proje sözlüğü.
     Ölçülmezse "çare" iddiası doğrulanmamış kalırdı. */
  it('Japonca sözlük olmasa da proje sözlüğü çare oluyor (AKIRA, shinjuku)', () => {
    const d = denetleyiciKur('en-US');
    const doc = new Y.Doc();
    expect(sozlugeTopluEkle(doc, ['AKIRA', 'shinjuku', 'Neo-Tokyo'])).toBe(3);
    d.ozelEkle(Object.values(sozlukMap(doc).toJSON() as Record<string, string>));
    for (const k of ['AKIRA', 'akira', 'Shinjuku', 'SHINJUKU', 'neo-tokyo']) {
      expect(d.dogru(k)).toBe(true);
    }
  });

  /* Bütün bir sahnenin kelimeleri toplu eklenince metin TAMAMEN temizleniyor
     mu — tek tek eklemek ile toplu eklemek aynı sonucu vermeli. */
  it('toplu ekleme sonrası sahne metninde HİÇ yanlış kalmıyor', () => {
    const metin = 'İÇ. ŞİŞLİ - GECE\nAyşe kapıyı iter. Işık yok.';
    const d = denetleyiciKur('tr');
    const doc = new Y.Doc();
    const oncekiYanlis = yanlislar(metin, d);
    expect(oncekiYanlis.length).toBeGreaterThan(0);

    sozlugeTopluEkle(doc, oncekiYanlis);
    d.ozelEkle(Object.values(sozlukMap(doc).toJSON() as Record<string, string>));
    expect(yanlislar(metin, d)).toEqual([]);
  });

  /* Proje sözlüğü ORTAK ÇALIŞMADA paylaşılıyor: bir yazarın eklediği ad
     ötekinde de düzelmeli. Yjs birleşmesi üzerinden ölçülüyor. */
  it('bir yazarın eklediği ad ötekinin denetleyicisinde de kabul ediliyor', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    sozlugeEkle(a, 'Ayşe');
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    const dB = denetleyiciKur('tr');
    expect(dB.dogru('AYŞE')).toBe(false);
    dB.ozelEkle(Object.values(sozlukMap(b).toJSON() as Record<string, string>));
    expect(dB.dogru('AYŞE')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 4. Dil değişince denetim dili GERÇEKTEN değişiyor mu                */
/* ------------------------------------------------------------------ */

describe('dil seçimi kabuğa doğru taşınıyor', () => {
  /* `useDilKabugu`'nun süzgeci: `d === dil || d.startsWith(dil + '-')`. */
  const secim = (dil: string, mevcut: string[]) =>
    mevcut.filter((d) => d === dil || d.startsWith(`${dil}-`));

  it('bölgesiz kod bölgeli varyantların HEPSİNİ seçiyor', () => {
    expect(secim('en', ['tr', 'en-US', 'en-GB', 'de'])).toEqual(['en-US', 'en-GB']);
  });

  /* `de` ile `de-DE`nin ikisi de varsa ikisi de gidiyor; Chromium ikisini
     de kabul ediyor ve biri düşseydi hangisi kalacağı rastgele olurdu. */
  it('hem çıplak hem bölgeli kod varsa ikisi de gidiyor', () => {
    expect(secim('de', ['de', 'de-DE'])).toEqual(['de', 'de-DE']);
  });

  /* TUZAK: önek eşleşmesi tire OLMADAN yapılsaydı `ru` kodu `ruk`/`rus`
     gibi alakasız kodları da toplar ve `setSpellCheckerLanguages` fırlardı. */
  it('önek eşleşmesi TİRE gerektiriyor — ru, ruk ile karışmıyor', () => {
    expect(secim('ru', ['ru-RU', 'ruk', 'rus'])).toEqual(['ru-RU']);
  });

  it('desteklenmeyen dilde kabuğa HİÇBİR ŞEY gitmiyor', () => {
    expect(secim('ja', ['tr', 'en-US'])).toEqual([]);
  });

  /* BİLİNEN SINIR (davranış, hata değil): desteklenmeyen bir dile
     geçildiğinde `denetimDilleriniAyarla` HİÇ çağrılmıyor, yani denetim
     ÖNCEKİ dilde takılı kalıyor. Japonca yazan kullanıcı her kelimeyi
     Türkçe sözlüğe göre kırmızı görür. Ölçülüyor ki sessizce değişmesin. */
  it('desteklenmeyen dile geçiş ÖNCEKİ dili temizlemiyor — bilinen sınır', () => {
    const mevcut = ['tr', 'en-US'];
    expect(secim('tr', mevcut)).toEqual(['tr']);
    expect(secim('ja', mevcut)).toEqual([]); // → çağrı yok → 'tr' etkin kalır
  });

  /* Kullanıcı ayarı DİSKTEN geliyor ve Electron sürümü o kayıttan sonra
     değişmiş olabilir; bayat bir kod `setSpellCheckerLanguages`i fırlatır
     ve o çağrıdaki GEÇERLİ dilleri de götürür. */
  it('bayat kod süzülüyor, sıra korunuyor', () => {
    expect(gecerliDilleri(['fr', 'ja', 'tr', 'xx'], ['tr', 'de', 'fr'])).toEqual(['fr', 'tr']);
  });

  it('boş seçim ve boş mevcut liste FIRLATMIYOR', () => {
    expect(gecerliDilleri([], ['tr'])).toEqual([]);
    expect(gecerliDilleri(['tr'], [])).toEqual([]);
  });

  /* Kabuğun bildirdiği liste ARAYÜZE olduğu gibi yansımalı: attığımız her
     kod, kullanıcının seçemediği bir dil demek. */
  it('desteklenen altı dilin hepsi listede ve okunur adla', () => {
    const liste = denetimDilleri(['tr', 'en-US', 'en-GB', 'de', 'fr', 'ru', 'uk']);
    expect(liste.map((x) => x.ad)).toEqual([
      'Almanca',
      'Fransızca',
      'İngilizce (ABD)',
      'İngilizce (Britanya)',
      'Rusça',
      'Türkçe',
      'Ukraynaca',
    ]);
  });

  /* Sıralama TÜRKÇE yerelle yapılıyor; menü Türk kullanıcı için alfabetik
     görünmeli. */
  it('sıralama Türkçe alfabeye göre', () => {
    const liste = denetimDilleri(['uk', 'tr', 'en']);
    expect(liste.map((x) => x.ad)).toEqual(['İngilizce', 'Türkçe', 'Ukraynaca']);
  });
});

/* ------------------------------------------------------------------ */
/* 5. Menü sözleşmesi — web'de denetim YOK ve bu SÖYLENİYOR            */
/* ------------------------------------------------------------------ */

describe('web kabuğunda denetim yok — olmayan yetenek gösterilmiyor', () => {
  const temel = {
    secimVar: true,
    panoDolu: true,
    duzenlenebilir: true,
    seciliSatir: 1,
    bagliPanelVar: false,
  };

  it('denetim yokken yazım grubu HİÇ oluşmuyor', () => {
    const gruplar = baglamMenusu({
      ...temel,
      denetimVar: false,
      yanlisKelime: 'kapu',
      oneriler: ['kapı'],
    });
    const hepsi = gruplar.flat();
    expect(hepsi.some((o) => o.eylem.tur === 'sozluge-ekle')).toBe(false);
    expect(hepsi.some((o) => o.eylem.tur === 'oneri')).toBe(false);
    // Ama düzenleme grubu duruyor: kes/kopyala denetimden bağımsız.
    expect(hepsi.some((o) => o.eylem.tur === 'kopyala')).toBe(true);
  });

  it('denetim var ama yanlış kelime yoksa yine grup yok', () => {
    const gruplar = baglamMenusu({ ...temel, denetimVar: true });
    expect(gruplar.flat().some((o) => o.eylem.tur === 'yoksay')).toBe(false);
  });

  /* Önerisi olmayan yanlış kelimede grup YİNE görünmeli: "sözlüğe ekle"
     kullanıcının TEK çaresidir, gizlenirse çare kalmaz. */
  it('önerisi olmayan kelimede "sözlüğe ekle" yine görünüyor', () => {
    const gruplar = baglamMenusu({
      ...temel,
      denetimVar: true,
      yanlisKelime: 'Zzzxq',
      oneriler: [],
    });
    expect(gruplar[0].map((o) => o.eylem.tur)).toEqual(['sozluge-ekle', 'yoksay']);
  });

  /* Salt-okur kullanıcı belgeye yazamaz ama kırmızı altçizgiden
     kurtulabilmeli: "yoksay" oturumluk ve ETKİN kalmalı. */
  it('salt-okur: ekleme pasif, yoksayma ETKİN', () => {
    const gruplar = baglamMenusu({
      ...temel,
      duzenlenebilir: false,
      denetimVar: true,
      yanlisKelime: 'kapu',
      oneriler: ['kapı'],
    });
    const yazim = gruplar[0];
    expect(yazim.find((o) => o.eylem.tur === 'oneri')!.pasif).toBe(true);
    expect(yazim.find((o) => o.eylem.tur === 'sozluge-ekle')!.pasif).toBe(true);
    expect(yazim.find((o) => o.eylem.tur === 'yoksay')!.pasif).toBeFalsy();
  });

  /* Uzun öneri listesi menüyü kullanılmaz yapar; sınır 5. Denetleyici
     bazen 20 öneri döner. */
  it('öneri listesi 5 ile sınırlı, İLK beş korunuyor', () => {
    const cok = Array.from({ length: 20 }, (_, i) => `o${i}`);
    const gruplar = baglamMenusu({
      ...temel,
      denetimVar: true,
      yanlisKelime: 'x',
      oneriler: cok,
    });
    const oneriler = gruplar[0].filter((o) => o.eylem.tur === 'oneri');
    expect(oneriler).toHaveLength(5);
    expect(oneriler.map((o) => (o.eylem as { oneri: string }).oneri)).toEqual(cok.slice(0, 5));
  });
});

/* ------------------------------------------------------------------ */
/* 6. Güven sınırı — sözlüğe ne girer, ne girmez                       */
/* ------------------------------------------------------------------ */

describe('sözlük güven sınırı — uç girdiler', () => {
  it('emoji tek başına sözlüğe GİRMİYOR (harf yok)', () => {
    expect(sozlugeUygun('😀')).toBe(false);
    expect(sozlugeUygun('👨‍👩‍👧‍👦')).toBe(false);
  });

  it('emoji yığını da reddediliyor — harf sınavını geçemez', () => {
    expect(sozlugeUygun('😀'.repeat(32))).toBe(false);
  });

  it('yalnız birleşik işaret içeren parça reddediliyor', () => {
    expect(sozlugeUygun('̇́')).toBe(false);
  });

  it('sıfır genişlikli birleştirici tek başına reddediliyor', () => {
    expect(sozlugeUygun('‍')).toBe(false);
  });

  it('satır sonu ve sekme kırpılıyor', () => {
    expect(sozlukAnahtari('\n\tAyşe\r\n')).toBe(sozlukAnahtari('Ayşe'));
  });

  /* Ayırıcı çok satırlı metinde satır sınırlarını kelimeye KARIŞTIRMAMALI. */
  it('çok satırlı metinde kelimeler satır sınırında birleşmiyor', () => {
    expect(kelimeleriAyir('Ayşe\nkapıyı\r\niter')).toEqual(['Ayşe', 'kapıyı', 'iter']);
  });

  it('emoji araya girse de kelimeler ayrı çıkıyor', () => {
    expect(kelimeleriAyir('Ayşe 😀 Kenji')).toEqual(['Ayşe', 'Kenji']);
  });

  /* NFD Türkçe: `ş` = s + U+0327. Ayırıcının `\p{M}` sınıfı bunu kelimenin
     İÇİNDE tutmalı, yoksa `s` ve boş bir işaret olarak ikiye bölünürdü. */
  it('NFD Türkçe harf tek kelime olarak çıkıyor ve NFC ile aynı anahtar', () => {
    const nfd = 'Ayşe kapı'.normalize('NFD');
    const kelimeler = kelimeleriAyir(nfd);
    expect(kelimeler).toHaveLength(2);
    expect(sozlukAnahtari(kelimeler[0])).toBe(sozlukAnahtari('Ayşe'));
    expect(sozlukAnahtari(kelimeler[1])).toBe(sozlukAnahtari('kapı'));
  });

  it('tek öğe ve boş metin — uç durumlar fırlatmıyor', () => {
    expect(kelimeleriAyir('')).toEqual([]);
    expect(kelimeleriAyir('   \n\t  ')).toEqual([]);
    expect(kelimeleriAyir('a')).toEqual(['a']);
  });

  /* ÇOK BÜYÜK metin: 5.000 satırlık bir senaryonun kelime ayrımı kabul
     edilebilir sürede bitmeli — ayırıcı her sağ tıkta çalışabilir. */
  it('5.000 satırlık metin makul sürede ayrılıyor ve tekrarlar teke iniyor', () => {
    const satirlar = Array.from({ length: 5000 }, (_, i) => `Ayşe kapıyı iter. Işık ${i} yok.`);
    const baslangic = performance.now();
    const kelimeler = kelimeleriAyir(satirlar.join('\n'));
    const sure = performance.now() - baslangic;
    // 5.000 satırda yalnız 5 benzersiz kelime var — tekilleştirme çalışıyor.
    expect(kelimeler).toEqual(['Ayşe', 'kapıyı', 'iter', 'Işık', 'yok']);
    expect(sure).toBeLessThan(2000);
  });

  /* İki katmanın birleşimi: proje ÜSTTE ama kullanıcı katmanı KAYBOLMAMALI. */
  it('birleştirme her iki katmanı da koruyor, çakışmada proje kazanıyor', () => {
    const kullanici: SozlukKaydi = { ayse: 'Ayse', kenji: 'Kenji' };
    const proje: SozlukKaydi = { ayse: 'Ayşe', київ: 'Київ' };
    const birlesik = sozlukBirlestir(kullanici, proje);
    expect(Object.keys(birlesik).sort()).toEqual(['ayse', 'kenji', 'київ']);
    expect(birlesik.ayse).toBe('Ayşe');
    expect(sozlukteVar(birlesik, 'KENJI')).toBe(true);
  });
});
