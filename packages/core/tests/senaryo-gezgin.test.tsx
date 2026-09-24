// @vitest-environment jsdom
import * as Y from 'yjs';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, afterEach } from 'vitest';
import { setScript, linkPanelScript } from '@storyboard/core/doc/mutations';
import { createDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { ScriptNavigator } from '@storyboard/core/components/script/ScriptNavigator';
import type { ScriptBlock } from '@storyboard/core/model/script';

const blok = (id: string, type: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id, fp: id, type, text, scene: '1', sceneId: 'sc_1' } as ScriptBlock);

/* Her tip temsil edilir: girinti kaçağı hangi tipte olursa olsun yakalansın. */
const SENARYO = {
  name: 'deneme',
  blocks: [
    blok('sb_1', 'scene', 'İÇ. KORİDOR - GECE'),
    blok('sb_2', 'action', 'Ayşe girer.'),
    blok('sb_3', 'character', 'AYŞE'),
    blok('sb_4', 'parenthetical', '(fısıltıyla)'),
    blok('sb_5', 'dialogue', 'Kimse yok, emin misin?'),
    blok('sb_6', 'transition', 'KES'),
  ],
};

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

// jsdom `scrollIntoView` uygulamıyor; gezgin imleci görünüre kaydırırken çağırıyor.
(HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};

function bagla(rol: 'owner' | 'commenter', bagliBlok?: string) {
  const doc = createDoc(createProject({ panels: [createPanel()] }));
  setScript(doc, SENARYO);
  useProjectStore.getState().attachDoc(doc, rol);
  const panelId = useProjectStore.getState().project.panels[0].id;
  if (bagliBlok) {
    linkPanelScript(doc, panelId, [bagliBlok]);
    useProjectStore.getState().setActivePanel(panelId);
  }
  useUiStore.setState({ scriptSelection: [], scriptCursor: null, scriptAnchor: null, scriptSearch: '', scriptFilter: 'all' });
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(<ScriptNavigator />); });
  return { doc, panelId };
}

const liste = () => yer!.querySelector('[data-script-list]') as HTMLElement;
const satirlar = () => Array.from(liste().querySelectorAll('[role="option"]')) as HTMLElement[];
const satir = (metin: string) =>
  satirlar().find((s) => s.textContent?.includes(metin)) as HTMLElement;

function tikla(el: HTMLElement) {
  act(() => { el.click(); });
}

function tus(hedef: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  act(() => {
    hedef.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  });
}

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

describe('ScriptNavigator — gezgin denetçiye taşındı', () => {
  it('satırları düz metin olarak listeler — sahte sayfa girintisi yok', () => {
    bagla('owner');
    expect(satirlar()).toHaveLength(6);
    /* Bitiş kriteri: ölçüye bağlı olmayan sabit girintiler kalkıyor.
       Yalnız SATIRLARIN içi taranır — kaçak orada olurdu; panelin kendi
       yardım metninin ortalanması sayfa düzeni iddiası değildir. */
    const kacak = /\b(pl-\d+|pr-\d+|text-right|text-center)\b/;
    for (const s of satirlar()) {
      for (const el of [s, ...Array.from(s.querySelectorAll('*'))]) {
        expect(el.className.toString()).not.toMatch(kacak);
      }
    }
  });

  it('↑↓ imleci ve seçimi taşır', () => {
    bagla('owner');
    tikla(satir('İÇ. KORİDOR'));
    expect(useUiStore.getState().scriptCursor).toBe('sb_1');

    tus(liste(), 'ArrowDown');
    expect(useUiStore.getState().scriptCursor).toBe('sb_2');
    expect(useUiStore.getState().scriptSelection).toEqual(['sb_2']);

    // Shift+↓ aralığı büyütür, tek satıra düşürmez.
    tus(liste(), 'ArrowDown', { shiftKey: true });
    expect(useUiStore.getState().scriptSelection).toEqual(['sb_2', 'sb_3']);

    tus(liste(), 'ArrowUp');
    expect(useUiStore.getState().scriptCursor).toBe('sb_2');
  });

  it('bağlı satırda panel rozeti görünür', () => {
    const { doc } = bagla('owner', 'sb_5');
    expect(doc).toBeInstanceOf(Y.Doc);
    const rozet = satir('Kimse yok').querySelector('button');
    expect(rozet?.textContent).toMatch(/^S.+·C.+$/);
    // Bağsız satırda rozet YOK — yoksa iddia her satırda geçerdi.
    expect(satir('Ayşe girer.').querySelector('button')).toBeNull();
  });

  /* DÜĞMELER KALDIRILDI (kullanıcı kararı 2026-08-26: eylem seçimin yanında
     olmalı, yan panelin dibinde değil) ama YETKİ KAPISI DURUYOR ve durmak
     zorunda. Test düğmeye değil KLAVYE yoluna bakıyor: kapıyı ölçen şey
     düğmenin `disabled` özelliği değil, belgenin değişmemesi. */
  it('YORUMCU gezginden panel oluşturamaz — klavye yolu da kapalı', () => {
    bagla('commenter');
    tikla(satir('Ayşe girer.'));
    expect(useUiStore.getState().scriptSelection).toEqual(['sb_2']);

    const once = useProjectStore.getState().project.panels.length;
    tus(liste(), 'Enter');
    expect(useProjectStore.getState().project.panels.length, 'panel oluşmamalı').toBe(once);

    const bagliOnce = JSON.stringify(useProjectStore.getState().project.panels);
    tus(liste(), 'Enter', { shiftKey: true });
    expect(JSON.stringify(useProjectStore.getState().project.panels), 'bağ kurulmamalı')
      .toBe(bagliOnce);
  });

  /* Mağaza fonksiyonları (`linkBlocksToPanel`, `unlinkBlocks`) rolü ZATEN
     denetliyor; bileşendeki `editable` kapısı o yüzden ikinci katman. Ama
     kaldırılınca ortaya çıkan şey "yorumcu yazabiliyor" değil, YALANCI BAŞARI
     BİLDİRİMİ: bildirimler çağrının sonucuna bakmadan gösteriliyor, yani
     yorumcu hiçbir şey olmadığı hâlde "bağlandı" yazısını görürdü. Ölçüldü:
     bu iddia olmadan kapının kaldırılması hiçbir testi kırmıyordu. */
  it('YORUMCUYA yalancı başarı bildirimi gösterilmez', () => {
    const { doc, panelId } = bagla('commenter', 'sb_5');
    tikla(satir('Kimse yok'));
    const bagliOnce = JSON.stringify(useProjectStore.getState().project.panels);

    useUiStore.setState({ toast: null });
    tus(liste(), 'Enter', { shiftKey: true });
    expect(useUiStore.getState().toast).toBeNull();

    useUiStore.setState({ toast: null });
    tus(liste(), 'Delete');
    expect(useUiStore.getState().toast).toBeNull();

    // Bildirimin yokluğu yetmez: doküman gerçekten değişmemiş olmalı.
    expect(JSON.stringify(useProjectStore.getState().project.panels)).toBe(bagliOnce);
    expect(doc).toBeInstanceOf(Y.Doc);
    expect(panelId).toBeTruthy();
  });

  /* KAPININ ROLDEN GELDİĞİ İDDİASI: aynı tuş, aynı seçim, farklı rol —
     farklı sonuç. Yorumcu testiyle BİRLİKTE okunmalı; tek başına ikisi de
     "hep açık" ya da "hep kapalı" bir kodu yakalayamaz. */
  it('SAHİP aynı tuşla panel oluşturabiliyor — kapı ROLDEN geliyor', () => {
    bagla('owner');
    tikla(satir('Ayşe girer.'));
    const once = useProjectStore.getState().project.panels.length;
    tus(liste(), 'Enter');
    expect(useProjectStore.getState().project.panels.length, 'sahip panel oluşturabilmeli')
      .toBe(once + 1);
  });

  it('arama kutusu listeyi daraltır', () => {
    bagla('owner');
    act(() => { useUiStore.getState().set('scriptSearch', 'emin misin'); });
    expect(satirlar()).toHaveLength(1);
    expect(satirlar()[0].textContent).toContain('Kimse yok');
  });
});
