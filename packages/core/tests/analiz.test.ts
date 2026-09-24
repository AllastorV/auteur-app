import { describe, expect, it } from 'vitest';
import {
  enUzunYokluk,
  karakterAdi,
  senaryoyuCozumle,
} from '@storyboard/core/model/analiz';
import type { ScriptBlock } from '@storyboard/core/model/script';

let sayac = 0;
const b = (
  tip: ScriptBlock['type'],
  text: string,
  sceneId = 'sc1',
): ScriptBlock => ({ id: `b${sayac++}`, fp: text, type: tip, text, scene: '', sceneId });

const SENARYO: ScriptBlock[] = [
  b('scene', 'İÇ. MUTFAK - GECE', 'sc1'),
  b('action', 'Ayşe masaya oturur.', 'sc1'),
  b('character', 'AYŞE', 'sc1'),
  b('dialogue', 'Bu iş burada bitmez.', 'sc1'),
  b('scene', 'DIŞ. SOKAK - GÜNDÜZ', 'sc2'),
  b('action', 'Yağmur yağıyor.', 'sc2'),
  b('character', 'MEHMET', 'sc2'),
  b('dialogue', 'Geç kaldık.', 'sc2'),
  b('character', 'AYŞE (V.O.)', 'sc2'),
  b('dialogue', 'Hep geç kalırız zaten.', 'sc2'),
];

describe('karakter adı normalleştirme', () => {
  /* `AYŞE (V.O.)` ile `AYŞE` AYNI karakter: ek, karakterin kim olduğunu
     değil sesinin nereden geldiğini söyler. Ayrı sayılsalardı en çok
     konuşan listesi ikiye bölünür ve dağılım grafiği yalan söylerdi. */
  it('ekler soyuluyor', () => {
    for (const ek of ['(V.O.)', '(O.S.)', "(CONT'D)", '(DEVAM)']) {
      expect(karakterAdi(`AYŞE ${ek}`)).toBe('AYŞE');
    }
  });

  it('zorlama işareti kalkıyor', () => {
    expect(karakterAdi('@Ayşe')).toBe('Ayşe');
  });

  it('NFC normalize ediliyor', () => {
    const ayrik = 'I' + String.fromCharCode(0x0307);
    expect(karakterAdi(ayrik)).toBe(ayrik.normalize('NFC'));
  });

  it('yalnız ekten ibaret satır BOŞ ad veriyor — sahte karakter üretmiyor', () => {
    expect(karakterAdi('(V.O.)')).toBe('');
  });

  /* Uç durumlar: boş satır, yalnız boşluk, emoji ve çok uzun ad. Karakter
     satırı doğrudan yazarın metni; hiçbiri sınanmamıştı. */
  it('boş ve boşluktan ibaret satır boş ad veriyor', () => {
    for (const bos of ['', '   ', '\t', '\n']) {
      expect(karakterAdi(bos), JSON.stringify(bos)).toBe('');
    }
  });

  it('emoji ve uzun ad bozulmadan geçiyor', () => {
    expect(karakterAdi('😀 ROBOT')).toBe('😀 ROBOT');
    expect(karakterAdi('👨‍👩‍👧 AİLE (V.O.)')).toBe('👨‍👩‍👧 AİLE');
    expect(karakterAdi('A'.repeat(1000))).toHaveLength(1000);
  });

  it('zorlama işareti ve ek BİRLİKTE soyuluyor', () => {
    expect(karakterAdi('@AYŞE (DEVAM)')).toBe('AYŞE');
  });

  /* DÜZELTİLDİ: YIĞILMIŞ parantezli ekler TÜMÜ soyuluyor, yalnız sonuncusu
     değil. `AYŞE (V.O.) (CONT'D)` gerçek senaryolarda yaygın (aynı sahnede
     sesle devam eden karakter) ve artık `AYŞE`ye indiriliyor — aynı
     karakter analiz panosunda ikiye bölünmüyor. */
  it('üst üste ekler HEPSİ soyuluyor — aynı karakter tek isimde birleşiyor', () => {
    expect(karakterAdi("AYŞE (V.O.) (CONT'D)")).toBe('AYŞE');
    expect(karakterAdi('AYŞE (O.S.) (DEVAM)')).toBe('AYŞE');
    expect(karakterAdi("AYŞE (CONT'D)")).toBe('AYŞE');
    expect(karakterAdi('AYŞE (V.O.)')).toBe('AYŞE');
    expect(karakterAdi('AYŞE')).toBe('AYŞE');
    // Üç kat yığılmış ek de tek geçişte tamamen soyuluyor.
    expect(karakterAdi("AYŞE (O.S.) (V.O.) (CONT'D)")).toBe('AYŞE');
    // Hepsi AYNI anahtara indiriyor — analiz panosunda bölünmüyor.
    const normalize = ["AYŞE", "AYŞE (V.O.)", "AYŞE (CONT'D)", "AYŞE (V.O.) (CONT'D)",
      "AYŞE (O.S.) (V.O.) (CONT'D)"].map(karakterAdi);
    expect(new Set(normalize).size).toBe(1);
    expect(normalize[0]).toBe('AYŞE');
  });
});

describe('sahne çözümlemesi', () => {
  it('sahneler sceneId ile bölünüyor', () => {
    const a = senaryoyuCozumle(SENARYO);
    expect(a.sahneler).toHaveLength(2);
    expect(a.sahneler.map((s) => s.baslik)).toEqual(['İÇ. MUTFAK - GECE', 'DIŞ. SOKAK - GÜNDÜZ']);
  });

  /* Tipe bakan bir bölme başlıksız açılışı bir önceki sahneye yapıştırır
     ya da hiç saymazdı. */
  it('başlıksız açılış sahnesi de bir SAHNE', () => {
    const a = senaryoyuCozumle([
      b('action', 'Karanlık.', 'sc0'),
      b('scene', 'İÇ. ODA', 'sc1'),
    ]);
    expect(a.sahneler).toHaveLength(2);
    expect(a.sahneler[0].baslik).toBe('');
  });

  it('her sahne İLK BLOĞUNU taşıyor — grafikten tıklama buna dayanıyor', () => {
    const a = senaryoyuCozumle(SENARYO);
    expect(a.sahneler[0].ilkBlokId).toBe(SENARYO[0].id);
    expect(a.sahneler[1].ilkBlokId).toBe(SENARYO[4].id);
  });

  it('diyalog ve aksiyon satırları ayrı sayılıyor', () => {
    const a = senaryoyuCozumle(SENARYO);
    expect(a.sahneler[0].diyalogSatir).toBe(1);
    expect(a.sahneler[0].aksiyonSatir).toBe(1);
    expect(a.sahneler[1].diyalogSatir).toBe(2);
  });

  it('sahnedeki karakterler konuşma sırasına göre', () => {
    const a = senaryoyuCozumle(SENARYO);
    expect(a.sahneler[1].karakterler).toEqual(['MEHMET', 'AYŞE']);
  });

  it('paylar toplamı 1 — grafik ölçeği buna dayanıyor', () => {
    const a = senaryoyuCozumle(SENARYO);
    const toplam = a.sahneler.reduce((t, s) => t + s.pay, 0);
    expect(toplam).toBeCloseTo(1, 10);
  });

  /* `0/0` NaN üretir ve grafik sessizce çizilmez hâle gelirdi. */
  it('boş senaryoda pay SIFIR, NaN değil', () => {
    const a = senaryoyuCozumle([b('action', '', 'sc1')]);
    expect(a.sahneler[0].pay).toBe(0);
    expect(Number.isNaN(a.sahneler[0].pay)).toBe(false);
  });

  it('hiç blok yoksa boş analiz', () => {
    const a = senaryoyuCozumle([]);
    expect(a.sahneler).toEqual([]);
    expect(a.karakterler).toEqual([]);
    expect(a.toplamKelime).toBe(0);
  });

  it('iç ve dış sahne ayrı sayılıyor', () => {
    const a = senaryoyuCozumle(SENARYO);
    expect(a.icSahne).toBe(1);
    expect(a.disSahne).toBe(1);
  });

  it('İngilizce ön ek de iç mekân sayılıyor', () => {
    const a = senaryoyuCozumle([b('scene', 'INT. KITCHEN - NIGHT', 'sc1')]);
    expect(a.icSahne).toBe(1);
  });
});

describe('karakter çözümlemesi', () => {
  it('replik ve sahne sayısı toplanıyor', () => {
    const a = senaryoyuCozumle(SENARYO);
    const ayse = a.karakterler.find((k) => k.ad === 'AYŞE')!;
    expect(ayse.replik).toBe(2);
    expect(ayse.sahneler).toEqual([0, 1]);
  });

  /* Karakter satırının kendisi sayılsaydı çok adı geçen bir figüran, az
     konuşan bir başroldan fazla "konuşmuş" görünürdü. */
  it('kelimeler KONUŞANA yazılıyor, ad satırına değil', () => {
    const a = senaryoyuCozumle(SENARYO);
    const mehmet = a.karakterler.find((k) => k.ad === 'MEHMET')!;
    expect(mehmet.kelime).toBe(2); // "Geç kaldık."
  });

  /* Kelime sayısına göre sıralamak, uzun tiratı olan bir yan karakteri öne
     çıkarırdı; "kim ne kadar var" sorusunun ilk cevabı kaç kez konuştuğudur. */
  it('replik sayısına göre sıralı, eşitlikte ADA göre KARARLI', () => {
    const a = senaryoyuCozumle([
      ...SENARYO,
      b('character', 'ZEYNEP', 'sc2'), b('dialogue', 'x', 'sc2'),
      b('character', 'BURAK', 'sc2'), b('dialogue', 'y', 'sc2'),
    ]);
    expect(a.karakterler[0].ad).toBe('AYŞE');
    // Eşit replikli üçü alfabetik.
    expect(a.karakterler.slice(1).map((k) => k.ad)).toEqual(['BURAK', 'MEHMET', 'ZEYNEP']);
  });

  it('ilk ve son sahnesi kaydediliyor', () => {
    const a = senaryoyuCozumle(SENARYO);
    const ayse = a.karakterler.find((k) => k.ad === 'AYŞE')!;
    expect(ayse.ilkSahne).toBe(0);
    expect(ayse.sonSahne).toBe(1);
  });
});

describe('en uzun yokluk — "başrol kayboluyor mu"', () => {
  it('aradaki boşluk sahne cinsinden', () => {
    expect(enUzunYokluk({ ad: 'X', replik: 3, kelime: 0, replikMedyan: 0, replikPayi: 0, sahneler: [0, 1, 7], ilkSahne: 0, sonSahne: 7 }))
      .toBe(5);
  });

  it('kesintisiz görünen karakterde sıfır', () => {
    expect(enUzunYokluk({ ad: 'X', replik: 3, kelime: 0, replikMedyan: 0, replikPayi: 0, sahneler: [2, 3, 4], ilkSahne: 2, sonSahne: 4 }))
      .toBe(0);
  });

  it('tek sahnede görünende sıfır', () => {
    expect(enUzunYokluk({ ad: 'X', replik: 1, kelime: 0, replikMedyan: 0, replikPayi: 0, sahneler: [5], ilkSahne: 5, sonSahne: 5 }))
      .toBe(0);
  });

  /* Hiç sahnede görünmeyen karakter (yalnız kayıtlı, senaryoda yok) ve
     BOŞLUKLARIN EN BÜYÜĞÜNÜN seçildiği durum sınanmamıştı: ilk boşluğu ya
     da sonuncuyu döndüren bir mutant üç testi de geçiyordu. */
  it('boş sahne listesinde sıfır — bölme/NaN yok', () => {
    expect(enUzunYokluk({ ad: 'X', replik: 0, kelime: 0, replikMedyan: 0, replikPayi: 0, sahneler: [], ilkSahne: 0, sonSahne: 0 }))
      .toBe(0);
  });

  it('boşlukların EN BÜYÜĞÜ seçiliyor — ilki ya da sonuncusu değil', () => {
    // Boşluklar sırasıyla 2, 9, 1: en büyüğü ORTADA.
    expect(enUzunYokluk({
      ad: 'X', replik: 4, kelime: 0, replikMedyan: 0, replikPayi: 0, sahneler: [0, 3, 13, 15], ilkSahne: 0, sonSahne: 15,
    })).toBe(9);
    // Aynı boşluklar ters düzende: en büyüğü BAŞTA.
    expect(enUzunYokluk({
      ad: 'X', replik: 4, kelime: 0, replikMedyan: 0, replikPayi: 0,
      sahneler: [0, 10, 13, 15], ilkSahne: 0, sonSahne: 15,
    })).toBe(9);
    // En büyüğü SONDA.
    expect(enUzunYokluk({
      ad: 'X', replik: 4, kelime: 0, replikMedyan: 0, replikPayi: 0,
      sahneler: [0, 2, 5, 15], ilkSahne: 0, sonSahne: 15,
    })).toBe(9);
  });
});

describe('ÖLÇEK — beş yüz sahnelik senaryo', () => {
  /* On bloklu bir senaryoda pay toplamı, sıralama ve kelime sayımı ancak
     kabaca sınanıyordu. Beş yüz sahne / iki bin blokta aynı değişmezler
     çok daha sert: kayan nokta birikimi, sıralama kararlılığı ve sahne
     indeksleri hep birlikte ölçülüyor. */
  const buyuk: ScriptBlock[] = [];
  for (let i = 0; i < 500; i++) {
    buyuk.push(b('scene', `İÇ. ODA ${i} - GECE`, `s${i}`));
    buyuk.push(b('action', 'Bir iki üç dört.', `s${i}`));
    buyuk.push(b('character', i % 2 ? 'AYŞE' : 'MEHMET', `s${i}`));
    buyuk.push(b('dialogue', 'Beş altı yedi.', `s${i}`));
  }
  const a = senaryoyuCozumle(buyuk);

  it('sahne, mekân ve kelime sayıları TAM', () => {
    expect(a.sahneler).toHaveLength(500);
    expect(a.icSahne).toBe(500);
    expect(a.disSahne).toBe(0);
    expect(a.toplamKelime).toBe(6500);
  });

  it('paylar toplamı ölçekte de 1 — kayan nokta birikmiyor', () => {
    expect(a.sahneler.reduce((t, s) => t + s.pay, 0)).toBeCloseTo(1, 10);
    // Hiçbir pay negatif ya da NaN değil.
    for (const s of a.sahneler) {
      expect(Number.isFinite(s.pay), s.baslik).toBe(true);
      expect(s.pay, s.baslik).toBeGreaterThan(0);
    }
  });

  it('karakter toplamları, ilk/son sahne ve sıralama TAM', () => {
    expect(a.karakterler.map((k) => [k.ad, k.replik, k.kelime, k.ilkSahne, k.sonSahne]))
      .toEqual([
        ['AYŞE', 250, 750, 1, 499],
        ['MEHMET', 250, 750, 0, 498],
      ]);
    // Eşit replikte ADA göre kararlı: AYŞE < MEHMET.
    expect(a.karakterler.map((k) => k.ad)).toEqual(['AYŞE', 'MEHMET']);
  });

  it('her sahne kendi İLK bloğunu taşıyor — ölçekte de kaymıyor', () => {
    expect(a.sahneler.map((s) => s.ilkBlokId)).toEqual(
      Array.from({ length: 500 }, (_, i) => buyuk[i * 4]!.id),
    );
  });
});
