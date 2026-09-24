// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { arayuzDiliniAyarla } from '@storyboard/core/dil/arayuz';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { ExportDialog } from '@storyboard/core/components/dialogs/ExportDialog';
import { useProjectStore } from '@storyboard/core/store/project';
import { PlatformProvider } from '@storyboard/core/platform/context';
import type { PlatformAdapter } from '@storyboard/core/platform/types';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';
import { RENK_ZEMINI } from '@storyboard/core/model/revizyon';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * REVİZYON'UN DIŞA AKTARIM EKRANINDAKİ KABLOSU.
 *
 * Motor testleri (`revizyon-pdf`) çizimin doğru olduğunu söylüyor; bu dosya
 * kullanıcının o çizime ULAŞABİLDİĞİNİ söylüyor. İkisi ayrı sorular:
 * doğru çizen ama düğmesi olmayan bir özellik yoktur.
 */

/*
 * `ExportDialog` panel çizicisini (`export/renderPanel`) içeri alıyor, o da
 * Konva'ya bağlı; Konva Node'da `require('canvas')` ile patlıyor (native
 * modül kurulu değil, gerekmiyor da — storyboard render'ı Playwright'ın
 * işi, §11). Bu dosya PDF seçenekleri kablosunu sınıyor, panel çizimini
 * değil; çizici sahte bir gövdeyle taklit ediliyor (`galeri.test.tsx` ile
 * AYNI desen).
 */
vi.mock('@storyboard/core/export/renderPanel', () => ({
  renderPanelToDataURL: async () => 'data:image/png;base64,',
}));

const SAHTE_PLATFORM = {
  kind: 'web', canSaveLocally: true, canExportVideo: false,
  veriGuvenligi: null, dil: null, baslangic: null,
  onExportProgress: () => () => {},
} as unknown as PlatformAdapter;

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;
let sayac = 0;

const b = (tip: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `${text}${sayac}`, type: tip, text, scene: '', sceneId: 'sc1' });

function projeKur(): Y.Doc {
  sayac = 0;
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  M.setScript(doc, {
    name: 's',
    blocks: [
      b('scene', 'İÇ. ATÖLYE — GECE'),
      b('action', 'Torna tezgâhı döner.'),
      b('character', 'DEMİR'),
      b('dialogue', 'Bu iş burada bitmez.'),
    ],
  });
  return doc;
}

function ciz() {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => {
    kok!.render(
      <PlatformProvider platform={SAHTE_PLATFORM}>
        <ExportDialog onClose={() => {}} />
      </PlatformProvider>,
    );
  });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const tikla = (id: string) => act(() => { (el(id) as HTMLInputElement).click(); });

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
  arayuzDiliniAyarla('tr');
});

describe('revizyon yokken', () => {
  it('filigranın iki kaydırıcısı amber vurgu rengini kullanıyor', () => {
    projeKur();
    ciz();
    tikla('filigran-ac');
    for (const id of ['filigran-opaklik', 'filigran-aci']) {
      expect(el(id)?.classList.contains('accent-[var(--mzn-amber)]')).toBe(true);
    }
  });

  it('kutu yerine AÇIKLAMA gösteriliyor — sessizce yok sayılmıyor', () => {
    projeKur();
    ciz();
    expect(el('revizyon-ac')).toBeNull();
    expect(el('revizyon-yok')?.textContent).toContain('önce bir revizyon açın');
  });
});

describe('revizyon varken', () => {
  it('kutu çıkıyor ve VARSAYILAN KAPALI', () => {
    const doc = projeKur();
    M.revizyonYayinla(doc, 'Mavi');
    ciz();
    const kutu = el('revizyon-ac') as HTMLInputElement;
    expect(kutu).not.toBeNull();
    expect(kutu.checked).toBe(false);
  });

  it('etkin revizyonun rengi örnek karede gösteriliyor', () => {
    const doc = projeKur();
    M.revizyonYayinla(doc); // beyaz
    M.revizyonYayinla(doc); // mavi
    ciz();
    const [r, g, bl] = RENK_ZEMINI.mavi.map((k) => Math.round(k * 255));
    expect(el('revizyon-renk')?.style.background).toBe(`rgb(${r}, ${g}, ${bl})`);
  });

  it('üstbilgi metni ekranda görünüyor — hangi revizyonun basılacağı belli', () => {
    const doc = projeKur();
    M.revizyonYayinla(doc);
    M.revizyonYayinla(doc, 'Çekim öncesi');
    ciz();
    expect(yer!.textContent).toContain('ÇEKİM ÖNCESİ REVİZYON');
  });

  it('English export hint shows the localized revision name', () => {
    const doc = projeKur();
    M.revizyonYayinla(doc);
    M.revizyonYayinla(doc);
    arayuzDiliniAyarla('en');
    ciz();
    expect(yer!.textContent).toContain('BLUE REVISION');
  });

  it('açılınca "yalnız işaretli" seçeneği çıkıyor ve VARSAYILAN AÇIK', () => {
    const doc = projeKur();
    M.revizyonYayinla(doc, 'Mavi');
    ciz();
    expect(el('yalniz-isaretli')).toBeNull();
    tikla('revizyon-ac');
    expect((el('yalniz-isaretli') as HTMLInputElement).checked).toBe(true);
  });

  it('işaret sayısı gösteriliyor', () => {
    const doc = projeKur();
    M.revizyonYayinla(doc, 'Mavi');
    const bloklar = useProjectStore.getState().project.script.blocks;
    M.revizyonIsaretle(doc, [bloklar[1].id, bloklar[3].id]);
    ciz();
    tikla('revizyon-ac');
    expect(el('isaret-sayisi')?.textContent).toContain('2');
  });

  it('hiç işaret yokken UYARIYOR — boş çıktı sürpriz olmasın', () => {
    const doc = projeKur();
    M.revizyonYayinla(doc, 'Mavi');
    ciz();
    tikla('revizyon-ac');
    expect(el('isaret-sayisi')?.textContent).toContain('hiç işaret yok');
    tikla('yalniz-isaretli');
    expect(el('isaret-sayisi')?.textContent).toContain('sayfalar renksiz basılır');
  });

  it('ESKİ revizyonun işaretleri sayılmıyor — yalnız etkin dağıtım', () => {
    const doc = projeKur();
    const bloklar = useProjectStore.getState().project.script.blocks;
    M.revizyonYayinla(doc, 'İlk');
    M.revizyonIsaretle(doc, [bloklar[1].id]);
    M.revizyonYayinla(doc, 'İkinci');
    M.revizyonIsaretle(doc, [bloklar[3].id]);
    ciz();
    tikla('revizyon-ac');
    expect(el('isaret-sayisi')?.textContent).toContain('1');
  });
});
