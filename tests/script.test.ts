import { describe, expect, it } from 'vitest';
import { duzYaz } from '@storyboard/core/disa/duz';
import * as Y from 'yjs';
import {
  createDoc,
  docToProject,
  metaMap,
  panelsArray,
  readScript,
  scriptMap,
  senaryoFragment,
} from '@storyboard/core/doc/schema';
import * as M from '@storyboard/core/doc/mutations';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { packProject, unpackProject, migrateProject } from '@storyboard/core/model/project-io';
import {
  metaFromBlocks,
  parseFountain,
  parseScript,
  scriptLinkIndex,
} from '@storyboard/core/model/script';

const SENARYO = [
  'Başlık: Şehrin Perdeleri',
  'Yazan: Cavas',
  '',
  'İÇ. ESKİ APARTMAN - KORİDOR - GECE',
  '',
  'Loş bir koridor. Duvarda nemden kabarmış bir afiş.',
  '',
  'AYŞE',
  '(fısıltıyla)',
  'Kimse yok, emin misin?',
  '',
  'KEMAL',
  'Emin değilim.',
  '',
  'DIŞ. SOKAK - GECE',
  '',
  'Yağmur başlar.',
  '',
  'KES:',
].join('\n');

describe('Fountain ayrıştırma', () => {
  it('blok türlerini ve sahne numaralarını doğru çıkarır', () => {
    const blocks = parseFountain(SENARYO);
    expect(blocks.map((b) => b.type)).toEqual([
      'scene',
      'action',
      'character',
      'parenthetical',
      'dialogue',
      'character',
      'dialogue',
      'scene',
      'action',
      'transition',
    ]);
    // Başlık sayfası bloklara girmez.
    expect(blocks.some((b) => b.text.includes('Şehrin Perdeleri'))).toBe(false);
    // Türkçe İÇ./DIŞ. sahne başlıkları tanınır ve sahne sayacı ilerler.
    expect(blocks[0].scene).toBe('1');
    expect(blocks.find((b) => b.text.startsWith('DIŞ.'))?.scene).toBe('2');
    expect(blocks[4].scene).toBe('1');
  });

  it('düz metni aksiyon satırlarına indirger', () => {
    const blocks = parseFountain('bir adam yürüyor\n\nsonra durur');
    expect(blocks.map((b) => b.type)).toEqual(['action', 'action']);
  });

  it('sahne numarası #12# biçiminde verilmişse onu kullanır', () => {
    const blocks = parseFountain('INT. EV - GÜN #12#\n\nBir şeyler olur.');
    expect(blocks[0].scene).toBe('12');
    expect(blocks[0].text).toBe('INT. EV - GÜN');
  });
});

describe('Blok kimlikleri', () => {
  it('kalıcıdır — her ayrıştırma yeni kimlik üretir', () => {
    const a = parseFountain(SENARYO).map((b) => b.id);
    const b = parseFountain(SENARYO).map((b) => b.id);
    expect(a).not.toEqual(b);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });

  it('parmak izi içerikten türer — aynı senaryo aynı parmak izlerini verir', () => {
    const a = parseFountain(SENARYO).map((b) => b.fp);
    const b = parseFountain(SENARYO).map((b) => b.fp);
    expect(a).toEqual(b);
  });

  it('tekrar eden satırlara ayrı parmak izi verir', () => {
    const blocks = parseFountain('Kapı çalar.\n\nKapı çalar.');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].fp).not.toBe(blocks[1].fp);
    expect(blocks[0].id).not.toBe(blocks[1].id);
  });

  it('her blok bir sahne kimliği taşır ve aynı sahnedekiler paylaşır', () => {
    const blocks = parseFountain(SENARYO);
    for (const b of blocks) expect(b.sceneId).toMatch(/^sc_/);

    // Aynı sahnedekiler paylaşır.
    const ilkSahne = blocks[0].sceneId;
    expect(blocks[1].sceneId).toBe(ilkSahne);

    // Yeni sahne başlığı yeni bir kimlik açar; ardından gelenler onu paylaşır.
    const ikinciSahne = blocks.find((b) => b.text.startsWith('DIŞ.'))!;
    expect(ikinciSahne.sceneId).not.toBe(ilkSahne);
    expect(blocks[8].sceneId).toBe(ikinciSahne.sceneId);

    // Hiçbir iki sahne başlığı aynı kimliği taşımaz.
    const sahneBaslari = blocks.filter((b) => b.type === 'scene');
    expect(new Set(sahneBaslari.map((b) => b.sceneId)).size).toBe(sahneBaslari.length);
  });
});

describe('Panel ↔ senaryo bağlama', () => {
  function fixture() {
    const project = createProject({ panels: [createPanel(), createPanel()] });
    const doc = createDoc(project);
    const script = parseScript('senaryo.fountain', SENARYO);
    M.setScript(doc, script);
    return { doc, script, panels: project.panels };
  }

  it('bağlar, birleştirir ve koparır', () => {
    const { doc, script, panels } = fixture();
    const [b0, b1] = script.blocks;

    M.linkPanelScript(doc, panels[0].id, [b0.id]);
    M.linkPanelScript(doc, panels[0].id, [b1.id, b0.id]);
    expect(docToProject(doc).panels[0].scriptRefs).toEqual([b0.id, b1.id]);

    M.unlinkPanelScript(doc, panels[0].id, [b0.id]);
    expect(docToProject(doc).panels[0].scriptRefs).toEqual([b1.id]);
  });

  it('bir satır birden çok panele bağlanabilir (aynı an, farklı açı)', () => {
    const { doc, script, panels } = fixture();
    const beat = script.blocks[1].id;
    M.linkPanelScript(doc, panels[0].id, [beat]);
    M.linkPanelScript(doc, panels[1].id, [beat]);
    const index = scriptLinkIndex(docToProject(doc).panels);
    expect(index.get(beat)).toEqual([panels[0].id, panels[1].id]);
  });

  it('panel çoğaltılınca senaryo bağlantısı kopyaya taşınır', () => {
    const { doc, script, panels } = fixture();
    M.linkPanelScript(doc, panels[0].id, [script.blocks[0].id]);
    const copyId = M.duplicatePanel(doc, panels[0].id);
    const copy = docToProject(doc).panels.find((p) => p.id === copyId);
    expect(copy?.scriptRefs).toEqual([script.blocks[0].id]);
  });

  it('senaryo revize edilince değişen satırın bağlantısı da korunur', () => {
    const { doc, script, panels } = fixture();
    const sahne = script.blocks[0];   // "İÇ. ESKİ APARTMAN..."
    const replik = script.blocks[4];  // "Kimse yok, emin misin?"
    M.linkPanelScript(doc, panels[0].id, [sahne.id, replik.id]);

    // Yalnızca replik değiştirilip senaryo yeniden yükleniyor.
    const revize = parseScript(
      'senaryo.fountain',
      SENARYO.replace('Kimse yok, emin misin?', 'Kimse var mı?'),
    );
    M.setScript(doc, revize);

    const refs = docToProject(doc).panels[0].scriptRefs;
    expect(refs).toContain(sahne.id);   // sahne başlığı aynı kaldı
    expect(refs).toContain(replik.id);  // replik değişti ama kimlik yaşıyor

    const blocks = docToProject(doc).script.blocks;
    expect(blocks.find((b) => b.id === replik.id)?.text).toBe('Kimse var mı?');
  });

  it('silinen bloğun bağlantısı düşer', () => {
    const { doc, script, panels } = fixture();
    const replik = script.blocks[4];
    M.linkPanelScript(doc, panels[0].id, [replik.id]);

    const kisa = parseScript(
      'senaryo.fountain',
      SENARYO.replace('Kimse yok, emin misin?', ''),
    );
    M.setScript(doc, kisa);

    expect(docToProject(doc).panels[0].scriptRefs).not.toContain(replik.id);
    // Kimlik başka bir bloğa devredilmiş de olmamalı — hizalama silinmiş bloğu
    // diriltirse bağ sessizce yanlış satıra kayardı.
    expect(docToProject(doc).script.blocks.some((b) => b.id === replik.id)).toBe(false);
  });

  it('senaryo içe aktarımı geri alınabilir', () => {
    const { doc, script, panels } = fixture();
    const bagliBlok = script.blocks[4].id;
    M.linkPanelScript(doc, panels[0].id, [bagliBlok]);

    // Üretimdeki `attachUndo` (`store/project.ts`) beş kökü izler ve
    // `captureTimeout: 400` kullanır; burada `setScript`in dokunduğu üç kök ve
    // anlık yakalama yeterli. Ortak olan tek şart: yalnızca LOCAL_ORIGIN
    // izlenir. `setScript` bu origin'i düşürürse yanlış dosya seçen kullanıcı
    // senaryosunu geri alamaz.
    const undoManager = new Y.UndoManager(
      [metaMap(doc), scriptMap(doc), senaryoFragment(doc), panelsArray(doc)],
      { trackedOrigins: new Set([M.LOCAL_ORIGIN]), captureTimeout: 0 },
    );

    M.setScript(doc, parseScript('yanlis.fountain', 'Yanlış dosya seçildi.'));
    expect(readScript(doc).name).toBe('yanlis.fountain');
    expect(docToProject(doc).panels[0].scriptRefs).toEqual([]); // bağ budandı

    expect(undoManager.canUndo()).toBe(true);
    undoManager.undo();
    expect(readScript(doc).name).toBe('senaryo.fountain');
    expect(readScript(doc).blocks.map((b) => b.id)).toEqual(script.blocks.map((b) => b.id));
    // Budama izlenen işlemin dışına kayarsa senaryo geri gelir ama panel bağı
    // geri gelmez — sessiz veri kaybı.
    expect(docToProject(doc).panels[0].scriptRefs).toEqual([bagliBlok]);
  });

  it('senaryo içe aktarımı belgenin zaman damgasını tazeler', () => {
    const { doc } = fixture();
    // Bilerek bayat bir damga: içe aktarım `touch` etmezse 0 kalır ve kaydedilen
    // projede `meta.updatedAt` bayatlar.
    metaMap(doc).set('updatedAt', 0);

    const simdi = Date.now();
    M.setScript(doc, parseScript('senaryo.fountain', SENARYO));

    expect(metaMap(doc).get('updatedAt') as number).toBeGreaterThanOrEqual(simdi);
  });

  it('senaryo temizlenince tüm bağlantılar düşer', () => {
    const { doc, script, panels } = fixture();
    M.linkPanelScript(doc, panels[0].id, [script.blocks[0].id]);
    M.clearScript(doc);
    expect(readScript(doc).blocks).toHaveLength(0);
    expect(docToProject(doc).panels[0].scriptRefs).toEqual([]);
  });
});

describe('Senaryodan panel meta’sı', () => {
  it('sahne numarasını, aksiyonu ve repliği ayırır', () => {
    const blocks = parseFountain(SENARYO);
    const meta = metaFromBlocks(blocks.slice(0, 5));
    expect(meta.scene).toBe('1');
    expect(meta.action).toContain('Loş bir koridor');
    expect(meta.dialogue).toContain('Kimse yok, emin misin?');
    expect(meta.dialogue).not.toContain('Loş bir koridor');
  });
});

describe('Kalıcılık', () => {
  it('.sbp yazma/okuma senaryoyu ve bağlantıları korur', async () => {
    const panel = createPanel();
    const script = parseScript('senaryo.fountain', SENARYO);
    panel.scriptRefs = [script.blocks[0].id];
    const project = createProject({ panels: [panel], script });

    const bundle = await unpackProject(await packProject({ project, assets: {} }));
    expect(bundle.project.script.name).toBe('senaryo.fountain');
    expect(bundle.project.script.blocks).toHaveLength(script.blocks.length);
    expect(bundle.project.panels[0].scriptRefs).toEqual([script.blocks[0].id]);
  });

  it('şema 1 projesi senaryosuz açılır (geriye dönük uyum)', () => {
    const eski = {
      schemaVersion: 1,
      meta: { id: 'prj_x', name: 'Eski' },
      settings: {},
      panels: [{ id: 'pnl_x', meta: {}, layers: [], objects: [] }],
      customPoses: [],
    };
    const project = migrateProject(eski);
    expect(project.script).toEqual({ name: '', blocks: [] });
    expect(project.panels[0].scriptRefs).toEqual([]);
  });
});


it('Markdown dışa aktarımı sahneleri, diyalogları ve kaçırılmış metni korur', () => {
  const blocks = parseFountain('İÇ. ATÖLYE - GECE\n\nAyşe bir kutu açar.\n\n@AYŞE\n(fısıltıyla)\nMerhaba.\n\n>KES:');
  blocks[1].text = '# işaret *yıldız* [not] > işaret';
  const roundtrip = parseScript('QA.md', duzYaz(blocks, { markdown: true }));
  expect(roundtrip.blocks.map(({ type, text }) => ({ type, text }))).toEqual(blocks.map(({ type, text }) => ({ type, text })));
  expect(roundtrip.blocks.every(b => b.scene === '1')).toBe(true);
});
