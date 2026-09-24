import { describe, expect, it } from 'vitest';
import { baglamMenusu, menuEtiketi, type MenuDurumu } from '@storyboard/core/dil/menu';
import { BLOK_ETIKETLERI, BLOK_TIPLERI, type ScriptBlockType } from '@storyboard/core/model/script';

const taban: MenuDurumu = {
  secimVar: false,
  panoDolu: false,
  duzenlenebilir: true,
  seciliSatir: 0,
  bagliPanelVar: false,
  denetimVar: true,
};

const d = (o: Partial<MenuDurumu> = {}): MenuDurumu => ({ ...taban, ...o });
const etiketler = (durum: MenuDurumu) => baglamMenusu(durum).flat().map((x) => x.etiket);

it('revizyon seçimi işaretle veya kaldır olarak görünür; salt-okurda mutasyon sunulmaz', () => {
  expect(etiketler(d({ revizyonIsaretleme: 'isaretle' }))).toContain('Seçimi işaretle');
  expect(etiketler(d({ revizyonIsaretleme: 'kaldir' }))).toContain('Seçimin revizyon işaretini kaldır');
  expect(etiketler(d())).not.toContain('Seçimi işaretle');
  expect(etiketler(d({ revizyonIsaretleme: 'isaretle', duzenlenebilir: false })))
    .not.toContain('Seçimi işaretle');
  expect(menuEtiketi(oge(d({ revizyonIsaretleme: 'kaldir' }), 'Seçimin revizyon işaretini kaldır'), 'en'))
    .toBe('Unmark selection');
});

it('English revision-colour menu translates the Turkish colour key', () => {
  const item = baglamMenusu(d({ revizyonRengi: 'mavi' })).flat()
    .find((entry) => entry.eylem.tur === 'revizyon-rengi' && entry.eylem.renk === 'mavi');
  expect(item).toBeDefined();
  expect(menuEtiketi(item!, 'en')).toBe('2. Blue');
});

/**
 * Öğeyi bulur; YOKSA testi düşürür.
 *
 * Önceden `find(...)` dönüyordu ve çağıranlar `oge(...)?.pasif` yazıyordu.
 * `undefined?.pasif` da `undefined`'dır ve `toBeFalsy()` bundan MEMNUN kalır:
 * yani "bu menü öğesini tamamen sil" mutasyonu, öğenin ETKİN olduğunu iddia
 * eden testlerin hepsinden sağ çıkıyordu. `?.` kaldırılınca iddia gerçekten
 * ısırıyor.
 */
const oge = (durum: MenuDurumu, etiket: string) => {
  const bulunan = baglamMenusu(durum).flat().find((x) => x.etiket === etiket);
  if (!bulunan) {
    throw new Error(
      `Menüde "${etiket}" öğesi YOK. Mevcut öğeler: ${etiketler(durum).join(' | ')}`,
    );
  }
  return bulunan;
};

describe('yazım grubu', () => {
  it('yanlış kelime yoksa grup hiç yok', () => {
    expect(etiketler(d())).not.toContain('Bu kelimeyi yoksay');
  });

  it('yanlış kelimede öneriler ve sözlük eylemleri geliyor', () => {
    const m = etiketler(d({ yanlisKelime: 'Ayşe', oneriler: ['Ayse', 'Ayça'] }));
    expect(m).toContain('Ayse');
    expect(m).toContain('Ayça');
    expect(m).toContain('"Ayşe" kelimesini sözlüğe ekle');
  });

  /* Denetleyici yoksa boş bir "Sözlüğe ekle" göstermek, kullanıcıya olmayan
     bir yeteneği vaat etmek olurdu (§15.4 ruhu). */
  it('denetim YOKSA (web) yazım grubu hiç oluşmuyor', () => {
    const m = etiketler(d({ denetimVar: false, yanlisKelime: 'Ayşe', oneriler: ['Ayse'] }));
    expect(m).not.toContain('Ayse');
    expect(m.join(' ')).not.toContain('sözlüğe ekle');
  });

  /* Önerisi olmayan kelimede "Sözlüğe ekle" KULLANICININ TEK çaresidir;
     gizlenirse çare kalmaz. */
  it('öneri yokken sözlüğe ekle yine görünüyor', () => {
    const m = etiketler(d({ yanlisKelime: 'Zzzq' }));
    expect(m).toContain('"Zzzq" kelimesini sözlüğe ekle');
    expect(m).toContain('Bu kelimeyi yoksay');
  });

  /* Öğenin YÜKÜ hiç iddia edilmiyordu: `oneri: kelime` yapılsa öneriye
     tıklamak kelimeyi KENDİSİYLE değiştirirdi ve hiçbir test kızarmazdı. */
  it('öneri öğesi doğru kelimeyi ve doğru öneriyi taşıyor', () => {
    const grup = baglamMenusu(d({ yanlisKelime: 'Ayşe', oneriler: ['Ayse', 'Ayça'] }))[0];
    const yukler = grup
      .filter((x) => x.eylem.tur === 'oneri')
      .map((x) => x.eylem as { tur: 'oneri'; kelime: string; oneri: string });
    expect(yukler.map((y) => y.oneri)).toEqual(['Ayse', 'Ayça']);
    for (const y of yukler) expect(y.kelime).toBe('Ayşe');
  });

  it('sözlüğe ekleme ve yoksayma yükü YANLIŞ kelimeyi taşıyor', () => {
    const grup = baglamMenusu(d({ yanlisKelime: 'Zzzq' }))[0];
    for (const tur of ['sozluge-ekle', 'yoksay'] as const) {
      const e = grup.find((x) => x.eylem.tur === tur)?.eylem as { kelime: string };
      expect(e.kelime).toBe('Zzzq');
    }
  });

  it('uzun öneri listesi kırpılıyor — menü kullanılmaz olmasın', () => {
    const oneriler = Array.from({ length: 20 }, (_, i) => `o${i}`);
    const m = baglamMenusu(d({ yanlisKelime: 'x', oneriler }));
    expect(m[0].filter((x) => x.eylem.tur === 'oneri')).toHaveLength(5);
  });

  /* Sözlüğe ekleme PROJE sözlüğüne yazar; o kök korumalı izdüşümde olduğu
     için sunucu yetkisiz yazımı reddeder. Etkin göstermek, reddedilecek bir
     eylem sunmak olurdu. Yoksayma oturumluktur, belgeye dokunmaz. */
  it('salt-okurda öneri VE sözlüğe ekleme pasif, yoksayma açık', () => {
    const durum = d({ duzenlenebilir: false, yanlisKelime: 'Ayşe', oneriler: ['Ayse'] });
    expect(oge(durum, 'Ayse').pasif).toBe(true);
    expect(oge(durum, '"Ayşe" kelimesini sözlüğe ekle').pasif).toBe(true);
    expect(oge(durum, 'Bu kelimeyi yoksay').pasif).toBeFalsy();
  });

  it('düzenleyebilen kullanıcıda sözlüğe ekleme AÇIK', () => {
    const durum = d({ duzenlenebilir: true, yanlisKelime: 'Ayşe' });
    expect(oge(durum, '"Ayşe" kelimesini sözlüğe ekle').pasif).toBeFalsy();
  });
});

describe('düzenleme grubu', () => {
  it('seçim yokken kes ve kopyala pasif', () => {
    const durum = d({ secimVar: false });
    expect(oge(durum, 'Kes').pasif).toBe(true);
    expect(oge(durum, 'Kopyala').pasif).toBe(true);
  });

  it('seçim varken kopyala aktif', () => {
    expect(oge(d({ secimVar: true }), 'Kopyala')?.pasif).toBe(false);
  });

  it('pano boşken yapıştır pasif', () => {
    expect(oge(d({ panoDolu: false }), 'Yapıştır')?.pasif).toBe(true);
    expect(oge(d({ panoDolu: true }), 'Yapıştır')?.pasif).toBe(false);
  });

  /* Salt-okur kullanıcı kopyalayabilir ama kesemez — kesme belgeyi
     değiştirir. */
  it('salt-okurda kopyala açık, kes kapalı', () => {
    const durum = d({ secimVar: true, duzenlenebilir: false });
    expect(oge(durum, 'Kopyala').pasif).toBe(false);
    expect(oge(durum, 'Kes').pasif).toBe(true);
  });

  it('tümünü seç her zaman açık', () => {
    expect(oge(d({ duzenlenebilir: false }), 'Tümünü seç').pasif).toBeFalsy();
  });
});

describe('blok tipi grubu', () => {
  it('satır seçili değilse grup yok', () => {
    expect(etiketler(d({ seciliSatir: 0 }))).not.toContain('Diyalog');
  });

  it('altı blok tipi de listeleniyor', () => {
    const m = etiketler(d({ seciliSatir: 1 }));
    for (const e of ['Sahne başlığı', 'Aksiyon', 'Karakter', 'Parantez', 'Diyalog', 'Geçiş']) {
      expect(m).toContain(e);
    }
  });

  /* Mevcut tipi GİZLEMEK, menüdeki öğelerin yerini her seferinde kaydırır ve
     kas hafızasını bozar. */
  it('mevcut tip listede KALIYOR ama pasif', () => {
    const durum = d({ seciliSatir: 1, blokTipi: 'dialogue' });
    expect(etiketler(durum)).toContain('Diyalog');
    expect(oge(durum, 'Diyalog').pasif).toBe(true);
    expect(oge(durum, 'Aksiyon').pasif).toBe(false);
  });

  it('karışık seçimde hiçbiri pasif değil', () => {
    const durum = d({ seciliSatir: 3, blokTipi: undefined });
    expect(baglamMenusu(durum).flat().filter((x) => x.eylem.tur === 'blok-tipi' && x.pasif)).toHaveLength(0);
  });

  it('salt-okurda hepsi pasif', () => {
    const durum = d({ seciliSatir: 1, duzenlenebilir: false });
    const bloklar = baglamMenusu(durum).flat().filter((x) => x.eylem.tur === 'blok-tipi');
    expect(bloklar.every((x) => x.pasif)).toBe(true);
  });
});

describe('panel grubu', () => {
  it('satır seçili değilse grup yok', () => {
    expect(etiketler(d())).not.toContain('Aktif panele bağla');
  });

  /* Pasif göstermek kullanıcıya gidilecek bir yer varmış gibi gelir. */
  it('bağlı panel YOKSA "panele git" hiç görünmüyor', () => {
    const m = etiketler(d({ seciliSatir: 1, bagliPanelVar: false }));
    expect(m).toContain('Aktif panele bağla');
    expect(m).not.toContain('Bağlı panele git');
    expect(m).not.toContain('Bağı kaldır');
  });

  it('bağlı panel varsa üçü de görünüyor', () => {
    const m = etiketler(d({ seciliSatir: 1, bagliPanelVar: true }));
    expect(m).toContain('Bağlı panele git');
    expect(m).toContain('Bağı kaldır');
  });

  /* "Panele git" belgeyi DEĞİŞTİRMEZ — salt-okur kullanıcı da gidebilmeli. */
  it('salt-okurda "panele git" açık, bağlama kapalı', () => {
    const durum = d({ seciliSatir: 1, bagliPanelVar: true, duzenlenebilir: false });
    expect(oge(durum, 'Bağlı panele git').pasif).toBeFalsy();
    expect(oge(durum, 'Aktif panele bağla').pasif).toBe(true);
    expect(oge(durum, 'Bağı kaldır').pasif).toBe(true);
  });
});

describe('gruplama', () => {
  it('boş gruplar DÜŞÜYOR — ayırıcı arası boşluk kalmıyor', () => {
    // Yalnız düzenleme grubu dolu: yazım yok, satır seçili değil.
    expect(baglamMenusu(d())).toHaveLength(1);
  });

  /* BEŞ grup: yazım, düzenleme, blok tipi, panel, yer imi.
     Yer imi grubu 2026-08-26'da eklendi — kullanıcı gerçek pencerede
     "sağ tık menüsü çok yetersiz, dediğim birçok işlev yok" dedi. */
  it('hepsi doluyken beş grup', () => {
    const durum = d({
      yanlisKelime: 'x',
      oneriler: ['y'],
      seciliSatir: 1,
      bagliPanelVar: true,
    });
    expect(baglamMenusu(durum)).toHaveLength(5);
  });

  it('panel grubunda TEK ADIMLI "oluştur ve bağla" var', () => {
    const gruplar = baglamMenusu(d({ seciliSatir: 2 }));
    const etiketler = gruplar.flat().map((o) => o.etiket);
    expect(etiketler).toContain('Panel oluştur ve bağla');
  });

  it('yer imi ETİKETİ duruma göre değişiyor', () => {
    expect(baglamMenusu(d({ seciliSatir: 1 })).flat().map((o) => o.etiket))
      .toContain('Yer imi koy');
    expect(baglamMenusu(d({ seciliSatir: 1, imVar: true })).flat().map((o) => o.etiket))
      .toContain('Yer imini kaldır');
  });

  /* Birden çok satıra tek imle işaret koymak, imin neyi gösterdiğini
     belirsizleştirir. */
  it('çok satırlı seçimde yer imi YOK', () => {
    expect(baglamMenusu(d({ seciliSatir: 3 })).flat().map((o) => o.etiket))
      .not.toContain('Yer imi koy');
  });

  it('yazım grubu HER ZAMAN en üstte — en sık aranan eylem', () => {
    const durum = d({ yanlisKelime: 'x', oneriler: ['y'], seciliSatir: 1 });
    expect(baglamMenusu(durum)[0][0].etiket).toBe('y');
  });
});

describe('blok etiketleri TEK evde', () => {
  /* İki elle yazılmış tablo vardı ve şimdiden ayrışmıştı: `parenthetical`
     menüde "Parantez", Yazım sekmesinde "Parantezik". Kullanıcı aynı blok
     tipini iki ayrı adla görüyordu. */
  it('menü etiketleri paylaşılan tablodan geliyor', () => {
    const m = etiketler(d({ seciliSatir: 1 }));
    // Varsayılan menü senaryo çekirdeğini gösteriyor (F7 öncesi davranış).
    for (const tip of ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition'] as ScriptBlockType[]) {
      expect(m).toContain(BLOK_ETIKETLERI[tip]);
    }
  });

  /* Menüde roman bloğu gören bir senaryo yazarı onu seçer ve profilde
     karşılığı olmadığı için sayfalayıcı fırlatır. */
  it('menü DOKÜMAN TİPİNİN bloklarını gösteriyor', () => {
    const m = etiketler(d({ seciliSatir: 1, izinliBloklar: ['bolum', 'paragraf'] }));
    expect(m).toContain('Bölüm');
    expect(m).toContain('Paragraf');
    expect(m).not.toContain('Sahne başlığı');
    expect(m).not.toContain('Geçiş');
  });

  it('liste verilmezse senaryo çekirdeği — eski çağıranlar bozulmuyor', () => {
    const m = etiketler(d({ seciliSatir: 1 }));
    expect(m).not.toContain('Bölüm');
    expect(m).toContain('Aksiyon');
  });

  /* `length > 0` her mutasyondan sağ çıkıyordu: iki tipe AYNI etiketi vermek
     ya da etiketi `x` yapmak testi geçerdi. Menüde iki özdeş satır gören
     kullanıcı hangisini seçeceğini bilemez. */
  it('her blok tipinin etiketi var, boş değil ve BENZERSİZ', () => {
    const tipler = [...BLOK_TIPLERI] as ScriptBlockType[];
    const etiketListesi = tipler.map((t) => BLOK_ETIKETLERI[t]);
    for (const [i, e] of etiketListesi.entries()) {
      expect(typeof e, tipler[i]).toBe('string');
      expect(e.trim(), tipler[i]).toBe(e); // baş/son boşluk menüde hizayı bozar
      expect(e.length, tipler[i]).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(etiketListesi).size).toBe(tipler.length);
  });
});

/* ------------------------------------------------------------------ */
/* Menünün TAM YAPISI — sıra ve sayı da sözleşmenin parçası            */
/* ------------------------------------------------------------------ */

describe('menü yapısı bit bitine', () => {
  /**
   * Buraya kadarki iddiaların neredeyse hepsi `toContain`. Bu şu
   * mutasyonların HİÇBİRİNİ öldürmüyor: bir öğeyi iki kez eklemek, grupları
   * yer değiştirmek, bir gruba fazladan öğe sokmak, öğe sırasını karıştırmak.
   * Oysa bağlam menüsünde sıra kas hafızasıdır — kullanıcı bakmadan tıklar.
   *
   * Tam liste, sıra ve grup sınırlarıyla birlikte sabitleniyor. Menü
   * bilerek değiştirilirse bu test kırılır ve değişiklik BİLİNÇLİ olur.
   */
  it('her şey doluyken menü tam olarak bu — sıra dahil', () => {
    const gruplar = baglamMenusu(
      d({
        yanlisKelime: 'Ayşe',
        oneriler: ['Ayse', 'Ayça'],
        secimVar: true,
        panoDolu: true,
        seciliSatir: 1,
        blokTipi: 'dialogue',
        bagliPanelVar: true,
        imVar: false,
      }),
    );

    expect(gruplar.map((g) => g.map((o) => o.etiket))).toEqual([
      ['Ayse', 'Ayça', '"Ayşe" kelimesini sözlüğe ekle', 'Bu kelimeyi yoksay'],
      ['Kes', 'Kopyala', 'Yapıştır', 'Tümünü seç'],
      ['Sahne başlığı', 'Aksiyon', 'Karakter', 'Parantez', 'Diyalog', 'Geçiş'],
      ['Panel oluştur ve bağla', 'Aktif panele bağla', 'Bağı kaldır', 'Bağlı panele git'],
      ['Yer imi koy'],
    ]);

    // Pasiflik deseni de sabit: yalnız mevcut blok tipi (Diyalog) kapalı.
    expect(gruplar.map((g) => g.map((o) => o.pasif === true))).toEqual([
      [false, false, false, false],
      [false, false, false, false],
      [false, false, false, false, true, false],
      [false, false, false, false],
      [false],
    ]);
  });

  /* Aynı eylem menüde İKİ KEZ görünmemeli; yinelenen bir öğe kullanıcıya
     iki farklı sonuç varmış gibi gelir. */
  it('hiçbir etiket menüde iki kez geçmiyor', () => {
    const hepsi = etiketler(
      d({
        yanlisKelime: 'x',
        oneriler: ['a', 'b'],
        secimVar: true,
        panoDolu: true,
        seciliSatir: 1,
        bagliPanelVar: true,
      }),
    );
    expect(new Set(hepsi).size).toBe(hepsi.length);
  });

  /* Menü ÇOK sayıda blok tipi olan bir doküman tipinde bile kurulabilmeli
     ve grup sınırları bozulmamalı. */
  it('geniş blok listesiyle grup sayısı ve sıra korunuyor', () => {
    const genis = [...BLOK_TIPLERI] as ScriptBlockType[];
    const gruplar = baglamMenusu(d({ seciliSatir: 1, izinliBloklar: genis }));
    // yazım yok (yanlış kelime verilmedi) → düzenleme, blok, panel, yer imi
    expect(gruplar).toHaveLength(4);
    expect(gruplar[1]).toHaveLength(genis.length);
    expect(gruplar[1].map((o) => o.etiket)).toEqual(genis.map((t) => BLOK_ETIKETLERI[t]));
  });

  /* Boş izinli blok listesi: grup HİÇ oluşmamalı, boş bir ayırıcı bırakmamalı. */
  it('izinli blok listesi BOŞSA blok grubu düşüyor', () => {
    const gruplar = baglamMenusu(d({ seciliSatir: 1, izinliBloklar: [] }));
    expect(gruplar.flat().some((o) => o.eylem.tur === 'blok-tipi')).toBe(false);
    expect(gruplar.every((g) => g.length > 0)).toBe(true);
  });

  /* Çok büyük seçim (5.000 satır) menüyü kurmayı engellememeli; yer imi
     grubu düşer ama ötekiler ayakta kalır. */
  it('5.000 satırlık seçimde menü hâlâ kuruluyor', () => {
    const gruplar = baglamMenusu(d({ seciliSatir: 5000, bagliPanelVar: true }));
    expect(gruplar.flat().some((o) => o.eylem.tur === 'yer-imi')).toBe(false);
    expect(gruplar.flat().some((o) => o.eylem.tur === 'panele-git')).toBe(true);
  });

  /* Yanlış kelime UZUN ya da tırnak içeriyorsa etiket bozulmamalı —
     etiket doğrudan kullanıcı metninden kuruluyor. */
  it('tırnaklı ve uzun kelime etiketi bozmuyor', () => {
    const kelime = 'Ayşe"nin\'çok'.repeat(5);
    const grup = baglamMenusu(d({ yanlisKelime: kelime }))[0];
    expect(grup[0].etiket).toBe(`"${kelime}" kelimesini sözlüğe ekle`);
    expect((grup[0].eylem as { kelime: string }).kelime).toBe(kelime);
  });
});

it('sağ tık komutları İngilizceye çevrilir, öneri metni değişmez', () => {
  const items = baglamMenusu(d({ seciliSatir: 1, bagliPanelVar: true, yanlisKelime: 'Çağla', oneriler: ['Karakter'] })).flat();
  const english = items.map((item) => menuEtiketi(item, 'en'));
  expect(english).toContain('Cut');
  expect(english).toContain('Scene heading');
  expect(english).toContain('Create and link panel');
  expect(english).toContain('Add bookmark');
  expect(english).toContain('Add "Çağla" to dictionary');
  expect(english[0]).toBe('Karakter');
  expect(items.map((item) => menuEtiketi(item, 'tr'))).toEqual(items.map((item) => item.etiket));
});
