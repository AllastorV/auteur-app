// @vitest-environment jsdom
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { readScript } from '@storyboard/core/doc/schema';
import { setScript } from '@storyboard/core/doc/mutations';
import { senaryoSemasi } from '@storyboard/core/editor/sema';
import { senaryoEklentileri } from '@storyboard/core/editor/bag';
import { presetKomutu, presetKisayollari } from '@storyboard/core/editor/preset';
import { profilOlustur } from '@storyboard/core/format/profil';
import { DOKUMAN_TIPLERI } from '@storyboard/core/model/dokuman-tipi';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * YAZIM PRESETİ KISAYOLLARI — Ctrl+1..9 (§16.3).
 *
 * Bu kısayollar var olmadan önce bir bloğun tipini DEĞİŞTİRMENİN HİÇBİR YOLU
 * yoktu: araç çubuğundaki açılır liste yalnız gösteriyordu, Enter ise
 * `splitBlock` ile önceki bloğun tipini kopyalıyordu. Yani klavyeyle senaryo
 * yazmak mümkün değildi.
 */

const blok = (id: string, type: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id, fp: '', type, text, scene: '1', sceneId: 'sc_1' });

const SENARYO = {
  name: 'deneme',
  blocks: [
    blok('sb_1', 'action', 'Ayşe pencereyi açar.'),
    blok('sb_2', 'action', 'Rüzgâr perdeyi savurur.'),
    blok('sb_3', 'action', 'Kapı çarpar.'),
  ],
};

const SESSIZ = { undo: () => {}, redo: () => {} };

function gorunum(doc: Y.Doc, tip = DOKUMAN_TIPLERI.senaryo): EditorView {
  const yer = document.createElement('div');
  document.body.appendChild(yer);
  return new EditorView(yer, {
    state: EditorState.create({
      schema: senaryoSemasi,
      plugins: senaryoEklentileri(doc, profilOlustur('amerikan', 'letter', 'tr'), SESSIZ, tip),
    }),
  });
}

/** Bloğun metin başlangıcının belge içindeki mutlak konumu. */
function metinBasi(view: EditorView, id: string): number {
  let bulunan = -1;
  view.state.doc.forEach((n, offset) => { if (n.attrs.id === id) bulunan = offset + 1; });
  if (bulunan < 0) throw new Error('blok yok: ' + id);
  return bulunan;
}

function imleciKoy(view: EditorView, id: string) {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, metinBasi(view, id))));
}

function seciminiKur(view: EditorView, bas: string, son: string) {
  const a = metinBasi(view, bas);
  const b = metinBasi(view, son);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, a, b)));
}

/** Ctrl+<rakam> tuşunu görünüme gönderir; işlendi mi döner. */
function ctrlRakam(view: EditorView, rakam: number): boolean {
  const ev = new KeyboardEvent('keydown', {
    key: String(rakam), code: 'Digit' + rakam, keyCode: 48 + rakam,
    ctrlKey: true, bubbles: true, cancelable: true,
  });
  return view.someProp('handleKeyDown', (f) => f(view, ev)) ?? false;
}

const tipler = (doc: Y.Doc) => readScript(doc).blocks.map((b) => b.type);

describe('Ctrl+rakam yazım presetini uyguluyor', () => {
  it('imleçteki bloğun tipini değiştiriyor ve DEPOYA yazıyor', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    const view = gorunum(doc);
    imleciKoy(view, 'sb_2');

    /* Senaryoda sıra: 1 sahne · 2 aksiyon · 3 karakter · 4 parantez ·
       5 diyalog · 6 geçiş. */
    expect(ctrlRakam(view, 3)).toBe(true);

    /* İddia DEPODAN okunuyor, `view.state`'ten değil: `setNodeAttribute`
       ProseMirror'da çalışıp Yjs'e geçmeseydi ekranda doğru görünür ama
       kaydedilmez, ortak yazara ulaşmazdı.

       YALNIZ İMLEÇTEKİ BLOK değişiyor: canlı otomatik algılama kullanıcı
       kararıyla kaldırıldı (2026-08-26) — tahmin eden bir editör, tahmini
       yanlış olduğunda kullanıcının yazdığını geri alıyordu. */
    expect(tipler(doc)).toEqual(['action', 'character', 'action']);
    view.destroy();
  });

  it('metni DEĞİŞTİRMİYOR — yalnız tip', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    const view = gorunum(doc);
    imleciKoy(view, 'sb_1');
    ctrlRakam(view, 5);
    expect(readScript(doc).blocks.map((b) => b.text)).toEqual([
      'Ayşe pencereyi açar.', 'Rüzgâr perdeyi savurur.', 'Kapı çarpar.',
    ]);
    view.destroy();
  });

  it('blok KİMLİĞİ yaşıyor — panel bağları kopmuyor', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    const view = gorunum(doc);
    imleciKoy(view, 'sb_2');
    ctrlRakam(view, 6);
    expect(readScript(doc).blocks.map((b) => b.id)).toEqual(['sb_1', 'sb_2', 'sb_3']);
    view.destroy();
  });

  it('seçimdeki TÜM blokları çeviriyor', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    const view = gorunum(doc);
    seciminiKur(view, 'sb_1', 'sb_3');
    ctrlRakam(view, 5);
    expect(tipler(doc)).toEqual(['dialogue', 'dialogue', 'dialogue']);
    view.destroy();
  });

  /* Kesişim koşulunun İKİ yarısı da ölçülüyor — `son > from` ve `offset < to`.
     Yalnız aşağıdaki seçim yazılsaydı `offset < to` tek başına da doğru
     sonucu verirdi ve üst sınırı düşüren mutant hayatta kalırdı. */
  it('seçimden SONRAKİ bloğa dokunmuyor', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    const view = gorunum(doc);
    seciminiKur(view, 'sb_1', 'sb_2');
    ctrlRakam(view, 5);
    expect(tipler(doc)).toEqual(['dialogue', 'dialogue', 'action']);
    view.destroy();
  });

  it('seçimden ÖNCEKİ bloğa dokunmuyor', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    const view = gorunum(doc);
    seciminiKur(view, 'sb_2', 'sb_3');
    ctrlRakam(view, 5);
    expect(tipler(doc)).toEqual(['action', 'dialogue', 'dialogue']);
    view.destroy();
  });
});

describe('numara sırası DOKÜMAN TİPİNDEN geliyor', () => {
  /* Aynı rakam farklı belgede farklı preset: numara `DokumanTipi.bloklar`
     sırasını izliyor. Sabit bir tablo yazılsaydı roman yazarına anlamsız bir
     "karakter" preseti verilirdi. */
  it('romanda Ctrl+3 diyalog, senaryoda karakter', () => {
    const senaryoDoc = new Y.Doc();
    setScript(senaryoDoc, SENARYO);
    const s = gorunum(senaryoDoc);
    imleciKoy(s, 'sb_1');
    ctrlRakam(s, 3);
    expect(tipler(senaryoDoc)[0]).toBe('character');
    s.destroy();

    const romanDoc = new Y.Doc();
    setScript(romanDoc, SENARYO);
    const r = gorunum(romanDoc, DOKUMAN_TIPLERI.roman);
    imleciKoy(r, 'sb_1');
    ctrlRakam(r, 3);
    expect(tipler(romanDoc)[0]).toBe('dialogue');
    r.destroy();
  });

  it('bağlar tam olarak blok sayısı kadar ve SIRAYLA', () => {
    const baglar = presetKisayollari(DOKUMAN_TIPLERI.roman.bloklar);
    expect(Object.keys(baglar)).toEqual(['Mod-1', 'Mod-2', 'Mod-3']);
  });

  it('listede olmayan rakam SESSİZ — yanlış presete düşmüyor', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    /* Romanda üç blok var; Ctrl+4 bağlı değil. */
    const view = gorunum(doc, DOKUMAN_TIPLERI.roman);
    imleciKoy(view, 'sb_1');
    expect(ctrlRakam(view, 4)).toBe(false);
    expect(tipler(doc)).toEqual(['action', 'action', 'action']);
    view.destroy();
  });

  it('dokuzdan fazla blok numaralanmıyor — Ctrl+10 diye bir tuş yok', () => {
    const uzun = ['scene', 'action', 'character', 'parenthetical', 'dialogue',
      'transition', 'bolum', 'paragraf', 'ses', 'muzik'] as const;
    const baglar = presetKisayollari(uzun);
    expect(Object.keys(baglar)).toHaveLength(9);
    expect(baglar['Mod-9']).toBeDefined();
  });
});

describe('boşa işlem üretmiyor', () => {
  /* Tuş zaten o tipteyken `true` dönseydi geri-al yığınına hiçbir şeyi
     değiştirmeyen bir adım girer, Ctrl+Z bir kez boşa basılırdı. */
  it('blok zaten o tipteyse komut false dönüyor', () => {
    const doc = new Y.Doc();
    setScript(doc, { name: 'x', blocks: [blok('sb_1', 'dialogue', 'Merhaba.')] });
    const view = gorunum(doc);
    imleciKoy(view, 'sb_1');
    /* Boş bir işlem geri-al yığınına girmemeli: Ctrl+Z bir kez boşa
       basılırdı. */
    expect(ctrlRakam(view, 5)).toBe(false);
    view.destroy();
  });

  it('seçimin bir kısmı zaten o tipteyse KALANI yine de çeviriyor', () => {
    const doc = new Y.Doc();
    setScript(doc, {
      name: 'x',
      blocks: [blok('sb_1', 'dialogue', 'A'), blok('sb_2', 'action', 'B')],
    });
    const view = gorunum(doc);
    seciminiKur(view, 'sb_1', 'sb_2');
    expect(ctrlRakam(view, 5)).toBe(true);
    expect(tipler(doc)).toEqual(['dialogue', 'dialogue']);
    view.destroy();
  });

  it('dispatch verilmeden çağırmak belgeyi DEĞİŞTİRMİYOR', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    const view = gorunum(doc);
    imleciKoy(view, 'sb_1');
    expect(presetKomutu('character')(view.state, undefined, view)).toBe(true);
    expect(tipler(doc)).toEqual(['action', 'action', 'action']);
    view.destroy();
  });
});
