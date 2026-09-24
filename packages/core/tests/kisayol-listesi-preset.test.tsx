// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { ShortcutsDialog } from '@storyboard/core/components/dialogs/ShortcutsDialog';
import { useProjectStore } from '@storyboard/core/store/project';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createProject } from '@storyboard/core/model/factory';
import { presetKisayollari } from '@storyboard/core/editor/preset';
import { DOKUMAN_TIPLERI } from '@storyboard/core/model/dokuman-tipi';
import { BLOK_ETIKETLERI } from '@storyboard/core/model/script';

/**
 * KISAYOL LİSTESİ ile KEYMAP AYNI KAYNAKTAN (Karar 2).
 *
 * Bu iki taraf ayrı yazılsaydı hata sessiz olurdu: listede "Ctrl+3 Karakter"
 * yazarken tuş başka bir preset uygular ve kullanıcı bunu ancak yanlış
 * biçimlenmiş bir sayfayı gördüğünde fark ederdi. Bir kısayolun YALAN
 * söylemesi, hiç olmamasından kötüdür.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

function ciz(tipAdi?: string) {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ meta: { dokumanTipi: tipAdi } }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(<ShortcutsDialog onClose={() => {}} />); });
}

/** Listedeki `Ctrl+<rakam>` satırlarını { tuş: etiket } olarak okur. */
function presetSatirlari(): Record<string, string> {
  const cikti: Record<string, string> = {};
  yer!.querySelectorAll('li').forEach((li) => {
    const tus = li.querySelector('kbd')?.textContent ?? '';
    if (!/^Ctrl\+\d$/.test(tus)) return;
    cikti[tus] = li.querySelector('span')?.textContent ?? '';
  });
  return cikti;
}

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

describe('kısayol listesi doküman tipini izliyor', () => {
  it('senaryoda Ctrl+1..6 sektör sırası', () => {
    ciz('senaryo');
    expect(presetSatirlari()).toEqual({
      'Ctrl+1': 'Sahne başlığı',
      'Ctrl+2': 'Aksiyon',
      'Ctrl+3': 'Karakter',
      'Ctrl+4': 'Parantez',
      'Ctrl+5': 'Diyalog',
      'Ctrl+6': 'Geçiş',
    });
  });

  it('romanda BAŞKA bir liste — üç preset', () => {
    ciz('roman');
    expect(presetSatirlari()).toEqual({
      'Ctrl+1': 'Bölüm',
      'Ctrl+2': 'Paragraf',
      'Ctrl+3': 'Diyalog',
    });
  });

  it('tipi olmayan eski proje senaryo listesini gösteriyor', () => {
    ciz(undefined);
    expect(presetSatirlari()['Ctrl+1']).toBe('Sahne başlığı');
  });

  /* Asıl güvence: ekrandaki her satır, KEYMAP'in o tuşa bağladığı presetin
     etiketi. Yukarıdaki iki test elle yazılmış beklentiler; bu test iki
     tarafı DOĞRUDAN karşılaştırıyor, yani listeler ileride değişse bile
     ıraksamayı yakalar. */
  it('her satır keymap ile birebir aynı', () => {
    for (const tip of Object.values(DOKUMAN_TIPLERI)) {
      /* İki sütunlu belge ProseMirror kullanmıyor — kendi satır presetleri
         `IkiSutunEditor`'da açılır listede. */
      if (tip.ikiSutun) continue;
      ciz(tip.id);
      const ekran = presetSatirlari();
      const keymap = presetKisayollari(tip.bloklar);
      const beklenen = Object.fromEntries(
        Object.keys(keymap).map((k, i) => [
          k.replace('Mod-', 'Ctrl+'),
          BLOK_ETIKETLERI[tip.bloklar[i]!],
        ]),
      );
      expect(ekran, tip.id).toEqual(beklenen);
      act(() => { kok?.unmount(); });
      yer?.remove();
    }
  });
});
