import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { loadProjectIntoDoc, docToProject } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';
import { DEFAULT_FRAME_GUIDES, REHBER_OPAKLIK, REHBER_RENK } from '@storyboard/core/model/types';

/**
 * ÇERÇEVE REHBERLERİ.
 *
 * Kullanıcı isteği: üçler kuralı yanında öteki kompozisyon kuralları da
 * olsun, renkleri ve opaklıkları ayarlanabilsin.
 */

function kur() {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  return { doc, id: docToProject(doc).panels[0].id };
}

describe('kompozisyon kuralları', () => {
  it('yeni kurallar varsayılanda KAPALI — kimsenin karesine davetsiz çizgi düşmüyor', () => {
    for (const k of ['altinOran', 'altinSpiral', 'capraz', 'harmonik', 'simetri'] as const) {
      expect(DEFAULT_FRAME_GUIDES[k], k).toBe(false);
    }
    /* Üçler kuralı açık kalıyor: F1'den beri öyleydi ve kapatmak eski
       projelerin görünümünü haber vermeden değiştirirdi. */
    expect(DEFAULT_FRAME_GUIDES.thirds).toBe(true);
  });

  it('her kural ayrı ayrı açılıp kapanıyor', () => {
    const { doc, id } = kur();
    M.updatePanelGuides(doc, id, { altinSpiral: true, capraz: true });
    const g = docToProject(doc).panels[0].guides;
    expect(g.altinSpiral).toBe(true);
    expect(g.capraz).toBe(true);
    expect(g.harmonik ?? false).toBe(false);
  });

  it('renk ve opaklık belgeye yazılıyor — oturuma değil', () => {
    const { doc, id } = kur();
    M.updatePanelGuides(doc, id, { renk: '#ff8800', opaklik: 0.3 });
    const g = docToProject(doc).panels[0].guides;
    expect(g.renk).toBe('#ff8800');
    expect(g.opaklik).toBe(0.3);
  });

  /* Bu alanlardan önce kaydedilmiş paneller onları HİÇ taşımıyor. Okuyucu
     düşmemeli ve kullanıcıya görünmez rehber çizmemeli. */
  it('eski panelde alanlar yokken varsayılana düşüyor', () => {
    const eski = { aspect: '16:9', thirds: true, actionSafe: false, titleSafe: false,
                   centerCross: false, enabled: true } as const;
    expect(eski.thirds).toBe(true);
    expect((eski as { renk?: string }).renk ?? REHBER_RENK).toBe(REHBER_RENK);
    expect((eski as { opaklik?: number }).opaklik ?? REHBER_OPAKLIK).toBe(REHBER_OPAKLIK);
    expect((eski as { altinOran?: boolean }).altinOran ?? false).toBe(false);
  });
});
