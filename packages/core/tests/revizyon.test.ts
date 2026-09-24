import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  REVIZYON_RENKLERI,
  RENK_ADLARI,
  VARSAYILAN_RENK,
  isaretliSayfalar,
  isaretliSayfaNumaralari,
  renkCoz,
  revizyonAdi,
  revizyonCoz,
  siradakiRenk,
  type Revizyon,
} from '@storyboard/core/model/revizyon';
import {
  etkinRevizyon,
  revizyonRenginiDegistir,
  LOCAL_ORIGIN,
  revizyonIsaretCevir,
  revizyonIsaretKaldir,
  revizyonIsaretle,
  revizyonIsaretleriniOku,
  revizyonYayinla,
  revizyonlariOku,
} from '@storyboard/core/doc/mutations';
import { revizyonlarArray, revizyonIsaretleriMap } from '@storyboard/core/doc/schema';

/* ------------------------------ Model ------------------------------- */

describe('güven sınırı — belge elle kurcalanmış olabilir', () => {
  it('paletin dışındaki renk varsayılana düşüyor, fırlatmıyor', () => {
    expect(renkCoz('turkuaz')).toBe(VARSAYILAN_RENK);
    expect(renkCoz(42)).toBe(VARSAYILAN_RENK);
    expect(renkCoz(undefined)).toBe(VARSAYILAN_RENK);
  });

  it('kimliksiz kayıt düşüyor — işaret bağlanamayacağı için hiçbir şey göstermez', () => {
    expect(revizyonCoz({ ad: 'Mavi', renk: 'mavi' })).toBeNull();
    expect(revizyonCoz({ id: '', renk: 'mavi' })).toBeNull();
    expect(revizyonCoz(null)).toBeNull();
    expect(revizyonCoz('rev1')).toBeNull();
  });

  it('bozuk ALAN kaydı DÜŞÜRMÜYOR — işaretler sahipsiz kalmasın', () => {
    const r = revizyonCoz({ id: 'rev1', ad: 7, renk: 'mor', tarih: 'dün' });
    expect(r).toEqual({ id: 'rev1', ad: '', renk: VARSAYILAN_RENK, tarih: 0 });
  });
});

describe('renk sırası', () => {
  it('sektör sırasını izliyor', () => {
    expect(siradakiRenk(0)).toBe('beyaz');
    expect(siradakiRenk(1)).toBe('mavi');
    expect(siradakiRenk(2)).toBe('pembe');
  });

  it('liste bitince başa dönüyor, fırlatmıyor', () => {
    const n = REVIZYON_RENKLERI.length;
    expect(siradakiRenk(n)).toBe(REVIZYON_RENKLERI[0]);
    expect(siradakiRenk(n + 1)).toBe(REVIZYON_RENKLERI[1]);
  });

  it('bozuk sayı ilk renge düşüyor', () => {
    expect(siradakiRenk(-3)).toBe(REVIZYON_RENKLERI[0]);
    expect(siradakiRenk(NaN)).toBe(REVIZYON_RENKLERI[0]);
  });

  it('her rengin bir adı var — palet ile sözlük ayrışamaz', () => {
    for (const renk of REVIZYON_RENKLERI) {
      expect(RENK_ADLARI[renk]).toBeTruthy();
    }
  });
});

describe('görünen ad', () => {
  const r = (ad: string): Revizyon => ({ id: 'r', ad, renk: 'mavi', tarih: 0 });

  it('yazarın verdiği adı kullanıyor', () => {
    expect(revizyonAdi(r('Çekim öncesi'))).toBe('Çekim öncesi');
  });

  it('ad boşsa rengin adına düşüyor', () => {
    expect(revizyonAdi(r(''))).toBe('Mavi');
    expect(revizyonAdi(r('   '))).toBe('Mavi');
  });
});

describe('işaretli sayfalar — sayfa KİMLİĞİ iddia edilmiyor', () => {
  const isaretler = new Map([
    ['b1', 'rev1'],
    ['b2', 'rev1'],
    ['b3', 'rev2'],
    ['yok', 'rev1'],
  ]);
  const sayfa = new Map([
    ['b1', 3],
    ['b2', 3],
    ['b3', 7],
  ]);

  it('aynı sayfadaki iki işaret tek sayfa veriyor', () => {
    expect(isaretliSayfalar(isaretler, sayfa, 'rev1')).toEqual([3]);
  });

  it('revizyon süzgeci uygulanıyor', () => {
    expect(isaretliSayfalar(isaretler, sayfa, 'rev2')).toEqual([7]);
  });

  it('süzgeçsiz çağrı bütün işaretleri topluyor ve SIRALI veriyor', () => {
    expect(isaretliSayfalar(isaretler, sayfa)).toEqual([3, 7]);
  });

  it('sayfalayıcının tanımadığı blok atlanıyor, çökmüyor', () => {
    expect(isaretliSayfalar(isaretler, sayfa, 'rev1')).not.toContain(undefined);
  });

  it('metin uzayıp sayfalar KAYINCA sonuç yeni sayfalayıcıyı izliyor', () => {
    const kaymis = new Map([
      ['b1', 4],
      ['b2', 4],
      ['b3', 9],
    ]);
    expect(isaretliSayfalar(isaretler, kaymis, 'rev1')).toEqual([4]);
  });
});

it('sayfa sınırına taşan blok iki sayfayı boyar; eski revizyon ve boş seçim boyamaz', () => {
  const sayfalar = [
    { no: 1, satirlar: [{ blockId: 'uzun' }] },
    { no: 2, satirlar: [{ blockId: 'uzun' }, { blockId: 'eski' }] },
    { no: 3, satirlar: [{ blockId: 'baska' }] },
  ];
  expect(isaretliSayfaNumaralari(sayfalar, new Map([
    ['uzun', 'etkin'], ['eski', 'onceki'],
  ]), 'etkin')).toEqual(new Set([1, 2]));
  expect(isaretliSayfaNumaralari(sayfalar, new Map([['eski', 'onceki']]), 'etkin'))
    .toEqual(new Set());
  expect(isaretliSayfaNumaralari(sayfalar, new Map(), 'etkin')).toEqual(new Set());
});

/* ---------------------------- Belge yolu ----------------------------- */

describe('revizyon yayınlama', () => {
  it('ilk yayın Beyaz, ikincisi Mavi — sıra belgeden türüyor', () => {
    const doc = new Y.Doc();
    expect(revizyonYayinla(doc).renk).toBe('beyaz');
    expect(revizyonYayinla(doc).renk).toBe('mavi');
    expect(revizyonlariOku(doc)).toHaveLength(2);
  });

  it('etkin revizyon listedeki SON kayıt', () => {
    const doc = new Y.Doc();
    revizyonYayinla(doc, 'İlk');
    const ikinci = revizyonYayinla(doc, 'İkinci');
    expect(etkinRevizyon(doc)?.id).toBe(ikinci.id);
  });

  it('revizyon yokken etkin revizyon null', () => {
    expect(etkinRevizyon(new Y.Doc())).toBeNull();
  });

  it('bozuk kayıt ATILIYOR, liste yaşıyor', () => {
    const doc = new Y.Doc();
    revizyonYayinla(doc, 'Sağlam');
    revizyonlarArray(doc).push([{ ad: 'kimliksiz' } as never]);
    const liste = revizyonlariOku(doc);
    expect(liste).toHaveLength(1);
    expect(liste[0].ad).toBe('Sağlam');
  });
});

describe('işaretleme', () => {
  it('etkin revizyon YOKKEN işaretlemiyor — sessizce revizyon yaratmıyor', () => {
    const doc = new Y.Doc();
    expect(revizyonIsaretle(doc, ['b1'])).toBe(false);
    expect(revizyonIsaretleriMap(doc).size).toBe(0);
    expect(revizyonlarArray(doc).length).toBe(0);
  });

  it('işaret etkin revizyonun kimliğini taşıyor', () => {
    const doc = new Y.Doc();
    const rev = revizyonYayinla(doc, 'Mavi');
    expect(revizyonIsaretle(doc, ['b1', 'b2'])).toBe(true);
    expect(revizyonIsaretleriniOku(doc)).toEqual(new Map([['b1', rev.id], ['b2', rev.id]]));
  });

  it('boş kimlik yazılmıyor', () => {
    const doc = new Y.Doc();
    revizyonYayinla(doc);
    expect(revizyonIsaretle(doc, ['', ''])).toBe(false);
    expect(revizyonIsaretleriMap(doc).size).toBe(0);
  });

  it('kaldırma işaretsizde false', () => {
    const doc = new Y.Doc();
    revizyonYayinla(doc);
    expect(revizyonIsaretKaldir(doc, ['b1'])).toBe(false);
    revizyonIsaretle(doc, ['b1']);
    expect(revizyonIsaretKaldir(doc, ['b1'])).toBe(true);
    expect(revizyonIsaretleriMap(doc).has('b1')).toBe(false);
  });

  it('eski revizyonun işareti yeni revizyonda YAŞIYOR — geçmiş kaybolmuyor', () => {
    const doc = new Y.Doc();
    const ilk = revizyonYayinla(doc, 'İlk');
    revizyonIsaretle(doc, ['b1']);
    const ikinci = revizyonYayinla(doc, 'İkinci');
    revizyonIsaretle(doc, ['b2']);
    expect(revizyonIsaretleriniOku(doc)).toEqual(
      new Map([['b1', ilk.id], ['b2', ikinci.id]]),
    );
  });
});

describe('işaret çevirme — karışık seçimde öngörülebilir', () => {
  it('hiçbiri işaretli değilse HEPSİNİ işaretliyor', () => {
    const doc = new Y.Doc();
    revizyonYayinla(doc);
    expect(revizyonIsaretCevir(doc, ['b1', 'b2'])).toBe(true);
    expect(revizyonIsaretleriMap(doc).size).toBe(2);
  });

  it('hepsi işaretliyse HEPSİNİ kaldırıyor', () => {
    const doc = new Y.Doc();
    revizyonYayinla(doc);
    revizyonIsaretle(doc, ['b1', 'b2']);
    expect(revizyonIsaretCevir(doc, ['b1', 'b2'])).toBe(false);
    expect(revizyonIsaretleriMap(doc).size).toBe(0);
  });

  it('KARIŞIK seçimde hepsini işaretliyor — blok blok çevirmiyor', () => {
    const doc = new Y.Doc();
    revizyonYayinla(doc);
    revizyonIsaretle(doc, ['b1']);
    expect(revizyonIsaretCevir(doc, ['b1', 'b2'])).toBe(true);
    expect(revizyonIsaretleriMap(doc).size).toBe(2);
  });

  it('başka revizyonda işaretli blok, etkin revizyonda işaretsiz sayılıyor', () => {
    const doc = new Y.Doc();
    revizyonYayinla(doc, 'İlk');
    revizyonIsaretle(doc, ['b1']);
    const ikinci = revizyonYayinla(doc, 'İkinci');
    expect(revizyonIsaretCevir(doc, ['b1'])).toBe(true);
    expect(revizyonIsaretleriniOku(doc).get('b1')).toBe(ikinci.id);
  });

  it('revizyon yokken çevirme false, belge değişmiyor', () => {
    const doc = new Y.Doc();
    expect(revizyonIsaretCevir(doc, ['b1'])).toBe(false);
    expect(revizyonIsaretleriMap(doc).size).toBe(0);
  });
});


describe('elle revizyon rengi', () => {
  it('referanstaki on rengi aynı sırada sunuyor', () => {
    expect(REVIZYON_RENKLERI).toEqual([
      'beyaz', 'mavi', 'pembe', 'sari', 'yesil', 'altin', 'devetuyu', 'somon', 'visne', 'tan',
    ]);
  });

  it('kimlik, tarih, ad, eski revizyon ve işaretler korunur; değişiklik geri alınır ve kaydedilir', () => {
    const doc = new Y.Doc();
    const eski = revizyonYayinla(doc, 'Eski');
    const etkin = revizyonYayinla(doc, 'Çekim');
    revizyonIsaretle(doc, ['b1']);
    const undo = new Y.UndoManager(revizyonlarArray(doc), { trackedOrigins: new Set([LOCAL_ORIGIN]) });
    expect(revizyonRenginiDegistir(doc, 'tan')).toBe(true);
    expect(revizyonlariOku(doc)).toEqual([eski, { ...etkin, renk: 'tan' }]);
    expect(revizyonIsaretleriniOku(doc).get('b1')).toBe(etkin.id);
    const kopya = new Y.Doc();
    Y.applyUpdate(kopya, Y.encodeStateAsUpdate(doc));
    expect(etkinRevizyon(kopya)?.renk).toBe('tan');
    undo.undo();
    expect(etkinRevizyon(doc)).toEqual(etkin);
    undo.redo();
    expect(etkinRevizyon(doc)?.renk).toBe('tan');
  });

  it('revizyon yokken, aynı renkte ve geçersiz girdide belgeye yazmaz', () => {
    const doc = new Y.Doc();
    expect(revizyonRenginiDegistir(doc, 'tan')).toBe(false);
    revizyonYayinla(doc);
    const once = Y.encodeStateAsUpdate(doc);
    expect(revizyonRenginiDegistir(doc, 'beyaz')).toBe(false);
    expect(revizyonRenginiDegistir(doc, 'turkuaz' as never)).toBe(false);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(once);
  });
});


it('eşzamanlı renk seçimleri iki revizyon yaratmaz; iki istemci aynı renkte birleşir', () => {
  const a = new Y.Doc();
  const ilk = revizyonYayinla(a, 'Çekim');
  revizyonIsaretle(a, ['b1']);
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  revizyonRenginiDegistir(a, 'tan');
  revizyonRenginiDegistir(b, 'somon');
  const ua = Y.encodeStateAsUpdate(a), ub = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, ub); Y.applyUpdate(b, ua);
  expect(revizyonlariOku(a)).toHaveLength(1);
  expect(revizyonlariOku(a)).toEqual(revizyonlariOku(b));
  expect(etkinRevizyon(a)?.id).toBe(ilk.id);
  expect(revizyonIsaretleriniOku(a).get('b1')).toBe(ilk.id);
  expect(revizyonYayinla(a).renk).toBe('mavi');
});
