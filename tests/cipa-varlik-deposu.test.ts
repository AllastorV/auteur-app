import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { gunlukDeposu } from '../apps/desktop/electron/gunluk-deposu';
import { VARLIK_DIZINI } from '../apps/desktop/electron/varlik-deposu';
import { loadProjectIntoDoc, assetsMap, readScript } from '@storyboard/core/doc/schema';
import { setAssets, setScript } from '@storyboard/core/doc/mutations';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { createHash } from 'node:crypto';
import { ilkSaglamKayit } from '@storyboard/core/veri/anlik';

/**
 * Çıpanın varlık ayrıştırması — §15.2.2'nin disk maliyeti.
 *
 * Ölçülen sorun (`agir-cipa-boyut.test.ts`): varlıklar belgenin İÇİNDE
 * duruyor, çıpa belgenin TAM anlık görüntüsü, yani halkadaki HER nokta bütün
 * görsellerin bir kopyasını taşıyordu — 50 sayfa + 20 varlık için 30 günlük
 * halka 354,6 MB. Bu dosya çözümün DAVRANIŞINI sınıyor; kazancın SAYISI
 * `agir-cipa-boyut.test.ts`te ölçülüyor.
 *
 * Belgenin veri modeli DEĞİŞMEDİ: `assetsMap` yerinde, varlıklar CRDT içinde
 * akmaya devam ediyor. Değişen tek şey diske yazılan çıpa.
 */

const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-varlik-'));
afterAll(() => fs.rmSync(kok, { recursive: true, force: true }));

let sayac = 0;
const depo = () => gunlukDeposu(kok, `proje-${sayac++}`);

/** Gerçekçi boyutlu, deterministik `dataUrl` — `Math.random` YOK. */
function varlikDataUrl(kb: number, tohum: number): string {
  const bayt = Uint8Array.from({ length: kb * 1024 }, (_, i) => (i * 7 + tohum) % 256);
  return `data:image/png;base64,${Buffer.from(bayt).toString('base64')}`;
}

function belgeOlustur(varliklar: Record<string, string>, metin = 'ilk satır'): Y.Doc {
  const doc = new Y.Doc();
  doc.clientID = 42;
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  setScript(doc, { name: 'test', blocks: [{ id: 'b1', fp: '', type: 'action', text: metin, scene: '', sceneId: '' }] });
  if (Object.keys(varliklar).length) setAssets(doc, varliklar);
  return doc;
}

/** Çıpa baytlarını belgeye çevirir — okuma yolunun yaptığının aynısı. */
function cipadanBelge(cipa: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, cipa, 'test');
  return doc;
}

/**
 * `taban` her çağrıda AYRI verilir: depo bütün testlerde ORTAK ve içerik
 * adresli, yani aynı tohum başka bir testin yazdığı dosyaya denk düşerdi.
 * "Bu testin varlığını sil" gibi bir adım o zaman yanlış dosyayı silerdi.
 */
const varlikSeti = (n: number, taban: number): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`varlik_${i}`, varlikDataUrl(50, taban + i)]),
  );

const ozet = (icerik: string) => createHash('sha256').update(icerik, 'utf8').digest('hex');

describe('çıpa ↔ varlık deposu — yaz/oku turu', () => {
  it('10 varlıklı belge çıpalanıp geri açıldığında VARLIKLAR DAHİL birebir aynı', () => {
    const varliklar = varlikSeti(10, 100);
    const doc = belgeOlustur(varliklar);
    const d = depo();
    d.cipaYazVeKes(Y.encodeStateAsUpdate(doc), 1_000);

    const geri = cipadanBelge(d.cipaOku(d.halka()[0].id));
    /* `durumOzdes` DEĞİL: geri dönüş için yanlış ölçüt olduğu daha önce
       ölçüldü (öğe kimlikleri değişir, içerik değişmez). Karşılaştırma
       İÇERİK üzerinden. */
    expect(assetsMap(geri).toJSON()).toEqual(varliklar);
    expect(readScript(geri).blocks.map((b) => b.text)).toEqual(
      readScript(doc).blocks.map((b) => b.text),
    );
    expect(d.eksikVarliklar(d.halka()[0].id)).toEqual([]);
  });

  it('çıpa dosyası varlıkları TAŞIMIYOR — baytlar depoda duruyor', () => {
    const varliklar = varlikSeti(10, 100);
    const doc = belgeOlustur(varliklar);
    const tamCipa = Y.encodeStateAsUpdate(doc);
    const d = depo();
    d.cipaYazVeKes(tamCipa, 1_000);

    const dosyaBoyutu = fs.statSync(path.join(d.dizin, d.halka()[0].id)).size;
    /* MUTANT KAPANI: varlık süzgeci kaldırılırsa dosya tam çıpa kadar olur. */
    expect(dosyaBoyutu).toBeLessThan(tamCipa.length / 10);
    expect(d.varliklar.toplamBoyut()).toBeGreaterThan(tamCipa.length / 2);
  });

  it('varlıksız çıpa DOKUNULMADAN yazılır — bayt bayt aynı', () => {
    const cipa = Y.encodeStateAsUpdate(belgeOlustur({}));
    const d = depo();
    d.cipaYazVeKes(cipa, 1_000);
    expect(new Uint8Array(fs.readFileSync(path.join(d.dizin, d.halka()[0].id)))).toEqual(cipa);
    expect(d.cipaOku(d.halka()[0].id)).toEqual(cipa);
  });

  it('çıpa + günlük oynatma zinciri bozulmuyor — sonraki iş KAYBOLMUYOR', () => {
    const doc = belgeOlustur(varlikSeti(3, 350));
    const d = depo();
    const sv = Y.encodeStateVector(doc);
    d.cipaYazVeKes(Y.encodeStateAsUpdate(doc), 1_000);
    // Çıpadan SONRAKİ iş — günlüğe düşen artım.
    setScript(doc, { name: 'test', blocks: [{ id: 'b1', fp: '', type: 'action', text: 'DEĞİŞTİ', scene: '', sceneId: '' }] });
    const artim = Y.encodeStateAsUpdate(doc, sv);

    const geri = cipadanBelge(d.cipaOku(d.halka()[0].id));
    Y.applyUpdate(geri, artim, 'gunluk');
    /* Kökleri yeni bir belgeye KOPYALAYAN alternatif burada SESSİZCE
       "ilk satır"da kalıyordu: kopyalama öğe kimliklerini yeniden yazıyor,
       günlük çerçeveleri bağlanacak öğeyi bulamıyor. */
    expect(readScript(geri).blocks[0].text).toBe('DEĞİŞTİ');
    expect(Object.keys(assetsMap(geri).toJSON())).toHaveLength(3);
  });
});

describe('içerik adresli depo', () => {
  it('aynı varlık iki kez eklenince depoda TEK dosya', () => {
    const ayniUrl = varlikDataUrl(50, 909);
    const d1 = depo();
    d1.cipaYazVeKes(Y.encodeStateAsUpdate(belgeOlustur({ a: ayniUrl })), 1_000);
    const tekDosyaSonrasi = fs.readdirSync(path.join(kok, VARLIK_DIZINI)).length;

    // Aynı görsel BAŞKA bir projede, BAŞKA bir kimlikle.
    const d2 = depo();
    d2.cipaYazVeKes(Y.encodeStateAsUpdate(belgeOlustur({ b: ayniUrl, c: ayniUrl })), 2_000);

    expect(fs.readdirSync(path.join(kok, VARLIK_DIZINI))).toHaveLength(tekDosyaSonrasi);
    // İki farklı kimlik AYNI baytlara işaret ediyor ama ikisi de geri geliyor.
    expect(assetsMap(cipadanBelge(d2.cipaOku(d2.halka()[0].id))).toJSON()).toEqual({
      b: ayniUrl,
      c: ayniUrl,
    });
  });

  it('66 çıpa aynı varlıkları BİR KEZ yazıyor — halka varlıklarla ölçeklenmiyor', () => {
    const varliklar = varlikSeti(5, 500);
    const cipa = Y.encodeStateAsUpdate(belgeOlustur(varliklar, 'halka'));
    const d = depo();
    const oncekiDepo = d.varliklar.toplamBoyut();
    for (let i = 1; i <= 66; i++) d.cipaYazVeKes(cipa, 100_000 + i, false);

    const halkaDisk = d
      .halka()
      .reduce((t, k) => t + fs.statSync(path.join(d.dizin, k.id)).size, 0);
    const varlikArtisi = d.varliklar.toplamBoyut() - oncekiDepo;
    /* ORAN kapanı, sabit bayt değil: 66 nokta, varlıkların 66 kopyasını
       DEĞİL en fazla ~1 kopyasını taşımalı. */
    expect(halkaDisk).toBeLessThan(cipa.length * 2);
    expect(varlikArtisi).toBeLessThan(cipa.length);
    expect(d.halka()).toHaveLength(66);
  });
});

describe('eksik varlık ve geriye uyum', () => {
  it('depoda varlık YOKSA belge yine AÇILIYOR, eksiklik BİLDİRİLİYOR', () => {
    const varliklar = varlikSeti(3, 300);
    const d = depo();
    d.cipaYazVeKes(Y.encodeStateAsUpdate(belgeOlustur(varliklar, 'metin duruyor')), 1_000);
    const noktaId = d.halka()[0].id;

    // BU çıpanın varlıklarından birini yok et — elle silinmiş / bozulmuş disk.
    fs.rmSync(path.join(d.varliklar.dizin, ozet(varliklar.varlik_0)));

    const geri = cipadanBelge(d.cipaOku(noktaId));
    // Belge AÇILDI: metin ve kalan varlıklar yerinde.
    expect(readScript(geri).blocks[0].text).toBe('metin duruyor');
    expect(Object.keys(assetsMap(geri).toJSON())).toHaveLength(2);
    // Eksiklik SESSİZ değil.
    expect(d.eksikVarliklar(noktaId)).toHaveLength(1);
    // Kuşak halkası bu çıpayı SAĞLAM sayıyor — eksik görsel eleme sebebi değil.
    expect(ilkSaglamKayit([{ id: noktaId, oku: () => d.cipaOku(noktaId) }]).doc).not.toBeNull();
  });

  it('ESKİ biçim çıpa (varlıkları GÖMÜLÜ) hâlâ açılıyor', () => {
    const varliklar = varlikSeti(4, 700);
    const eskiCipa = Y.encodeStateAsUpdate(belgeOlustur(varliklar, 'eski sürümden'));
    const d = depo();
    /* Eski sürümün diske BIRAKTIĞI dosya: ham `encodeStateAsUpdate`, zarf
       yok, varlık deposu yok. `cipaYazVeKes`i BİLEREK atlıyoruz. */
    fs.mkdirSync(d.dizin, { recursive: true });
    fs.writeFileSync(path.join(d.dizin, 'cipa-1000.yjs'), eskiCipa);

    const geri = cipadanBelge(d.cipaOku('cipa-1000.yjs'));
    expect(assetsMap(geri).toJSON()).toEqual(varliklar);
    expect(readScript(geri).blocks[0].text).toBe('eski sürümden');
    expect(d.eksikVarliklar('cipa-1000.yjs')).toEqual([]);
    // Eski ve yeni biçim AYNI halkada yan yana durabiliyor.
    d.cipaYazVeKes(Y.encodeStateAsUpdate(belgeOlustur(varliklar, 'yeni')), 2_000);
    expect(d.halka()).toHaveLength(2);
    for (const k of d.halka()) {
      expect(readScript(cipadanBelge(d.cipaOku(k.id))).blocks[0].text).toMatch(/eski sürümden|yeni/);
    }
  });

  it('çıpa adı bir YOL SINIRI — eksik varlık sorgusunda da', () => {
    const d = depo();
    expect(() => d.eksikVarliklar('../../gizli')).toThrow(/Gecersiz/);
    expect(() => d.eksikVarliklar('alt/dizin')).toThrow(/Gecersiz/);
  });
});

/* ------------------------------------------------------------------ */

import { kurtar } from '@storyboard/core/veri/kurtarma';
import { cerceve, gunlukBasligi } from '@storyboard/core/veri/gunluk';
import { setAsset } from '@storyboard/core/doc/mutations';

/**
 * VARLIK GERİ KOYMA GÜNLÜKTEN SONRA — 2026-08-27 taramasının 1. bulgusu.
 *
 * Eski yol geri koymayı çıpa okunurken, rastgele clientID'li YENİ öğelerle
 * yapıyordu. Çıpadan sonraki günlük düzenlemesi o öğelerle CRDT açısından
 * EŞZAMANLI düşer ve YMap'te büyük clientID kazanır (ölçüldü): 40 denemede
 * 18 kez kullanıcının DEĞİŞTİRDİĞİ görsel eski hâline döndü. SİLİNEN görsel
 * ise her durumda diriliyordu — günlükteki silme çıpadaki eski öğeyi
 * hedefler, geri konan yeni öğeye işlemez.
 *
 * Yeni yol: `cipaParcaliOku` gövde + varlık baytlarını AYRI verir; `kurtar`
 * önce günlüğü oynatır, oynatma sırasında `assets` kökünde dokunulan
 * anahtarları toplar ve geri koymayı YALNIZ dokunulmamışlara yapar.
 *
 * Döngü 25 kez: yarışın eski hâli rastgele clientID'ye bağlıydı (~%45);
 * tek koşu mutanta karşı yazı-tura olurdu, 25 koşuda kaçma olasılığı ~1e-6.
 */
describe('kurtarmada varlıklar günlükten SONRA geri konur (yarış + dirilme)', () => {
  /** Çıpa sonrası düzenlemeyi günlük dosyası biçiminde toplar. */
  function gunlukTopla(doc: Y.Doc, duzenle: () => void): Uint8Array {
    const parcalar: Uint8Array[] = [gunlukBasligi()];
    const dinle = (u: Uint8Array) => parcalar.push(cerceve(u, 5_000));
    doc.on('update', dinle);
    duzenle();
    doc.off('update', dinle);
    const toplam = parcalar.reduce((t, p) => t + p.length, 0);
    const cikti = new Uint8Array(toplam);
    let k = 0;
    for (const p of parcalar) { cikti.set(p, k); k += p.length; }
    return cikti;
  }

  it('çıpadan sonra DEĞİŞTİRİLEN görsel kurtarmada asla eskiye dönmüyor', () => {
    for (let deneme = 0; deneme < 25; deneme++) {
      const d = depo();
      const eski = varlikDataUrl(2, 900 + deneme);
      const yeni = varlikDataUrl(2, 950 + deneme);
      const doc = belgeOlustur({ degisen: eski, sabit: varlikDataUrl(1, 990) });
      d.cipaYazVeKes(Y.encodeStateAsUpdate(doc), 1_000);

      const gunluk = gunlukTopla(doc, () => setAsset(doc, 'degisen', yeni));

      const parca = d.cipaParcaliOku(d.halka()[0].id);
      const sonuc = kurtar(parca.govde, gunluk, parca.varliklar, parca.ogeler);
      expect(assetsMap(sonuc.doc).get('degisen')).toBe(yeni);
      /* Dokunulmamış görsel geri konmuş olmalı — "hiç geri koyma" mutantı
         burada ölür. */
      expect(assetsMap(sonuc.doc).get('sabit')).toBe(varlikDataUrl(1, 990));
      sonuc.doc.destroy();
      doc.destroy();
    }
  });

  it('çıpadan sonra SİLİNEN görsel kurtarmada dirilmiyor', () => {
    const d = depo();
    const doc = belgeOlustur({ silinen: varlikDataUrl(2, 1100), kalan: varlikDataUrl(1, 1150) });
    d.cipaYazVeKes(Y.encodeStateAsUpdate(doc), 1_000);

    const gunluk = gunlukTopla(doc, () => assetsMap(doc).delete('silinen'));

    const parca = d.cipaParcaliOku(d.halka()[0].id);
    const sonuc = kurtar(parca.govde, gunluk, parca.varliklar, parca.ogeler);
    expect(assetsMap(sonuc.doc).has('silinen')).toBe(false);
    expect(assetsMap(sonuc.doc).get('kalan')).toBe(varlikDataUrl(1, 1150));
    sonuc.doc.destroy();
    doc.destroy();
  });

  it('parçalı okuma: gövde varlıksız, baytlar ayrı, eksikler bildiriliyor', () => {
    const d = depo();
    const varliklar = varlikSeti(3, 1200);
    const doc = belgeOlustur(varliklar);
    d.cipaYazVeKes(Y.encodeStateAsUpdate(doc), 1_000);

    const parca = d.cipaParcaliOku(d.halka()[0].id);
    expect(parca.varliklar).toEqual(varliklar);
    expect(parca.eksik).toEqual([]);
    const govdeDoc = cipadanBelge(parca.govde);
    expect(assetsMap(govdeDoc).size).toBe(0); // gövde gerçekten varlıksız
    govdeDoc.destroy();

    /* Depodan bir varlık silinirse parçalı okuma bunu SÖYLÜYOR. */
    const ozet = createHash('sha256')
      .update(Object.values(varliklar)[0], 'utf8')
      .digest('hex');
    fs.rmSync(path.join(kok, VARLIK_DIZINI, ozet));
    const eksikli = d.cipaParcaliOku(d.halka()[0].id);
    expect(eksikli.eksik).toHaveLength(1);
    doc.destroy();
  });

  it('ESKİ biçim çıpada parçalı okuma ham baytları olduğu gibi verir', () => {
    const d = depo();
    const varliklar = varlikSeti(2, 1300);
    const eskiCipa = Y.encodeStateAsUpdate(belgeOlustur(varliklar));
    fs.mkdirSync(d.dizin, { recursive: true });
    fs.writeFileSync(path.join(d.dizin, 'cipa-1000.yjs'), eskiCipa);

    const parca = d.cipaParcaliOku('cipa-1000.yjs');
    expect(parca.varliklar).toEqual({});
    const geri = cipadanBelge(parca.govde);
    expect(assetsMap(geri).toJSON()).toEqual(varliklar); // gömülü hâliyle
    geri.destroy();
  });
});
