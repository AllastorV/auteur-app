import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { ilkSaglamKayit, oturumuKurtar, type AdayKayit } from '@storyboard/core/veri/anlik';
import { durumOzdes } from '@storyboard/core/veri/kurtarma';
import { cerceve, gunlukBasligi } from '@storyboard/core/veri/gunluk';
import { loadProjectIntoDoc, metaMap } from '@storyboard/core/doc/schema';
import * as M from '@storyboard/core/doc/mutations';
import { createPanel, createProject } from '@storyboard/core/model/factory';

function birlestir(parcalar: Uint8Array[]): Uint8Array {
  const toplam = parcalar.reduce((t, p) => t + p.length, 0);
  const cikti = new Uint8Array(toplam);
  let k = 0;
  for (const p of parcalar) { cikti.set(p, k); k += p.length; }
  return cikti;
}

/** Gerçek bir projeden Yjs çıpa baytları üretir. */
function cipa(baslik = 'proje'): { bayt: Uint8Array; doc: Y.Doc } {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  doc.getMap('meta').set('title', baslik);
  return { bayt: Y.encodeStateAsUpdate(doc), doc };
}

const aday = (id: string, bayt: Uint8Array): AdayKayit => ({ id, oku: () => bayt });
const patlayanAday = (id: string): AdayKayit => ({
  id,
  oku: () => { throw new Error('disk hatası'); },
});

describe('§15.5 — kuşak halkası bozuk kayıtta geri düşüyor', () => {
  it('en yeni kayıt ÇÖZÜMLENEMİYORSA bir öncekine düşer', () => {
    const saglam = cipa('sağlam');
    const bozuk = new Uint8Array([1, 2, 3, 250, 250, 250, 9]);
    const sonuc = ilkSaglamKayit([aday('yedek-1', bozuk), aday('yedek-2', saglam.bayt)]);
    expect(sonuc.kullanilan).toBe('yedek-2');
    expect(sonuc.elenen).toEqual([{ id: 'yedek-1', sebep: 'cozumlenemedi' }]);
    expect(metaMap(sonuc.doc!).get('title')).toBe('sağlam');
  });

  it('okunamayan dosya da elenip bir öncekine düşülür', () => {
    const saglam = cipa();
    const sonuc = ilkSaglamKayit([patlayanAday('yedek-1'), aday('yedek-2', saglam.bayt)]);
    expect(sonuc.kullanilan).toBe('yedek-2');
    expect(sonuc.elenen).toEqual([{ id: 'yedek-1', sebep: 'okunamadi' }]);
  });

  /* En sinsi hâl: sıfır uzunluklu ya da yarım yazılmış bir dosya çoğu zaman
     SORUNSUZ çözümlenir ve BOŞ bir belge verir. "Çözümlenebiliyor mu" diye
     sormak yetseydi halka hiç geri düşmez, kullanıcı boş bir projeyle
     karşılaşır ve sağlam yedeği hiç denenmemiş olurdu. */
  it('BOŞ ama çözümlenebilen kayıt geçerli sayılmaz', () => {
    const saglam = cipa('gerçek');
    const bosDoc = new Y.Doc();
    const bos = Y.encodeStateAsUpdate(bosDoc);
    expect(() => Y.applyUpdate(new Y.Doc(), bos)).not.toThrow();

    const sonuc = ilkSaglamKayit([aday('yedek-1', bos), aday('yedek-2', saglam.bayt)]);
    expect(sonuc.kullanilan).toBe('yedek-2');
    expect(sonuc.elenen).toEqual([{ id: 'yedek-1', sebep: 'projesiz' }]);
    expect(metaMap(sonuc.doc!).get('title')).toBe('gerçek');
  });

  it('sıfır uzunluklu dosya da elenir', () => {
    const saglam = cipa();
    const sonuc = ilkSaglamKayit([aday('yedek-1', new Uint8Array(0)), aday('yedek-2', saglam.bayt)]);
    expect(sonuc.kullanilan).toBe('yedek-2');
  });

  it('hepsi bozuksa null döner ve elenenlerin hepsi bildirilir', () => {
    const sonuc = ilkSaglamKayit([
      aday('a', new Uint8Array(0)),
      patlayanAday('b'),
      aday('c', new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, 9])),
    ]);
    expect(sonuc.doc).toBeNull();
    expect(sonuc.kullanilan).toBeNull();
    expect(sonuc.elenen.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('ilk kayıt sağlamsa sonrakiler HİÇ okunmaz', () => {
    const saglam = cipa();
    let okundu = false;
    const sonraki: AdayKayit = { id: 'yedek-2', oku: () => { okundu = true; return saglam.bayt; } };
    const sonuc = ilkSaglamKayit([aday('yedek-1', saglam.bayt), sonraki]);
    expect(sonuc.kullanilan).toBe('yedek-1');
    expect(okundu).toBe(false);
  });
});

describe('oturum kurtarma — çıpa + günlük', () => {
  /** Çıpa alındıktan SONRA yapılan düzenlemeler günlüğe düşer. */
  function seans() {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
    const cipaBayt = Y.encodeStateAsUpdate(doc);

    const parcalar: Uint8Array[] = [gunlukBasligi()];
    let zaman = 1_700_000_000_000;
    doc.on('update', (u: Uint8Array) => { zaman += 200; parcalar.push(cerceve(u, zaman)); });

    M.setScript(doc, {
      name: 'sahne',
      blocks: [{ id: 'sb_1', fp: '', type: 'action', text: 'Ayşe girer.', scene: '', sceneId: '' }],
    });
    doc.getMap('meta').set('title', 'çökmeden önce');
    M.addPanel(doc);

    return { doc, cipaBayt, gunluk: birlestir(parcalar) };
  }

  it('çıpanın üstüne günlük oynanınca durum birebir geri gelir', () => {
    const { doc, cipaBayt, gunluk } = seans();
    const sonuc = oturumuKurtar([aday('yedek-1', cipaBayt)], gunluk);
    expect(sonuc.cipa).toBe('yedek-1');
    expect(sonuc.uygulanan).toBeGreaterThan(0);
    expect(durumOzdes(sonuc.doc, doc)).toBe(true);
  });

  it('çıpa bozuksa bir öncekine düşülür ve günlük yine oynatılır', () => {
    const { doc, cipaBayt, gunluk } = seans();
    const sonuc = oturumuKurtar(
      [aday('yedek-1', new Uint8Array([7, 7, 7, 7, 7, 7, 7])), aday('yedek-2', cipaBayt)],
      gunluk,
    );
    expect(sonuc.cipa).toBe('yedek-2');
    expect(sonuc.elenen).toHaveLength(1);
    expect(durumOzdes(sonuc.doc, doc)).toBe(true);
  });

  /* Hiç anlık görüntü alınamadan çökülmüş olabilir — EN ÇOK işin bulunduğu
     durum tam da budur. "Çıpa yok, o hâlde iş yok" demek her şeyi atmaktır. */
  it('hiç sağlam çıpa yoksa günlük TEK BAŞINA oynatılır', () => {
    const doc = new Y.Doc();
    const parcalar: Uint8Array[] = [gunlukBasligi()];
    let zaman = 1_700_000_000_000;
    doc.on('update', (u: Uint8Array) => { zaman += 200; parcalar.push(cerceve(u, zaman)); });
    loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
    doc.getMap('meta').set('title', 'çıpasız');

    const sonuc = oturumuKurtar([aday('yedek-1', new Uint8Array(0))], birlestir(parcalar));
    expect(sonuc.cipa).toBeNull();
    expect(sonuc.uygulanan).toBeGreaterThan(0);
    expect(durumOzdes(sonuc.doc, doc)).toBe(true);
  });

  /* Yazma sırası sözleşmesi: önce çıpa, SONRA günlük kesilir. Bu sırayla
     çökme, çıpada ZATEN olan güncellemelerin günlükte de kalmasına yol açar.
     Yjs güncellemeleri idempotenttir — oynatma aynı sonucu vermeli. */
  it('çıpayla ÖRTÜŞEN günlük iki kez uygulanınca durum bozulmaz', () => {
    const { doc, gunluk } = seans();
    const tamCipa = Y.encodeStateAsUpdate(doc);
    const sonuc = oturumuKurtar([aday('yedek-1', tamCipa)], gunluk);
    expect(sonuc.uygulanamayan).toBe(0);
    expect(durumOzdes(sonuc.doc, doc)).toBe(true);
  });
});
