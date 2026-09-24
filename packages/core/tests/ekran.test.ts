import { describe, expect, it } from 'vitest';
import {
  COURIER_EN_ORANI,
  YAZI_MM,
  blokKurallari,
  girintiSutun,
  metinSayaclari,
  sayaclar,
  sayfaDegiskenleri,
  sayfaDolgulari,
  sayfaSinirlari,
  sureklilikSatirlari,
} from '@storyboard/core/format/ekran';
import type { Sayfa, SayfaSatiri } from '@storyboard/core/format/sayfala';
import { IZGARA, KARAKTER_MM, SATIR_MM } from '@storyboard/core/format/izgara';
import { AMERIKAN_BLOKLAR, profilOlustur, sutunGenisligi } from '@storyboard/core/format/profil';
import { sayfala } from '@storyboard/core/format/sayfala';
import type { ScriptBlock, ScriptBlockType } from '@storyboard/core/model/script';

/**
 * SÜREKLİLİK SATIRLARI EKRANDA — ajan taramasının bulgusu (2026-08-31).
 *
 * Bu satırlar belgede yok, sayfalayıcı üretiyor; ama yer KAPLIYORLAR ve
 * ekranın blok konumları da aynı sayfalardan türüyor. Çizilmedikleri sürece
 * PDF'te "(DEVAMI VAR)" yazan yerde ekranda BOŞLUK kalıyordu.
 */
describe('sureklilikSatirlari — PDF ile ekran aynı şeyi gösteriyor', () => {
  const sayfa = (no: number, satirlar: Partial<SayfaSatiri>[]): Sayfa => ({
    no,
    satirlar: satirlar.map((x) => ({
      blockId: 'b', tip: 'dialogue', satirIndex: 0, metin: '', ...x,
    })) as SayfaSatiri[],
  });

  it('işaretsiz sayfada hiçbir şey üretmiyor — ayar kapalıyken bedeli yok', () => {
    expect(sureklilikSatirlari([sayfa(1, [{ metin: 'a' }, { metin: 'b' }])], 55)).toEqual([]);
  });

  it('ofset SAYFA SINIRLARIYLA aynı ızgaradan — sayfa no × satır sayısı + indeks', () => {
    const s = sureklilikSatirlari([
      sayfa(1, [{ metin: 'x' }, { metin: '(DEVAMI VAR)', surekliligi: 'devami-var' }]),
      sayfa(2, [{ metin: 'AYŞE (DEVAM)', surekliligi: 'devam' }]),
    ], 55);
    expect(s.map((x) => [x.satirOfseti, x.tur, x.metin])).toEqual([
      [1, 'devami-var', '(DEVAMI VAR)'],
      [55, 'devam', 'AYŞE (DEVAM)'],
    ]);
  });

  it('anahtarlar benzersiz — React listesi çakışmamalı', () => {
    const s = sureklilikSatirlari([
      sayfa(1, [{ metin: 'a', surekliligi: 'devami-var' }]),
      sayfa(2, [{ metin: 'b', surekliligi: 'devam' }]),
    ], 55);
    expect(new Set(s.map((x) => x.anahtar)).size).toBe(2);
  });
});

const profil = (kagit: 'letter' | 'a4' = 'letter') => profilOlustur('amerikan', kagit, 'tr');

let sayac = 0;
const blok = (type: ScriptBlockType, text: string): ScriptBlock => ({
  id: `b${sayac++}`, fp: '', type, text, scene: '', sceneId: '',
});

describe('Courier metriği türetilir, varsayılmaz', () => {
  it('YAZI_MM karakter genişliğinden ve en oranından çıkar', () => {
    expect(YAZI_MM).toBeCloseTo(KARAKTER_MM / COURIER_EN_ORANI, 10);
  });

  /* Bu eşitlik Courier 12pt'nin bir ÖZELLİĞİ (10 karakter/inç × 6 satır/inç,
     12pt = 1/6 inç), ızgaranın bir kuralı değil. Kodda `font-size: SATIR_MM`
     yazmak ilişkiyi görünmez kılardı; burada iddia edilir ki yazı tipi
     değişirse bu test kırılsın ve ilişki yeniden düşünülsün. */
  it('Courier 12pt\'de punto ile satır yüksekliği ÇAKIŞIR — tesadüf, kural değil', () => {
    expect(YAZI_MM).toBeCloseTo(SATIR_MM, 10);
  });
});

describe('girintiSutun — her girinti TEK TEK tam karakter olmalı', () => {
  it('Amerikan profilinin bütün girintileri tam karakter', () => {
    for (const [tip, stil] of Object.entries(AMERIKAN_BLOKLAR)) {
      const { sol, sag } = girintiSutun(stil);
      expect(Number.isInteger(sol), tip).toBe(true);
      expect(Number.isInteger(sag), tip).toBe(true);
    }
  });

  it('diyalog girintisi profildeki mm ölçüsünden türer', () => {
    // 25,4 mm = 10 karakter, 38,1 mm = 15 karakter → 60 - 25 = 35 sütun (§6.4).
    expect(girintiSutun(AMERIKAN_BLOKLAR.dialogue!)).toEqual({ sol: 10, sag: 15 });
    expect(sutunGenisligi(AMERIKAN_BLOKLAR.dialogue!)).toBe(35);
  });

  /* `sutunGenisligi`'nin KOPYASI DEĞİL: o TOPLAMI doğrular. Yarım karakterlik
     iki girinti toplamda tam bir karaktere denk gelir ve oradan sorunsuz
     geçer — ama ekranda metin karakter ızgarasının yarım hücre dışına oturur
     ve DOM motordan farklı yerde sarar. */
  it('toplamı tam olan ama TEK TEK yarım olan girintiyi reddeder', () => {
    const yarim = { ...AMERIKAN_BLOKLAR.action!, solMm: KARAKTER_MM / 2, sagMm: KARAKTER_MM / 2 };
    expect(() => sutunGenisligi(yarim)).not.toThrow();
    expect(sutunGenisligi(yarim)).toBe(IZGARA.sutun - 1);
    expect(() => girintiSutun(yarim)).toThrow(/tam karakter degil/);
  });
});

describe('sayfaDegiskenleri', () => {
  it('kağıt değişince marj değişkenleri değişir, ızgara değişkenleri değişmez', () => {
    const l = sayfaDegiskenleri(profil('letter'), 1);
    const a = sayfaDegiskenleri(profil('a4'), 1);
    expect(l['--sayfa-genislik']).not.toBe(a['--sayfa-genislik']);
    expect(l['--sayfa-sag']).not.toBe(a['--sayfa-sag']);
    // Izgara SABİT, marj esner (§6.3).
    expect(l['--sutun']).toBe(a['--sutun']);
    expect(l['--satir']).toBe(a['--satir']);
    expect(l['--sayfa-sol']).toBe(a['--sayfa-sol']);
  });

  it('sütun genişliği ızgaradan gelir ve KARAKTER cinsindendir', () => {
    expect(sayfaDegiskenleri(profil(), 1)['--sutun']).toBe(`${IZGARA.sutun}ch`);
  });

  it('blok girintileri profilden türetilmiş değişkenlere yazılır', () => {
    const d = sayfaDegiskenleri(profil(), 1);
    expect(d['--girinti-dialogue']).toBe('10ch');
    expect(d['--cekme-dialogue']).toBe('15ch');
    expect(d['--girinti-character']).toBe('20ch');
    expect(d['--bos-scene']).toBe('calc(2 * var(--satir))');
    expect(d['--bos-parenthetical']).toBe('calc(0 * var(--satir))');
  });

  /* §16.1 BAĞLAYICI: "yakınlaştırma sayfa genişliğini değil ÖLÇEĞİ değiştirir
     — satır sonları ve sayfa numaraları asla kaymaz". Bunun yapısal karşılığı:
     ölçek YALNIZCA `--birim`'e girer. Başka bir değişken ölçekle değişseydi
     (örneğin sütun px'e çevrilseydi) sarma noktaları kayardı. */
  it('ölçek YALNIZCA --birim değişkenini değiştirir', () => {
    const bir = sayfaDegiskenleri(profil(), 1);
    const iki = sayfaDegiskenleri(profil(), 2.5);
    const farkli = Object.keys(bir).filter((k) => bir[k] !== iki[k]);
    expect(farkli).toEqual(['--birim']);
    expect(iki['--birim']).toBe('2.5mm');
  });

  it('geçersiz ölçeği reddeder', () => {
    expect(() => sayfaDegiskenleri(profil(), 0)).toThrow(/Olcek/);
    expect(() => sayfaDegiskenleri(profil(), -1)).toThrow(/Olcek/);
    expect(() => sayfaDegiskenleri(profil(), Number.NaN)).toThrow(/Olcek/);
  });
});

describe('blokKurallari', () => {
  const css = blokKurallari(profil());

  it('girintiyi SABİT uzunlukla değil değişkenle yazar', () => {
    expect(css).toContain('margin-left:var(--girinti-dialogue)');
    // Kaldırılan salt-okunur görüntüleyicinin `pl-16`/`pl-10` gibi ölçüye
    // bağlı olmayan sabitleri geri sızmasın.
    expect(css).not.toMatch(/margin-left:\s*\d/);
  });

  it('büyük harf ve hiza profilden gelir', () => {
    expect(css).toContain('.senaryo-metin [data-tip="scene"]{');
    expect(css).toMatch(/\[data-tip="scene"\][^}]*text-transform:uppercase/);
    expect(css).toMatch(/\[data-tip="action"\][^}]*text-transform:none/);
    expect(css).toMatch(/\[data-tip="transition"\][^}]*text-align:right/);
    /* Sahne başlığı KALIN (kullanıcı kararı 2026-08-26); aksiyon değil —
       kalınlık gerçekten AYIRT ediyor mu, o ölçülüyor. */
    expect(css).toMatch(/\[data-tip="scene"\][^}]*font-weight:700/);
    expect(css).toMatch(/\[data-tip="action"\][^}]*font-weight:400/);
  });

  it('her blok tipi için kural üretir', () => {
    for (const tip of Object.keys(AMERIKAN_BLOKLAR)) {
      expect(css).toContain(`[data-tip="${tip}"]`);
    }
  });
});

describe('sayfaSinirlari — sayfa sayısı EKRANDAN türetilmez (Karar 34)', () => {
  it('tek sayfalık senaryoda sınır yoktur', () => {
    const sayfalar = sayfala([blok('action', 'kısa')], profil());
    expect(sayfalar).toHaveLength(1);
    expect(sayfaSinirlari(sayfalar, IZGARA.satir)).toEqual([]);
  });

  it('sınır sayısı sayfa sayısının bir eksiğidir ve numaralar 2\'den başlar', () => {
    const bloklar = Array.from({ length: 80 }, (_, i) => blok('action', `Satır ${i}`));
    const sayfalar = sayfala(bloklar, profil());
    expect(sayfalar.length).toBeGreaterThan(1);
    const sinirlar = sayfaSinirlari(sayfalar, IZGARA.satir);
    expect(sinirlar).toHaveLength(sayfalar.length - 1);
    expect(sinirlar.map((s) => s.sayfaNo)).toEqual(
      sayfalar.slice(1).map((s) => s.no),
    );
  });

  it('blok ORTASINDA biten sayfada sınır satır indeksi taşır', () => {
    // Tek bir dev aksiyon bloğu: sayfa sonu bloğun içine düşmek zorunda.
    const uzun = blok('action', Array.from({ length: 400 }, (_, i) => `kelime${i}`).join(' '));
    const sayfalar = sayfala([uzun], profil());
    expect(sayfalar.length).toBeGreaterThan(1);
    const [sinir] = sayfaSinirlari(sayfalar, IZGARA.satir);
    expect(sinir.blockId).toBe(uzun.id);
    expect(sinir.satirIndex).toBeGreaterThan(0);
  });

  it('sınır her zaman motorun sayfa başı satırını gösterir', () => {
    const bloklar = Array.from({ length: 120 }, (_, i) =>
      blok(i % 7 === 0 ? 'scene' : 'action', `Metin ${i}`),
    );
    const sayfalar = sayfala(bloklar, profil());
    for (const sinir of sayfaSinirlari(sayfalar, IZGARA.satir)) {
      const ilk = sayfalar[sinir.sayfaNo - 1].satirlar[0];
      expect(sinir.blockId).toBe(ilk.blockId);
      // Sayfa boş ayırıcı satırla BAŞLAMAZ (§6.2) — indeks negatif olamaz.
      expect(sinir.satirIndex).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('sayfaSinirlari — satır ofseti (DOM ölçülmez)', () => {
  /* SÖZLEŞME DEĞİŞTİ (2026-08-30). Ofset eskiden AKAN satır toplamıydı ve
     burada "55 katı DEĞİLDİR" diye bir test duruyordu. O test kendi
     döneminde DOĞRUYDU: ekranda erken kapanan sayfanın kalan satırları yer
     kaplamıyordu, dolayısıyla sınır da akışı takip etmek zorundaydı.

     Artık sayfa başı blokları `sayfaDolgulari` kadar aşağı iniyor (elle
     sayfa başı isteği, kullanıcı 2026-08-30) — yani kağıt gerçekten
     sayfalanıyor ve sınır fiziksel sayfa tepesine oturuyor. İki kural tek
     yerde tutarlı olmak zorunda: dolgu konup sınır akışta bırakılsaydı
     çizgi metinden kopardı. */
  it('sınır ofseti fiziksel sayfa tepesidir — satirSayisi katı', () => {
    const bloklar = Array.from({ length: 80 }, (_, i) => blok('action', `Satır ${i}`));
    const sinirlar = sayfaSinirlari(sayfala(bloklar, profil()), IZGARA.satir);
    expect(sinirlar.length).toBeGreaterThan(0);
    for (const s of sinirlar) {
      expect(s.satirOfseti).toBe((s.sayfaNo - 1) * IZGARA.satir);
    }
  });

  it('erken kapanan sayfada da katı korur — dolgu farkı kapatıyor', () => {
    // Sahne başlıkları sık: dul kuralı sayfaları erken kapatsın.
    const bloklar = Array.from({ length: 200 }, (_, i) =>
      i % 5 === 0
        ? blok('scene', `İÇ. MEKAN ${i} - GECE`)
        : blok('dialogue', `Uzunca bir replik ${i} ve devamı burada sürüyor.`),
    );
    const sayfalar = sayfala(bloklar, profil());
    const sinirlar = sayfaSinirlari(sayfalar, IZGARA.satir);
    expect(sinirlar.length).toBeGreaterThan(2);
    /* Erken kapanan sayfa GERÇEKTEN var — yoksa bu test dolgu yolunu hiç
       yürümez ve boşuna yeşil kalırdı. */
    expect(sayfalar.some((s) => s.satirlar.length < IZGARA.satir)).toBe(true);
    for (const s of sinirlar) expect(s.satirOfseti % IZGARA.satir).toBe(0);

    /* GERÇEK DEĞİŞMEZ: ekranda her sayfa, kendinden önceki sayfaların
       satırları ARTI dolguları kadar aşağıda başlar ve bu toplam her
       zaman satirSayisi'nin katıdır. Formülü tekrar yazmak testi
       uygulamanın kopyası yapardı; burada DOM'un yaptığı toplama
       taklit ediliyor. */
    const dolgular = sayfaDolgulari(sayfalar, IZGARA.satir);
    let tepe = 0;
    for (let i = 0; i < sayfalar.length; i++) {
      const ilk = sayfalar[i].satirlar[0];
      tepe += ilk?.satirIndex === 0 ? (dolgular.get(ilk.blockId) ?? 0) : 0;
      expect(tepe, `sayfa ${i + 1} tepesi`).toBe(i * IZGARA.satir);
      tepe += sayfalar[i].satirlar.length;
    }
  });

  it('blok ORTASINDA başlayan sayfaya dolgu konmaz', () => {
    /* Sayfalar elle kuruluyor: `sayfala` bugün böyle bir çıktı üretmiyor
       (erken kapanan sayfadan sonra hep blok sınırı gelir) ama kural
       yine de doğru olmak zorunda — bloğun kendi satırları önceki
       sayfada zaten yer kapladı, üstüne dolgu koymak metni İKİ KEZ
       aşağı iterdi. Mutasyon testi bu satırın koruduğu şeyi başka
       türlü göstermiyordu. */
    const satir = (blockId: string, satirIndex: number) =>
      ({ blockId, tip: 'action' as const, satirIndex, metin: 'x' });
    const dolgular = sayfaDolgulari([
      { no: 1, satirlar: [satir('a', 0)] },
      { no: 2, satirlar: [satir('b', 3)] },
    ], IZGARA.satir);
    expect(dolgular.size).toBe(0);
  });

  it('ofsetler kesin artar', () => {
    const bloklar = Array.from({ length: 300 }, (_, i) => blok('action', `Satır ${i}`));
    const sinirlar = sayfaSinirlari(sayfala(bloklar, profil()), IZGARA.satir);
    for (let i = 1; i < sinirlar.length; i++) {
      expect(sinirlar[i].satirOfseti).toBeGreaterThan(sinirlar[i - 1].satirOfseti);
    }
  });
});

describe('sayaçlar (§16.1)', () => {
  it('kelime ve karakter sayar', () => {
    expect(metinSayaclari('bir iki üç')).toEqual({ kelime: 3, karakter: 10 });
  });

  it('ardışık boşluk kelime uydurmaz, baştaki/sondaki boşluk sayılmaz', () => {
    expect(metinSayaclari('  bir   iki  ').kelime).toBe(2);
  });

  /* NFC — format modülüne ÜÇÜNCÜ metin giriş noktası (§6.2 tetik koşullu
     borcu). Normalize edilmezse NFD gelen Türkçe harf iki kod birimi sayılır
     ve görünüşte aynı metin farklı karakter sayısı verir. */
  it('NFD gelen Türkçe metin NFC ile aynı sayıyı verir', () => {
    const nfc = 'işçi göz'.normalize('NFC');
    const nfd = nfc.normalize('NFD');
    expect(nfd.length).toBeGreaterThan(nfc.length);
    expect(metinSayaclari(nfd)).toEqual(metinSayaclari(nfc));
  });

  it('sayfa sayacı sayfalama motorunun sayısıyla AYNIDIR', () => {
    const bloklar = Array.from({ length: 90 }, (_, i) => blok('action', `Satır ${i}`));
    const p = profil();
    expect(sayaclar(bloklar, p).sayfa).toBe(sayfala(bloklar, p).length);
  });

  it('boş senaryo bir sayfadır, sıfır kelimedir', () => {
    expect(sayaclar([], profil())).toEqual({ kelime: 0, karakter: 0, sayfa: 1 });
  });
});
