import { describe, expect, it } from 'vitest';
import { blokTipiAlgila, tipleriAlgila } from '@storyboard/core/editor/algila';
import { KARAKTER_EN_UZUN, parseFountain, type ScriptBlockType } from '@storyboard/core/model/script';

const tr = (metin: string, oncekiTip: ScriptBlockType | null = null) =>
  blokTipiAlgila(metin, { oncekiTip, dil: 'tr' });
const en = (metin: string, oncekiTip: ScriptBlockType | null = null) =>
  blokTipiAlgila(metin, { oncekiTip, dil: 'en' });

describe('sahne başlığı', () => {
  it('Türkçe ve İngilizce kısaltmaları tanır', () => {
    expect(tr('İÇ. MUTFAK - GECE')).toBe('scene');
    expect(tr('DIŞ. SOKAK - GÜN')).toBe('scene');
    expect(en('INT. KITCHEN - NIGHT')).toBe('scene');
    expect(en('EXT. STREET - DAY')).toBe('scene');
  });

  /* İngilizce kısaltmalar Türkçe yazarken de yaygın; dil `tr` iken `INT.`
     yazan biri sahne başlığı yazıyordur. Tersi de geçerli. */
  it('dil ayarından bağımsız olarak her iki kısaltma ailesini tanır', () => {
    expect(tr('INT. KITCHEN - NIGHT')).toBe('scene');
    expect(en('İÇ. MUTFAK - GECE')).toBe('scene');
  });

  it('küçük harfle yazılmış sahne başlığı da tanınır', () => {
    expect(tr('iç. mutfak - gece')).toBe('scene');
  });

  it('sahne başlığına benzemeyen metin sahne değildir', () => {
    expect(tr('İÇTEN bir gülümseme')).toBe('action');
  });
});

describe('parantezik', () => {
  it('parantezle açılıp kapanan satır parantezliktir', () => {
    expect(tr('(fısıltıyla)', 'character')).toBe('parenthetical');
    expect(tr('(kendi kendine)', 'dialogue')).toBe('parenthetical');
  });

  it('yalnız açan parantez parantezik değildir', () => {
    expect(tr('(yarım kalmış', 'character')).toBe('dialogue');
  });
});

describe('geçiş', () => {
  it('bilinen geçiş kalıplarını tanır', () => {
    expect(tr('KES', 'action')).toBe('transition');
    expect(en('CUT TO:', 'action')).toBe('transition');
    expect(en('FADE OUT.', 'action')).toBe('transition');
    expect(tr('KARARMA', 'action')).toBe('transition');
  });

  it('geçişe benzeyen ama listede olmayan metin karakter ya da aksiyondur', () => {
    expect(tr('KESKİN BİR SES', 'action')).toBe('character');
  });
});

describe('karakter ve diyalog', () => {
  it('aksiyondan sonra gelen kısa büyük harfli satır karakterdir', () => {
    expect(tr('AYŞE', 'action')).toBe('character');
    expect(tr('AYŞE (V.O.)', 'action')).toBe('character');
    expect(tr("MEHMET (CONT'D)", 'scene')).toBe('character');
  });

  /* Bu kural sırasının sebebi: büyük harfle BAĞIRAN bir replik karakter
     adına benzer. Diyalog kuralı önce gelmezse "HAYIR!" yeni bir karakter
     sanılır ve replik ikiye bölünür. */
  it('karakterden sonraki büyük harfli replik DİYALOGDUR, yeni karakter değil', () => {
    expect(tr('HAYIR!', 'character')).toBe('dialogue');
    expect(tr('DEFOL!', 'parenthetical')).toBe('dialogue');
  });

  it('karakterden sonra gelen olağan replik diyalogdur', () => {
    expect(tr('Kimse yok, emin misin?', 'character')).toBe('dialogue');
  });

  /* Uzunluk sınırı, büyük harfle yazılmış bir aksiyon cümlesini karakter
     sanmayı önler — tabelalar ve pankartlar senaryoda büyük yazılır. */
  it('uzun büyük harfli cümle karakter değil aksiyondur', () => {
    const uzun = 'KAPIDA KOCAMAN BİR TABELA ASILI DURUYOR VE ÜSTÜNDE BİR ŞEY YAZIYOR';
    expect(tr(uzun, 'action')).toBe('action');
  });

  it('nokta ile biten büyük harfli satır karakter değildir', () => {
    expect(tr('SESSİZLİK.', 'action')).toBe('action');
  });

  it('küçük harfli satır karakter olamaz', () => {
    expect(tr('Ayşe', 'action')).toBe('action');
  });

  /* Türkçe'de `i → İ`. Dile duyarsız büyütmeyle "Işık" meşru bir karakter adı
     olduğu hâlde büyük harf sayılmazdı. */
  it('Türkçe büyük harf kuralı doğru uygulanır', () => {
    expect(tr('IŞIK', 'action')).toBe('character');
    expect(tr('İSMAİL', 'action')).toBe('character');
  });
});

describe('boş satır', () => {
  /* Boş satır kendi başına tip taşımaz. Aksiyona düşürülseydi, diyalog içinde
     nefes için bırakılan boş satır bloğun tipini sessizce değiştirirdi. */
  it('önceki tipi korur', () => {
    expect(tr('', 'dialogue')).toBe('dialogue');
    expect(tr('   ', 'character')).toBe('character');
  });

  it('en baştaki boş satır aksiyondur', () => {
    expect(tr('', null)).toBe('action');
  });
});

describe('dizi hâlinde algılama', () => {
  it('gerçek bir sahne doğru diziliyor', () => {
    const satirlar = [
      'İÇ. ESKİ APARTMAN - KORİDOR - GECE',
      'Ayşe kapıyı yavaşça iter.',
      'AYŞE',
      '(fısıltıyla)',
      'Kimse yok, emin misin?',
      'MEHMET',
      'Emin değilim.',
      'KES',
    ];
    const tipler = tipleriAlgila(satirlar.map((text) => ({ text, type: 'action' as const })), 'tr');
    expect(tipler).toEqual([
      'scene', 'action', 'character', 'parenthetical', 'dialogue',
      'character', 'dialogue', 'transition',
    ]);
  });

  /* §16.3: elle değiştirme otomatiği geçersiz kılar. */
  it('elle sabitlenmiş bloğa DOKUNULMAZ', () => {
    const bloklar = [
      { text: 'Ayşe girer.', type: 'action' as ScriptBlockType },
      { text: 'AYŞE', type: 'action' as ScriptBlockType, elleSabit: true },
      { text: 'Merhaba.', type: 'action' as ScriptBlockType },
    ];
    const tipler = tipleriAlgila(bloklar, 'tr');
    expect(tipler[1]).toBe('action');
  });

  /* Elle sabitlenen tip sonraki blokların BAĞLAMINA girer: kullanıcının
     kararı akışın gerisini de doğru yönlendirmeli. */
  it('elle sabitlenen tip sonraki blokların bağlamını belirler', () => {
    const bloklar = [
      { text: 'Ayşe girer.', type: 'action' as ScriptBlockType },
      { text: 'BİR SES', type: 'action' as ScriptBlockType, elleSabit: true, },
      { text: 'HAYIR!', type: 'action' as ScriptBlockType },
    ];
    // `BİR SES` aksiyon olarak sabitlendi → sonraki büyük harfli satır
    // diyalog DEĞİL, karakter olarak algılanır.
    expect(tipleriAlgila(bloklar, 'tr')[2]).toBe('character');

    bloklar[1] = { ...bloklar[1], type: 'character' };
    expect(tipleriAlgila(bloklar, 'tr')[2]).toBe('dialogue');
  });

  it('boş dizi boş sonuç verir', () => {
    expect(tipleriAlgila([], 'tr')).toEqual([]);
  });
});

describe('karakter adı UZUNLUK SINIRI çivilendi', () => {
  /* Sınır hiçbir testle sabitlenmemişti: 8'e de 65'e de çekilebiliyordu ve
     hiçbir test kızarmıyordu. 8'de `KOMİSER YARDIMCISI MEHMET` aksiyon olur;
     65'te büyük harfli bir tabela metni karakter olur ve ALTINDAKİ aksiyon
     diyaloğa döner — tek yanlış algılama sonraki blokların hepsini kaydırır.
     Sabit artık `model/script.ts`'te TEK evde (60): içe aktarma ile algılama
     aynı belgeyi aynı eşikle tiplendirmek zorunda. */
  const uzunluk = (n: number) => 'A'.repeat(n);

  it('sınırdaki ad KARAKTER sayılıyor', () => {
    expect(blokTipiAlgila(uzunluk(KARAKTER_EN_UZUN), { oncekiTip: 'action', dil: 'tr' }))
      .toBe('character');
  });

  it('sınırı BİR aşan ad karakter DEĞİL', () => {
    expect(blokTipiAlgila(uzunluk(KARAKTER_EN_UZUN + 1), { oncekiTip: 'action', dil: 'tr' }))
      .not.toBe('character');
  });

  it('gerçek bir Türkçe karakter adı sınırın altında kalıyor', () => {
    expect('KOMİSER YARDIMCISI MEHMET'.length).toBeLessThanOrEqual(KARAKTER_EN_UZUN);
    expect(blokTipiAlgila('KOMİSER YARDIMCISI MEHMET', { oncekiTip: 'action', dil: 'tr' }))
      .toBe('character');
  });

  it('içe aktarma ile algılama AYNI eşiği kullanıyor', () => {
    // İki uygulama ayrı sabit taşıdığı sürece aynı belge iki farklı tiplenirdi.
    const ad = uzunluk(KARAKTER_EN_UZUN);
    // Karakter satırının HEMEN altında diyalog olmalı — boş satır ayırırsa
    // Fountain onu karakter saymaz.
    const ayrisan = parseFountain(`Ahmet girer.

${ad}
Merhaba.`);
    expect(ayrisan.find((b) => b.text === ad)?.type).toBe('character');
  });
});

describe('içe aktarma ile algılama AYNI kuralları kullanıyor (K8)', () => {
  /* İki uygulama farklı sabit kümesi taşıdığı sürece aynı belge iki farklı
     tiplenirdi ve tip değişimi girintiyi, `oncekiBosSatir`'ı, dolayısıyla
     SAYFA SAYISINI değiştirir. */
  const ilkTip = (metin: string) => parseFountain(metin)[0]?.type;

  for (const baslik of ['EST. ÇATIKATI', 'I/E. ARABA - GECE', 'INT/EXT. EV']) {
    it(`"${baslik}" iki yolda da sahne`, () => {
      expect(ilkTip(baslik)).toBe('scene');
      expect(tr(baslik)).toBe('scene');
    });
  }

  for (const gecis of ['ZINCIRLEME', 'KARARMA.', 'CUT TO:']) {
    it(`"${gecis}" iki yolda da geçiş`, () => {
      expect(tr(gecis, 'action')).toBe('transition');
    });
  }

  it('karakter eki iki yolda da soyuluyor', () => {
    expect(tr("AYŞE (CONT'D)", 'action')).toBe('character');
    expect(tr('MEHMET (V.O.)', 'action')).toBe('character');
    expect(tr('MEHMET (DEVAM)', 'action')).toBe('character');
  });

  it('yalnız ekten ibaret satır karakter DEĞİL', () => {
    expect(tr('(V.O.)', 'action')).toBe('parenthetical');
  });
});

describe('gerçek senaryolardan çıkan kurallar', () => {
  /* ÖLÇÜLDÜ (Ginger & Rosa): "The caption changes to:" GEÇİŞ sanılıyordu —
     `to:` ile biten HER cümle geçiş oluyordu. Gerçek geçişler istisnasız
     versaldir; cümle içinde geçen "changes to:" değildir.

     Yanlış tip yalnız görünüm değil GİRİNTİ ve `oncekiBosSatir` demek,
     o da SAYFA SAYISI demek — sessiz ve pahalı bir hata. */
  it('cümle içinde geçen "to:" geçiş DEĞİL', () => {
    expect(en('The caption changes to:')).toBe('action');
    expect(en('He turns and walks to:')).toBe('action');
  });

  it('versal geçiş kuyruğu HÂLÂ geçiş', () => {
    expect(en('CUT TO:')).toBe('transition');
    expect(en('DISSOLVE TO:')).toBe('transition');
    expect(en('SMASH CUT TO:')).toBe('transition');
  });
});
