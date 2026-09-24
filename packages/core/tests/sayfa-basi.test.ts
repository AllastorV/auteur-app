import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { ScriptBlock } from '@storyboard/core/model/script';
import { profilOlustur } from '@storyboard/core/format/profil';
import { sayfala } from '@storyboard/core/format/sayfala';
import { bloklarToDoc, docToBloklar, senaryoSemasi } from '@storyboard/core/editor/sema';
import { sayfaBasiKomutu } from '@storyboard/core/editor/sayfa-basi';
import JSZip from 'jszip';
import { docxYaz } from '@storyboard/core/disa/docx';
import { createDoc, docToProject } from '@storyboard/core/doc/schema';
import { setScript } from '@storyboard/core/doc/mutations';
import { createProject } from '@storyboard/core/model/factory';
import { migrateProject, packProject, unpackProject } from '@storyboard/core/model/project-io';

/**
 * ELLE SAYFA BAŞI (Ctrl+Enter) — kullanıcı isteği 2026-08-30:
 * "kullanıcı worddeki gibi sayfa sonu tuşuna basıp diyince sonrasına oto
 * boş bir sayfa eklesin".
 *
 * Bayrak ALTI katmandan geçiyor ve her katman ayrı bir sessiz kayıp
 * noktası: sayfalayıcı → ekran, ProseMirror şeması → Yjs deposu → proje
 * dosyası → PDF/DOCX. Beşi de burada sınanıyor çünkü aradaki herhangi bir
 * beyaz liste unutulduğunda hata "işaret koydum, kayıt ettim, açtım, yok"
 * biçiminde görünür — yani kullanıcının emeğini yiyen sınıftan.
 *
 * Senaryo metni üretilmiştir.
 */

const profil = profilOlustur('amerikan', 'a4', 'tr');

const blok = (id: string, text: string, yeniSayfada?: boolean): ScriptBlock =>
  ({ id, fp: id, type: 'action', text, scene: '1', sceneId: 'sc_1', yeniSayfada });

describe('sayfala — elle sayfa başı', () => {
  it('işaretli blok yeni sayfanın ilk satırında başlar', () => {
    const bloklar = [blok('sb_a', 'Bir.'), blok('sb_b', 'Iki.'), blok('sb_c', 'Uc.', true)];
    const sayfalar = sayfala(bloklar, profil);
    expect(sayfalar).toHaveLength(2);
    expect(sayfalar[0].satirlar).toHaveLength(3); // Bir. + ayırıcı + Iki.
    expect(sayfalar[1].satirlar[0].blockId).toBe('sb_c');
    /* MUTASYON KAPISI: bayrak olmadan aynı bloklar TEK sayfa. Sayfayı
       çeviren şey gerçekten bayrak; test sayfa sayısını başka bir
       sebepten okumuyor. */
    expect(sayfala(bloklar.map((b) => ({ ...b, yeniSayfada: undefined })), profil))
      .toHaveLength(1);
  });

  it('senaryonun ilk bloğu işaretliyse boş sayfa üretmez', () => {
    const sayfalar = sayfala([blok('sb_a', 'Bir.', true)], profil);
    expect(sayfalar).toHaveLength(1);
    expect(sayfalar[0].satirlar).toHaveLength(1);
  });

  /* "PROFİL BAYRAĞI HÂLÂ ÇALIŞIYOR" testi BURADA DEĞİL, `sayfala.test.ts`te:
     oradaki üç `yeniSayfada` testi `||` yerine `&&` yazılırsa kırmızıya
     döner (blok bayrağı `undefined` olduğu için). Aynı kuralı ikinci kez
     sınamak, iki testin birlikte bakımını gerektirirdi (Karar 2). */
});

describe('sayfaBasiKomutu', () => {
  const durum = (bloklar: readonly ScriptBlock[], imlecBlok: number) => {
    const doc = bloklarToDoc(bloklar);
    let konum = 0;
    for (let i = 0; i < imlecBlok; i++) konum += doc.child(i).nodeSize;
    return EditorState.create({
      schema: senaryoSemasi,
      doc,
      selection: TextSelection.create(doc, konum + 1),
    });
  };

  const isaretli = (state: EditorState) =>
    docToBloklar(state.doc).bloklar.filter((b) => b.yeniSayfada).map((b) => b.id);

  it('imleçteki bloğa işaret koyar, ikinci basışta kaldırır', () => {
    const bloklar = [blok('sb_a', 'Bir.'), blok('sb_b', 'Iki.')];
    let state = durum(bloklar, 1);
    expect(sayfaBasiKomutu(state, (tr) => { state = state.apply(tr); })).toBe(true);
    expect(isaretli(state)).toEqual(['sb_b']);

    expect(sayfaBasiKomutu(state, (tr) => { state = state.apply(tr); })).toBe(true);
    expect(isaretli(state)).toEqual([]);
  });

  it('ilk bloğa işaret koymaz — orada sayfa çevirecek bir şey yok', () => {
    const state = durum([blok('sb_a', 'Bir.'), blok('sb_b', 'Iki.')], 0);
    /* `false` dönmek ÖNEMLİ: keymap tuşu yutmasın, boş bir işlem geri-al
       yığınına girmesin. */
    expect(sayfaBasiKomutu(state, () => { throw new Error('dispatch olmamalıydı'); }))
      .toBe(false);
  });

  it('seçim birden çok bloğa dokunuyorsa hepsini birden değiştirir', () => {
    const bloklar = [blok('sb_a', 'Bir.'), blok('sb_b', 'Iki.'), blok('sb_c', 'Uc.')];
    const doc = bloklarToDoc(bloklar);
    let state = EditorState.create({
      schema: senaryoSemasi,
      doc,
      selection: TextSelection.create(doc, doc.child(0).nodeSize + 1, doc.content.size - 1),
    });
    sayfaBasiKomutu(state, (tr) => { state = state.apply(tr); });
    expect(isaretli(state)).toEqual(['sb_b', 'sb_c']);
  });
});

describe('sayfa başı kalıcılığı', () => {
  it('Yjs deposuna yazılıp geri okunuyor', () => {
    /* `bloklariFragmenteYaz` ve `fragmentToPmDoc` iki AYRI beyaz liste
       tutuyor; birine eklenip diğerine eklenmeyen attribute sessizce
       düşer (dosyadaki `elleSabit` notu tam bu hatanın kaydı). */
    const doc = createDoc(createProject({ panels: [] }));
    setScript(doc, { name: 'S', blocks: [blok('sb_a', 'Bir.'), blok('sb_b', 'Iki.', true)] });
    const geri = docToProject(doc);
    expect(geri.script.blocks.map((b) => b.yeniSayfada)).toEqual([undefined, true]);
    doc.destroy();
  });

  it('.sbp dosyasına yazılıp geri okunuyor', async () => {
    const project = createProject({ panels: [] });
    project.script = { name: 'S', blocks: [blok('sb_a', 'Bir.'), blok('sb_b', 'Iki.', true)] };
    const geri = await unpackProject(await packProject({ project, assets: {} }));
    expect(geri.project.script.blocks[1].yeniSayfada).toBe(true);
    expect(geri.project.script.blocks[0].yeniSayfada).toBeUndefined();
  });

  it('dosyadan gelen bozuk değer sayfa çevirmez', () => {
    /* GÜVEN SINIRI: dosya ortak çalışandan gelebilir. `'1'`, `1`, `'evet'`
       gibi "doğruya benzeyen" değerler sessizce sayfa açmamalı. */
    const geri = migrateProject({
      script: { name: 'S', blocks: [
        { id: 'sb_a', type: 'action', text: 'Bir.', yeniSayfada: 'evet' },
        { id: 'sb_b', type: 'action', text: 'Iki.', yeniSayfada: 1 },
        { id: 'sb_c', type: 'action', text: 'Uc.', yeniSayfada: true },
      ] },
    });
    expect(geri.script.blocks.map((b) => b.yeniSayfada))
      .toEqual([undefined, undefined, true]);
  });
});

describe('sayfa başı dışa aktarımda', () => {
  it('DOCX çıktısına pageBreakBefore olarak geçiyor', async () => {
    const bayt = await docxYaz([blok('sb_a', 'Bir.'), blok('sb_b', 'Iki.', true)], profil);
    const zip = await JSZip.loadAsync(bayt);
    const xml = await zip.file('word/document.xml')!.async('string');
    /* TAM SAYI: iki bloktan YALNIZ biri işaretli. `toContain` bir tane
       varken de, ikisi de kırılmışken de geçerdi. */
    expect(xml.match(/<w:pageBreakBefore\/>/g) ?? []).toHaveLength(1);
  });
});
