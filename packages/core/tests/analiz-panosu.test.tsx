// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { AnalizPanosu } from '@storyboard/core/components/script/AnalizPanosu';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * F4'ün bitiş ölçütü: GRAFİKTEN SAHNEYE tıklanabiliyor. Gösterdiği şeye
 * götürmeyen bir analiz ekranı rapor olur, araç olmaz.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;
let sayac = 0;

const b = (tip: ScriptBlock['type'], text: string, sceneId: string): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `${text}${sayac}`, type: tip, text, scene: '', sceneId });

function projeKur(bloklar: ScriptBlock[]) {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  M.setScript(doc, { name: 's', blocks: bloklar });
  return doc;
}

function ciz() {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(<AnalizPanosu />); });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

const SENARYO = () => {
  sayac = 0;
  return [
    b('scene', 'İÇ. MUTFAK - GECE', 'sc1'),
    b('action', 'Ayşe masaya oturur ve uzun uzun düşünür.', 'sc1'),
    b('character', 'AYŞE', 'sc1'),
    b('dialogue', 'Bu iş burada bitmez.', 'sc1'),
    b('scene', 'DIŞ. SOKAK - GÜNDÜZ', 'sc2'),
    b('character', 'MEHMET', 'sc2'),
    b('dialogue', 'Geç.', 'sc2'),
  ];
};

beforeEach(() => {
  useUiStore.setState({ analizPanosu: true, viewMode: 'senaryo', scriptCursor: null });
});

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

describe('pano sekme gövdesi olarak çiziliyor', () => {
  it('tam analiz eylemi düğme olarak belirgin ve klavyeyle odaklanabilir', () => {
    projeKur([]);
    ciz();
    const dugme = el('analiz-panele-git') as HTMLButtonElement;
    expect(dugme.tagName).toBe('BUTTON');
    expect(dugme.textContent).toMatch(/ölçüler|measures/i);
    expect(dugme.classList.contains('mzn-denetim')).toBe(true);
    expect(dugme.className).toContain('focus-visible:');
    expect(dugme.querySelector('svg')).not.toBeNull();
  });

  /* Pano artık sağ denetçinin SEKMESİ; hangi sekmenin açık olduğu
     oturumluk `inspectorTab`'da. */
  it('sekme seçimi oturumluk mağazada', () => {
    projeKur(SENARYO());
    useUiStore.setState({ inspectorTab: 'analiz' });
    expect(useUiStore.getState().inspectorTab).toBe('analiz');
  });

  it('senaryo yokken durum söyleniyor', () => {
    projeKur([]);
    ciz();
    expect(el('analiz-panosu')!.textContent).toMatch(/Çözümlenecek senaryo yok/);
  });
});

describe('özet ve ritim', () => {
  it('sahne, kelime ve iç/dış sayıları gösteriliyor', () => {
    projeKur(SENARYO());
    ciz();
    const metin = el('analiz-ozet')!.textContent!;
    expect(metin).toMatch(/2 sahne/);
    expect(metin).toMatch(/1 iç \/ 1 dış/);
  });

  it('her sahne için bir çubuk var', () => {
    projeKur(SENARYO());
    ciz();
    expect(el('sahne-cubuk-0')).not.toBeNull();
    expect(el('sahne-cubuk-1')).not.toBeNull();
    expect(el('sahne-cubuk-2')).toBeNull();
  });

  /* Grafik yaklaşık, SAYI kesindir: yalnız çubuk göstermek yazara ritim
     hakkında bir şey söyler ama uzunluğu söylemez. */
  it('çubuğun başlığında kesin sayılar var', () => {
    projeKur(SENARYO());
    ciz();
    expect(el('sahne-cubuk-0')!.title).toMatch(/kelime/);
    expect(el('sahne-cubuk-0')!.title).toMatch(/diyalog/);
  });

  it('başlıksız sahne uydurulmuyor', () => {
    sayac = 0;
    projeKur([b('action', 'Karanlık.', 'sc0')]);
    ciz();
    expect(el('sahne-cubuk-0')!.textContent).toMatch(/başlıksız/);
  });
});

describe('GRAFİKTEN SAHNEYE — F4 bitiş ölçütü', () => {
  it('çubuğa tıklamak imleci o sahnenin ilk bloğuna götürüyor', () => {
    const bloklar = SENARYO();
    projeKur(bloklar);
    ciz();
    act(() => { (el('sahne-cubuk-1') as HTMLButtonElement).click(); });
    expect(useUiStore.getState().scriptCursor).toBe(bloklar[4].id);
  });

  it('ilk sahneye de gidiliyor', () => {
    const bloklar = SENARYO();
    projeKur(bloklar);
    ciz();
    act(() => { (el('sahne-cubuk-0') as HTMLButtonElement).click(); });
    expect(useUiStore.getState().scriptCursor).toBe(bloklar[0].id);
  });

  /* "Bu karakter nereden giriyor" en sık sorulan soru. */
  it('karaktere tıklamak İLK göründüğü sahneye götürüyor', () => {
    const bloklar = SENARYO();
    projeKur(bloklar);
    ciz();
    act(() => { (el('karakter-MEHMET') as HTMLButtonElement).click(); });
    expect(useUiStore.getState().scriptCursor).toBe(bloklar[4].id);
  });

  it('pano moddan bağımsız — panodayken de senaryoya götürüyor', () => {
    const bloklar = SENARYO();
    projeKur(bloklar);
    useUiStore.setState({ viewMode: 'board' });
    ciz();
    act(() => { (el('sahne-cubuk-1') as HTMLButtonElement).click(); });
    expect(useUiStore.getState().viewMode).toBe('senaryo');
  });
});

describe('karakter listesi', () => {
  it('replik ve kelime sayısı gösteriliyor', () => {
    projeKur(SENARYO());
    ciz();
    expect(el('karakter-AYŞE')!.textContent).toMatch(/1 replik/);
  });

  it('her karakter için sahne dağılımı çiziliyor', () => {
    projeKur(SENARYO());
    ciz();
    // İki sahne → iki dilim.
    expect(el('dagilim-AYŞE')!.children).toHaveLength(2);
  });

  /* Uzun yokluk dramaturjik bir SORU, hata değil. */
  it('uzun yokluk bildiriliyor, kısa yokluk bildirilmiyor', () => {
    sayac = 0;
    const bloklar: ScriptBlock[] = [];
    for (let i = 0; i < 8; i++) {
      bloklar.push(b('scene', `İÇ. ODA ${i}`, `sc${i}`));
      if (i === 0 || i === 7) {
        bloklar.push(b('character', 'AYŞE', `sc${i}`));
        bloklar.push(b('dialogue', 'x', `sc${i}`));
      } else {
        bloklar.push(b('character', 'MEHMET', `sc${i}`));
        bloklar.push(b('dialogue', 'y', `sc${i}`));
      }
    }
    projeKur(bloklar);
    ciz();
    expect(el('yokluk-AYŞE')).not.toBeNull();
    expect(el('yokluk-MEHMET')).toBeNull();
  });

  it('konuşan yoksa söyleniyor', () => {
    sayac = 0;
    projeKur([b('scene', 'İÇ. ODA', 'sc1'), b('action', 'Sessizlik.', 'sc1')]);
    ciz();
    expect(el('analiz-panosu')!.textContent).toMatch(/Konuşan karakter yok/);
  });
});
