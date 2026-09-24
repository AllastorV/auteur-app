import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as Y from 'yjs';
import { EditorState } from 'prosemirror-state';
import { profilOlustur } from '@storyboard/core/format/profil';
import { sayfala } from '@storyboard/core/format/sayfala';
import { bloklarToDoc, senaryoSemasi } from '@storyboard/core/editor/sema';
import { sayfaDurumu, sayfaEklentisi } from '@storyboard/core/editor/sayfa';
import { setScript } from '@storyboard/core/doc/mutations';
import { readScript, senaryoFragment } from '@storyboard/core/doc/schema';
import { cerceve, gunlukBasligi } from '@storyboard/core/veri/gunluk';
import { durumOzdes, kurtar } from '@storyboard/core/veri/kurtarma';
import { bloklar } from './yardim/agir-senaryo';

/**
 * TEST 2 — ÇÖKME SINIRI (kullanıcının en çok önemsediği test).
 *
 * > "Rastgele yazılarla program çökene kadar sayfaları doldur; nerede
 * > çöküyor, çökünce ne kadarı kurtarılabiliyor. Tek projede 1000 sayfa
 * > yazıya rağmen çökmüyorsa bu testi geçti demek."
 *
 * ÖLÇÜLEN, GEÇTİ/KALDI DEĞİL SAYI: her kademede tuş başına gecikme (ms),
 * bellek (MB) ve sayfalama süresi (ms) yazılıyor ve
 * `test-results/agir/olcum.json` dosyasına dökülüyor.
 *
 * ## Neden mutlak eşik YOK, ORAN var
 *
 * Duvar saati makineye bağlı; CI'da yükselen bir eşik gerçek bir yavaşlamayı
 * gizler (bu depoda `scale.spec.ts`'te aynı ders alınmıştı). Bu yüzden
 * iddia şu: maliyet blok başına SABİT kalmalı. Kademeler arasında blok başına
 * maliyet belirgin biçimde artıyorsa algoritma karesel demektir ve 1000 sayfa
 * bir duvara toslar — ORAN makineden bağımsızdır.
 */

const profil = profilOlustur('amerikan', 'a4', 'tr');

/** 1000 sayfa = 21.000 blok (bu fikstürde ölçüldü); kademeler oradan türüyor. */
const BLOK_SAYFA = 21;
const KADEMELER = [100, 250, 500, 1000] as const;

interface Olcum {
  hedefSayfa: number;
  blok: number;
  sayfa: number;
  sayfalaMs: number;
  kurulumMs: number;
  tusMs: number;
  tusMsBlokBasina: number;
  bellekMB: number;
}

const heapMB = () => process.memoryUsage().heapUsed / 1048576;
const olcumler: Olcum[] = [];

function kademe(hedefSayfa: number): Olcum {
  const n = hedefSayfa * BLOK_SAYFA;
  const bs = bloklar(n);

  const t0 = performance.now();
  const sayfalar = sayfala(bs, profil);
  const sayfalaMs = performance.now() - t0;

  const t1 = performance.now();
  const state = EditorState.create({
    schema: senaryoSemasi, doc: bloklarToDoc(bs), plugins: [sayfaEklentisi(profil)],
  });
  const kurulumMs = performance.now() - t1;

  /* Tuş vuruşu GERÇEK yol: `insertText` + eklentinin yeniden sayfalaması.
     Belgenin ORTASINA yazılıyor — sona yazmak, sayfalayıcının değişimden
     sonrasını yeniden kurup kurmadığını gizlerdi. */
  const orta = Math.floor(state.doc.content.size / 2);
  let st = state;
  const TUS = 12;
  const t2 = performance.now();
  for (let i = 0; i < TUS; i++) st = st.apply(st.tr.insertText('a', orta));
  const tusMs = (performance.now() - t2) / TUS;

  /* Eklenti ile saf motor AYNI sayıyı vermeli — ölçüm yaparken sessizce
     ıraksamış olmadıklarını da kanıtlıyoruz (Karar 34). */
  expect(sayfaDurumu(state)!.sayaclar.sayfa).toBe(sayfalar.length);

  const o: Olcum = {
    hedefSayfa,
    blok: n,
    sayfa: sayfalar.length,
    sayfalaMs: +sayfalaMs.toFixed(1),
    kurulumMs: +kurulumMs.toFixed(1),
    tusMs: +tusMs.toFixed(1),
    tusMsBlokBasina: +(tusMs / n).toFixed(6),
    bellekMB: +heapMB().toFixed(0),
  };
  olcumler.push(o);
  // eslint-disable-next-line no-console -- ölçüm testinin ÇIKTISI bu.
  console.log(
    `${hedefSayfa} sayfa hedefi → ${o.sayfa} sayfa / ${o.blok} blok | ` +
    `sayfala ${o.sayfalaMs}ms | kurulum ${o.kurulumMs}ms | ` +
    `tuş ${o.tusMs}ms (${(o.tusMsBlokBasina * 1000).toFixed(3)} µs/blok) | heap ${o.bellekMB}MB`,
  );
  return o;
}

describe('TEST 2 — kademeli büyüme, 1000 sayfaya kadar', () => {
  it('100 / 250 / 500 / 1000 sayfa: çökme YOK, donma ölçülüyor', () => {
    for (const k of KADEMELER) {
      const o = kademe(k);
      /* Fikstür hedefe OTURMALI: tutmazsa "1000 sayfa dayandı" iddiası
         başka bir belge hakkında olurdu. %5 pay üretecin ritim
         dalgalanmasına. */
      expect(Math.abs(o.sayfa - k) / k, `${k} sayfa hedefi tutmadı: ${o.sayfa}`)
        .toBeLessThan(0.05);
    }

    fs.mkdirSync(path.resolve(__dirname, '../../../test-results/agir'), { recursive: true });
    fs.writeFileSync(
      path.resolve(__dirname, '../../../test-results/agir/olcum.json'),
      JSON.stringify(olcumler, null, 2),
    );
  }, 600_000);

  it('1000 SAYFA ÇÖKMÜYOR — kullanıcının geçme ölçütü', () => {
    const bin = olcumler.find((o) => o.hedefSayfa === 1000);
    expect(bin, 'kademe ölçümü koşmadı').toBeDefined();
    expect(bin!.sayfa).toBeGreaterThanOrEqual(950);
    /* Bellek TAVANI mutlak: 1 GB'ı aşan bir heap Electron renderer'da
       çökme demektir ve bu eşik makineye değil sürecin sınırına bağlı. */
    expect(bin!.bellekMB).toBeLessThan(1024);
  });

  it('maliyet blok başına SABİT — karesel değil (oran iddiası)', () => {
    const ilk = olcumler[0];
    const son = olcumler[olcumler.length - 1];
    /* Karesel olsaydı blok başına maliyet 10 kat büyümede 10 katına
       çıkardı. 3× pay: ölçüm gürültüsü, GC ve önbellek etkisi için. */
    expect(
      son.tusMsBlokBasina / ilk.tusMsBlokBasina,
      `blok başına tuş maliyeti ${ilk.hedefSayfa}→${son.hedefSayfa} sayfada ` +
      `${(son.tusMsBlokBasina / ilk.tusMsBlokBasina).toFixed(2)}× büyüdü`,
    ).toBeLessThan(3);
    expect(son.sayfalaMs / ilk.sayfalaMs / (son.blok / ilk.blok)).toBeLessThan(3);
  });
});

describe('TEST 2b — 1000 sayfada çökme sonrası kurtarma (§15.3)', () => {
  /**
   * Senaryo: 1000 sayfalık belge çıpalanmış, sonra 500 düzenleme yapılmış ve
   * bilgisayar günlüğün SON çerçevesi diske yazılırken kesilmiş.
   *
   * Ölçülen: sağlam ön ek eksiksiz oynuyor mu ve YÜZDE KAÇI kurtarılıyor.
   */
  it('yarım kalmış günlükte sağlam ön ek BİREBİR geri geliyor', () => {
    const bs = bloklar(1000 * BLOK_SAYFA);
    const doc = new Y.Doc();
    setScript(doc, { name: 'agir', blocks: bs });
    const cipa = Y.encodeStateAsUpdate(doc);

    const parcalar: Uint8Array[] = [gunlukBasligi()];
    const cerceveUzunluklari: number[] = [];
    doc.on('update', (u: Uint8Array) => {
      const c = cerceve(u, Date.now());
      parcalar.push(c);
      cerceveUzunluklari.push(c.length);
    });

    /* Düzenlemeler METNE yapılıyor — `Y.Map` sayacı artırmak günlüğü
       doldurur ama senaryonun kendisini değiştirmez ve kurtarma iddiası
       kullanıcının yazısı hakkında olmalı. Doğrudan `Y.XmlText`'e yazılıyor
       (`setScript` DEĞİL): setScript bütün belgeyi uzlaştırır, oysa gerçek
       tuş vuruşu tek bir metin düğümüne dokunur — ölçmek istediğimiz yol o. */
    const parca = senaryoFragment(doc);
    const YAZIM = 500;
    const t0 = performance.now();
    for (let i = 0; i < YAZIM; i++) {
      const eleman = parca.get((i * 7) % parca.length) as Y.XmlElement;
      const metin = eleman.get(0) as unknown;
      if (metin instanceof Y.XmlText) metin.insert(0, 'x');
      else eleman.insert(0, [new Y.XmlText('x')]);
    }
    const yazimMs = performance.now() - t0;
    expect(cerceveUzunluklari.length).toBe(YAZIM);

    const tamUzunluk = parcalar.reduce((t, p) => t + p.length, 0);
    const tam = new Uint8Array(tamUzunluk);
    let o = 0;
    for (const p of parcalar) { tam.set(p, o); o += p.length; }

    /* ÇÖKME: son çerçeve YARIM yazılmış. Ekleme (append) sırasında kesilen
       bir yazımın diskte bıraktığı iz tam olarak budur (§15.2). */
    const yarim = tam.subarray(0, tam.length - Math.floor(cerceveUzunluklari[cerceveUzunluklari.length - 1] / 2));

    const t1 = performance.now();
    const sonuc = kurtar(cipa, yarim);
    const kurtarmaMs = performance.now() - t1;

    expect(sonuc.durum).toBe('kirpik');
    expect(sonuc.uygulanamayan).toBe(0);
    expect(sonuc.uygulanan).toBe(cerceveUzunluklari.length - 1);

    /* BİREBİR: yarım günlükten kurtarılan belge, son yazımı YAPILMAMIŞ
       hâlin AYNISI olmalı. Beklenen durum ikinci bir kurulumla değil, aynı
       çerçevelerin bir sayısı eksik uygulanmasıyla kuruluyor — tek kaynak. */
    const eksikGunluk = tam.subarray(0, tam.length - cerceveUzunluklari[cerceveUzunluklari.length - 1]);
    const beklenen = kurtar(cipa, eksikGunluk);
    expect(beklenen.durum).toBe('tam');
    expect(durumOzdes(sonuc.doc, beklenen.doc), 'kırpık günlük fazladan/eksik durum üretti').toBe(true);

    const tamOkuma = kurtar(cipa, tam);
    expect(tamOkuma.durum).toBe('tam');
    expect(tamOkuma.uygulanan).toBe(cerceveUzunluklari.length);
    expect(durumOzdes(tamOkuma.doc, doc), 'tam günlük durumu birebir vermedi').toBe(true);
    expect(readScript(tamOkuma.doc).blocks).toHaveLength(bs.length);

    const yuzde = (sonuc.uygulanan / cerceveUzunluklari.length) * 100;
    // eslint-disable-next-line no-console -- ölçüm çıktısı.
    console.log(
      `1000 sayfa · ${YAZIM} yazım: çıpa ${Math.round(cipa.length / 1024)}KB, ` +
      `günlük ${Math.round(tamUzunluk / 1024)}KB, yazım ${yazimMs.toFixed(0)}ms, ` +
      `kurtarma ${kurtarmaMs.toFixed(0)}ms, kurtarılan ${sonuc.uygulanan}/${cerceveUzunluklari.length} ` +
      `çerçeve (%${yuzde.toFixed(1)})`,
    );
    /* Yarım çerçeve YALNIZ kendisini götürür: kayıp bir çerçeveden fazlaysa
       ekleme kuralı (§15.2) çalışmıyor demektir. */
    expect(yuzde).toBeGreaterThan(99);
  }, 900_000);

  it('çıpasız kurtarma: günlük tek başına TAM durumu taşıyor', () => {
    /* §15.3: "hiç anlık görüntü alınmadan çökülmüşse günlük tek başına da tam
       durumu taşır". 1000 sayfada da geçerli mi — ölçülüyor. */
    const bs = bloklar(1000 * BLOK_SAYFA);
    const doc = new Y.Doc();
    const parcalar: Uint8Array[] = [gunlukBasligi()];
    doc.on('update', (u: Uint8Array) => parcalar.push(cerceve(u, Date.now())));
    setScript(doc, { name: 'agir', blocks: bs });

    const uzunluk = parcalar.reduce((t, p) => t + p.length, 0);
    const gunluk = new Uint8Array(uzunluk);
    let o = 0;
    for (const p of parcalar) { gunluk.set(p, o); o += p.length; }

    const t0 = performance.now();
    const sonuc = kurtar(null, gunluk);
    const ms = performance.now() - t0;

    expect(sonuc.durum).toBe('tam');
    expect(sonuc.uygulanamayan).toBe(0);
    expect(durumOzdes(sonuc.doc, doc), 'çıpasız kurtarma durumu birebir vermedi').toBe(true);
    // eslint-disable-next-line no-console -- ölçüm çıktısı.
    console.log(`çıpasız kurtarma: günlük ${Math.round(uzunluk / 1024)}KB → ${ms.toFixed(0)}ms, durum birebir`);
  }, 900_000);
});
