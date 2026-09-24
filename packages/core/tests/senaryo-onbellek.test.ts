import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { createDoc, readScript } from '@storyboard/core/doc/schema';
import * as M from '@storyboard/core/doc/mutations';
import { ProjectSnapshot } from '@storyboard/core/store/snapshot';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import type { ScriptBlock } from '@storyboard/core/model/script';

const BLOK_SAYISI = 5000;

/**
 * Eşik ÖLÇÜLDÜ, tahmin edilmedi (2026-08-25, bu makine):
 *   önbelleksiz panel güncelleme + snapshot.read() → 12,38 ms/tur
 *   önbellekli                                     →  0,08 ms/tur
 * Fark ~155×. İddia bu yüzden MUTLAK eşik değil ORANTIDIR: hızlı bir CI
 * makinesinde iki ölçüm de küçülür ama kat farkı korunur; sabit bir ms eşiği
 * ise orada kendi ön koşulunu kırardı.
 */
/** Ön koşul tabanı: ham okuma bunun altına inerse ölçüm gürültüye karışır. */
const TABAN_MS = 1;

function buyukDoc() {
  const doc = createDoc(createProject({ panels: [createPanel(), createPanel()] }));
  const blocks: ScriptBlock[] = Array.from({ length: BLOK_SAYISI }, (_, i) => ({
    id: `sb_${i}`, fp: '', type: 'action', text: `Satır ${i} metni burada.`,
    scene: '1', sceneId: 'sc_1',
  }));
  M.setScript(doc, { name: 'buyuk', blocks });
  const snap = new ProjectSnapshot(doc);
  doc.on('afterTransaction', (tr: Y.Transaction) => snap.markFromTransaction(tr));
  snap.read();
  return { doc, snap };
}

describe('senaryo önbelleği — canvas sıcak yolu', () => {
  it('panel güncellemesi senaryoyu YENİDEN OKUMAZ', () => {
    const { doc, snap } = buyukDoc();
    const panelId = snap.read().panels[0].id;

    // ÖN KOŞUL: önbelleksiz maliyet eşiğin epey üstünde olmalı, yoksa test
    // hiçbir şey ispatlamaz.
    let t = performance.now();
    readScript(doc);
    const hamMaliyet = performance.now() - t;
    expect(hamMaliyet).toBeGreaterThan(TABAN_MS);

    t = performance.now();
    for (let i = 0; i < 20; i++) {
      M.updatePanelMeta(doc, panelId, { shot: String(i) });
      snap.read();
    }
    const turBasina = (performance.now() - t) / 20;
    // İddia MUTLAK değil ORANTILI: hızlı bir makinede iki ölçüm de küçülür,
    // aradaki kat farkı küçülmez. Ölçülen fark ~155×; 10× geniş bir marj.
    expect(turBasina).toBeLessThan(hamMaliyet / 10);

    /* Aynı ScriptDoc referansı dönüyor — React senaryo panelini boşuna
       çizmez. İki ardışık `read()`'i karşılaştırmak VAKUMLUK olurdu: hiçbir şey
       kirlenmediğinde `read()` zaten `lastProject`'i döndürür, önbellek hiç
       olmasa da geçerdi. Panel değişimi PROJEYİ kirletir, senaryoyu kirletmez —
       ayrımı ölçen tek kurulum bu. */
    const oncekiScript = snap.read().script;
    M.updatePanelMeta(doc, panelId, { shot: 'son' });
    const sonraki = snap.read();
    expect(sonraki.panels[0].meta.shot).toBe('son');
    expect(sonraki.script).toBe(oncekiScript);
  });

  it('senaryo DEĞİŞİNCE önbellek geçersizleşir — bayat metin dönmez', () => {
    const { doc, snap } = buyukDoc();
    expect(snap.read().script.blocks[0].text).toBe('Satır 0 metni burada.');

    M.setScript(doc, {
      name: 'yeni',
      blocks: [{ id: 'sb_tek', fp: '', type: 'action', text: 'Tek satır.', scene: '', sceneId: '' }],
    });
    expect(snap.read().script.blocks.map((b) => b.text)).toEqual(['Tek satır.']);
  });

  it('senaryonun ADI değişince de önbellek geçersizleşir', () => {
    const { doc, snap } = buyukDoc();
    expect(snap.read().script.name).toBe('buyuk');
    doc.transact(() => { doc.getMap('script').set('name', 'degisti'); });
    expect(snap.read().script.name).toBe('degisti');
  });

  it('fragment İÇİNE yazmak da önbelleği geçersizleştirir (kök yürüyüşü)', () => {
    const { doc, snap } = buyukDoc();
    expect(snap.read().script.blocks[0].text).toBe('Satır 0 metni burada.');
    doc.transact(() => {
      const el = doc.getXmlFragment('senaryo').get(0) as Y.XmlElement;
      (el.get(0) as Y.XmlText).insert(0, 'ÖNEK ');
    });
    expect(snap.read().script.blocks[0].text).toBe('ÖNEK Satır 0 metni burada.');
  });
});
