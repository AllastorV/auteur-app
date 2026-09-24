// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Presentation } from '@storyboard/core/components/presentation/Presentation';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { moduDegistir } from '@storyboard/core/store/mod';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { setScript } from '@storyboard/core/doc/mutations';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import type { ScriptBlock } from '@storyboard/core/model/script';

// Gerekçe `galeri.test.tsx`teki AYNI: Konva/react-konva vitest'in Node
// ortamında `require('canvas')` ile patlıyor, storyboard render Playwright'ın
// işi (§11). Sunum kendi navigasyon/klavye/oturumluk-durum mantığını sınıyor.
vi.mock('@storyboard/core/components/grid/PanelThumbnail', () => ({
  PanelThumbnail: ({ width }: { width?: number }) => (
    <div data-testid="thumb-stub" data-width={width} />
  ),
}));

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

function ciz(oge: React.ReactNode) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(oge); });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

const blok = (id: string, text: string): ScriptBlock =>
  ({ id, fp: '', type: 'action', text, scene: '', sceneId: 'sc1' });

function kur() {
  const paneller = [
    createPanel({ id: 'pn0', meta: { scene: '1', duration: 2 } }),
    createPanel({ id: 'pn1', meta: { scene: '1', duration: 3 }, scriptRefs: ['b1'] }),
    createPanel({ id: 'pn2', meta: { scene: '2', duration: 1 } }),
  ];
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, { ...createProject({ panels: [] }), panels: paneller }, 'load');
  setScript(doc, { name: 's', blocks: [blok('b1', 'Ayşe kapıyı açar.')] });
  useProjectStore.getState().attachDoc(doc, 'owner');
  return doc;
}

beforeEach(() => {
  vi.useFakeTimers();
  kur();
  useProjectStore.getState().setActivePanel('pn0');
  useUiStore.setState({ viewMode: 'senaryo' });
});

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
  vi.useRealTimers();
});

describe('Presentation — F8 sunum (§13.2)', () => {
  it('geçerli panel gösteriliyor, sayaç doğru', () => {
    ciz(<Presentation />);
    expect(el('sunum-sayac')!.textContent).toBe('1 / 3');
    expect(el('thumb-stub')).not.toBeNull();
  });

  it('sağ ok bir sonraki panele geçiriyor', () => {
    ciz(<Presentation />);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); });
    expect(useProjectStore.getState().activePanelId).toBe('pn1');
  });

  it('sol ok önceki panele dönüyor, ilk panelde SINIRDA kalıyor', () => {
    ciz(<Presentation />);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); });
    expect(useProjectStore.getState().activePanelId).toBe('pn0'); // zaten ilkti, taşmadı
  });

  it('son panelde sağ ok taşmıyor, SINIRDA kalıyor (wrap yok)', () => {
    ciz(<Presentation />);
    useProjectStore.getState().setActivePanel('pn2');
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); });
    expect(useProjectStore.getState().activePanelId).toBe('pn2');
  });

  it('bağlı senaryo satırı altta gösteriliyor, bağsız panelde gösterilmiyor', () => {
    ciz(<Presentation />);
    expect(el('sunum-satirlar')).toBeNull(); // pn0 bağsız

    useProjectStore.getState().setActivePanel('pn1');
    act(() => { kok!.render(<Presentation />); });
    expect(el('sunum-satirlar')!.textContent).toMatch(/Ayşe kapıyı açar/);
  });

  it('Oynat panelin SÜRESİ kadar bekleyip otomatik ilerliyor', () => {
    ciz(<Presentation />);
    act(() => { el('sunum-oynat')!.click(); }); // pn0.duration = 2sn
    expect(useProjectStore.getState().activePanelId).toBe('pn0');
    act(() => { vi.advanceTimersByTime(1999); });
    expect(useProjectStore.getState().activePanelId).toBe('pn0');
    act(() => { vi.advanceTimersByTime(2); });
    expect(useProjectStore.getState().activePanelId).toBe('pn1');
  });

  it('Space da oynat/duraklatı değiştiriyor', () => {
    ciz(<Presentation />);
    expect(el('sunum-oynat')!.textContent).toMatch(/Oynat/);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })); });
    expect(el('sunum-oynat')!.textContent).toMatch(/Duraklat/);
  });

  it('SON panelde otomatik ilerleme kendini durduruyor, döngüye girmiyor', () => {
    useProjectStore.getState().setActivePanel('pn2'); // duration 1sn, son panel
    ciz(<Presentation />);
    act(() => { el('sunum-oynat')!.click(); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(useProjectStore.getState().activePanelId).toBe('pn2'); // başa sarmadı
    expect(el('sunum-oynat')!.textContent).toMatch(/Oynat/); // duraklamış görünüyor
  });

  it('Esc — mod kabuğu ÜZERİNDEN sunuma girilen moda dönüyor (§7)', () => {
    useUiStore.setState({ viewMode: 'senaryo' });
    moduDegistir('sunum');
    ciz(<Presentation />);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(useUiStore.getState().viewMode).toBe('senaryo');
  });

  it('Çık düğmesi klavyeyle AYNI yolu çağırıyor', () => {
    useUiStore.setState({ viewMode: 'board' });
    moduDegistir('sunum');
    ciz(<Presentation />);
    act(() => { el('sunum-cik')!.click(); });
    expect(useUiStore.getState().viewMode).toBe('board');
  });

  it('sunum durumu OTURUMLUK: proje verisinde (Yjs) hiçbir alan yazılmıyor', () => {
    const doc = useProjectStore.getState().doc;
    const oncekiUpdate = Y.encodeStateAsUpdate(doc);
    ciz(<Presentation />);
    act(() => { el('sunum-oynat')!.click(); });
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); });
    // Panel gezinmesi `activePanelId` (Yjs DIŞI) yazıyor — belge değişmiyor.
    expect(Y.encodeStateAsUpdate(doc)).toEqual(oncekiUpdate);
  });

  it('panel yokken çökmüyor, bilgilendirici yüzey çiziyor', () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, { ...createProject({ panels: [] }), panels: [] }, 'load');
    useProjectStore.getState().attachDoc(doc, 'owner');
    expect(() => ciz(<Presentation />)).not.toThrow();
    expect(el('sunum-yuzeyi')).not.toBeNull();
  });
});
