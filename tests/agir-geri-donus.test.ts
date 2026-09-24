import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { gunlukDeposu } from '../apps/desktop/electron/gunluk-deposu';
import { kontrolNoktasinaDon, type GeriDonusKabugu } from '@storyboard/core/veri/geri-donus';
import { durumOzdes } from '@storyboard/core/veri/kurtarma';
import { stableStringify } from '@storyboard/core/model/projection';
import { setScript, LOCAL_ORIGIN } from '@storyboard/core/doc/mutations';
import { docToProject, loadProjectIntoDoc, readScript, senaryoFragment } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { bloklar } from '../packages/core/tests/yardim/agir-senaryo';

/**
 * TEST 4 — GERİ DÖNÜŞ NOKTALARI (kullanıcı isteği).
 *
 * İki ayrı soru:
 *
 * 1. **Normal geri dönüş** — `UndoManager` uzun bir yazım seansında
 *    adım adım geri alıyor ve ileri alıyor mu; belge başlangıç durumuna
 *    BİREBİR dönüyor mu?
 * 2. **§15.2.2 iddiası** — "Geri dönmek mevcut durumu silmiyor: geri
 *    dönmeden hemen önce otomatik bir kontrol noktası daha yazılıyor, yani
 *    geri dönüşten de geri dönülebilir." GERÇEKTEN ÖYLE Mİ?
 *
 * İkincisi burada BELLEKTE TAKLİT EDİLMİŞ bir kabukla değil, masaüstünün
 * GERÇEK dosya deposuyla (`gunlukDeposu`) ölçülüyor: `packages/core`'daki
 * mevcut test sahte bir `Map` deposu kullanıyor ve o, güvenlik noktasının
 * diske düşüp düşmediğini söyleyemez. İddia bir DOSYA iddiasıdır — geri
 * dönüşten geri dönmek, o dosya orada değilse mümkün değildir.
 */

const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'mzn-agir-'));
afterAll(() => fs.rmSync(kok, { recursive: true, force: true }));

let sayac = 0;
const depo = () => gunlukDeposu(kok, `proje-${sayac++}`);

/**
 * Damgalar ŞİMDİYE yakın olmak zorunda — ve bu, fikstür kolaylığı değil bir
 * BULGUNUN izi. `cipaYazVeKes` her yazımda `seyrelt` çağırıyor; 30 günden
 * eski otomatik noktalar siliniyor. İlk yazışımda hedef noktanın damgası
 * 1970'teydi ve GÜVENLİK NOKTASI YAZILIRKEN hedefin kendisi budandı:
 * `kontrolNoktasinaDon` önce yazıp sonra okuduğu için dönüş ham bir ENOENT
 * ile patladı. Üretimde de dar bir yarış var (liste çizildikten sonra hedef
 * 30 günü geçerse) — raporda "düzeltilmedi" başlığı altında.
 */
const SIMDI = Date.now();

/**
 * Fikstür: ~50 sayfalık gerçek senaryo taşıyan GERÇEK bir proje belgesi.
 *
 * `loadProjectIntoDoc` şart: `ilkSaglamKayit` proje kimliği taşımayan bir
 * çıpayı `projesiz` diye ELİYOR (soy karışmasına karşı). Yalnız `setScript`
 * çağıran bir fikstür, kurtarmanın bu muhafızını yanlışlıkla sınardı.
 */
function senaryoDoc(n = 1050): Y.Doc {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  setScript(doc, { name: 'agir', blocks: bloklar(n) });
  return doc;
}

/** `gunlukDeposu`'nu §15.2.2'nin kabuğuna bağlar — üretimdeki bağın aynısı. */
function kabukKur(d: ReturnType<typeof depo>): GeriDonusKabugu {
  return {
    async guvenlikNoktasiYaz(cipa) {
      /* Üretimdeki yol `cipaYazVeGunlugeKes` — çıpayı ATOMİK yazıp günlüğü
         kesiyor. Aynı fonksiyon burada da çağrılıyor: ayrı bir yazım
         çağrısı kullansaydık, atomikliği olmayan bir yolu test etmiş
         olurduk. */
      d.cipaYazVeKes(cipa, SIMDI + ++sayac);
    },
    async noktaOku(id) {
      return d.cipaOku(id);
    },
  };
}

describe('TEST 4a — normal geri dönüş (UndoManager), uzun seans', () => {
  it('60 ayrı yazım adımı geri alınıp ileri alınıyor, durum BİREBİR', async () => {
    const { useProjectStore } = await import('@storyboard/core/store/project');
    const doc = senaryoDoc();
    useProjectStore.getState().attachDoc(doc, 'owner');
    const { undoManager } = useProjectStore.getState();

    const baslangic = Y.encodeStateAsUpdate(doc);
    const parca = senaryoFragment(doc);
    const ADIM = 60;

    const t0 = performance.now();
    for (let i = 0; i < ADIM; i++) {
      /* `stopCapturing` ŞART: `captureTimeout: 400` ms içinde arka arkaya
         gelen yazımlar TEK geri alma adımına birleşir. Birleşme gerçek
         kullanımda doğru davranıştır (harf harf geri almak işkence olurdu)
         ama burada "60 adım" iddiasını ölçemez hâle getirirdi. */
      undoManager.stopCapturing();
      doc.transact(() => {
        const eleman = parca.get((i * 13) % parca.length) as Y.XmlElement;
        const metin = eleman.get(0) as unknown;
        if (metin instanceof Y.XmlText) metin.insert(0, `D${i} `);
        else eleman.insert(0, [new Y.XmlText(`D${i} `)]);
      }, LOCAL_ORIGIN);
    }
    const yazimMs = performance.now() - t0;

    const son = Y.encodeStateAsUpdate(doc);
    expect(readScript(doc).blocks.some((b) => b.text.startsWith('D59 '))).toBe(true);

    const t1 = performance.now();
    for (let i = 0; i < ADIM; i++) {
      expect(undoManager.canUndo(), `adım ${i} yığında yok`).toBe(true);
      undoManager.undo();
    }
    const geriMs = performance.now() - t1;

    /* İÇERİK karşılaştırılıyor, `durumOzdes` DEĞİL. ÖLÇÜLDÜ: geri alma
       durumu eski hâline döndürmez, TERS işlemleri EKLER — silme de yeni bir
       operasyondur ve istemcinin saati ilerler. Bu yüzden geri alınmış bir
       belgenin durum VEKTÖRÜ başlangıçtakiyle asla eşleşmez; eşleşmesini
       beklemek testi yanlış yerden kırar. Kullanıcının sorduğu soru
       "vektör aynı mı" değil, "metnim aynı mı". */
    /* `doc.toJSON()` DOĞRUDAN kullanılamaz: güncellemelerden kurulmuş bir
       belgede kökler erişilene kadar TİPSİZ yer tutucudur ve `toJSON()` onları
       `null` gösterir (ölçüldü — `kurtarma.ts` aynı tuzağı anlatıyor).
       `docToProject` bütün köklere dokunduğu için karşılaştırma gerçek
       içeriği görür. */
    const icerik = (d: Y.Doc) => stableStringify(docToProject(d));
    const baslangicDoc = new Y.Doc();
    Y.applyUpdate(baslangicDoc, baslangic);
    expect(readScript(doc).blocks.map((b) => b.text))
      .toEqual(readScript(baslangicDoc).blocks.map((b) => b.text));
    expect(readScript(doc).blocks.map((b) => b.id))
      .toEqual(readScript(baslangicDoc).blocks.map((b) => b.id));
    expect(icerik(doc), 'geri alma başlangıcı geri getirmedi').toBe(icerik(baslangicDoc));
    expect(undoManager.canUndo()).toBe(false);

    const t2 = performance.now();
    for (let i = 0; i < ADIM; i++) {
      expect(undoManager.canRedo(), `ileri adım ${i} yok`).toBe(true);
      undoManager.redo();
    }
    const ileriMs = performance.now() - t2;

    const sonDoc = new Y.Doc();
    Y.applyUpdate(sonDoc, son);
    expect(readScript(doc).blocks.map((b) => b.text))
      .toEqual(readScript(sonDoc).blocks.map((b) => b.text));
    expect(icerik(doc), 'ileri alma son durumu geri getirmedi').toBe(icerik(sonDoc));

    // eslint-disable-next-line no-console -- ölçüm çıktısı.
    console.log(
      `50 sayfa · ${ADIM} adım: yazım ${yazimMs.toFixed(0)}ms, ` +
      `geri ${geriMs.toFixed(0)}ms (${(geriMs / ADIM).toFixed(1)}ms/adım), ` +
      `ileri ${ileriMs.toFixed(0)}ms (${(ileriMs / ADIM).toFixed(1)}ms/adım)`,
    );
  }, 600_000);
});

describe('TEST 4b — §15.2.2 iddiası GERÇEK depoda', () => {
  it('geri dönüş mevcut durumu SİLMİYOR: güvenlik noktası DİSKE düşüyor', async () => {
    const d = depo();
    const kabuk = kabukKur(d);

    // A durumu — kontrol noktası olarak diske yazılıyor.
    const docA = senaryoDoc();
    d.cipaYazVeKes(Y.encodeStateAsUpdate(docA), SIMDI - 60_000);
    const noktaA = d.halka()[0].id;

    // A üstüne yazılıyor → B durumu (kullanıcının "mevcut durumu").
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    const parcaB = senaryoFragment(docB);
    for (let i = 0; i < 25; i++) {
      const eleman = parcaB.get(i * 11) as Y.XmlElement;
      (eleman.get(0) as Y.XmlText).insert(0, `YENİ${i} `);
    }
    const bMetni = readScript(docB).blocks.map((b) => b.text);
    expect(bMetni.filter((t) => t.startsWith('YENİ'))).toHaveLength(25);

    const halkaOnce = d.halka().length;

    // B'deyken A'ya dön.
    const donus = await kontrolNoktasinaDon(docB, noktaA, kabuk);
    expect(durumOzdes(donus.doc, docA), 'hedef kontrol noktası açılmadı').toBe(true);

    /* İDDİANIN ÖLÇÜSÜ: halkada YENİ bir dosya var ve içeriği B'nin ta
       kendisi. Sayının artması tek başına yetmez — yanlış baytları yazan
       bir kayıt da sayıyı artırırdı. */
    const halkaSonra = d.halka();
    expect(halkaSonra.length, 'güvenlik noktası diske yazılmadı').toBe(halkaOnce + 1);
    const yeniNokta = halkaSonra.find((c) => c.id !== noktaA)!;
    const geriYuklenen = new Y.Doc();
    Y.applyUpdate(geriYuklenen, d.cipaOku(yeniNokta.id));
    expect(durumOzdes(geriYuklenen, docB), 'güvenlik noktası B durumunu taşımıyor').toBe(true);

    // "Geri dönüşten geri dön" — B birebir geri geliyor mu?
    const geri = await kontrolNoktasinaDon(donus.doc, yeniNokta.id, kabuk);
    expect(durumOzdes(geri.doc, docB), 'geri dönüşten geri dönülemedi').toBe(true);
    expect(readScript(geri.doc).blocks.map((b) => b.text)).toEqual(bMetni);
  }, 600_000);

  it('güvenlik noktası YAZILAMAZSA dönüş hiç başlamıyor — mevcut durum yerinde', async () => {
    const d = depo();
    const docA = senaryoDoc(210);
    d.cipaYazVeKes(Y.encodeStateAsUpdate(docA), SIMDI - 120_000);
    const noktaA = d.halka()[0].id;

    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    (senaryoFragment(docB).get(3) as Y.XmlElement).insert(0, [new Y.XmlText('KAYBOLMAMALI ')]);
    const oncekiDurum = Y.encodeStateAsUpdate(docB);

    let okundu = false;
    const kirikKabuk: GeriDonusKabugu = {
      async guvenlikNoktasiYaz() { throw new Error('disk dolu'); },
      async noktaOku(id) { okundu = true; return d.cipaOku(id); },
    };

    await expect(kontrolNoktasinaDon(docB, noktaA, kirikKabuk)).rejects.toThrow('disk dolu');
    /* Hedef HİÇ okunmamalı: okunup uygulanmaya başlansaydı kullanıcı yarım
       bir dönüşle baş başa kalırdı. */
    expect(okundu, 'güvenlik noktası yazılamazken hedef yine de okundu').toBe(false);
    const sonraki = new Y.Doc();
    Y.applyUpdate(sonraki, oncekiDurum);
    expect(durumOzdes(docB, sonraki), 'iptal edilen dönüş belgeye dokundu').toBe(true);
  }, 600_000);

  it('üst üste üç dönüş: her adımın güvenlik noktası halkada duruyor', async () => {
    const d = depo();
    const kabuk = kabukKur(d);

    const durumlar: Y.Doc[] = [];
    const noktalar: string[] = [];
    let mevcut = senaryoDoc(420);
    for (let i = 0; i < 3; i++) {
      d.cipaYazVeKes(Y.encodeStateAsUpdate(mevcut), SIMDI - (3 - i) * 60_000);
      noktalar.push(d.halka()[0].id);
      const kopya = new Y.Doc();
      Y.applyUpdate(kopya, Y.encodeStateAsUpdate(mevcut));
      durumlar.push(kopya);

      const sonraki = new Y.Doc();
      Y.applyUpdate(sonraki, Y.encodeStateAsUpdate(mevcut));
      (senaryoFragment(sonraki).get(i * 5) as Y.XmlElement).insert(0, [new Y.XmlText(`K${i} `)]);
      mevcut = sonraki;
    }

    /* En eskiye dön, sonra zinciri geri sar: her dönüşün güvenlik noktası
       bir sonraki dönüşün HEDEFİ olabiliyor mu — §15.2.2'nin "geri
       dönüşten de geri dönülebilir" cümlesinin tekrarlanabilir hâli. */
    let el = mevcut;
    const guvenlikler: string[] = [];
    for (let i = 2; i >= 0; i--) {
      const oncekiHalka = new Set(d.halka().map((c) => c.id));
      const donus = await kontrolNoktasinaDon(el, noktalar[i], kabuk);
      const yeni = d.halka().find((c) => !oncekiHalka.has(c.id));
      expect(yeni, `dönüş ${i} güvenlik noktası bırakmadı`).toBeDefined();
      guvenlikler.push(yeni!.id);
      expect(durumOzdes(donus.doc, durumlar[i])).toBe(true);
      el = donus.doc;
    }

    // Zinciri ileri sar: son yazılan güvenlik noktasından başa dönülüyor.
    for (let i = guvenlikler.length - 1; i >= 0; i--) {
      const donus = await kontrolNoktasinaDon(el, guvenlikler[i], kabuk);
      el = donus.doc;
    }
    expect(durumOzdes(el, mevcut), 'zincirin başına dönülemedi').toBe(true);
  }, 600_000);
});
