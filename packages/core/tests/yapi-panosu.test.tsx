// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { YapiPanosu } from '@storyboard/core/components/script/YapiPanosu';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * F7 AÇIK KALAN kısmı: tip başına yapı paneli ve istatistik.
 * Bitiş ölçütü AnalizPanosu ile AYNI (§ F4): satırdan bloğa tıklanabiliyor.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;
let sayac = 0;

const b = (tip: ScriptBlock['type'], text: string, sceneId = ''): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `${text}${sayac}`, type: tip, text, scene: '', sceneId });

function projeKur(bloklar: ScriptBlock[], tipAdi?: string) {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  if (tipAdi) M.setDokumanTipi(doc, tipAdi);
  M.setScript(doc, { name: 's', blocks: bloklar });
  return doc;
}

function ciz() {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(<YapiPanosu />); });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

beforeEach(() => {
  sayac = 0;
  useUiStore.setState({ viewMode: 'senaryo', scriptCursor: null });
});

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

describe('boş belge', () => {
  it('yapı yokken durum söyleniyor', () => {
    projeKur([]);
    ciz();
    expect(el('yapi-panosu')!.textContent).toMatch(/Çözümlenecek yapı yok/);
  });
});

describe('senaryo — sahne birimleri', () => {
  const SENARYO = () => [
    b('scene', 'İÇ. MUTFAK - GECE', 'sc1'),
    b('action', 'Ayşe masaya oturur ve uzun uzun düşünür.', 'sc1'),
    b('scene', 'DIŞ. SOKAK - GÜNDÜZ', 'sc2'),
    b('action', 'Yağmur yağıyor.', 'sc2'),
  ];

  it('özet etiketi tipin yapiAdi\'ndan geliyor — "Sahne" sabit yazılmıyor', () => {
    projeKur(SENARYO());
    ciz();
    expect(el('yapi-ozet')!.textContent).toMatch(/2 Sahne/);
  });

  it('her sahne için bir satır var', () => {
    projeKur(SENARYO());
    ciz();
    expect(el('yapi-birim-0')).not.toBeNull();
    expect(el('yapi-birim-1')).not.toBeNull();
    expect(el('yapi-birim-2')).toBeNull();
  });

  it('satıra tıklamak o birimin ilk bloğuna gidiyor (blogaGit)', () => {
    const bloklar = SENARYO();
    projeKur(bloklar);
    ciz();
    act(() => { (el('yapi-birim-1') as HTMLButtonElement).click(); });
    expect(useUiStore.getState().scriptCursor).toBe(bloklar[2].id);
  });

  it('süre YALNIZ sayfa=dakika geçerli tipte gösteriliyor', () => {
    projeKur(SENARYO());
    ciz();
    expect(el('yapi-birim-0')!.textContent).toMatch(/dk/);
  });
});

describe('roman — bölüm birimleri, süre yok', () => {
  const ROMAN = () => [
    b('bolum', 'Bölüm 1', ''),
    b('paragraf', 'Bir varmış bir yokmuş.', ''),
    b('bolum', 'Bölüm 2', ''),
    b('paragraf', 'İkinci bölüm.', ''),
  ];

  it('özet etiketi "Bölüm" — romanda sahne yok', () => {
    projeKur(ROMAN(), 'roman');
    ciz();
    expect(el('yapi-ozet')!.textContent).toMatch(/2 Bölüm/);
  });

  /* Romanda sayfa süreyi ölçmez; göstermek yazara olmayan bir bilgi vermek
     olurdu (§6.2) — AynıAnalizPanosu/ScriptEditor kararı burada da geçerli. */
  it('romanda "dk" HİÇ görünmüyor', () => {
    projeKur(ROMAN(), 'roman');
    ciz();
    expect(el('yapi-panosu')!.textContent).not.toMatch(/dk\b/);
  });

  it('bölüme tıklamak o bölümün ilk bloğuna gidiyor', () => {
    const bloklar = ROMAN();
    projeKur(bloklar, 'roman');
    ciz();
    act(() => { (el('yapi-birim-1') as HTMLButtonElement).click(); });
    expect(useUiStore.getState().scriptCursor).toBe(bloklar[2].id);
  });
});
