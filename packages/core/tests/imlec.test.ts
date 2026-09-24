// @vitest-environment jsdom
import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPluginKey } from 'y-prosemirror';
import { setScript } from '@storyboard/core/doc/mutations';
import { blokDokunusuDinle, blokDokunusuSifirla } from '@storyboard/core/veri/blok-dokunus';
import { senaryoSemasi } from '@storyboard/core/editor/sema';
import { senaryoEklentileri } from '@storyboard/core/editor/bag';
import {
  DUZENLEME_ALANI,
  SERIT_ANAHTARI,
  SERIT_SOLMA_MS,
  SERIT_SURESI_MS,
  SECIM_OPAKLIGI,
  imlecCizici,
  secimCizici,
  seritleriTopla,
  type SeritGecmisi,
} from '@storyboard/core/editor/imlec';
import { SABIT_SAYFA_CSS, blokKurallari, profilOlustur } from '@storyboard/core/format';
import { DOKUMAN_TIPLERI } from '@storyboard/core/model/dokuman-tipi';
import {
  ETIKET_YAZISI,
  USER_COLORS,
  VARSAYILAN_RENK,
  colorForUser,
} from '@storyboard/core/util/color';
import type { ScriptBlock } from '@storyboard/core/model/script';

/* ── KONTRAST ÖLÇÜMÜ ──────────────────────────────────────────────────
   WCAG 2.1'in göreli parlaklık ve kontrast oranı formülü. Palet "iyi
   görünüyor" diye değil, ÖLÇÜLEREK kabul ediliyor: burada hesaplanan sayı
   bir renk değiştiğinde kendiliğinden değişir ve eşiği geçemezse test
   kırılır. Sayıyı yoruma yazmak, yorumun bayatlamasına izin vermek olurdu. */

/** Ekranda gerçekten kullanılan renkler (`apps/web/src/styles.css`). */
const KAGIT = '#f7f5f0';
const KOYU_KABUK = '#0a0c0e';
const KAGIT_MUREKKEBI = '#1c1a17';

function kanallar(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Alti haneli renk bekleniyordu: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function parlaklik(hex: string): number {
  const [r, g, b] = kanallar(hex).map((k) => {
    const o = k / 255;
    return o <= 0.03928 ? o / 12.92 : Math.pow((o + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function kontrast(a: string, b: string): number {
  const x = parlaklik(a);
  const y = parlaklik(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Yarı saydam bir rengin zemin üzerindeki GÖRÜNEN karşılığı. */
function karistir(on: string, arka: string, alfa: number): string {
  const o = kanallar(on);
  const a = kanallar(arka);
  return '#' + o
    .map((v, i) => Math.round(v * alfa + a[i] * (1 - alfa)).toString(16).padStart(2, '0'))
    .join('');
}

describe('yazar paleti ÖLÇÜLEN kontrastı tutturuyor', () => {
  it('her renk kremimsi kağıttan da koyu kabuktan da en az 3:1 ayrılıyor', () => {
    /* 3:1 — WCAG 1.4.11 (metin olmayan içerik). İmleç çizgisi ve düzenleme
       şeridi birer grafik nesne: hiçbir yazı taşımıyorlar, tek işleri
       zeminden ayrılmak. İki yüzey birden çünkü aynı renk hem senaryo
       kağıdında (imleç, şerit) hem panonun koyu zemininde (CursorLayer)
       çiziliyor. */
    for (const renk of USER_COLORS) {
      expect(kontrast(renk, KAGIT), `${renk} kağıtta`).toBeGreaterThanOrEqual(3);
      expect(kontrast(renk, KOYU_KABUK), `${renk} koyu kabukta`).toBeGreaterThanOrEqual(3);
    }
  });

  it('ad etiketinin YAZISI her renk üstünde en az 4,5:1', () => {
    /* 4,5:1 — WCAG 1.4.3 (küçük metin). Etiket bir kişi adı taşıyor, yani
       OKUNMASI gerekiyor; grafik nesne eşiği burada yetmez. Tek bir yazı
       rengi kuralı var (`ETIKET_YAZISI`); sekiz rengin hepsi onu taşımalı. */
    for (const renk of USER_COLORS) {
      expect(kontrast(ETIKET_YAZISI, renk), `${renk} üstünde etiket yazısı`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  it('seçim zemini altındaki senaryo metnini okunur bırakıyor', () => {
    for (const renk of USER_COLORS) {
      const zemin = karistir(renk, KAGIT, SECIM_OPAKLIGI);
      expect(kontrast(KAGIT_MUREKKEBI, zemin), `${renk} seçimi altında metin`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  it('renkler birbirinden ayırt edilebiliyor — iki yazar aynı rengi almıyor', () => {
    expect(new Set(USER_COLORS).size).toBe(USER_COLORS.length);
    /* Yalnız EŞSİZ olmaları yetmez: 1 kanal farkla iki "farklı" renk ekranda
       aynıdır. En yakın çift bile gözle ayrılacak kadar uzak olmalı. */
    for (let i = 0; i < USER_COLORS.length; i++) {
      for (let j = i + 1; j < USER_COLORS.length; j++) {
        const a = kanallar(USER_COLORS[i]);
        const b = kanallar(USER_COLORS[j]);
        const uzaklik = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        expect(uzaklik, `${USER_COLORS[i]} ↔ ${USER_COLORS[j]}`).toBeGreaterThan(48);
      }
    }
  });
});

describe('renk kullanıcıdan TÜRETİLİYOR', () => {
  it('aynı kimlik her çağrıda aynı rengi alıyor', () => {
    const bir = colorForUser('kul_ayse');
    expect(colorForUser('kul_ayse')).toBe(bir);
    expect(USER_COLORS).toContain(bir);
  });

  it('kimliksiz kullanım varsayılan renge düşüyor — tek yazıcı hâli', () => {
    expect(colorForUser('')).toBe(VARSAYILAN_RENK);
    expect(USER_COLORS).toContain(VARSAYILAN_RENK);
  });

  it('farklı kimlikler paleti gerçekten dağıtıyor', () => {
    const kimlikler = Array.from({ length: 40 }, (_, i) => `kul_${i}`);
    const renkler = new Set(kimlikler.map(colorForUser));
    /* Tek renge çöken bir karma (örneğin `return USER_COLORS[0]`) burada
       yakalanıyor: kırk kullanıcı en az yarım paleti doldurmalı. */
    expect(renkler.size).toBeGreaterThanOrEqual(USER_COLORS.length / 2);
  });
});

/* ── DÜZENLEME ŞERİDİ ─────────────────────────────────────────────── */

const UZAK = 42;
const uzakDurum = (
  blokIdler: readonly string[] | unknown, sira: number, renk: unknown = '#de5747',
) =>
  new Map<number, Record<string, unknown>>([
    [UZAK, { user: { color: renk }, [DUZENLEME_ALANI]: { blokIdler, sira } }],
  ]);

describe('şerit süresi YEREL saatle ölçülüyor', () => {
  const BASLANGIC = 1_000_000;

  it('süre KULLANICININ seçtiği dört saniye', () => {
    /* Sayı burada AÇIKÇA yazılı: aşağıdaki testler sabiti kullandığı için
       değeri değiştiren bir düzenleme onlardan sessizce geçerdi. */
    expect(SERIT_SURESI_MS).toBe(4000);
    expect(SERIT_SOLMA_MS).toBeLessThan(SERIT_SURESI_MS);
  });

  it('yeni işaret tam parlaklıkta başlıyor ve sönmeye dört saniye kalıyor', () => {
    const s = seritleriTopla(uzakDurum(['sb_1'], 1), 7, new Map(), BASLANGIC);
    expect(s.seritler).toEqual([
      { clientId: UZAK, blokId: 'sb_1', renk: '#de5747', solan: false },
    ]);
    expect(s.sonrakiUyanma).toBe(SERIT_SURESI_MS);
  });

  it('dört saniye dolunca şerit SÖNÜYOR, hemen kaybolmuyor', () => {
    const ilk = seritleriTopla(uzakDurum(['sb_1'], 1), 7, new Map(), BASLANGIC);
    const sonra = seritleriTopla(
      uzakDurum(['sb_1'], 1), 7, ilk.gecmis, BASLANGIC + SERIT_SURESI_MS,
    );
    expect(sonra.seritler[0].solan).toBe(true);
    expect(sonra.sonrakiUyanma).toBe(SERIT_SOLMA_MS);
  });

  it('solma da bitince şerit düşüyor ve uyanma istenmiyor', () => {
    const ilk = seritleriTopla(uzakDurum(['sb_1'], 1), 7, new Map(), BASLANGIC);
    const bitis = seritleriTopla(
      uzakDurum(['sb_1'], 1), 7, ilk.gecmis,
      BASLANGIC + SERIT_SURESI_MS + SERIT_SOLMA_MS,
    );
    expect(bitis.seritler).toEqual([]);
    expect(bitis.sonrakiUyanma).toBeNull();
  });

  it('aynı bloğa yeniden yazınca kronometre baştan başlıyor', () => {
    const ilk = seritleriTopla(uzakDurum(['sb_1'], 1), 7, new Map(), BASLANGIC);
    const yeniden = seritleriTopla(
      uzakDurum(['sb_1'], 2), 7, ilk.gecmis, BASLANGIC + SERIT_SURESI_MS,
    );
    expect(yeniden.seritler[0].solan).toBe(false);
  });

  it('uzak saatin ne dediği hiç sorulmuyor — payload zaman taşımıyor', () => {
    /* Uzak istemci saatini bir yıl ileri kursa bile şerit yine dört saniye
       yaşamalı: süreyi ölçen tek saat YEREL saat. İşaretin içine kasten
       çılgın bir zaman damgası konuyor; sonucu değiştirmemeli. */
    const zehirli = new Map<number, Record<string, unknown>>([
      [UZAK, {
        user: { color: '#de5747' },
        [DUZENLEME_ALANI]: { blokIdler: ['sb_1'], sira: 1, zaman: BASLANGIC + 31_536_000_000 },
      }],
    ]);
    const ilk = seritleriTopla(zehirli, 7, new Map(), BASLANGIC);
    const sonra = seritleriTopla(zehirli, 7, ilk.gecmis, BASLANGIC + SERIT_SURESI_MS);
    expect(sonra.seritler[0].solan).toBe(true);
  });

  it('kendi şeridini çizmiyor', () => {
    const s = seritleriTopla(uzakDurum(['sb_1'], 1), UZAK, new Map(), BASLANGIC);
    expect(s.seritler).toEqual([]);
  });

  it('işareti olmayan katılımcı şerit üretmiyor', () => {
    const durumlar = new Map<number, Record<string, unknown>>([
      [UZAK, { user: { color: '#de5747' } }],
    ]);
    expect(seritleriTopla(durumlar, 7, new Map(), BASLANGIC).seritler).toEqual([]);
  });

  it('bozuk uzak yük çökertmiyor, yalnız o şeridi düşürüyor', () => {
    /* Uzak yük GÜVEN SINIRI: dizi değil, sayı dizisi, boş dizge… hiçbiri
       şerit katmanını devirmemeli. */
    for (const kotu of [5, 'sb_1', null, [], [''], [7], {}]) {
      expect(seritleriTopla(uzakDurum(kotu, 1), 7, new Map(), BASLANGIC).seritler).toEqual([]);
    }
  });

  it('tek işaret birden çok satırı işaretleyebiliyor — yapıştırma', () => {
    const s = seritleriTopla(uzakDurum(['sb_1', 'sb_2', 'sb_3'], 1), 7, new Map(), BASLANGIC);
    expect(s.seritler.map((x) => x.blokId)).toEqual(['sb_1', 'sb_2', 'sb_3']);
  });
});

describe('uzaktan gelen renk GÜVEN SINIRI', () => {
  const gecerliMi = (deger: unknown) =>
    seritleriTopla(uzakDurum(['sb_1'], 1, deger), 7, new Map(), 1000).seritler[0].renk;

  it('CSS enjeksiyonu denemesi varsayılana düşüyor', () => {
    expect(gecerliMi('red;background:url(https://kotu/x.png)')).toBe(VARSAYILAN_RENK);
  });

  it('altı haneli olmayan her değer varsayılana düşüyor', () => {
    for (const kotu of ['#fff', 'red', '', null, 42, { r: 1 }]) {
      expect(gecerliMi(kotu)).toBe(VARSAYILAN_RENK);
    }
  });

  it('geçerli altı haneli renk olduğu gibi geçiyor', () => {
    expect(gecerliMi('#0A0b0C')).toBe('#0A0b0C');
  });
});

/* ── EKLENTİ ──────────────────────────────────────────────────────── */

const blok = (id: string, text: string): ScriptBlock =>
  ({ id, fp: '', type: 'action', text, scene: '1', sceneId: 'sc_1' });

const SENARYO = { name: 'deneme', blocks: [blok('sb_1', 'Ayşe girer.'), blok('sb_2', 'Ali kalkar.')] };
const SESSIZ = { undo: () => {}, redo: () => {} };

function kurulum() {
  const doc = new Y.Doc();
  setScript(doc, SENARYO);
  const awareness = new Awareness(doc);
  awareness.setLocalStateField('user', { name: 'Yerel', color: '#4a86d8' });
  const yer = document.createElement('div');
  document.body.appendChild(yer);
  const view = new EditorView(yer, {
    /* `ScriptEditor`'daki kapının AYNISI. `y-prosemirror` 1.3.7 awareness
       değişimini bir sonraki tura erteliyor ve o turda görünüm yok edilmiş
       olabilir; koruma olmadan test de üretim de çöker. */
    dispatchTransaction(this: EditorView, tr) {
      if (this.isDestroyed) return;
      this.updateState(this.state.apply(tr));
    },
    state: EditorState.create({
      schema: senaryoSemasi,
      plugins: senaryoEklentileri(
        doc, profilOlustur('amerikan', 'letter', 'tr'), SESSIZ,
        DOKUMAN_TIPLERI.senaryo, awareness,
      ),
    }),
  });
  return { doc, awareness, view };
}

/** Bloğun metin başlangıcının belgedeki mutlak konumu. */
function metinBasi(view: EditorView, id: string): number {
  let bulunan = -1;
  view.state.doc.forEach((n, ofset) => { if (n.attrs.id === id) bulunan = ofset + 1; });
  if (bulunan < 0) throw new Error(`blok yok: ${id}`);
  return bulunan;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('yerel düzenleme awareness ile yayımlanıyor, belgeye yazılmıyor', () => {
  it('yazılan bloğun kimliği awareness alanına düşüyor', () => {
    const { awareness, view } = kurulum();
    view.dispatch(view.state.tr.insertText('x', metinBasi(view, 'sb_2')));
    /* İMLEÇ HÂLÂ BİRİNCİ BLOKTA: `insertText` seçimi taşımıyor. İşaret yine
       de sb_2 demeli — düzenlenen satır, imlecin bulunduğu satır değildir.
       İlk yazışım imlece bakıyordu ve tam burada KIRMIZI verdi. */
    expect(view.state.selection.from).toBeLessThan(metinBasi(view, 'sb_2'));
    expect(awareness.getLocalState()?.[DUZENLEME_ALANI])
      .toMatchObject({ blokIdler: ['sb_2'] });
    view.destroy();
  });

  it('birden çok satıra dokunan tek işlem hepsini işaretliyor', () => {
    const { awareness, view } = kurulum();
    const bas = metinBasi(view, 'sb_1');
    const son = metinBasi(view, 'sb_2') + 1;
    view.dispatch(view.state.tr.insertText('Z', bas, son));
    const isaret = awareness.getLocalState()?.[DUZENLEME_ALANI] as { blokIdler: string[] };
    expect(isaret.blokIdler).toContain('sb_1');
    view.destroy();
  });

  it('UZAK kaynaklı değişim yerel işaret saymıyor', () => {
    /* Kritik: `ySyncPlugin` uzak güncellemeyi de yerel bir işlem olarak
       uyguluyor. Süzme kalkarsa istemci başkasının yazdığı satırı KENDİ
       düzenlemesi diye yayımlar ve şerit yanlış yazara boyanır. */
    const { view } = kurulum();
    const once = SERIT_ANAHTARI.getState(view.state)?.yerel ?? null;
    view.dispatch(
      view.state.tr
        .insertText('x', metinBasi(view, 'sb_1'))
        .setMeta(ySyncPluginKey, { isChangeOrigin: true }),
    );
    expect(SERIT_ANAHTARI.getState(view.state)?.yerel).toEqual(once);
    view.destroy();
  });

  it('şerit BELGEYE hiç girmiyor — Yjs metni yalnız yazılanı taşıyor', () => {
    const { doc, view } = kurulum();
    view.dispatch(view.state.tr.insertText('x', metinBasi(view, 'sb_2')));
    const ham = JSON.stringify(doc.getMap('project').toJSON());
    expect(ham).not.toContain(DUZENLEME_ALANI);
    expect(ham).not.toContain('mzn-serit');
    view.destroy();
  });

  it('görünüm kapanınca işaret siliniyor — kağıtta asılı şerit kalmıyor', () => {
    const { awareness, view } = kurulum();
    view.dispatch(view.state.tr.insertText('x', metinBasi(view, 'sb_2')));
    view.destroy();
    expect(awareness.getLocalState()?.[DUZENLEME_ALANI]).toBeNull();
  });

  it('yazarken kapanan editör, ertelenmiş işlem geldiğinde çökmüyor', () => {
    /* `y-prosemirror` 1.3.7'nin `updateMetas`'ı korumasını `isDestroyed`
       alanına dayıyor ve o alan pakette hiç yok — yani ertelenen işlem yok
       edilmiş görünüme ULAŞIYOR. Kapı `dispatchTransaction`'da. */
    vi.useFakeTimers();
    const { awareness, view } = kurulum();
    awareness.setLocalStateField('user', { name: 'Yerel', color: '#3f9e5f' });
    view.destroy();
    expect(() => vi.advanceTimersByTime(10)).not.toThrow();
  });
});

describe('uzak şerit kağıtta çiziliyor ve dört saniyede sönüyor', () => {
  it('uzak işaret geldiği bloğu işaretliyor, süre dolunca söner ve düşer', () => {
    vi.useFakeTimers();
    const { awareness, view } = kurulum();

    /* İkinci bir istemcinin awareness'ı: sunucu olmadan aynı yolu izliyoruz —
       uzak durum kodlanıp yerel awareness'a uygulanıyor, yani ağdan geldiği
       gibi. Doğrudan iç haritaya yazmak, protokolü atlayan sahte bir test
       olurdu. */
    const uzakDoc = new Y.Doc();
    const uzakAw = new Awareness(uzakDoc);
    uzakAw.setLocalStateField('user', { name: 'Uzak', color: '#de5747' });
    uzakAw.setLocalStateField(DUZENLEME_ALANI, { blokIdler: ['sb_2'], sira: 1 });
    applyAwarenessUpdate(awareness, encodeAwarenessUpdate(uzakAw, [uzakDoc.clientID]), 'test');

    const seritli = () => view.dom.querySelector('.mzn-serit');
    expect(seritli()).not.toBeNull();
    expect(seritli()!.getAttribute('data-serit-solan')).toBeNull();
    /* Doğru bloğa: uzak yazar ikinci bloğa dokundu, birincisi temiz kalmalı. */
    expect(view.dom.children[0].classList.contains('mzn-serit')).toBe(false);
    expect(view.dom.children[1].classList.contains('mzn-serit')).toBe(true);

    vi.advanceTimersByTime(SERIT_SURESI_MS);
    expect(seritli()?.getAttribute('data-serit-solan')).toBe('evet');

    vi.advanceTimersByTime(SERIT_SOLMA_MS);
    expect(seritli()).toBeNull();

    view.destroy();
  });
});

describe('imleç DOM üretimi', () => {
  it('ad etiketi imlecin üstünde, akışa genişlik eklemeyen bir kökte', () => {
    const el = imlecCizici({ name: 'Ayşe', color: '#de5747' });
    expect(el.className).toBe('mzn-imlec');
    expect(el.style.getPropertyValue('--imlec-renk')).toBe('#de5747');
    const etiket = el.querySelector('.mzn-imlec-ad');
    expect(etiket?.textContent).toBe('Ayşe');
    /* Kök yalnız etiketi taşıyor: çizgi CSS'te `::before`, yani DOM'da hiç
       düğüm yok ve akışta hiç yer kaplamıyor. */
    expect(el.childNodes.length).toBe(1);
  });

  it('uzak ad METİN olarak yazılıyor — kağıda işaretleme enjekte edilemiyor', () => {
    const el = imlecCizici({ name: '<img src=x onerror=alert(1)>', color: '#de5747' });
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.mzn-imlec-ad')?.textContent)
      .toBe('<img src=x onerror=alert(1)>');
  });

  it('adsız ve renksiz uzak kullanıcı çökertmiyor', () => {
    const el = imlecCizici({});
    expect(el.querySelector('.mzn-imlec-ad')?.textContent).toBe('Konuk');
    expect(el.style.getPropertyValue('--imlec-renk')).toBe(VARSAYILAN_RENK);
  });

  it('seçim zemini aynı rengin solgunu', () => {
    expect(secimCizici({ color: '#de5747' })).toEqual({
      class: 'mzn-secim',
      style: `background-color:rgba(222, 87, 71, ${SECIM_OPAKLIGI})`,
    });
  });
});

describe('şerit CSS kuralları tek evden geliyor', () => {
  it('sönme süresi eklentideki sayıyla AYNI', () => {
    /* İki sayı ayrışırsa: CSS daha uzunsa şerit sönmeden kaybolur, daha
       kısaysa görünmez bir çizgi kağıtta asılı kalır. */
    expect(SABIT_SAYFA_CSS).toContain(`transition:opacity ${SERIT_SOLMA_MS}ms`);
    expect(SABIT_SAYFA_CSS).toContain('.mzn-serit[data-serit-solan]::after{opacity:0;}');
  });

  it('ad etiketinin yazı rengi PALETİN evinden geliyor', () => {
    /* CSS ayrı bir onaltılık yazsaydı, kontrast testi bir rengi ölçer,
       ekran başka bir rengi çizerdi. */
    expect(SABIT_SAYFA_CSS).toContain(`color:${ETIKET_YAZISI};`);
  });

  it('şerit her blok tipinde KAĞIDIN sol marjına oturuyor', () => {
    const css = blokKurallari(profilOlustur('amerikan', 'letter', 'tr'));
    /* Diyalog en girintili blok; sabit bir `left` yazılsaydı şerit onda
       sayfanın ortasına kayardı. Kural bloğun KENDİ girintisini geri
       çıkarıyor, yani her tipte aynı yere düşüyor. */
    expect(css).toContain(
      '.senaryo-metin [data-tip="dialogue"].mzn-serit::after{'
      + 'left:calc(-1 * var(--sayfa-sol) - var(--girinti-dialogue) + var(--birim));}',
    );
    expect(css).toContain(
      '.senaryo-metin [data-tip="scene"].mzn-serit::after{'
      + 'left:calc(-1 * var(--sayfa-sol) - var(--girinti-scene) + var(--birim));}',
    );
  });
});

describe('tek yazıcı hiçbir imleç eklentisi taşımıyor', () => {
  it('awareness verilmezse eklenti sayısı artmıyor', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    const profil = profilOlustur('amerikan', 'letter', 'tr');
    const yalniz = senaryoEklentileri(doc, profil, SESSIZ, DOKUMAN_TIPLERI.senaryo);
    const ortak = senaryoEklentileri(
      doc, profil, SESSIZ, DOKUMAN_TIPLERI.senaryo, new Awareness(doc),
    );
    expect(ortak.length).toBe(yalniz.length + 2);
  });
});

/* `SeritGecmisi` tipinin dışa açık kaldığını derleyiciye söyler. */
const _tip: SeritGecmisi = { imza: 'sb_1:1', baslangic: 0 };
void _tip;

describe('yazarlık kanalı — dokunulan bloklar bildiriliyor', () => {
  /* Bu testin varlık sebebi somut bir hata: yazarlık günlüğünün deposu,
     sorgusu ve testleri yazıldı ama editörden gelen "hangi bloklara
     dokunuldu" bildirimi HİÇ BAĞLANMADI. Dosyalar yazılıyor, sorgu hep
     null dönüyor ve hiçbir test kırmızıya dönmüyordu. Kanal artık
     bağlantısız kalırsa buradan kırılır. */
  afterEach(() => blokDokunusuSifirla());

  it('yerel yazım dokunulan bloğu bildiriyor', () => {
    const yayinlar: string[][] = [];
    blokDokunusuDinle((idler) => yayinlar.push([...idler]));
    const { view } = kurulum();

    const hedef = SENARYO.blocks[1].id;
    view.dispatch(view.state.tr.insertText('x', metinBasi(view, hedef)));

    expect(yayinlar.flat()).toContain(hedef);
    view.destroy();
  });

  it('UZAK değişim bildirilmiyor — başkasının yazdığı bize yazılmaz', () => {
    /* Süzgeç kalksaydı her istemci ortak çalışanın satırını KENDİ
       düzenlemesi diye kaydeder ve yazarlık günlüğü yanlış isim gösterirdi. */
    const yayinlar: string[][] = [];
    const { view } = kurulum();
    blokDokunusuDinle((idler) => yayinlar.push([...idler]));

    const hedef = SENARYO.blocks[1].id;
    view.dispatch(
      view.state.tr
        .insertText('u', metinBasi(view, hedef))
        .setMeta(ySyncPluginKey, { isChangeOrigin: true }),
    );

    expect(yayinlar.flat()).not.toContain(hedef);
    view.destroy();
  });
});
