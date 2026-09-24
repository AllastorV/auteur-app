import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  adiDuzelt,
  karakterAdiGecerliMi,
  karakterAnahtari,
  karakterSatirlari,
  karakterleriTopla,
  KARAKTER_ADI_EN_UZUN,
  type Karakter,
} from '@storyboard/core/model/karakter';
import type { ScriptBlock } from '@storyboard/core/model/script';
import {
  karakterEkle,
  karakterGuncelle,
  karakterSil,
  LOCAL_ORIGIN,
} from '@storyboard/core/doc/mutations';
import { karakterlerMap } from '@storyboard/core/doc/schema';
import { protectedProjection } from '@storyboard/core/model/projection';

const blok = (i: number, tip: ScriptBlock['type'], metin: string): ScriptBlock => ({
  id: `b${i}`, fp: `f${i}`, type: tip, text: metin, scene: '', sceneId: 's1',
});

describe('adiDuzelt — belge elle kurcalanmış olabilir', () => {
  it('NFC normalize ediyor ve kırpıyor', () => {
    const ayrik = 'I' + String.fromCharCode(0x0307);
    expect(adiDuzelt(`  ${ayrik}  `)).toBe(ayrik.normalize('NFC'));
  });

  it('uzun adı kırpıyor — listede okunmaz olmasın', () => {
    const uzun = 'x'.repeat(KARAKTER_ADI_EN_UZUN + 40);
    expect(adiDuzelt(uzun)).toHaveLength(KARAKTER_ADI_EN_UZUN);
  });

  it('dizge olmayan girdide çökmeden boşa dönüyor', () => {
    expect(adiDuzelt(null)).toBe('');
    expect(adiDuzelt(42)).toBe('');
  });
});

describe('karakterAnahtari — Türkçe İ/ı tuzağından bağımsız', () => {
  it('büyük/küçük Türkçe harf varyasyonları AYNI anahtara düşüyor', () => {
    expect(karakterAnahtari('IŞIK')).toBe(karakterAnahtari('ışık'));
    expect(karakterAnahtari('İREM')).toBe(karakterAnahtari('irem'));
  });

  it('farklı adlar farklı anahtar üretiyor', () => {
    expect(karakterAnahtari('Ayşe')).not.toBe(karakterAnahtari('Ali'));
  });
});

describe('karakterAdiGecerliMi', () => {
  const digerleri: Karakter[] = [
    { id: 'k1', ad: 'Ayşe', aciklama: '', renk: '', notlar: '' },
  ];

  it('boş ad geçersiz', () => {
    expect(karakterAdiGecerliMi('', digerleri)).toEqual({
      gecerli: false,
      hata: 'Karakter adı boş olamaz.',
    });
    expect(karakterAdiGecerliMi('   ', digerleri).gecerli).toBe(false);
  });

  it('çakışan ad (Türkçe katlamayla) geçersiz', () => {
    const sonuc = karakterAdiGecerliMi('AYŞE', digerleri);
    expect(sonuc.gecerli).toBe(false);
    expect(sonuc.hata).toContain('Ayşe');
    /* `toContain('Ayşe')` mesajın tamamını serbest bırakıyordu; kullanıcı bu
       metni diyalogda okuyor ve KAYITLI hâli ("Ayşe", yazdığı "AYŞE" değil)
       görmesi gerekiyor — hangi kaydın çakıştığını ancak öyle anlar. */
    expect(sonuc).toEqual({
      gecerli: false,
      hata: '"Ayşe" adıyla zaten bir karakter var.',
    });
    /* Türkçe katlama HER varyasyonda: `ı/I` ve `i/İ` tuzağının iki yönü de
       aynı çakışmayı vermeli — biri kaçarsa iki "Ayşe" birden var olur. */
    for (const varyasyon of ['ayşe', 'AYŞE', 'AyŞe', 'ayŞE']) {
      expect(karakterAdiGecerliMi(varyasyon, digerleri).gecerli, varyasyon).toBe(false);
    }
  });

  it('benzersiz ad geçerli', () => {
    expect(karakterAdiGecerliMi('Mehmet', digerleri)).toEqual({ gecerli: true });
  });

  it('kendiId kendi kaydını çakışma saymıyor', () => {
    expect(karakterAdiGecerliMi('AYŞE', digerleri, 'k1')).toEqual({ gecerli: true });
  });
});

describe('karakterleriTopla — otomatik toplama', () => {
  it('yalnız character bloklarını sayıyor', () => {
    const bloklar = [
      blok(0, 'scene', 'İÇ. MUTFAK - GÜN'),
      blok(1, 'character', 'AYŞE'),
      blok(2, 'dialogue', 'Gitmiyorum.'),
    ];
    expect(karakterleriTopla(bloklar).map((k) => k.ad)).toEqual(['AYŞE']);
  });

  it('uzantılı ad (V.O./O.S./devam) AYNI karakterle birleşiyor', () => {
    const bloklar = [
      blok(0, 'character', 'AYŞE'),
      blok(1, 'character', 'AYŞE (V.O.)'),
      blok(2, 'character', 'ayşe (devam)'),
    ];
    const sonuc = karakterleriTopla(bloklar);
    expect(sonuc).toHaveLength(1);
    // İLK görünen biçim korunuyor — sonraki varyasyonlar adı değiştirmiyor.
    expect(sonuc[0].ad).toBe('AYŞE');
    expect(sonuc[0].ilkBlokId).toBe('b0');
  });

  it('yalnız uzantıdan ibaret satır (ad boşa iniyor) atlanıyor', () => {
    const bloklar = [blok(0, 'character', '(V.O.)')];
    expect(karakterleriTopla(bloklar)).toEqual([]);
  });

  it('sıra belge sırası — ikinci konuşan ikinci geliyor', () => {
    const bloklar = [
      blok(0, 'character', 'MEHMET'),
      blok(1, 'character', 'AYŞE'),
    ];
    expect(karakterleriTopla(bloklar).map((k) => k.ad)).toEqual(['MEHMET', 'AYŞE']);
  });

  /* ÖLÇEK: üç bloklu testler ne sıralamayı ne de birleştirmeyi gerçekten
     zorluyordu. Beş yüz karakter, her biri üç varyasyonla (düz, V.O.,
     küçük harf) geçiyor — birleştirme, ilk-biçim koruma ve belge sırası
     aynı anda sınanıyor. */
  it('ÖLÇEK: 500 karakter × 3 varyasyon TEK kayda iniyor, sıra korunuyor', () => {
    const bloklar: ScriptBlock[] = [];
    let i = 0;
    for (let n = 0; n < 500; n++) {
      bloklar.push(blok(i++, 'character', `KARAKTER ${n}`));
      bloklar.push(blok(i++, 'dialogue', 'x'));
      bloklar.push(blok(i++, 'character', `KARAKTER ${n} (V.O.)`));
      bloklar.push(blok(i++, 'character', `karakter ${n} (devam)`));
    }
    const sonuc = karakterleriTopla(bloklar);
    expect(sonuc).toHaveLength(500);
    // Belge sırası: 0"dan 499"a.
    expect(sonuc.map((k) => k.ad)).toEqual(
      Array.from({ length: 500 }, (_, n) => `KARAKTER ${n}`),
    );
    // İLK görünen biçim ve ilk blok kimliği korunuyor.
    expect(sonuc[0].ilkBlokId).toBe('b0');
    expect(sonuc[499].ilkBlokId).toBe('b1996');
  });

  /* Türkçe katlama ÖLÇEKTE de tek kayda indirmeli: `IŞIK`/`ışık` ve
     `İREM`/`irem` çiftleri ayrı sayılırsa kadro listesi ikiye bölünür. */
  it('Türkçe İ/ı katlaması ölçekte de TEK kayda indiriyor', () => {
    const bloklar: ScriptBlock[] = [];
    let i = 0;
    for (let n = 0; n < 200; n++) {
      bloklar.push(blok(i++, 'character', `IŞIK${n}`));
      bloklar.push(blok(i++, 'character', `ışık${n}`));
      bloklar.push(blok(i++, 'character', `İREM${n}`));
      bloklar.push(blok(i++, 'character', `irem${n}`));
    }
    expect(karakterleriTopla(bloklar)).toHaveLength(400);
  });

  /* Uzun ad, NFD ve emoji: kadro adı doğrudan senaryodan geliyor ve bu
     girdilerin hiçbiri sınanmamıştı. */
  it('uzun ad, NFD ve emoji toplama sırasında çökmüyor', () => {
    const uzun = 'A'.repeat(500);
    const nfd = 'Ayşe'.normalize('NFD');
    const sonuc = karakterleriTopla([
      blok(0, 'character', uzun),
      blok(1, 'character', nfd),
      blok(2, 'character', '😀 ROBOT'),
      blok(3, 'character', 'Ayşe'.normalize('NFC')),
    ]);
    // NFD ve NFC AYNI karakter — anahtar normalize ediliyor.
    expect(sonuc.map((k) => k.ad)).toEqual([uzun, 'Ayşe'.normalize('NFC'), '😀 ROBOT']);
  });
});

describe('karakterSatirlari — kayıtlı ve senaryodaki birleşimi', () => {
  const bloklar = [blok(0, 'character', 'AYŞE')];

  it('yalnız senaryoda geçen ama hiç kaydedilmemiş karakter — id YOK, ilkBlokId VAR', () => {
    const satirlar = karakterSatirlari({}, bloklar);
    expect(satirlar).toEqual([{ id: undefined, ad: 'AYŞE', aciklama: '', ilkBlokId: 'b0' }]);
  });

  it('yalnız kayıtlı ama senaryoda geçmeyen karakter — id VAR, ilkBlokId YOK', () => {
    const kayit: Karakter = { id: 'k1', ad: 'Mehmet', aciklama: 'Baba', renk: '', notlar: '' };
    const satirlar = karakterSatirlari({ k1: kayit }, bloklar);
    // AYŞE (senaryoda) + Mehmet (kayıtlı) — Türkçe alfabetik sırayla.
    expect(satirlar).toEqual([
      { id: undefined, ad: 'AYŞE', aciklama: '', ilkBlokId: 'b0' },
      { id: 'k1', ad: 'Mehmet', aciklama: 'Baba', ilkBlokId: undefined },
    ]);
  });

  it('hem kayıtlı hem senaryoda geçen karakter TEK satırda birleşiyor', () => {
    const kayit: Karakter = { id: 'k1', ad: 'Ayşe', aciklama: 'Anne', renk: '', notlar: '' };
    const satirlar = karakterSatirlari({ k1: kayit }, bloklar);
    expect(satirlar).toEqual([{ id: 'k1', ad: 'Ayşe', aciklama: 'Anne', ilkBlokId: 'b0' }]);
  });

  it('Map girdisiyle de çalışıyor', () => {
    const kayit: Karakter = { id: 'k1', ad: 'Zeynep', aciklama: '', renk: '', notlar: '' };
    const satirlar = karakterSatirlari(new Map([['k1', kayit]]), []);
    expect(satirlar).toEqual([{ id: 'k1', ad: 'Zeynep', aciklama: '', ilkBlokId: undefined }]);
  });
});

describe('belge mutasyonları', () => {
  it('karakter eklenip okunuyor — kimlik üretiliyor', () => {
    const doc = new Y.Doc();
    const k = karakterEkle(doc, { ad: 'Ayşe', aciklama: 'Anne' });
    expect(k.id).toMatch(/^kr_/);
    expect(karakterlerMap(doc).get(k.id)).toEqual({
      id: k.id, ad: 'Ayşe', aciklama: 'Anne', renk: '', notlar: '',
    });
    // Dönen nesne ile belgedeki kayıt AYNI: çağıran yanlış bir kopya almıyor.
    expect(k).toEqual(karakterlerMap(doc).get(k.id));
  });

  /* `toMatch(/^kr_/)` ön eki ölçüyordu ama BENZERSİZLİĞİ değil: her çağrıda
     `'kr_1'` döndüren bir mutant geçer, ikinci karakter birincinin üstüne
     yazılır ve ortak çalışmada kayıt sessizce kaybolurdu. */
  it('ÖLÇEK: 500 kimlik BENZERSİZ ve hepsi kr_ ön ekli', () => {
    const doc = new Y.Doc();
    const idler = Array.from({ length: 500 }, (_, i) => karakterEkle(doc, { ad: `K${i}` }).id);
    expect(new Set(idler).size).toBe(500);
    for (const id of idler) expect(id, id).toMatch(/^kr_/);
    expect(karakterlerMap(doc).size).toBe(500);
    // Beş yüz kaydın beş yüzü de OKUNABİLİYOR ve adı doğru.
    expect(idler.map((id) => karakterlerMap(doc).get(id)!.ad))
      .toEqual(Array.from({ length: 500 }, (_, i) => `K${i}`));
  });

  it('boş ad fırlatıyor — sessiz reddedilmiyor', () => {
    const doc = new Y.Doc();
    expect(() => karakterEkle(doc, { ad: '' })).toThrow('Karakter adı boş olamaz.');
    expect(karakterlerMap(doc).size).toBe(0);
  });

  it('çakışan ad fırlatıyor', () => {
    const doc = new Y.Doc();
    karakterEkle(doc, { ad: 'Ayşe' });
    expect(() => karakterEkle(doc, { ad: 'AYŞE' })).toThrow(/zaten bir karakter var/);
    expect(karakterlerMap(doc).size).toBe(1);
  });

  it('güncelleme verilmeyen alanı KORUYOR', () => {
    const doc = new Y.Doc();
    const k = karakterEkle(doc, { ad: 'Ayşe', renk: 'mavi' });
    karakterGuncelle(doc, k.id, { aciklama: 'yeni not' });
    expect(karakterlerMap(doc).get(k.id)).toEqual({
      id: k.id, ad: 'Ayşe', aciklama: 'yeni not', renk: 'mavi', notlar: '',
    });
  });

  it('yeniden adlandırma başka kayıtla çakışırsa fırlıyor ve ESKİ ad kalıyor', () => {
    const doc = new Y.Doc();
    karakterEkle(doc, { ad: 'Ayşe' });
    const b = karakterEkle(doc, { ad: 'Mehmet' });
    expect(() => karakterGuncelle(doc, b.id, { ad: 'AYŞE' })).toThrow(/zaten bir karakter var/);
    expect(karakterlerMap(doc).get(b.id)!.ad).toBe('Mehmet');
  });

  it('kendi adıyla güncellemek çakışma SAYILMIYOR', () => {
    const doc = new Y.Doc();
    const k = karakterEkle(doc, { ad: 'Ayşe' });
    expect(karakterGuncelle(doc, k.id, { ad: 'AYŞE', renk: 'kırmızı' })).toBe(true);
    expect(karakterlerMap(doc).get(k.id)!.renk).toBe('kırmızı');
  });

  it('olmayan kayıt güncellenemiyor — false', () => {
    const doc = new Y.Doc();
    expect(karakterGuncelle(doc, 'yok', { ad: 'x' })).toBe(false);
  });

  it('silme yoksa false, varsa true', () => {
    const doc = new Y.Doc();
    expect(karakterSil(doc, 'yok')).toBe(false);
    const k = karakterEkle(doc, { ad: 'Ayşe' });
    expect(karakterSil(doc, k.id)).toBe(true);
    expect(karakterlerMap(doc).size).toBe(0);
  });

  it('yazım LOCAL_ORIGIN taşıyor', () => {
    const doc = new Y.Doc();
    const originler: unknown[] = [];
    doc.on('update', (_u: Uint8Array, origin: unknown) => originler.push(origin));
    karakterEkle(doc, { ad: 'Ayşe' });
    expect(originler).toContain(LOCAL_ORIGIN);
    /* `toContain` "aralarında bir tane var" diyordu: yazımı iki işleme bölen
       (biri origin"siz) bir mutant geçerdi ve origin"siz olan geri alma
       yığınına GİRMEZ — geri alma yarım kalırdı. TEK yazım, TEK origin. */
    expect(originler).toEqual([LOCAL_ORIGIN]);
    // Güncelleme ve silme de aynı sözleşmede.
    const k = karakterEkle(doc, { ad: 'Mehmet' });
    originler.length = 0;
    karakterGuncelle(doc, k.id, { aciklama: 'x' });
    expect(originler).toEqual([LOCAL_ORIGIN]);
    originler.length = 0;
    karakterSil(doc, k.id);
    expect(originler).toEqual([LOCAL_ORIGIN]);
  });

  it('geri alınabiliyor', () => {
    const doc = new Y.Doc();
    const undo = new Y.UndoManager([karakterlerMap(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });
    karakterEkle(doc, { ad: 'Ayşe' });
    undo.undo();
    expect(karakterlerMap(doc).size).toBe(0);
  });
});

describe('karakterler KORUMALI izdüşümde', () => {
  it('ekleme izdüşümü değiştiriyor', () => {
    const doc = new Y.Doc();
    const once = protectedProjection(doc);
    karakterEkle(doc, { ad: 'Ayşe' });
    expect(protectedProjection(doc)).not.toBe(once);
  });

  it('güncelleme izdüşümü değiştiriyor', () => {
    const doc = new Y.Doc();
    const k = karakterEkle(doc, { ad: 'Ayşe' });
    const once = protectedProjection(doc);
    karakterGuncelle(doc, k.id, { aciklama: 'x' });
    expect(protectedProjection(doc)).not.toBe(once);
  });

  it('silme izdüşümü değiştiriyor', () => {
    const doc = new Y.Doc();
    const k = karakterEkle(doc, { ad: 'Ayşe' });
    const once = protectedProjection(doc);
    karakterSil(doc, k.id);
    expect(protectedProjection(doc)).not.toBe(once);
  });
});
