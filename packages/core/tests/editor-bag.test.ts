// @vitest-environment jsdom
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { readScript, senaryoFragment } from '@storyboard/core/doc/schema';
import { setScript, linkPanelScript } from '@storyboard/core/doc/mutations';
import { senaryoSemasi } from '@storyboard/core/editor/sema';
import { senaryoEklentileri } from '@storyboard/core/editor/bag';
import { profilOlustur } from '@storyboard/core/format/profil';
import { DOKUMAN_TIPLERI } from '@storyboard/core/model/dokuman-tipi';
import type { ScriptBlock } from '@storyboard/core/model/script';

const blok = (id: string, type: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id, fp: '', type, text, scene: '1', sceneId: 'sc_1' });

const SENARYO = {
  name: 'deneme',
  blocks: [
    blok('sb_1', 'scene', 'İÇ. MUTFAK - GECE'),
    blok('sb_2', 'action', 'Ayşe pencereyi açar.'),
  ],
};

const SESSIZ = { undo: () => {}, redo: () => {} };

function gorunum(doc: Y.Doc, komutlar = SESSIZ): EditorView {
  const yer = document.createElement('div');
  document.body.appendChild(yer);
  return new EditorView(yer, {
    state: EditorState.create({ schema: senaryoSemasi, plugins: senaryoEklentileri(doc, profilOlustur('amerikan', 'letter', 'tr'), komutlar, DOKUMAN_TIPLERI.senaryo) }),
  });
}

/** Bloğun METİN başlangıcının belge içindeki mutlak konumu. */
function metinBasi(view: EditorView, id: string): number {
  let bulunan = -1;
  view.state.doc.forEach((n, offset) => { if (n.attrs.id === id) bulunan = offset + 1; });
  if (bulunan < 0) throw new Error(`blok yok: ${id}`);
  return bulunan;
}

/* Kimlik iddiaları HAM fragment'ten okunur, `readScript`'ten DEĞİL.
   `readScript` → `docToBloklar` OKUMA yolunda yinelenen kimliği zaten onarıyor
   (Karar 10): yazma yolunun onarımını sökmek testi kırmazdı, çünkü okuma yolu
   arkadan toparlıyor. Ölçülmek istenen DEPODAKİ kimlik. */
const hamIdler = (doc: Y.Doc): unknown[] =>
  senaryoFragment(doc).toArray().map((el) => (el as Y.XmlElement).getAttribute('id'));
const metinler = (doc: Y.Doc) => readScript(doc).blocks.map((b) => b.text);

describe('F1b-2 BİTİŞ KRİTERİ — aynı blokta eşzamanlı düzenleme metin kaybetmiyor', () => {
  it('İKİ YAZAR AYNI BLOĞA YAZARSA İKİ KATKI DA YAŞAR', () => {
    const a = new Y.Doc();
    setScript(a, SENARYO);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    const ga = gorunum(a);
    const gb = gorunum(b);
    // ÖN KOŞUL: bağ kurulmuş, iki görünüm de aynı metni görüyor.
    expect(ga.state.doc.textBetween(metinBasi(ga, 'sb_2'), metinBasi(ga, 'sb_2') + 20))
      .toBe('Ayşe pencereyi açar.');
    expect(gb.state.doc.childCount).toBe(2);

    // A bloğun BAŞINA, B SONUNA yazar — aynı blok, farklı konum.
    const uzunluk = SENARYO.blocks[1].text.length;
    ga.dispatch(ga.state.tr.insertText('[A] ', metinBasi(ga, 'sb_2')));
    gb.dispatch(gb.state.tr.insertText(' [B]', metinBasi(gb, 'sb_2') + uzunluk));

    // İki yönlü senkron.
    const guncelA = Y.encodeStateAsUpdate(a);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, guncelA);

    /* İddia TAM DİZGİ, `toContain` değil: blok düzeyinde birleşmede taraflardan
       biri bütünüyle kazanır ve gövde yine "içerir" testini geçerdi. Karakter
       düzeyinde birleşmenin tek kanıtı iki eklemenin de KENDİ konumunda
       durması ve gövdenin bir kez bulunması. */
    const sonA = readScript(a).blocks[1].text;
    expect(sonA).toBe('[A] Ayşe pencereyi açar. [B]');
    expect(readScript(a).blocks).toHaveLength(2);
    // İki istemci AYNI sonuca varır.
    expect(readScript(b).blocks[1].text).toBe(sonA);
    ga.destroy(); gb.destroy();
  });
});

describe('yazma yolunun kimlik güvencesi (Karar 32)', () => {
  it('ENTER yeni bloğa TAZE kimlik verir — ilk yarı kimliğini korur', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    const g = gorunum(doc);
    const bas = metinBasi(g, 'sb_2');
    // "Ayşe " ile "pencereyi açar." arasından böl.
    g.dispatch(g.state.tr.split(bas + 5));

    const son = hamIdler(doc);
    expect(son).toHaveLength(3);
    expect(son[0]).toBe('sb_1');
    // İlk yarı kimliği KORUR (Karar 10'un yönü), yeni kimlik ikinci yarıya gider.
    expect(son[1]).toBe('sb_2');
    expect(son[2]).not.toBe('sb_2');
    expect(son[2]).toMatch(/^sb_/);
    expect(new Set(son).size).toBe(3);
    expect(metinler(doc)).toEqual(['İÇ. MUTFAK - GECE', 'Ayşe ', 'pencereyi açar.']);
    g.destroy();
  });

  it('bölünen bloğun PANEL BAĞI ilk yarıda kalır', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    const panelId = readScript(doc) && 'pnl_test';
    linkPanelScript(doc, panelId, ['sb_2']);
    const g = gorunum(doc);
    g.dispatch(g.state.tr.split(metinBasi(g, 'sb_2') + 5));
    // Bağ hâlâ 'sb_2'ye bakıyor ve 'sb_2' hâlâ ilk yarı.
    expect(hamIdler(doc)[1]).toBe('sb_2');
    expect(hamIdler(doc)[2]).not.toBe('sb_2');
    expect(metinler(doc)[1]).toBe('Ayşe ');
    g.destroy();
  });

  it('YAPIŞTIRILAN yinelenen kimlik onarılır', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    const g = gorunum(doc);
    // Var olan bloğun kopyası belgeye eklenir — kes/yapıştırın ürettiği durum.
    const kopya = g.state.doc.child(1);
    g.dispatch(g.state.tr.insert(g.state.doc.content.size, kopya));

    const son = hamIdler(doc);
    expect(son).toHaveLength(3);
    // DEPODA yineleme kalmamalı; okuma yolunun onarımı bunu maskeler.
    expect(new Set(son).size).toBe(3);
    expect(son[1]).toBe('sb_2');
    expect(metinler(doc)[2]).toBe('Ayşe pencereyi açar.');
    g.destroy();
  });

  it('UZAK değişimde onarım KOŞMAZ — iki istemci ıraksamaz (Karar 33)', () => {
    const a = new Y.Doc();
    setScript(a, SENARYO);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const ga = gorunum(a);
    const gb = gorunum(b);

    /* B'nin deposuna YİNELENEN kimlikli bir blok girer — eski sürümlü bir
       istemci ya da onarım öncesi yazılmış bir belge. A bunu UZAK olarak alır.
       Kurulum kasıtlı olarak görünüm ÜZERİNDEN değil, ham Yjs'ten: yerel
       onarımın hiç dokunmadığı bir kimlik gerekiyor. */
    const yinelenen = new Y.XmlElement('blok');
    yinelenen.setAttribute('id', 'sb_2');
    yinelenen.setAttribute('tip', 'action');
    yinelenen.setAttribute('scene', '1');
    yinelenen.setAttribute('sceneId', 'sc_1');
    yinelenen.insert(0, [new Y.XmlText('Uzaktan geldi.')]);
    senaryoFragment(b).insert(2, [yinelenen]);
    // ÖN KOŞUL: B'nin deposunda gerçekten yineleme var.
    expect(hamIdler(b).filter((x) => x === 'sb_2')).toHaveLength(2);

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));

    /* ASIL İDDİA — ÖLÇÜLDÜ: koruma olmadan onarım uzak girdide koşar ve PM
       durumunu depodan ANINDA ayırır (ölçüm: PM `["sb_1","TAZE_0"]` iken depo
       `["sb_1","sb_1"]`). `y-prosemirror` uzak kaynaklı işlemde PM→Y geri
       yazımını atladığı için depo o an sağlam görünür; ayrışma bir SONRAKİ
       yerel düzenlemede depoya boşalır. Bu yüzden iddia depoya değil,
       PM durumu ile depo arasındaki EŞİTLİĞE bakar. */
    expect(ga.state.doc.children.map((n) => n.attrs.id)).toEqual(hamIdler(a));
    expect(hamIdler(a)).toEqual(hamIdler(b));
    expect(hamIdler(a).filter((x) => x === 'sb_2')).toHaveLength(2);

    /* Ayrışma olsaydı ilk yerel düzenleme onu depoya yazar ve A ile B farklı
       kimliklerle ıraksardı. */
    ga.dispatch(ga.state.tr.insertText('x', metinBasi(ga, 'sb_1')));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(hamIdler(a)).toEqual(hamIdler(b));
    // Okuma yolu yine de kullanıcıya çakışmasız liste veriyor.
    expect(new Set(readScript(a).blocks.map((x) => x.id)).size).toBe(3);
    ga.destroy(); gb.destroy();
  });
});

describe('geri alma klavye yolunu da kapsar', () => {
  it('görünümden yazılan metin mağazanın UndoManager’ıyla geri alınır', async () => {
    const { useProjectStore } = await import('@storyboard/core/store/project');
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    useProjectStore.getState().attachDoc(doc, 'owner');
    const { undoManager } = useProjectStore.getState();
    const g = gorunum(doc, { undo: () => undoManager.undo(), redo: () => undoManager.redo() });

    g.dispatch(g.state.tr.insertText('YENİ ', metinBasi(g, 'sb_2')));
    expect(readScript(doc).blocks[1].text).toBe('YENİ Ayşe pencereyi açar.');
    // ÖN KOŞUL: yığına gerçekten bir adım düştü.
    expect(undoManager.canUndo()).toBe(true);

    undoManager.undo();
    expect(readScript(doc).blocks[1].text).toBe('Ayşe pencereyi açar.');
    // Fragment kökü de geri döndü, yalnız state değil.
    expect(senaryoFragment(doc).length).toBe(2);
    g.destroy();
  });
});
