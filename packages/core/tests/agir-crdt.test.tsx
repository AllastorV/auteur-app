// @vitest-environment jsdom
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { readScript, senaryoFragment } from '@storyboard/core/doc/schema';
import { setScript } from '@storyboard/core/doc/mutations';
import { senaryoSemasi } from '@storyboard/core/editor/sema';
import { senaryoEklentileri } from '@storyboard/core/editor/bag';
import { profilOlustur } from '@storyboard/core/format/profil';
import { DOKUMAN_TIPLERI } from '@storyboard/core/model/dokuman-tipi';
import { bloklar } from './yardim/agir-senaryo';

/**
 * TEST 5 — CRDT ZORLU TEST (kullanıcı isteği).
 *
 * > "`Y.XmlFragment` + `y-prosemirror`: iki yazar AYNI ANDA farklı sahneleri
 * > düzenlerse biri ötekinin TÜM yazdığını eziyor mu? Sadece iki değil, 3-5
 * > yazarla ve çakışan/çakışmayan bölgelerle dene. Ağ gecikmesi ve kopma
 * > senaryosu ekle (bir yazar çevrimdışı yazıp sonra bağlanıyor)."
 *
 * Mevcut testler (`editor-bag.test.ts`, `tests/crdt.test.ts`) İKİ yazarı ve
 * TEK bir düzenlemeyi ölçüyor. Buradaki fark üç katmanlı:
 *
 * 1. **Gerçek editör yolu.** Düzenlemeler `Y.XmlText`'e elden değil,
 *    `EditorView.dispatch` ile yapılıyor — yani `ySyncPlugin` ve
 *    `kimlikOnarimEklentisi` de devrede. Elden yazan bir test, uzak değişimde
 *    kimlik onarımının koşup koşmadığını (Karar 33) hiç sınamaz.
 * 2. **Gecikmeli ve SIRASIZ ağ.** Güncellemeler kuyruğa alınıp karışık sırada
 *    dağıtılıyor. Yjs sıradan bağımsız birleşir; bunu iddia etmek, bir
 *    gün araya "sıralı teslim" varsayan bir eniyileme girdiğinde kırmızı
 *    döner.
 * 3. **Kopma.** Bir yazar kuyruğunu hiç almadan yazmaya devam ediyor, sonra
 *    bağlanıyor.
 *
 * ÖLÇÜT "kaybolmadı" DEĞİL, "tam olarak bir kez ve doğru yerde": her yazarın
 * imi metinde BİR kez geçmeli. `toContain` ile bakmak, bir tarafın diğerini
 * ezip kendi imini bıraktığı durumu yeşil gösterirdi.
 */

const profil = profilOlustur('amerikan', 'letter', 'tr');
const SESSIZ = { undo: () => {}, redo: () => {} };

/** Bir yazar: kendi `Y.Doc`'u, kendi görünümü, kendi gelen kutusu. */
interface Yazar {
  ad: string;
  doc: Y.Doc;
  view: EditorView;
  /** Bu yazarın ÜRETTİĞİ, henüz dağıtılmamış güncellemeler. */
  giden: Uint8Array[];
  cevrimici: boolean;
}

function yazarKur(ad: string, tohum: Uint8Array): Yazar {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, tohum);
  const yer = document.createElement('div');
  document.body.appendChild(yer);
  const view = new EditorView(yer, {
    state: EditorState.create({
      schema: senaryoSemasi,
      plugins: senaryoEklentileri(doc, profil, SESSIZ, DOKUMAN_TIPLERI.senaryo),
    }),
  });
  const y: Yazar = { ad, doc, view, giden: [], cevrimici: true };
  /* Yalnız YEREL yazımlar ağa çıkar: uzaktan gelen güncellemeyi geri
     yayınlamak sonsuz yankı olurdu. `origin` uzak uygulamada 'ag'. */
  doc.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== 'ag') y.giden.push(u);
  });
  return y;
}

/** Bloğun METİN başlangıcının belge içindeki mutlak konumu. */
function metinBasi(view: EditorView, id: string): number {
  let bulunan = -1;
  view.state.doc.forEach((n, offset) => { if (n.attrs.id === id) bulunan = offset + 1; });
  if (bulunan < 0) throw new Error(`blok yok: ${id}`);
  return bulunan;
}

/** Deterministik karıştırıcı — `Math.random()` bir kırılmayı tekrarlanamaz kılardı. */
function karistir<T>(dizi: T[], tohum: number): T[] {
  let s = tohum >>> 0 || 1;
  const kopya = [...dizi];
  for (let i = kopya.length - 1; i > 0; i--) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    const j = s % (i + 1);
    [kopya[i], kopya[j]] = [kopya[j], kopya[i]];
  }
  return kopya;
}

/**
 * Ağ turu: bekleyen güncellemeleri KARIŞIK sırada, ÇEVRİMİÇİ yazarlara dağıtır.
 *
 * Çevrimdışı yazarın gideni kuyrukta bekler (kopma), geleni de gelmez.
 */
function agTuru(yazarlar: Yazar[], tohum: number): void {
  const paketler: { kaynak: Yazar; veri: Uint8Array }[] = [];
  for (const y of yazarlar) {
    if (!y.cevrimici) continue;
    for (const veri of y.giden) paketler.push({ kaynak: y, veri });
    y.giden = [];
  }
  for (const p of karistir(paketler, tohum)) {
    for (const hedef of yazarlar) {
      if (hedef === p.kaynak || !hedef.cevrimici) continue;
      Y.applyUpdate(hedef.doc, p.veri, 'ag');
    }
  }
}

/**
 * Herkes çevrimiçi olur ve YENİDEN BAĞLANMA PROTOKOLÜ koşar.
 *
 * Kuyruğu boşaltmak YETMEZ ve bu ölçüldü: kopmuşken dağıtılan paketler
 * gönderenin kuyruğundan çoktan düşmüştür, dolayısıyla kopan yazar onları
 * bir daha hiç görmez ve belge kalıcı olarak ıraksar. Gerçek istemci
 * (`y-websocket`) bağlanınca DURUM VEKTÖRÜ değiş tokuşu yapıp yalnız
 * eksiğini çeker — burada modellenen o. Bu adım olmadan test, kopmayı
 * değil kendi kuyruk kurgusunu ölçerdi.
 */
function yakinsat(yazarlar: Yazar[]): void {
  for (const y of yazarlar) y.cevrimici = true;
  agTuru(yazarlar, 7);
  for (const a of yazarlar) {
    for (const b of yazarlar) {
      if (a === b) continue;
      Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc)), 'ag');
    }
  }
  agTuru(yazarlar, 11);
}

/** Fikstür: 20 sahnelik senaryo — sahne başına ~10 blok. */
function tohumBelge(n = 420) {
  const doc = new Y.Doc();
  const bs = bloklar(n);
  setScript(doc, { name: 'ortak', blocks: bs });
  return { tohum: Y.encodeStateAsUpdate(doc), bloklar: bs };
}

describe('TEST 5a — 5 yazar, ÇAKIŞMAYAN sahneler', () => {
  it('kimse kimsenin sahnesini ezmiyor; her katkı TAM BİR KEZ yaşıyor', () => {
    const { tohum, bloklar: bs } = tohumBelge();
    const yazarlar = ['A', 'B', 'C', 'D', 'E'].map((ad) => yazarKur(ad, tohum));

    /* Her yazar KENDİ sahne kuşağını yeniden yazıyor: 5 yazar × 12 blok.
       Bölge seçimi sabit ve ayrık — çakışma bir sonraki testin konusu. */
    const bolgeler = yazarlar.map((_, i) => bs.slice(i * 40 + 5, i * 40 + 17));
    const YAZIM = 12;

    for (let tur = 0; tur < YAZIM; tur++) {
      yazarlar.forEach((y, i) => {
        const hedef = bolgeler[i][tur];
        y.view.dispatch(
          y.view.state.tr.insertText(`<${y.ad}${tur}>`, metinBasi(y.view, hedef.id)),
        );
      });
      /* Her turda ağ karışıyor: yazımlar birbirinin üstüne SIRASIZ gidiyor. */
      agTuru(yazarlar, 1000 + tur);
    }
    yakinsat(yazarlar);

    const referans = readScript(yazarlar[0].doc).blocks;
    /* 1) Bütün yazarlar AYNI belgeye vardı. */
    for (const y of yazarlar.slice(1)) {
      expect(readScript(y.doc).blocks.map((b) => b.text), `${y.ad} ıraksadı`)
        .toEqual(referans.map((b) => b.text));
    }
    /* 2) Blok sayısı ve kimlikler DEĞİŞMEDİ — birleşme blok uydurmadı. */
    expect(referans).toHaveLength(bs.length);
    expect(referans.map((b) => b.id)).toEqual(bs.map((b) => b.id));
    expect(new Set(referans.map((b) => b.id)).size).toBe(bs.length);

    /* 3) Her katkı TAM BİR KEZ. Sayıyı ölçmek şart: bir tarafın diğerini
          ezmesi de, birleşmenin katkıyı ÇİFTLEMESİ de burada yakalanır. */
    const tumMetin = referans.map((b) => b.text).join('\n');
    for (const y of yazarlar) {
      for (let tur = 0; tur < YAZIM; tur++) {
        const im = `<${y.ad}${tur}>`;
        const kac = tumMetin.split(im).length - 1;
        expect(kac, `${im} ${kac} kez geçiyor`).toBe(1);
      }
    }

    /* 4) HİÇ DOKUNULMAYAN bloklar birebir eski hâlinde: "farklı sahneyi
          düzenleyen biri ötekinin yazdığını eziyor mu" sorusunun doğrudan
          karşılığı. */
    const dokunulan = new Set(bolgeler.flat().map((b) => b.id));
    for (const [i, b] of referans.entries()) {
      if (dokunulan.has(b.id)) continue;
      expect(b.text, `dokunulmayan blok ${b.id} değişti`).toBe(bs[i].text);
    }

    for (const y of yazarlar) y.view.destroy();
  }, 600_000);
});

describe('TEST 5b — 3 yazar, AYNI bloğa aynı anda', () => {
  it('üç katkı da karakter düzeyinde birleşiyor, hiçbiri ezilmiyor', () => {
    const { tohum, bloklar: bs } = tohumBelge(120);
    const yazarlar = ['A', 'B', 'C'].map((ad) => yazarKur(ad, tohum));
    /* Metni uzun bir aksiyon bloğu seçiliyor: üç yazar ÜÇ AYRI konuma
       yazsın diye. Aynı konuma yazmak da geçerli ama orada sıralama
       CRDT'nin keyfî ama TUTARLI kararıdır; "ezilme" oradan ölçülmez. */
    const hedef = bs.find((b) => b.type === 'action' && b.text.length > 80)!;
    const govde = hedef.text;

    const konumlar = [0, Math.floor(govde.length / 2), govde.length];
    yazarlar.forEach((y, i) => {
      y.view.dispatch(
        y.view.state.tr.insertText(`[${y.ad}]`, metinBasi(y.view, hedef.id) + konumlar[i]),
      );
    });
    yakinsat(yazarlar);

    const sonuc = readScript(yazarlar[0].doc).blocks.find((b) => b.id === hedef.id)!.text;
    /* TAM DİZGİ: gövde bir kez, üç im kendi yerinde. `toContain` üçlüsü,
       gövdenin ikiye katlandığı bir birleşmeyi de yeşil gösterirdi. */
    expect(sonuc).toBe(
      `[A]${govde.slice(0, konumlar[1])}[B]${govde.slice(konumlar[1])}[C]`,
    );
    for (const y of yazarlar.slice(1)) {
      expect(readScript(y.doc).blocks.find((b) => b.id === hedef.id)!.text).toBe(sonuc);
    }
    for (const y of yazarlar) y.view.destroy();
  }, 600_000);
});

describe('TEST 5c — kopma: çevrimdışı yazıp sonra bağlanma', () => {
  it('çevrimdışı yazarın 30 düzenlemesi bağlanınca EKSİKSİZ geliyor', () => {
    const { tohum, bloklar: bs } = tohumBelge(420);
    const yazarlar = ['A', 'B', 'C', 'D'].map((ad) => yazarKur(ad, tohum));
    const kopan = yazarlar[3];

    // Önce herkes bir tur yazıyor, ağ sağlıklı.
    yazarlar.forEach((y, i) => {
      y.view.dispatch(y.view.state.tr.insertText(`(${y.ad}0)`, metinBasi(y.view, bs[i * 30 + 3].id)));
    });
    agTuru(yazarlar, 1);

    // D kopuyor. Kalanlar yazmaya devam.
    kopan.cevrimici = false;
    for (let tur = 1; tur <= 20; tur++) {
      yazarlar.slice(0, 3).forEach((y, i) => {
        y.view.dispatch(
          y.view.state.tr.insertText(`(${y.ad}${tur})`, metinBasi(y.view, bs[i * 30 + 3 + tur].id)),
        );
      });
      // D de yazıyor — ama kimse görmüyor.
      kopan.view.dispatch(
        kopan.view.state.tr.insertText(`(D${tur})`, metinBasi(kopan.view, bs[200 + tur].id)),
      );
      agTuru(yazarlar, 2000 + tur);
    }
    // D on düzenleme daha yapıyor: toplam 30 çevrimdışı yazım.
    for (let tur = 21; tur <= 30; tur++) {
      kopan.view.dispatch(
        kopan.view.state.tr.insertText(`(D${tur})`, metinBasi(kopan.view, bs[200 + tur].id)),
      );
    }

    /* ÖN KOŞUL: kopma GERÇEKTEN oldu — D'nin yazdığı ötekilerde YOK. */
    const kopukkenA = readScript(yazarlar[0].doc).blocks.map((b) => b.text).join('\n');
    expect(kopukkenA).not.toContain('(D30)');
    expect(kopukkenA).not.toContain('(D5)');

    yakinsat(yazarlar);

    const referans = readScript(yazarlar[0].doc).blocks;
    for (const y of yazarlar.slice(1)) {
      expect(readScript(y.doc).blocks.map((b) => b.text), `${y.ad} ıraksadı`)
        .toEqual(referans.map((b) => b.text));
    }
    const tumMetin = referans.map((b) => b.text).join('\n');
    // D'nin 30 çevrimdışı yazımının HEPSİ, tam birer kez.
    for (let tur = 1; tur <= 30; tur++) {
      expect(tumMetin.split(`(D${tur})`).length - 1, `(D${tur}) eksik/çift`).toBe(1);
    }
    // Kopma sırasında ötekilerin yazdıkları da yerinde.
    for (const ad of ['A', 'B', 'C']) {
      for (let tur = 0; tur <= 20; tur++) {
        expect(tumMetin.split(`(${ad}${tur})`).length - 1, `(${ad}${tur})`).toBe(1);
      }
    }
    expect(referans.map((b) => b.id)).toEqual(bs.map((b) => b.id));

    for (const y of yazarlar) y.view.destroy();
  }, 600_000);
});

describe('TEST 5d — uzak değişim yerel kimlikleri BOZMUYOR (Karar 33)', () => {
  it('5 yazarın 60 turluk yazımından sonra hiçbir blok kimliği yinelenmiyor', () => {
    const { tohum, bloklar: bs } = tohumBelge(210);
    const yazarlar = ['A', 'B', 'C', 'D', 'E'].map((ad) => yazarKur(ad, tohum));

    for (let tur = 0; tur < 60; tur++) {
      const y = yazarlar[tur % yazarlar.length];
      y.view.dispatch(
        y.view.state.tr.insertText('.', metinBasi(y.view, bs[(tur * 3) % bs.length].id)),
      );
      if (tur % 3 === 0) agTuru(yazarlar, 3000 + tur);
    }
    yakinsat(yazarlar);

    for (const y of yazarlar) {
      /* HAM fragment'ten okunuyor: `readScript` → `docToBloklar` yinelenen
         kimliği OKUMA yolunda onarıyor (Karar 10) ve onarılmış listeye
         bakmak, deponun gerçekten bozulup bozulmadığını gizlerdi. */
      const kimlikler: string[] = [];
      senaryoFragment(y.doc).forEach((n) => {
        kimlikler.push((n as Y.XmlElement).getAttribute('id') ?? '');
      });
      expect(kimlikler, `${y.ad} blok sayısı değişti`).toHaveLength(bs.length);
      expect(new Set(kimlikler).size, `${y.ad} yinelenen kimlik üretti`).toBe(bs.length);
      expect(kimlikler).toEqual(bs.map((b) => b.id));
    }
    for (const y of yazarlar) y.view.destroy();
  }, 600_000);
});
