import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { cerceve, gunlukBasligi } from '@storyboard/core/veri/gunluk';
import { durumOzdes, kurtar, kurtarilanSure } from '@storyboard/core/veri/kurtarma';
import { loadProjectIntoDoc, senaryoFragment } from '@storyboard/core/doc/schema';
import * as M from '@storyboard/core/doc/mutations';
import { createPanel, createProject } from '@storyboard/core/model/factory';

function birlestir(parcalar: Uint8Array[]): Uint8Array {
  const toplam = parcalar.reduce((t, p) => t + p.length, 0);
  const cikti = new Uint8Array(toplam);
  let k = 0;
  for (const p of parcalar) { cikti.set(p, k); k += p.length; }
  return cikti;
}

/** Deterministik sözde-rastgele — başarısızlık yeniden üretilebilsin. */
function rastgele(tohum: number) {
  let s = tohum >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Rastgele bir düzenleme dizisi uygular ve her güncellemeyi günlüğe çerçeveler.
 * Gerçek akışın taklidi: `doc.on('update')` → çerçeve → ekle.
 */
function seansUret(tohum: number, adim: number) {
  /* Dinleyici belge DOĞMADAN önce bağlanır. Sonra bağlanırsa günlük belgenin
     kuruluşunu kaçırır ve tek başına durumu geri getiremez — gerçek akışta da
     günlük ya doğumdan başlar ya bir anlık görüntünün üstüne biner. */
  const doc = new Y.Doc();
  const cerceveler: Uint8Array[] = [gunlukBasligi()];
  let zaman = 1_700_000_000_000;
  doc.on('update', (u: Uint8Array) => {
    zaman += 250;
    cerceveler.push(cerceve(u, zaman));
  });
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');

  const rnd = rastgele(tohum);
  const panelId = () => {
    const p = doc.getArray('panels');
    return (p.get(Math.floor(rnd() * p.length)) as Y.Map<unknown>).get('id') as string;
  };

  for (let i = 0; i < adim; i++) {
    const secim = Math.floor(rnd() * 5);
    if (secim === 0) M.addPanel(doc);
    else if (secim === 1) M.updatePanelMeta(doc, panelId(), { sound: `ses-${i}` });
    else if (secim === 2) M.setScript(doc, {
      name: `senaryo-${i}`,
      blocks: Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, k) => ({
        id: `sb_${i}_${k}`, fp: '', type: 'action' as const,
        text: `Satır ${i}-${k} metin.`, scene: '', sceneId: '',
      })),
    });
    else if (secim === 3) M.setAsset(doc, `a_${i}`, `blob:${i}`);
    else doc.getMap('meta').set('title', `başlık ${i}`);
  }

  return { doc, gunluk: birlestir(cerceveler) };
}

describe('§15.5 — günlük oynatma durumu BİREBİR geri getiriyor', () => {
  it('anlık görüntü olmadan, yalnız günlükten', () => {
    const { doc, gunluk } = seansUret(7, 60);
    const sonuc = kurtar(null, gunluk);
    expect(sonuc.durum).toBe('tam');
    expect(sonuc.uygulanamayan).toBe(0);
    expect(sonuc.uygulanan).toBeGreaterThan(50);
    expect(durumOzdes(sonuc.doc, doc)).toBe(true);
  });

  it('anlık görüntü + sonrasındaki günlük', () => {
    const { doc, gunluk } = seansUret(11, 40);
    // Ara bir anlık görüntü: durumun tamamı + üstüne aynı günlük oynatılır.
    // Yjs güncellemeleri idempotenttir; sonuç yine özdeş olmalı.
    const anlik = Y.encodeStateAsUpdate(doc);
    const sonuc = kurtar(anlik, gunluk);
    expect(durumOzdes(sonuc.doc, doc)).toBe(true);
  });

  /* Beş ayrı tohum: tek bir dizide şansa geçen bir kurtarma, farklı düzenleme
     karışımlarında ayakta kalmaz. */
  it('beş farklı rastgele dizide de özdeş', () => {
    for (const tohum of [1, 2, 3, 5, 8]) {
      const { doc, gunluk } = seansUret(tohum, 35);
      expect(durumOzdes(kurtar(null, gunluk).doc, doc), `tohum=${tohum}`).toBe(true);
    }
  });

  it('senaryo METNİ de birebir geliyor — XmlFragment kökü ayrı köktür', () => {
    const { doc, gunluk } = seansUret(3, 30);
    const kurtarilan = kurtar(null, gunluk).doc;
    expect(senaryoFragment(kurtarilan).toString()).toBe(senaryoFragment(doc).toString());
    expect(senaryoFragment(doc).length).toBeGreaterThan(0);
  });
});

describe('durumOzdes iki bağımsız eksene bakar', () => {
  /* Son güncellemesi eksik bir belge, içerik olarak çok yakın olabilir ama
     ÖZDEŞ değildir. Tek eksene (yalnız içerik) bakan bir karşılaştırma burada
     yanılırdı. */
  it('SON güncellemesi eksik belge özdeş sayılmaz', () => {
    const { doc, gunluk } = seansUret(21, 30);
    const tam = kurtar(null, gunluk);
    expect(durumOzdes(tam.doc, doc)).toBe(true);

    const eksik = kurtar(null, gunluk.subarray(0, gunluk.length - 5));
    expect(eksik.durum).toBe('kirpik');
    expect(durumOzdes(eksik.doc, doc)).toBe(false);
  });

  /* Durum vektörü tek başına YETMEZ. Aynı istemci kimliği ve aynı saatle
     ama FARKLI içerikle iki belge kurulabilir — bir eşitleme hatasının ya da
     kimlik çakışmasının bıraktığı iz tam olarak budur. Vektörler birebir
     aynıdır; ayrışmayı yalnız içerik ekseni görür. */
  it('aynı saat, farklı içerik — içerik ekseni olmadan ıraksama görülmez', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.clientID = 42;
    b.clientID = 42;
    a.getMap('meta').set('title', 'aslı');
    b.getMap('meta').set('title', 'kopyası');

    const va = Y.encodeStateVector(a);
    const vb = Y.encodeStateVector(b);
    expect(Array.from(va)).toEqual(Array.from(vb));
    expect(durumOzdes(a, b)).toBe(false);
  });

  /* İçerik ekseni tek başına da YETMEZ. Aynı içeriğe farklı sayıda
     güncellemeyle varılabilir; saatler ayrışır. Bu bir görünüş farkı değil:
     kurtarılan belge yazılmaya ve eşitlenmeye DEVAM edecek, saati kaynaktan
     geride kalırsa sonraki yerel yazımlar zaten kullanılmış kimliklerle
     çakışır. §15.5 "durum birebir" derken tarihi de kastediyor. */
  it('aynı içerik, farklı saat — içerik ekseni bunu göremez', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.clientID = 7;
    b.clientID = 7;
    a.getMap('meta').set('title', 'son');
    b.getMap('meta').set('title', 'ara');
    b.getMap('meta').set('title', 'son');

    expect(JSON.stringify(a.toJSON())).toBe(JSON.stringify(b.toJSON()));
    expect(Array.from(Y.encodeStateVector(a))).not.toEqual(Array.from(Y.encodeStateVector(b)));
    expect(durumOzdes(a, b)).toBe(false);
  });

  it('boş belge dolu belgeyle özdeş değildir', () => {
    const { doc } = seansUret(23, 10);
    expect(durumOzdes(new Y.Doc(), doc)).toBe(false);
    expect(durumOzdes(doc, new Y.Doc())).toBe(false);
  });
});

describe('kurtarma bozuk ve kırpık günlükte de sağlam ön eki verir', () => {
  it('kırpık kuyruk: uygulanan sayısı bildirilir, durum kirpik', () => {
    const { gunluk } = seansUret(13, 25);
    const kirpik = gunluk.subarray(0, gunluk.length - 5);
    const sonuc = kurtar(null, kirpik);
    expect(sonuc.durum).toBe('kirpik');
    expect(sonuc.uygulanan).toBeGreaterThan(0);
  });

  /* BAŞKA bir projenin güncellemesi sağlamayı tutturur ama uygulanamaz.
     Sessizce atlanırsa kullanıcı yarım bir belgeyi tam sanır. */
  it('uygulanamayan güncelleme SAYILIR, atlanmaz', () => {
    const { gunluk } = seansUret(17, 10);
    const yabanciDoc = new Y.Doc();
    yabanciDoc.getMap('x').set('k', 'v');
    // Yjs güncellemesi olmayan ama sağlaması tutan bir çerçeve.
    const cop = cerceve(new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]), 1);
    const sonuc = kurtar(null, birlestir([gunluk, cop]));
    expect(sonuc.uygulanan).toBeGreaterThan(0);
    expect(sonuc.uygulanamayan).toBe(1);
  });

  it('yabancı günlük hiç oynatılmaz', () => {
    const { gunluk } = seansUret(19, 10);
    const yabanci = gunluk.slice();
    yabanci[0] ^= 0xff;
    const sonuc = kurtar(null, yabanci);
    expect(sonuc.durum).toBe('yabanci');
    expect(sonuc.uygulanan).toBe(0);
  });
});

describe('kurtarılan süre', () => {
  it('ilk ve son yazım arasındaki süredir', () => {
    const kaynak = new Y.Doc();
    loadProjectIntoDoc(kaynak, createProject({ panels: [createPanel()] }), 'load');
    const gunluk = birlestir([gunlukBasligi(), cerceve(Y.encodeStateAsUpdate(kaynak), 1000)]);
    const sonuc = kurtar(null, gunluk);
    expect(sonuc.ilkZaman).toBe(1000);
    expect(kurtarilanSure(sonuc)).toBe(0);
    // Süre sıfır ama İŞ var — çağıran "0 dakika" yazmamalı.
    expect(sonuc.uygulanan).toBe(1);
  });

  it('boş günlükte süre sıfır ve iş yok', () => {
    const sonuc = kurtar(null, gunlukBasligi());
    expect(sonuc.uygulanan).toBe(0);
    expect(sonuc.ilkZaman).toBeNull();
    expect(kurtarilanSure(sonuc)).toBe(0);
  });
});
