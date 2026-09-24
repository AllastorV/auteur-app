// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Gallery } from '@storyboard/core/components/gallery/Gallery';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';

/*
 * `PanelThumbnail` gerçek Konva/`react-konva` sahnesi kuruyor; bu paket
 * yalnız TARAYICIDA çalışır — vitest'in Node ortamında `konva`nın kendisi
 * `require('canvas')` ile patlıyor (native modül kurulu değil, kurulmasına
 * da gerek yok: bu proje storyboard render testlerini Playwright'a
 * bırakıyor, bkz. §11). Galeri testleri kendi mantığını (filtre, tıklama,
 * mod geçişi) sınıyor — küçük resmin KENDİSİ `PanelThumbnail`ın testinin
 * işi, burada sahte bir gövdeyle taklit ediliyor.
 */
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
const tumu = (id: string) => Array.from(yer!.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];

function kur(panelSayisi: number, sahneVer: (i: number) => string, bagliMi: (i: number) => boolean) {
  const paneller = Array.from({ length: panelSayisi }, (_, i) => createPanel({
    id: `pn${i}`,
    meta: { scene: sahneVer(i), shot: '1' },
    scriptRefs: bagliMi(i) ? [`b${i}`] : [],
  }));
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, { ...createProject({ panels: [] }), panels: paneller }, 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  return doc;
}

beforeEach(() => {
  kur(3, (i) => String(i + 1), (i) => i % 2 === 0); // pn0 bağlı, pn1 bağsız, pn2 bağlı
  useUiStore.setState({ viewMode: 'grid' });
});

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

describe('Gallery — F8 imagesgallery (§13.2)', () => {
  it('bütün paneller kart olarak çiziliyor', () => {
    ciz(<Gallery />);
    expect(tumu('galeri-karti')).toHaveLength(3);
  });

  it('varsayılan filtre "Tümü" işaretli', () => {
    ciz(<Gallery />);
    expect(el('galeri-filtre-all')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('"Bağlı" filtresi yalnız scriptRefs dolu panelleri bırakıyor', () => {
    ciz(<Gallery />);
    act(() => { el('galeri-filtre-linked')!.click(); });
    expect(tumu('galeri-karti')).toHaveLength(2);
  });

  it('"Bağsız" filtresi yalnız scriptRefs boş paneli bırakıyor', () => {
    ciz(<Gallery />);
    act(() => { el('galeri-filtre-unlinked')!.click(); });
    expect(tumu('galeri-karti')).toHaveLength(1);
  });

  it('sahneye göre süzgeç seçilince yalnız o sahnenin panelleri kalıyor', () => {
    ciz(<Gallery />);
    const sec = el('galeri-sahne-sec') as HTMLSelectElement;
    act(() => {
      sec.value = '2';
      sec.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(tumu('galeri-karti')).toHaveLength(1);
  });

  it('bu filtreye uyan panel yoksa boş mesaj gösteriliyor, çökme yok', () => {
    ciz(<Gallery />);
    act(() => { el('galeri-filtre-linked')!.click(); });
    const sec = el('galeri-sahne-sec') as HTMLSelectElement;
    act(() => {
      sec.value = '2'; // sahne 2 = pn1, ama pn1 bağsız → linked ∩ sahne2 = boş
      sec.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(tumu('galeri-karti')).toHaveLength(0);
    expect(yer!.textContent).toMatch(/Bu filtreye uyan panel yok/);
  });

  it('panele tıklayınca aktif panel değişiyor ve BOARD moduna geçiyor (§7)', () => {
    ciz(<Gallery />);
    const kartlar = tumu('galeri-karti');
    act(() => { kartlar[1].click(); }); // pn1
    expect(useProjectStore.getState().activePanelId).toBe('pn1');
    expect(useUiStore.getState().viewMode).toBe('board');
  });

  it('küçük resim PanelThumbnail ÜZERİNDEN çiziliyor — yeniden çizilmiyor', () => {
    ciz(<Gallery />);
    expect(tumu('thumb-stub')).toHaveLength(3);
  });
});

describe('Gallery — büyük projede takılmama ölçütü (§13.2, "Ölçüldü:")', () => {
  /* PanelThumbnail'ın KENDİ IntersectionObserver kapısı (kaynak dosyada,
     `packages/core/src/components/grid/PanelThumbnail.tsx`) hangi
     panellerin GERÇEKTEN Konva sahnesi kurduğunu belirliyor — o mekanizma
     burada MOCK'landığı için yeniden sınanmıyor (Karar 2: PanelThumbnail
     zaten kendi görünürlük kapısını taşıyor, galeri onu YENİDEN YAZMIYOR).
     Bu test GALERİNİN KENDİ payını ölçüyor: N panelde filtre+ızgara
     kurulumunun süresi. */
  it('500 panelde galeri ızgarası makul sürede kuruluyor', () => {
    kur(500, (i) => String((i % 12) + 1), (i) => i % 3 === 0);
    const basla = performance.now();
    ciz(<Gallery />);
    const gecenMs = performance.now() - basla;
    expect(tumu('galeri-karti')).toHaveLength(500);
    // ponytail: gerçek eşik yok, ölçülen değer raporda — burada yalnız
    // "saniyeler sürmüyor" seviyesinde bir tavan (regresyon bekçisi).
    expect(gecenMs).toBeLessThan(2000);
    // eslint-disable-next-line no-console
    console.log(`ölçüldü: 500 panelli galeri ${gecenMs.toFixed(1)} ms'de kuruldu`);
  });
});
