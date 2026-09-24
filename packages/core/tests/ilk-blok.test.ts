// @vitest-environment jsdom
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { readScript } from '@storyboard/core/doc/schema';
import { setScript } from '@storyboard/core/doc/mutations';
import { senaryoSemasi } from '@storyboard/core/editor/sema';
import { senaryoEklentileri } from '@storyboard/core/editor/bag';
import { tipProfili } from '@storyboard/core/format/profil';
import { DOKUMAN_TIPLERI } from '@storyboard/core/model/dokuman-tipi';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * BOŞ BELGEDE YAZILACAK BİR BLOK VAR (gerçek hata, 2026-08-26).
 *
 * Kullanıcının bildirimi: "yazı yazamıyorum, kısayol tetiklenip sayfalar
 * arası geçiyor." İki belirti tek nedenin sonucuydu — yeni bir projede
 * belgede HİÇ blok yoktu, yani tıklanacak, imleç konacak, yazılacak bir yer
 * yoktu. Tuşlar editöre değil pencereye düşüyor ve genel kısayollar
 * tetikleniyordu.
 *
 * `bosMu` bu dosyada zaten duruyordu ve "ilk bloğu üretmek çağıranın işi"
 * diyordu; ÖLÇÜLDÜ: hiçbir çağıran yoktu. Sözleşmeyi yorumda bırakmak,
 * hiç yazmamakla aynı şey.
 */

const SESSIZ = { undo: () => {}, redo: () => {} };

function gorunum(
  doc: Y.Doc,
  tip = DOKUMAN_TIPLERI.senaryo,
  duzenlenebilir = true,
): EditorView {
  const yer = document.createElement('div');
  document.body.appendChild(yer);
  return new EditorView(yer, {
    state: EditorState.create({
      schema: senaryoSemasi,
      /* Profil TİPTEN türetiliyor, üretimdeki gibi: ikisi ayrışırsa
         sayfalayıcı "Profilde tanımsız blok tipi" diye AÇIKÇA fırlıyor —
         bu testi ilk yazışımda tam olarak öyle fırladı. */
      plugins: senaryoEklentileri(doc, tipProfili(tip.id, 'letter', 'tr'), SESSIZ, tip),
    }),
    editable: () => duzenlenebilir,
  });
}

const blok = (id: string, type: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id, fp: '', type, text, scene: '', sceneId: '' });

describe('boş belge yazılabilir açılıyor', () => {
  it('hiç blok yokken TEK bir blok üretiliyor', () => {
    const doc = new Y.Doc();
    const view = gorunum(doc);
    expect(view.state.doc.childCount, 'yazılacak bir yer olmalı').toBe(1);
    view.destroy();
  });

  it('üretilen blok DEPOYA yazılıyor — ekranda görünüp kaybolmuyor', () => {
    const doc = new Y.Doc();
    const view = gorunum(doc);
    const bloklar = readScript(doc).blocks;
    expect(bloklar).toHaveLength(1);
    expect(bloklar[0]!.text).toBe('');
    view.destroy();
  });

  /* Kimlik ZORUNLU (§5.2): kimliksiz blok panel bağlarının bağlanacağı
     sahte bir çapa olurdu ve `docToBloklar` onu onarım kaydıyla karşılardı. */
  it('üretilen bloğun kimliği var', () => {
    const doc = new Y.Doc();
    const view = gorunum(doc);
    expect(readScript(doc).blocks[0]!.id).toMatch(/^sb_/);
    view.destroy();
  });

  it('tipi doküman tipinin VARSAYILAN bloğu — senaryoda aksiyon', () => {
    const doc = new Y.Doc();
    const view = gorunum(doc);
    expect(readScript(doc).blocks[0]!.type).toBe('action');
    view.destroy();
  });

  /* Romanda `action` diye bir blok YOK; sabit bir tip yazılsaydı sayfalayıcı
     tanımsız blokla karşılaşıp AÇIKÇA fırlardı — yani yeni bir roman hiç
     açılamazdı. */
  it('romanda paragraf, çizgi romanda kare', () => {
    const roman = new Y.Doc();
    const r = gorunum(roman, DOKUMAN_TIPLERI.roman);
    expect(readScript(roman).blocks[0]!.type).toBe('paragraf');
    r.destroy();

    const cizgi = new Y.Doc();
    const c = gorunum(cizgi, DOKUMAN_TIPLERI['cizgi-roman']);
    expect(readScript(cizgi).blocks[0]!.type).toBe('kare');
    c.destroy();
  });

  it('dolu belgeye FAZLADAN blok eklemiyor', () => {
    const doc = new Y.Doc();
    setScript(doc, { name: 'x', blocks: [blok('sb_1', 'action', 'Var olan satır.')] });
    const view = gorunum(doc);
    expect(readScript(doc).blocks.map((b) => b.text)).toEqual(['Var olan satır.']);
    view.destroy();
  });

  /* Kullanıcı her şeyi silerse editör yine yazılamaz hâle gelirdi. Aynı ev
     iki durumu da kapatıyor; "yeni proje" özel durumu diye ayrı bir yol
     açılsaydı bu ikincisi açıkta kalırdı. */
  it('belge SONRADAN boşalırsa blok geri geliyor', () => {
    const doc = new Y.Doc();
    setScript(doc, { name: 'x', blocks: [blok('sb_1', 'action', 'Silinecek.')] });
    const view = gorunum(doc);
    view.dispatch(view.state.tr.delete(0, view.state.doc.content.size));
    expect(view.state.doc.childCount, 'boşalan belge yine yazılabilir olmalı').toBe(1);
    view.destroy();
  });

  /* SALT OKUR ROL BELGEYE YAZMAZ: bir izleyici projeyi AÇMAKLA onu
     değiştirmiş olamaz — hem yetki ihlali hem de ortak çalışanların
     belgesine sessizce boş satır sokmak olurdu. */
  it('salt okur rolde blok ÜRETİLMİYOR', () => {
    const doc = new Y.Doc();
    const view = gorunum(doc, DOKUMAN_TIPLERI.senaryo, false);
    expect(view.state.doc.childCount).toBe(0);
    expect(readScript(doc).blocks).toHaveLength(0);
    view.destroy();
  });
});
