import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  breakdownEkiDuzelt,
  breakdownSatirlariniCikar,
  BOS_BREAKDOWN_EKI,
  type BreakdownEki,
} from '@storyboard/core/model/breakdown';
import type { ScriptBlock } from '@storyboard/core/model/script';
import { breakdownEkiGuncelle, LOCAL_ORIGIN } from '@storyboard/core/doc/mutations';
import { breakdownMap } from '@storyboard/core/doc/schema';
import { protectedProjection } from '@storyboard/core/model/projection';
import { breakdownCsvYaz, breakdownMarkdownYaz } from '@storyboard/core/disa/breakdown';

const blok = (i: number, tip: ScriptBlock['type'], metin: string, sceneId: string): ScriptBlock => ({
  id: `b${i}`, fp: `f${i}`, type: tip, text: metin, scene: '', sceneId,
});

describe('breakdownEkiDuzelt — belge elle kurcalanmış olabilir', () => {
  it('hiç değer yokken boş ekiyle dönüyor', () => {
    expect(breakdownEkiDuzelt(undefined)).toEqual(BOS_BREAKDOWN_EKI);
    expect(breakdownEkiDuzelt(null)).toEqual(BOS_BREAKDOWN_EKI);
  });

  it('dizi olmayan liste alanı boş diziye düşüyor', () => {
    expect(breakdownEkiDuzelt({ ozelEsya: 'tek dizge' }).ozelEsya).toEqual([]);
  });

  it('liste içindeki boş/dizge-olmayan girdiler süzülüyor', () => {
    expect(breakdownEkiDuzelt({ kostum: ['ceket', '  ', 42, '  şapka  '] }).kostum)
      .toEqual(['ceket', 'şapka']);
  });

  it('sureTahmini negatifse ya da sayı değilse null', () => {
    expect(breakdownEkiDuzelt({ sureTahmini: -1 }).sureTahmini).toBeNull();
    expect(breakdownEkiDuzelt({ sureTahmini: 'iki' }).sureTahmini).toBeNull();
    expect(breakdownEkiDuzelt({ sureTahmini: NaN }).sureTahmini).toBeNull();
    expect(breakdownEkiDuzelt({ sureTahmini: 0 }).sureTahmini).toBe(0);
    expect(breakdownEkiDuzelt({ sureTahmini: 3.5 }).sureTahmini).toBe(3.5);
  });

  it('notlar dizge değilse boşa düşüyor, dizgeyse NFC normalize edilir', () => {
    expect(breakdownEkiDuzelt({ notlar: 7 }).notlar).toBe('');
    const ayrik = 'I' + String.fromCharCode(0x0307);
    expect(breakdownEkiDuzelt({ notlar: ayrik }).notlar).toBe(ayrik.normalize('NFC'));
  });
});

describe('breakdownSatirlariniCikar — sahne bölme sceneId ile', () => {
  const bloklar: ScriptBlock[] = [
    // Başlıksız açılış: hiç 'scene' bloğu yok ama bu da bir sahne (görev
    // tanımı: sceneId ile bölünür, type === 'scene' ile DEĞİL).
    blok(0, 'action', 'Karanlıkta bir el belirir.', 's0'),
    blok(1, 'character', 'ANLATICI', 's0'),

    blok(2, 'scene', 'İÇ. MUTFAK - GÜN', 's1'),
    blok(3, 'character', 'AYŞE', 's1'),
    blok(4, 'dialogue', 'Gitmiyorum.', 's1'),

    blok(5, 'scene', 'DIŞ. SOKAK - GECE', 's2'),
    blok(6, 'character', 'MEHMET', 's2'),

    // sceneId DEĞİŞİYOR ama ilk blok 'scene' TİPİNDE DEĞİL — `type ===
    // 'scene'` ile bölseydi bu, s2'nin bir devamı sanılırdı. Tam da görev
    // tanımının "type === 'scene' ile DEĞİL" uyarısının sınadığı durum.
    blok(7, 'action', 'İkinci başlıksız kesit.', 's3'),
  ];

  it('DÖRT sahneye bölünüyor — ilki VE dördüncüsü başlıksız', () => {
    const satirlar = breakdownSatirlariniCikar(bloklar, 'tr', {});
    expect(satirlar).toHaveLength(4);
    expect(satirlar.map((s) => s.sceneId)).toEqual(['s0', 's1', 's2', 's3']);
    expect(satirlar.map((s) => s.sira)).toEqual([0, 1, 2, 3]);
    expect(satirlar[0].baslik).toBe('(başlıksız)');
    expect(satirlar[0].ilkBlokId).toBe('b0');
    expect(satirlar[3].baslik).toBe('(başlıksız)');
    expect(satirlar[3].ilkBlokId).toBe('b7');
  });

  it('karakterler OTOMATİK — karakterleriTopla ile AYNI normalizasyon, sahneye sınırlı', () => {
    const satirlar = breakdownSatirlariniCikar(bloklar, 'tr', {});
    expect(satirlar[0].karakterler).toEqual(['ANLATICI']);
    expect(satirlar[1].karakterler).toEqual(['AYŞE']);
    expect(satirlar[2].karakterler).toEqual(['MEHMET']);
  });

  it('mekân ve iç/dış OTOMATİK — lokasyonlariTopla ile, sahneye sınırlı', () => {
    const satirlar = breakdownSatirlariniCikar(bloklar, 'tr', {});
    expect(satirlar[0].mekan).toBe(''); // başlıksız sahnede lokasyon yok
    expect(satirlar[1]).toMatchObject({ mekan: 'MUTFAK', icDis: 'ic' });
    expect(satirlar[2]).toMatchObject({ mekan: 'SOKAK', icDis: 'dis' });
  });

  it('zaman sahne başlığından çıkarılıyor', () => {
    const satirlar = breakdownSatirlariniCikar(bloklar, 'tr', {});
    expect(satirlar[0].zaman).toBeNull();
    expect(satirlar[1].zaman).toBe('gunduz');
    expect(satirlar[2].zaman).toBe('gece');
  });

  it('ELLE alanlar sceneId ile eşleşen kayıttan geliyor, diğerleri BOŞ', () => {
    const ekler: Record<string, BreakdownEki> = {
      s1: { ozelEsya: ['bıçak'], kostum: [], efekt: [], notlar: 'dikkat', sureTahmini: 2,
           zamanKatmani: 'simdi' as const, hikayeSirasi: null },
    };
    const satirlar = breakdownSatirlariniCikar(bloklar, 'tr', ekler);
    expect(satirlar[0].ek).toEqual(BOS_BREAKDOWN_EKI);
    expect(satirlar[1].ek).toEqual(ekler.s1);
    expect(satirlar[2].ek).toEqual(BOS_BREAKDOWN_EKI);
  });

  it('Map girdisiyle de çalışıyor', () => {
    const ekler = new Map<string, BreakdownEki>([
      ['s2', { ...BOS_BREAKDOWN_EKI, notlar: 'harita' }],
    ]);
    const satirlar = breakdownSatirlariniCikar(bloklar, 'tr', ekler);
    expect(satirlar[2].ek.notlar).toBe('harita');
  });

  it('boş belgede boş dizi dönüyor', () => {
    expect(breakdownSatirlariniCikar([], 'tr', {})).toEqual([]);
  });
});

describe('breakdownEkiGuncelle — belge mutasyonu', () => {
  it('yeni kayıt kuruyor ve sanitize ediyor', () => {
    const doc = new Y.Doc();
    breakdownEkiGuncelle(doc, 's1', { ozelEsya: ['bıçak', '  '], sureTahmini: -5 });
    expect(breakdownMap(doc).get('s1')).toEqual({
      ozelEsya: ['bıçak'], kostum: [], efekt: [], notlar: '', sureTahmini: null,
      zamanKatmani: 'simdi', hikayeSirasi: null,
    });
  });

  it('verilmeyen alanları KORUYOR — mevcutla birleştiriyor', () => {
    const doc = new Y.Doc();
    breakdownEkiGuncelle(doc, 's1', { ozelEsya: ['bıçak'], sureTahmini: 3 });
    breakdownEkiGuncelle(doc, 's1', { notlar: 'ek not' });
    expect(breakdownMap(doc).get('s1')).toEqual({
      ozelEsya: ['bıçak'], kostum: [], efekt: [], notlar: 'ek not', sureTahmini: 3,
      zamanKatmani: 'simdi', hikayeSirasi: null,
    });
  });

  it('boş sceneId sessizce hiçbir şey yazmıyor', () => {
    const doc = new Y.Doc();
    breakdownEkiGuncelle(doc, '', { notlar: 'x' });
    expect(breakdownMap(doc).size).toBe(0);
  });

  it('yazım LOCAL_ORIGIN taşıyor', () => {
    const doc = new Y.Doc();
    const originler: unknown[] = [];
    doc.on('update', (_u: Uint8Array, origin: unknown) => originler.push(origin));
    breakdownEkiGuncelle(doc, 's1', { notlar: 'x' });
    expect(originler).toContain(LOCAL_ORIGIN);
    /* `toContain` origin"siz İKİNCİ bir yazımı görmezdi; o yazım geri alma
       yığınına girmez ve geri alma yarım kalırdı. TEK yazım, TEK origin. */
    expect(originler).toEqual([LOCAL_ORIGIN]);
    // İkinci güncelleme (birleştirme yolu) da tek yazım.
    originler.length = 0;
    breakdownEkiGuncelle(doc, 's1', { ozelEsya: ['bıçak'] });
    expect(originler).toEqual([LOCAL_ORIGIN]);
    // Boş sceneId HİÇ yazım üretmiyor — sessiz ret gerçekten sessiz.
    originler.length = 0;
    breakdownEkiGuncelle(doc, '', { notlar: 'y' });
    expect(originler).toEqual([]);
  });

  /* Geri alma yolu breakdown için hiç sınanmamıştı; karakter/lokasyon/dünya
     testlerinin hepsinde var ve LOCAL_ORIGIN"in tek amacı bu. */
  it('geri alınabiliyor', () => {
    const doc = new Y.Doc();
    const undo = new Y.UndoManager([breakdownMap(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });
    breakdownEkiGuncelle(doc, 's1', { notlar: 'x' });
    expect(breakdownMap(doc).size).toBe(1);
    undo.undo();
    expect(breakdownMap(doc).size).toBe(0);
  });

  it('KORUMALI izdüşümü değiştiriyor', () => {
    const doc = new Y.Doc();
    const once = protectedProjection(doc);
    breakdownEkiGuncelle(doc, 's1', { notlar: 'x' });
    expect(protectedProjection(doc)).not.toBe(once);
  });
});

describe('breakdownCsvYaz / breakdownMarkdownYaz', () => {
  const satirlar = breakdownSatirlariniCikar(
    [
      blok(0, 'scene', 'İÇ. MUTFAK - GÜN', 's1'),
      blok(1, 'character', 'AYŞE', 's1'),
    ],
    'tr',
    { s1: { ozelEsya: ['bıçak, kanlı'], kostum: [], efekt: [], notlar: '', sureTahmini: 2, zamanKatmani: 'simdi', hikayeSirasi: null } },
  );

  it('CSV BOM ile başlıyor ve başlık satırını taşıyor — SÜTUN LİSTESİ TAM', () => {
    const csv = breakdownCsvYaz(satirlar, 'tr');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Sahne,Başlık,İç/Dış,Mekân,Zaman,Karakterler');
    /* Parça iddiası, ELLE GİRİLEN sütunlarının (süre, özel eşya, kostüm,
       efekt, notlar) düşmesini görmezdi — CSV"nin tek işi zaten onları
       prodüksiyona taşımak. Başlık satırının tamamı çivileniyor. */
    expect(csv.slice(1).split('\r\n')[0]).toBe(
      'Sahne,Başlık,İç/Dış,Mekân,Zaman,Karakterler,'
      + 'Süre tahmini (dk),Özel eşya,Kostüm,Efekt,Notlar',
    );
    // Satır sonu CRLF: Excel"in beklediği biçim, `\n` yazan mutant yakalanır.
    expect(csv).toContain('\r\n');
  });

  /* KARAR 2026-08-31: döküm etiketleri BELGE dilinde. Bu test olmadan
     karar yalnız bir yorumdur — İngilizce bir belgenin dökümü sessizce
     Türkçe başlıkla çıkardı ve satırında `INT.` yazardı. */
  it('İngilizce belgede başlıklar da İngilizce — ARAYÜZ dili değil belge dili', () => {
    const enSatirlar = breakdownSatirlariniCikar(
      [
        blok(0, 'scene', 'INT. KITCHEN - DAY', 's1'),
        blok(1, 'character', 'AYŞE', 's1'),
      ],
      'en',
      { s1: { ozelEsya: [], kostum: [], efekt: [], notlar: '', sureTahmini: 2, zamanKatmani: 'simdi', hikayeSirasi: null } },
    );
    const csv = breakdownCsvYaz(enSatirlar, 'en');
    expect(csv.slice(1).split('\r\n')[0]).toBe(
      'Scene,Heading,Int/Ext,Location,Time,Characters,'
      + 'Estimated time (min),Props,Costume,Effects,Notes',
    );
    /* Markdown tarafı da aynı karara tabi: iki yazıcıdan biri Türkçe
       kalsaydı hata yalnız o dışa aktarımı seçen kullanıcıda görünürdü. */
    const md = breakdownMarkdownYaz(enSatirlar, 'en');
    expect(md).toContain('### Collected automatically');
    expect(md).toContain('### Entered manually');
    expect(md).toContain('- **Int/Ext:** INT.');
    expect(md).toContain('- **Estimated time:** 2 min');
    expect(md).not.toContain('İç/Dış');
  });

  it('virgül içeren alan tırnaklanıyor — DOSYANIN TAMAMI çivili', () => {
    const csv = breakdownCsvYaz(satirlar, 'tr');
    expect(csv).toContain('"bıçak, kanlı"');
    /* `toContain` alanın DOĞRU SÜTUNDA olduğunu ölçmüyordu: bütün alanları
       tırnaklayan ya da sütunları kaydıran bir mutant geçerdi. Tam dosya. */
    expect(csv).toBe(
      '﻿Sahne,Başlık,İç/Dış,Mekân,Zaman,Karakterler,'
      + 'Süre tahmini (dk),Özel eşya,Kostüm,Efekt,Notlar\r\n'
      + '1,İÇ. MUTFAK - GÜN,İÇ,MUTFAK,GÜN,AYŞE,2,"bıçak, kanlı",,,\r\n',
    );
  });

  /* Tırnak, satır sonu ve noktalı virgül: CSV kaçırmasının asıl tuzakları
     ve hiçbiri sınanmamıştı. Kaçırılmazsa dosya Excel"de kayar. */
  it('tırnak ve satır sonu içeren alanlar da kaçırılıyor', () => {
    const zor = breakdownSatirlariniCikar(
      [blok(0, 'scene', 'İÇ. "BÜYÜK" SALON - GÜN', 's1')], 'tr',
      { s1: { ozelEsya: ['a"b', 'c\nd'], kostum: [], efekt: [], notlar: '', sureTahmini: null, zamanKatmani: 'simdi', hikayeSirasi: null } },
    );
    const csv = breakdownCsvYaz(zor, 'tr');
    // Çift tırnak İKİYE KATLANIYOR (RFC 4180) ve alan tırnak içine alınıyor.
    expect(csv).toContain('"İÇ. ""BÜYÜK"" SALON - GÜN"');
    // Satır sonu içeren alan da tırnaklı — yoksa satır ikiye bölünürdü.
    expect(csv).toMatch(/"a""b[^"]*c\nd"/u);
  });

  it('Markdown otomatik ve elle bölümlerini AYIRIYOR — BELGENİN TAMAMI', () => {
    const md = breakdownMarkdownYaz(satirlar, 'tr');
    expect(md).toContain('### Otomatik toplanan');
    expect(md).toContain('### Elle girilen');
    expect(md).toContain('MUTFAK');
    expect(md).toContain('bıçak, kanlı');
    /* Dört parça iddiası SIRAYI ve hangi alanın hangi bölüme düştüğünü
       ölçmüyordu: elle girilen "özel eşya"yı otomatik bölüme yazan bir
       mutant dördünü de geçerdi. Belgenin tamamı çivileniyor. */
    expect(md).toBe(
      '## 1. İÇ. MUTFAK - GÜN\n\n'
      + '### Otomatik toplanan\n\n'
      + '- **İç/Dış:** İÇ\n- **Mekân:** MUTFAK\n- **Zaman:** GÜN\n- **Karakterler:** AYŞE\n\n'
      + '### Elle girilen\n\n'
      + '- **Süre tahmini:** 2 dk\n- **Özel eşya:** bıçak, kanlı\n\n',
    );
  });

  it('Markdown başlıktaki özel karakteri kaçırıyor — disa/duz.ts ile TEK EV', () => {
    const yildizli = breakdownSatirlariniCikar(
      [blok(0, 'scene', 'İÇ. *STÜDYO* - GÜN', 's1')], 'tr', {},
    );
    const md = breakdownMarkdownYaz(yildizli, 'tr');
    expect(md).toContain('\\*STÜDYO\\*');
    // Başlık satırının tamamı: kaçırma başlık işaretini bozmuyor.
    expect(md.split('\n')[0]).toBe('## 1. İÇ. \\*STÜDYO\\* - GÜN');
  });

  /* ÖLÇEK: iki bloklu tek sahne, sıralamayı ve numaralandırmayı hiç
     zorlamıyordu. Beş yüz sahnede sıra, numara ve alan eşleşmesi birlikte
     sınanıyor — `sira` bir kayarsa prodüksiyon yanlış sahneyi çeker. */
  it('ÖLÇEK: 500 sahne CSV ve Markdown"a sırayla, kaybolmadan yazılıyor', () => {
    const bloklar: ScriptBlock[] = [];
    for (let i = 0; i < 500; i++) {
      bloklar.push(blok(i * 2, 'scene', `İÇ. ODA ${i} - GÜN`, `s${i}`));
      bloklar.push(blok(i * 2 + 1, 'character', `KİŞİ ${i}`, `s${i}`));
    }
    const cok = breakdownSatirlariniCikar(bloklar, 'tr', {});
    expect(cok).toHaveLength(500);
    expect(cok.map((s) => s.sira)).toEqual(Array.from({ length: 500 }, (_, i) => i));

    const csv = breakdownCsvYaz(cok, 'tr');
    const satirDizisi = csv.slice(1).split('\r\n').filter((s) => s !== '');
    expect(satirDizisi, 'başlık + 500 satır').toHaveLength(501);
    // Sahne numaraları 1"den 500"e, sırayla.
    expect(satirDizisi.slice(1).map((s) => Number(s.split(',')[0])))
      .toEqual(Array.from({ length: 500 }, (_, i) => i + 1));
    // Her satır KENDİ mekânını ve karakterini taşıyor — eşleşme kaymıyor.
    expect(satirDizisi[1]).toBe('1,İÇ. ODA 0 - GÜN,İÇ,ODA 0,GÜN,KİŞİ 0,,,,,');
    expect(satirDizisi[500]).toBe('500,İÇ. ODA 499 - GÜN,İÇ,ODA 499,GÜN,KİŞİ 499,,,,,');

    const md = breakdownMarkdownYaz(cok, 'tr');
    expect(md.match(/^## \d+\. /gmu)).toHaveLength(500);
    expect(md.startsWith('## 1. İÇ. ODA 0 - GÜN\n')).toBe(true);
  });
});
