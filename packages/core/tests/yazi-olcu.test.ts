import { describe, expect, it } from 'vitest';
import { COURIER_PRIME, TINOS, genislikEm, yaziTipi } from '@storyboard/core/format/yazi';
import { sarmala, sarmalaOlcuyle, sayfala } from '@storyboard/core/format/sayfala';
import { tipProfili, sayfaSatirSayisi, satirYuksekligiMm } from '@storyboard/core/format/profil';
import { IZGARA, SATIR_MM } from '@storyboard/core/format/izgara';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * ORANTILI YAZI ÖLÇÜSÜ (kullanıcı kararı 2026-08-26).
 *
 * Motorun tamamı sabit bir KARAKTER IZGARASI sayıyordu. Senaryo için doğru —
 * sayfa ≈ dakika sözleşmesi ızgaranın kendisidir — ama romanı ölçemez: el
 * yazması standardı Times 12pt çift aralıktır ve Times orantılıdır.
 *
 * Bu dosyanın ilk işi ESKİ YOLUN DEĞİŞMEDİĞİNİ çivilemek: senaryo sayfa
 * sayısı değişseydi bugüne kadar teslim edilmiş her ölçü yalan olurdu.
 */

const blok = (id: string, type: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id, fp: '', type, text, scene: '', sceneId: '' });

describe('senaryo yolu SAYISAL OLARAK aynı kaldı', () => {
  it('Courier ilerlemesi ızgara sabitiyle aynı', () => {
    /* TÜRETİM: Courier 12pt yatayda 10 karakter/inç → karakter başına 0.1 in.
       12pt em = 12/72 in = 0.1667 in. 0.1 / 0.1667 = 0.6. İkisi ıraksarsa
       sayfa sayısı yalan söyler. */
    expect(COURIER_PRIME.ilerlemeEm(65)).toBeCloseTo(0.6, 10);
    expect(COURIER_PRIME.ilerlemeEm(32)).toBeCloseTo(0.6, 10);
  });

  it('Courier sayfası hâlâ 55 satır', () => {
    expect(sayfaSatirSayisi(COURIER_PRIME)).toBe(IZGARA.satir);
  });

  it('Courier satır yüksekliği 1/6 inç', () => {
    expect(satirYuksekligiMm(COURIER_PRIME)).toBeCloseTo(SATIR_MM, 10);
  });

  it('eşgenişlikli sarma karakter sayısıyla aynı sonucu veriyor', () => {
    const olcuyle = sarmalaOlcuyle('aaa bbb ccc', 7, (m) => m.length);
    expect(olcuyle).toEqual(sarmala('aaa bbb ccc', 7));
  });
});

describe('Tinos — Times metrikleri', () => {
  /* Times'ta boşluk 0.25em, `!` 0.333em, `m` 0.778em. Hepsi karakter
     sayısıyla ölçülemez: `iii` ile `mmm` aynı sayıda karakter ama Times'ta
     ikincisi üç kat geniş. */
  it('harfler farklı genişlikte — Times tablosunun TAM değerleriyle', () => {
    const i = TINOS.ilerlemeEm('i'.codePointAt(0)!);
    const m = TINOS.ilerlemeEm('m'.codePointAt(0)!);
    expect(m).toBeGreaterThan(i * 2);
    /* `m > i*2` tabloyu ÖLÇMÜYORDU: bütün genişlikleri iki katına çıkaran
       (yani sayfa sayısını yarıya indiren) bir mutant da bu oranı korur ve
       geçerdi. Ölçünün kendisi çivileniyor — sayfa sayısı buna bağlı. */
    expect(i).toBeCloseTo(0.277832, 6);
    expect(m).toBeCloseTo(0.777832, 6);
    expect(TINOS.ilerlemeEm(65), 'A').toBeCloseTo(0.722168, 6);
  });

  it('boşluk Times ölçüsünde (0.25em)', () => {
    expect(TINOS.ilerlemeEm(32)).toBeCloseTo(0.25, 3);
  });

  /* `> 0` sessiz VARSAYILANA DÜŞMEYİ göremiyordu: `ğ` tabloda olmasa da
     0,5 varsayılanı dönerdi ve test yeşil kalırdı — oysa Türkçe metnin
     sayfa sayısı tam o harflerin ölçüsüne bağlı. Değerler tek tek çivili;
     hiçbiri varsayılana eşit DEĞİL (`ö ü ğ` dışında — onlar tesadüfen 0,5). */
  it('Türkçe harfler tabloda — TAM ölçüleriyle, varsayılana düşmüyor', () => {
    expect([...'ÇçĞğİıÖöŞşÜü'].map((h) => [h, TINOS.ilerlemeEm(h.codePointAt(0)!)]))
      .toEqual([
        ['Ç', 0.666992], ['ç', 0.443848], ['Ğ', 0.722168], ['ğ', 0.5],
        ['İ', 0.333008], ['ı', 0.277832], ['Ö', 0.722168], ['ö', 0.5],
        ['Ş', 0.556152], ['ş', 0.38916], ['Ü', 0.722168], ['ü', 0.5],
      ]);
    /* Küçük harfler büyüklerden dar: tabloyu tek bir sabitle dolduran
       mutant yukarıdaki eşitliği geçemez ama bu ilişki niyeti anlatıyor. */
    for (const [buyuk, kucuk] of [['Ç', 'ç'], ['İ', 'ı'], ['Ş', 'ş']] as const) {
      expect(TINOS.ilerlemeEm(kucuk.codePointAt(0)!), `${buyuk}/${kucuk}`)
        .toBeLessThan(TINOS.ilerlemeEm(buyuk.codePointAt(0)!));
    }
  });

  /* Tabloda olmayan kod noktası VARSAYILANA düşüyor — fırlatmıyor. Bir
     emoji yüzünden belge açılamaz olmak, satır sayısının o satırda yaklaşık
     olmasından çok daha pahalı. */
  it('tanınmayan kod noktası varsayılana düşüyor — varsayılan 0,5 em', () => {
    /* `> 0` varsayılanın DEĞERİNİ ölçmüyordu: 0,05 em'lik bir varsayılan da
       geçerdi ve emoji dolu bir sayfa on kat fazla satır sığdırırdı. */
    expect(TINOS.ilerlemeEm(0x1f600)).toBe(0.5);
    // Astral düzlemin başka noktaları, ZWJ ve seçici de aynı varsayılana düşüyor.
    for (const kn of [0x1f600, 0x1f469, 0x200d, 0xfe0f, 0x10ffff, 0x4e00, 0x0640]) {
      expect(TINOS.ilerlemeEm(kn), `U+${kn.toString(16)}`).toBe(0.5);
    }
  });

  /* ZWJ ile birleşen emoji ailesi: dört kod noktası + üç birleştirici =
     yedi kod noktası. Kod BİRİMİ üzerinden gezen bir ölçüm on bir sayardı. */
  it('ZWJ emoji birleşimi kod NOKTASI başına ölçülüyor', () => {
    const aile = '👨‍👩‍👧';
    expect([...aile]).toHaveLength(5); // 3 emoji + 2 ZWJ
    expect(genislikEm(aile, TINOS)).toBeCloseTo(5 * 0.5, 10);
    expect(aile.length, 'kod BİRİMİ sayısı farklı — birim üzerinden sayılmıyor').toBe(8);
  });

  it('genişlik KOD NOKTASI üzerinden — vekil çift iki kez sayılmıyor', () => {
    /* Emoji iki kod BİRİMİ ama bir kod NOKTASI. Birim üzerinden gezilseydi
       genişlik iki katına çıkardı. */
    expect(genislikEm('😀', TINOS)).toBeCloseTo(TINOS.ilerlemeEm(0x1f600), 10);
  });

  it('çift aralık: sayfaya Courier"in yarısı kadar satır sığıyor', () => {
    expect(TINOS.satirEm).toBe(2);
    expect(sayfaSatirSayisi(TINOS)).toBe(Math.floor(IZGARA.satir / 2));
  });
});

describe('orantılı sarma genişliği ÖLÇÜYOR', () => {
  const olc = (m: string) => genislikEm(m, TINOS);

  it('dar harfler aynı satıra daha çok sığıyor — satır sayıları TAM', () => {
    const dar = sarmalaOlcuyle('i'.repeat(40).split('').join(' '), 10, olc);
    const genis = sarmalaOlcuyle('m'.repeat(40).split('').join(' '), 10, olc);
    expect(genis.length).toBeGreaterThan(dar.length);
    /* `genis > dar` yalnız SIRALAMAYI ölçüyordu: ölçüyü tamamen bozup 3'e 40
       veren bir mutant da geçerdi. Sayılar çivili — sayfa sayısı bunlardan
       türüyor. */
    expect(dar).toHaveLength(3);
    expect(genis).toHaveLength(5);
    // Hiçbir satır sınırı aşmıyor (ölçü doğruysa bu da tutar).
    for (const s of [...dar, ...genis]) expect(olc(s)).toBeLessThanOrEqual(10 + 1e-9);
  });

  it('hiçbir satır sınırı aşmıyor', () => {
    const metin = 'Kar yağıyordu ve pencereden bakıldığında sokak bembeyazdı.'.repeat(4);
    for (const s of sarmalaOlcuyle(metin, 12, olc)) {
      expect(olc(s)).toBeLessThanOrEqual(12 + 1e-9);
    }
  });

  /* Sığmayan tek kelime ÖLÇÜLEREK bölünüyor: karakter sayısıyla bölünseydi
     `mmmm` ile `iiii` aynı yerden kesilir, ilki satırı taşırırdı. */
  it('sığmayan kelime ölçülerek bölünüyor', () => {
    const parcalar = sarmalaOlcuyle('mmmmmmmmmm', 2, olc);
    expect(parcalar.length).toBeGreaterThan(1);
    for (const p of parcalar) expect(olc(p)).toBeLessThanOrEqual(2 + 1e-9);
    /* `> 1` her bölünmeyi kabul ediyordu — harf harf bölen bir mutant (on
       parça) da geçerdi. `m` 0,778em, sınır 2em: parça başına TAM İKİ harf.
       Ayrıca metnin tamamı korunuyor. */
    expect(parcalar).toEqual(['mm', 'mm', 'mm', 'mm', 'mm']);
    expect(parcalar.join('')).toBe('mmmmmmmmmm');
  });

  /* KESME NOKTASI KARAKTER SAYISINDAN GELMİYOR. Dar harflerle karakter
     sayısı tesadüfen doğru çıkıyordu ve "sınır kadar karakter al" mutantı
     hayatta kalmıştı (ölçüldü); karışık genişlikte ayrışıyor: `i` 0.278em,
     `m` 0.778em. */
  it('kesme noktası GENİŞLİKTEN, karakter sayısından değil', () => {
    const parcalar = sarmalaOlcuyle('iiiiimmmmm', 3, olc);
    const ilk = parcalar[0]!;
    expect(ilk.length, 'üç karakterden fazlası sığar').toBeGreaterThan(3);
    expect(olc(ilk)).toBeLessThanOrEqual(3 + 1e-9);
    /* `> 3` beşi de yedisi de kabul ediyordu; doğru kesme noktası TEK bir
       yerdedir: 5×0,278 + 2×0,778 = 2,946em sığar, üçüncü `m` 3,724em ile
       taşar. Tam bölünme çivileniyor. */
    expect(parcalar).toEqual(['iiiiimm', 'mmm']);
    expect(parcalar.join('')).toBe('iiiiimmmmm');
  });

  it('bölme AÇGÖZLÜ — bir harf daha eklenirse sınır aşılır', () => {
    const sinir = 3;
    const parcalar = sarmalaOlcuyle('iiiiimmmmmiiiii', sinir, olc);
    for (const [i, p] of parcalar.entries()) {
      if (i === parcalar.length - 1) continue;
      const sonraki = parcalar[i + 1]!;
      expect(olc(p + sonraki[0]), `parça ${i} daha fazlasını alabilirdi`)
        .toBeGreaterThan(sinir);
    }
  });

  it('sınır sıfır ya da negatifse FIRLATIYOR — sonsuz döngü yerine hata', () => {
    expect(() => sarmalaOlcuyle('a', 0, olc)).toThrow();
    expect(() => sarmalaOlcuyle('a', -1, olc)).toThrow();
    expect(() => sarmalaOlcuyle('a', Number.NaN, olc)).toThrow();
    // Sonsuz ve -sonsuz da geçerli sınır değil: ilki hiç bölmez, ikincisi kilitler.
    expect(() => sarmalaOlcuyle('a', Number.NEGATIVE_INFINITY, olc)).toThrow();
  });

  /* UÇ DURUMLAR: boş metin, yalnız boşluk, çok satırlı metin ve Unicode.
     Sarmalayıcı editör metnini doğrudan alıyor; bu girdiler kullanıcıdan
     gerçekten geliyor ve hiçbirinde çökmemeli, metin kaybetmemeli. */
  it('boş ve boşluktan ibaret metin çökmüyor', () => {
    expect(sarmalaOlcuyle('', 10, olc)).toEqual(['']);
    expect(sarmalaOlcuyle('   ', 10, olc).join('').trim()).toBe('');
  });

  it('NFD Türkçe metin NFC ile AYNI sonucu veriyor — sessiz ıraksama yok', () => {
    const ham = 'Ayşe İstiklal Caddesi\'nde ışığı gördü ve durdu';
    /* NFD"de `ş` iki kod noktası: ölçüm birleştirici işareti ayrı sayarsa
       aynı cümle NFD"de daha geniş ölçülür ve sayfa sayısı ıraksar. */
    expect(ham.normalize('NFD')).not.toBe(ham.normalize('NFC'));
    const nfc = sarmalaOlcuyle(ham.normalize('NFC'), 8, olc);
    const nfd = sarmalaOlcuyle(ham.normalize('NFD'), 8, olc);
    expect(nfd.map((s) => s.normalize('NFC'))).toEqual(nfc);
  });

  it('çok uzun tek kelime bölünüyor ve TEK harf bile kaybolmuyor', () => {
    const dev = 'm'.repeat(5000);
    const parcalar = sarmalaOlcuyle(dev, 3, olc);
    expect(parcalar.join('')).toBe(dev);
    // 3 × 0,778 = 2,334em sığar; dördüncüsü 3,111em ile taşar → parça başına 3 harf.
    expect(parcalar).toHaveLength(1667);
    expect(parcalar[0]).toBe('mmm');
    expect(parcalar.at(-1), 'son parça artan iki harf').toBe('mm');
    for (const p of parcalar) expect(olc(p)).toBeLessThanOrEqual(3 + 1e-9);
  });
});

describe('yazı KİLİDİ doküman tipinden türetiliyor', () => {
  /* Kilit ⇔ `sayfaDakika`. Ayrı bir bayrak tutulsaydı biri değişince öteki
     sessizce eskirdi (Karar 2). */
  it('senaryo ailesinde kilitli ve Times istense bile Courier kalıyor', () => {
    for (const tip of ['senaryo', 'dizi', 'sahne-oyunu', 'radyo-oyunu']) {
      const p = tipProfili(tip, 'letter', 'tr', TINOS);
      expect(p.yaziKilitli, tip).toBe(true);
      expect(p.yazi.id, `${tip}: sayfa ≈ dakika sözleşmesi ızgaraya bağlı`).toBe('courier-prime');
    }
  });

  it('roman ve düz metinde serbest', () => {
    for (const tip of ['roman', 'duz-metin', 'cizgi-roman']) {
      const p = tipProfili(tip, 'letter', 'tr', TINOS);
      expect(p.yaziKilitli, tip).toBe(false);
      expect(p.yazi.id, tip).toBe('tinos');
    }
  });

  it('verilmezse Courier — eski çağıranlar birebir aynı davranıyor', () => {
    expect(tipProfili('roman', 'letter', 'tr').yazi.id).toBe('courier-prime');
  });

  it('tanınmayan yazı adı null — çağıran düşürme kararını kendi veriyor', () => {
    expect(yaziTipi('yok-boyle')).toBeNull();
    expect(yaziTipi(42)).toBeNull();
    expect(yaziTipi('tinos')).toBe(TINOS);
  });
});

describe('sayfalayıcı yazıyı kullanıyor', () => {
  const uzun = Array.from({ length: 40 }, (_, i) =>
    blok(`b${i}`, 'paragraf', 'Kar yağıyordu ve pencereden bakıldığında sokak bembeyazdı.'));

  it('Times ile sayfa sayısı Courier"den FARKLI', () => {
    const c = sayfala(uzun, tipProfili('roman', 'letter', 'tr', COURIER_PRIME)).length;
    const t = sayfala(uzun, tipProfili('roman', 'letter', 'tr', TINOS)).length;
    /* Çift aralık sayfaya yarı satır sığdırıyor; aynı metin daha çok sayfa
       tutuyor. Aynı çıksaydı yazı seçimi motora hiç ulaşmıyor demekti.

       `t > c` yalnız yönü ölçüyordu: Courier"i 1 sayfaya indiren ya da
       Times"ı 40 sayfaya çıkaran bir mutant da geçerdi. İkisi de çivili. */
    expect(t).toBeGreaterThan(c);
    expect(c, 'Courier — 40 paragraf').toBe(2);
    expect(t, 'Times çift aralık — 40 paragraf').toBe(3);
  });

  it('hiçbir sayfa satır sınırını aşmıyor', () => {
    const profil = tipProfili('roman', 'letter', 'tr', TINOS);
    for (const s of sayfala(uzun, profil)) {
      expect(s.satirlar.length).toBeLessThanOrEqual(profil.satirSayisi);
    }
  });

  it('metin KAYBOLMUYOR — bütün bloklar sayfalarda', () => {
    const profil = tipProfili('roman', 'letter', 'tr', TINOS);
    const gorulen = new Set(
      sayfala(uzun, profil).flatMap((s) => s.satirlar.map((r) => r.blockId)),
    );
    expect(gorulen.size).toBe(uzun.length);
  });
});
