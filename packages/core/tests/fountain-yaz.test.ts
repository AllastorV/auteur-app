import { describe, expect, it } from 'vitest';
import { fountainYaz } from '@storyboard/core/disa/fountain';
import { parseFountain, type ScriptBlock, type ScriptBlockType } from '@storyboard/core/model/script';

let sayac = 0;
const b = (type: ScriptBlockType, text: string): ScriptBlock => ({
  id: `sb_${sayac++}`, fp: '', type, text, scene: '', sceneId: '',
});

const tipler = (metin: string) => parseFountain(metin).map((x) => x.type);
const metinler = (metin: string) => parseFountain(metin).map((x) => x.text);

const SAHNE: ScriptBlock[] = [
  b('scene', 'İÇ. ESKİ APARTMAN - KORİDOR - GECE'),
  b('action', 'Ayşe kapıyı yavaşça iter.'),
  b('character', 'AYŞE'),
  b('parenthetical', '(fısıltıyla)'),
  b('dialogue', 'Kimse yok, emin misin?'),
  b('character', 'MEHMET'),
  b('dialogue', 'Emin değilim.'),
  b('transition', 'KES'),
];

describe('Fountain dışa aktarımı YUVARLANIYOR', () => {
  /* İddia edilmiyor, ÖLÇÜLÜYOR: yazılan metin kendi ayrıştırıcımızla geri
     okunduğunda tipler birebir aynı olmak zorunda. */
  it('tipler birebir geri geliyor', () => {
    const cikti = fountainYaz(SAHNE);
    expect(cikti.tutmayan).toEqual([]);
    expect(tipler(cikti.metin)).toEqual(SAHNE.map((x) => x.type));
  });

  it('metinler zorlama işaretleri olmadan geri geliyor', () => {
    const cikti = fountainYaz(SAHNE);
    expect(metinler(cikti.metin)).toEqual(SAHNE.map((x) => x.text));
  });

  /* Fountain'ın varlık sebebi düz metin olarak okunabilmesi; her satırı
     işaretlemek onu insan eliyle düzenlenemez kılardı. Yalnız ayrıştırıcının
     geri okuyamayacağı blok işaretlenir.

     Bu sahnedeki tek istisna sondaki `KES`: ayrıştırıcı çıplak `KES`'i geçiş
     saymıyor (`TRANSITION_TAIL` `kes:` ve `kes.` istiyor), editörün canlı
     algılaması ise sayıyor (`editor/algila.ts` GECİŞLER). İki modül farklı
     güven düzeyinde çalışıyor — biri YABANCI dosyayı okuyor ve temkinli
     olmalı, öteki kullanıcının o an yazdığını okuyor. Ayrışma bilinçli;
     yuvarlanabilirliği kendi kendini doğrulayan yazım koruyor. */
  it('yalnız geri okunamayan blok işaretlenir, gerisi deyimsel kalır', () => {
    const cikti = fountainYaz(SAHNE);
    expect(cikti.zorlananlar).toEqual([7]);
    expect(cikti.metin).toContain('>KES');
    // Diğer yedi blok işaretsiz.
    expect(cikti.metin.split('\n').filter((l) => /^[.@>!]/.test(l))).toHaveLength(1);
  });
});

describe('kayıplı vakalar ZORLANIYOR', () => {
  /* Ayrıştırıcı karakter satırının ALTINDA bir satır olmasını şart koşuyor;
     sonunda diyalog olmayan bir karakter aksiyona dönüşürdü. */
  it('sonda diyalogsuz karakter zorlanır ve tipi korunur', () => {
    const bloklar = [b('action', 'Kapı çalar.'), b('character', 'AYŞE')];
    const cikti = fountainYaz(bloklar);
    expect(cikti.zorlananlar).toContain(1);
    expect(cikti.metin).toContain('@AYŞE');
    expect(tipler(cikti.metin)).toEqual(['action', 'character']);
    expect(cikti.tutmayan).toEqual([]);
  });

  /* Büyük harfle bağıran bir replik, aksiyon konumunda karakter sanılır. */
  it('geçişe benzeyen aksiyon zorlanır', () => {
    const bloklar = [b('action', 'KES'), b('action', 'Ayşe döner.')];
    const cikti = fountainYaz(bloklar);
    expect(tipler(cikti.metin)).toEqual(['action', 'action']);
    expect(cikti.tutmayan).toEqual([]);
  });

  it('sahne başlığına benzeyen aksiyon zorlanır', () => {
    const bloklar = [b('action', 'İÇ. MUTFAK - GECE'), b('action', 'Bir ses duyulur.')];
    const cikti = fountainYaz(bloklar);
    expect(tipler(cikti.metin)).toEqual(['action', 'action']);
    expect(cikti.metin).toContain('!İÇ. MUTFAK');
  });

  it('aksiyona benzeyen sahne başlığı zorlanır', () => {
    const bloklar = [b('scene', 'Karanlık bir oda'), b('action', 'Işık yanar.')];
    const cikti = fountainYaz(bloklar);
    expect(cikti.metin).toContain('.Karanlık bir oda');
    expect(tipler(cikti.metin)).toEqual(['scene', 'action']);
  });

  it('zorlanan blokların metni işaretsiz geri gelir', () => {
    const bloklar = [b('action', 'KES'), b('character', 'AYŞE')];
    const cikti = fountainYaz(bloklar);
    expect(metinler(cikti.metin)).toEqual(['KES', 'AYŞE']);
  });
});

describe('blok ayırma kuralları', () => {
  /* Diyalog ve parantezik karakterin HEMEN ALTINDA olmak zorunda: araya boş
     satır girerse ayrıştırıcı akışı keser ve replik aksiyona dönüşür. */
  it('diyalog karakterin hemen altına yazılır', () => {
    const cikti = fountainYaz([b('character', 'AYŞE'), b('dialogue', 'Merhaba.')]);
    expect(cikti.metin).toContain('AYŞE\nMerhaba.');
  });

  it('aksiyonlar arasında boş satır bırakılır', () => {
    const cikti = fountainYaz([b('action', 'Bir.'), b('action', 'İki.')]);
    expect(cikti.metin).toContain('Bir.\n\nİki.');
    expect(tipler(cikti.metin)).toEqual(['action', 'action']);
  });

  it('boş senaryo boş çıktı verir ve çökmez', () => {
    const cikti = fountainYaz([]);
    expect(cikti.tutmayan).toEqual([]);
    expect(parseFountain(cikti.metin)).toEqual([]);
  });
});

describe('geniş karışımda da yuvarlanıyor', () => {
  it('yüz bloklu karışık senaryo tip kaybı vermiyor', () => {
    const desen: ScriptBlockType[] = [
      'scene', 'action', 'character', 'dialogue', 'action',
      'character', 'parenthetical', 'dialogue', 'transition',
    ];
    const bloklar = Array.from({ length: 100 }, (_, i) => {
      const tip = desen[i % desen.length];
      const metin =
        tip === 'scene' ? `İÇ. MEKAN ${i} - GECE`
        : tip === 'character' ? `KİŞİ${i}`
        : tip === 'parenthetical' ? '(alçak sesle)'
        : tip === 'transition' ? 'KES'
        : `Satır ${i} bir miktar metin taşır.`;
      return b(tip, metin);
    });
    const cikti = fountainYaz(bloklar);
    expect(cikti.tutmayan).toEqual([]);
    expect(tipler(cikti.metin)).toEqual(bloklar.map((x) => x.type));
    expect(metinler(cikti.metin)).toEqual(bloklar.map((x) => x.text));
  });
});
