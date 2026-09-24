import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import {
  kelimeleriAyir,
  sozlukAnahtari,
  sozlukBirlestir,
  sozlugeUygun,
  sozlukteVar,
} from '@storyboard/core/dil/sozluk';
import { denetimDilleri, gecerliDilleri } from '@storyboard/core/dil/denetim';
import { LOCAL_ORIGIN, sozlugeEkle, sozlugeTopluEkle, sozluktenCikar } from '@storyboard/core/doc/mutations';
import { sozlukMap } from '@storyboard/core/doc/schema';
import { protectedProjection } from '@storyboard/core/model/projection';

describe('sözlük anahtarı — aynı ad üç biçimde geçer', () => {
  /* Senaryoda karakter bloğunda `AYŞE`, aksiyonda `Ayşe`, diyalogda `ayşe`.
     Üçü aynı anahtara düşmezse kullanıcı kelimeyi üç kez eklemek zorunda
     kalır. */
  it('büyük/küçük harf ayrımı yok', () => {
    expect(sozlukAnahtari('AYŞE')).toBe(sozlukAnahtari('Ayşe'));
    expect(sozlukAnahtari('ayşe')).toBe(sozlukAnahtari('AYŞE'));
  });

  /* ÖLÇÜLDÜ: 'ISPARTA'.toLocaleLowerCase('tr') → ısparta,
     .toLocaleLowerCase('en') → isparta. Aynı kelime, belgenin diline göre
     iki ayrı anahtar üretirdi ve sözlük dil değişince sessizce ıskalardı. */
  it('Türkçe ı/i ayrımı anahtarı BÖLMÜYOR', () => {
    expect(sozlukAnahtari('ISPARTA')).toBe(sozlukAnahtari('isparta'));
    expect(sozlukAnahtari('Işık')).toBe(sozlukAnahtari('ışık'));
    expect(sozlukAnahtari('İZMİR')).toBe(sozlukAnahtari('izmir'));
  });

  it('NFD gelen Türkçe harf NFC ile aynı anahtarı veriyor', () => {
    const nfd = 'Ayşe'.normalize('NFD');
    expect(nfd).not.toBe('Ayşe');
    expect(sozlukAnahtari(nfd)).toBe(sozlukAnahtari('Ayşe'));
  });

  it('baştaki ve sondaki boşluk anahtarı değiştirmiyor', () => {
    expect(sozlukAnahtari('  Ayşe  ')).toBe(sozlukAnahtari('Ayşe'));
  });
});

describe('sözlüğe uygunluk — güven sınırı', () => {
  it('harf içermeyen parçalar reddediliyor', () => {
    expect(sozlugeUygun('...')).toBe(false);
    expect(sozlugeUygun('123')).toBe(false);
    expect(sozlugeUygun('')).toBe(false);
    expect(sozlugeUygun('   ')).toBe(false);
  });

  it('gerçek kelimeler kabul ediliyor', () => {
    expect(sozlugeUygun('Ayşe')).toBe(true);
    expect(sozlugeUygun('Şişli')).toBe(true);
    expect(sozlugeUygun('AKIRA')).toBe(true); // romanize Japonca
    expect(sozlugeUygun('Київ')).toBe(true); // Ukraynaca
  });

  it('aşırı uzun parça reddediliyor — sözlüğü şişirir', () => {
    expect(sozlugeUygun('a'.repeat(65))).toBe(false);
    expect(sozlugeUygun('a'.repeat(64))).toBe(true);
  });
});

describe('iki katman — proje ÜSTTE', () => {
  /* Ekipçe üzerinde anlaşılmış yazım, tek kullanıcının kendi kaydından
     önce gelir. */
  it('aynı anahtarda projedeki özgün yazım kazanıyor', () => {
    const birlesik = sozlukBirlestir({ ayse: 'Ayse' }, { ayse: 'Ayşe' });
    expect(birlesik.ayse).toBe('Ayşe');
  });

  it('iki katman da görünüyor', () => {
    const birlesik = sozlukBirlestir({ kenji: 'Kenji' }, { 'ayşe': 'Ayşe' });
    expect(sozlukteVar(birlesik, 'KENJI')).toBe(true);
    expect(sozlukteVar(birlesik, 'ayşe')).toBe(true);
  });

  it('sözlükte olmayan kelime bulunmuyor', () => {
    expect(sozlukteVar({ 'ayşe': 'Ayşe' }, 'Mehmet')).toBe(false);
  });

  /* Katlama ı/i dışına taşsaydı `sıkı` ile `siki` değil, `Ayşe` ile `Ayse`
     de aynı anahtara düşerdi — farklı yazımlar sessizce birleşirdi. */
  it('ş/s ve ğ/g AYRI kalıyor — katlama fazla geniş değil', () => {
    expect(sozlukAnahtari('Ayşe')).not.toBe(sozlukAnahtari('Ayse'));
    expect(sozlukAnahtari('dağ')).not.toBe(sozlukAnahtari('dag'));
  });
});

describe('metinden kelime ayırma', () => {
  it('kesme işareti kelimenin İÇİNDE kalıyor', () => {
    expect(kelimeleriAyir("Arzu'nun çantası")).toEqual(["Arzu'nun", 'çantası']);
  });

  it('sondaki kesme işareti düşüyor — sözlüğe çöp girmiyor', () => {
    expect(kelimeleriAyir("Ayşe' geldi")).toEqual(['Ayşe', 'geldi']);
  });

  it('noktalama ve rakamlar ayıklanıyor', () => {
    expect(kelimeleriAyir('İÇ. ODA 12 - GECE')).toEqual(['İÇ', 'ODA', 'GECE']);
  });

  it('aynı kelime bir kez dönüyor (büyük/küçük fark etmez)', () => {
    expect(kelimeleriAyir('Ayşe ayşe AYŞE')).toEqual(['Ayşe']);
  });

  it('Kiril ve Latin bir arada çalışıyor', () => {
    expect(kelimeleriAyir('Київ ve Paris')).toEqual(['Київ', 've', 'Paris']);
  });
});

describe('proje sözlüğü belgede yaşıyor ve PAYLAŞILIYOR', () => {
  it('eklenen kelime katlanmış anahtarla, özgün yazımıyla duruyor', () => {
    const doc = new Y.Doc();
    expect(sozlugeEkle(doc, 'Ayşe')).toBe(true);
    /* Katlama YALNIZ ı/i'ye dokunuyor: `ş` yerinde kalır, yani anahtar
       `ayşe`. Bu bilinçli — daha geniş katlamak (ş→s, ğ→g) birbirinden
       gerçekten farklı Türkçe kelimeleri aynı anahtara düşürürdü. */
    expect(sozlukMap(doc).toJSON()).toEqual({ 'ayşe': 'Ayşe' });
  });

  /* Sessiz yutma, kullanıcıya kelimeyi eklediğini sandırırdı. */
  it('uygunsuz kelime sessizce yutulmuyor, FALSE dönüyor', () => {
    const doc = new Y.Doc();
    expect(sozlugeEkle(doc, '123')).toBe(false);
    expect(sozlukMap(doc).size).toBe(0);
  });

  it('çıkarma yoksa false, varsa siliyor', () => {
    const doc = new Y.Doc();
    sozlugeEkle(doc, 'Ayşe');
    expect(sozluktenCikar(doc, 'yok')).toBe(false);
    expect(sozluktenCikar(doc, 'AYŞE')).toBe(true); // başka biçimle de bulunuyor
    expect(sozlukMap(doc).size).toBe(0);
  });

  /* İki yazar aynı kelimeyi aynı anda eklerse Map tek girdiye yakınsar;
     Y.Array olsaydı kelime İKİ KEZ görünürdü. */
  it('eşzamanlı aynı ekleme TEK girdiye yakınsıyor', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    sozlugeEkle(a, 'Ayşe');
    sozlugeEkle(b, 'AYŞE');
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(sozlukMap(a).size).toBe(1);
    expect(sozlukMap(a).toJSON()).toEqual(sozlukMap(b).toJSON());
  });

  it('toplu ekleme TEK transaction — geri alma tek adım', () => {
    const doc = new Y.Doc();
    let islem = 0;
    doc.on('afterTransaction', () => islem++);
    expect(sozlugeTopluEkle(doc, ['Ayşe', 'Kenji', '123', 'Київ'])).toBe(3);
    expect(islem).toBe(1);
    expect(sozlukMap(doc).size).toBe(3);
  });
});

describe('sözlük KORUMALI izdüşümde — yetkisiz yazım engellenir', () => {
  /* Dışarıda bıraksaydık yorumcu ve İZLEYİCİ rolü sözlüğe sınırsız
     yazabilirdi ve sunucunun izin denetimi bunu hiç görmezdi. */
  it('sözlüğe yazmak izdüşümü değiştiriyor', () => {
    const doc = new Y.Doc();
    const once = protectedProjection(doc);
    sozlugeEkle(doc, 'Ayşe');
    expect(protectedProjection(doc)).not.toBe(once);
  });

  it('izdüşüm sözlüğün İÇERİĞİNİ taşıyor', () => {
    const doc = new Y.Doc();
    sozlugeEkle(doc, 'Ayşe');
    expect(protectedProjection(doc)).toContain('Ayşe');
  });
});

describe('denetim dilleri — liste KABUKTAN gelir', () => {
  /* Sabit liste yazmak, kullanıcıya seçebileceğini sandığı ama
     `setSpellCheckerLanguages`'in hata fırlatacağı bir dil göstermek
     olurdu. */
  it('kabuğun bildirdiği kodlar okunur adla dönüyor', () => {
    const d = denetimDilleri(['tr', 'de', 'ru']);
    expect(d.map((x) => x.ad)).toEqual(['Almanca', 'Rusça', 'Türkçe']);
  });

  it('aynı dilin varyantı iki kez listelenmiyor', () => {
    expect(denetimDilleri(['tr', 'tr-TR']).map((x) => x.ad)).toEqual(['Türkçe']);
  });

  /* Süzmek, çeviri tablomuzun eksikliğini kullanıcının yeteneği sanmak
     olurdu. */
  it('tanımadığımız kod ATILMIYOR, kodun kendisiyle gösteriliyor', () => {
    expect(denetimDilleri(['xx-YY']).map((x) => x.ad)).toEqual(['xx-YY']);
  });

  it('Japonca kabuk bildirmediği için hiç görünmüyor', () => {
    expect(denetimDilleri(['tr', 'en-US', 'de', 'fr', 'ru', 'uk']).map((x) => x.kod)).not.toContain(
      'ja',
    );
  });

  /* Bir bayat kod `setSpellCheckerLanguages`'i fırlatır ve o çağrıdaki
     GEÇERLİ dilleri de götürür. */
  it('bayat seçim süzülüyor, geçerliler korunuyor', () => {
    expect(gecerliDilleri(['tr', 'ja', 'de'], ['tr', 'de', 'fr'])).toEqual(['tr', 'de']);
  });

  it('hepsi bayatsa boş liste — fırlatma değil', () => {
    expect(gecerliDilleri(['ja'], ['tr'])).toEqual([]);
  });
});

describe('sözlük yazımı GERİ ALINABİLİR — ret sonrası toparlanma buna dayanıyor', () => {
  /* Sunucu yetkisiz sözlük yazımını reddettiğinde istemcinin tek toparlanma
     yolu `store.undo()`. Yazım `LOCAL_ORIGIN` taşımasaydı ya da sözlük kökü
     UndoManager kapsamında olmasaydı o çağrı ALAKASIZ bir önceki düzenlemeyi
     geri alırdı — sessiz veri kaybı. */
  const kapsamli = (doc: Y.Doc) =>
    new Y.UndoManager([sozlukMap(doc)], { trackedOrigins: new Set([LOCAL_ORIGIN]) });

  it('eklenen kelime geri alınıyor', () => {
    const doc = new Y.Doc();
    const undo = kapsamli(doc);
    sozlugeEkle(doc, 'Ayşe');
    expect(sozlukMap(doc).size).toBe(1);
    undo.undo();
    expect(sozlukMap(doc).size).toBe(0);
  });

  it('çıkarılan kelime geri alınıyor', () => {
    const doc = new Y.Doc();
    sozlugeEkle(doc, 'Ayşe');
    const undo = kapsamli(doc);
    sozluktenCikar(doc, 'Ayşe');
    expect(sozlukMap(doc).size).toBe(0);
    undo.undo();
    expect(sozlukMap(doc).size).toBe(1);
  });

  /* Yorumun sözü: "geri alma TEK adım olur." Ölçülmeseydi toplu ekleme
     kelime sayısı kadar adım açar ve kullanıcı N kez geri almak zorunda kalırdı. */
  it('toplu ekleme TEK adımda geri alınıyor', () => {
    const doc = new Y.Doc();
    const undo = kapsamli(doc);
    sozlugeTopluEkle(doc, ['Ayşe', 'Kenji', 'Київ']);
    expect(sozlukMap(doc).size).toBe(3);
    undo.undo();
    expect(sozlukMap(doc).size).toBe(0);
  });

  it('yazım LOCAL_ORIGIN taşıyor — kapsam dışı origin geri alınmaz', () => {
    const doc = new Y.Doc();
    const originler: unknown[] = [];
    doc.on('update', (_u: Uint8Array, origin: unknown) => originler.push(origin));
    sozlugeEkle(doc, 'Ayşe');
    expect(originler).toContain(LOCAL_ORIGIN);
  });
});
