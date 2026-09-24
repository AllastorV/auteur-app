// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { KarsilastirDialog } from '@storyboard/core/components/dialogs/KarsilastirDialog';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { useProjectStore } from '@storyboard/core/store/project';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { packProject } from '@storyboard/core/model/project-io';
import * as M from '@storyboard/core/doc/mutations';
import type { PlatformAdapter } from '@storyboard/core/platform/types';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * F3'ün asıl sözü: SEÇEREK geri getirme. Sürüm geçmişi bugüne kadar
 * hepsi-ya-da-hiçbiri idi; bir sahneyi geri istemek için bütün belgeyi geri
 * almak ve aradaki bütün işi kaybetmek gerekiyordu.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

const b = (id: string, text: string, tip: ScriptBlock['type'] = 'action'): ScriptBlock =>
  ({ id, fp: text, type: tip, text, scene: '', sceneId: 'sc1' });

async function paketle(bloklar: ScriptBlock[]) {
  const proje = createProject({ panels: [createPanel()] });
  return packProject({
    project: { ...proje, script: { name: 's', blocks: bloklar } },
    assets: {},
  });
}

function projeKur(bloklar: ScriptBlock[]) {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  M.setScript(doc, { name: 's', blocks: bloklar });
  return doc;
}

function platformKur(surumVerisi: Uint8Array | null) {
  return {
    kind: 'desktop', canSaveLocally: true, canExportVideo: false,
    veriGuvenligi: null, dil: null,
    listVersions: async () => [{ id: 'v1.sbp', savedAt: 1_700_000_000_000, label: 'otomatik', size: 10 }],
    restoreVersion: async () => surumVerisi,
  } as unknown as PlatformAdapter;
}

async function ciz(platform: PlatformAdapter) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  await act(async () => {
    kok!.render(
      <PlatformProvider platform={platform}>
        <KarsilastirDialog onClose={() => {}} />
      </PlatformProvider>,
    );
    await Promise.resolve();
  });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

async function surumSec() {
  const sec = el('karsilastir-surum') as HTMLSelectElement;
  await act(async () => {
    sec.value = 'v1.sbp';
    sec.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
  /* Paket açma GERÇEK asenkron (JSZip); mikro-görev yetmiyor. Sonuç
     görünene kadar bekleniyor — sabit bir gecikme makineye göre flake üretirdi. */
  for (let i = 0; i < 100; i++) {
    if (el('fark-ozeti') || el('fark-yok') || el('karsilastir-hata')) return;
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  }
}

const metinler = () =>
  useProjectStore.getState().project.script!.blocks.map((x) => x.text);

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

describe('fark gösterimi', () => {
  it('sürüm seçilmeden fark gösterilmiyor', async () => {
    projeKur([b('1', 'bir')]);
    await ciz(platformKur(await paketle([b('1', 'bir')])));
    expect(el('fark-ozeti')).toBeNull();
  });

  it('aynı içerikte FARK YOK deniyor', async () => {
    projeKur([b('1', 'bir')]);
    await ciz(platformKur(await paketle([b('1', 'bir')])));
    await surumSec();
    expect(el('fark-yok')).not.toBeNull();
  });

  it('değişiklik özeti sayılarla gösteriliyor', async () => {
    projeKur([b('1', 'BİR YENİ'), b('9', 'eklenen')]);
    await ciz(platformKur(await paketle([b('1', 'bir'), b('2', 'iki')])));
    await surumSec();
    const metin = el('fark-ozeti')!.textContent!;
    expect(metin).toMatch(/1 eklendi/);
    expect(metin).toMatch(/1 silindi/);
    expect(metin).toMatch(/1 değişti/);
  });

  it('sürüm okunamazsa hata METNİYLE gösteriliyor', async () => {
    projeKur([b('1', 'bir')]);
    await ciz(platformKur(null));
    await surumSec();
    expect(el('karsilastir-hata')!.textContent).toMatch(/okunamadı/);
  });
});

describe('seçerek geri getirme', () => {
  const sec = (id: string) =>
    act(() => { (el(`fark-sec-${id}`) as HTMLInputElement).click(); });
  const geriGetir = () =>
    act(() => { (el('secileni-geri-getir') as HTMLButtonElement).click(); });

  it('hiçbir şey seçilmeden düğme KAPALI', async () => {
    projeKur([b('1', 'BİR YENİ')]);
    await ciz(platformKur(await paketle([b('1', 'bir')])));
    await surumSec();
    expect((el('secileni-geri-getir') as HTMLButtonElement).disabled).toBe(true);
  });

  it('seçilen DEĞİŞİK blok eski metnine dönüyor', async () => {
    projeKur([b('1', 'BİR YENİ'), b('2', 'iki')]);
    await ciz(platformKur(await paketle([b('1', 'bir'), b('2', 'iki')])));
    await surumSec();
    sec('1');
    geriGetir();
    expect(metinler()).toEqual(['bir', 'iki']);
  });

  /* "Seçerek" sözü buradan tutuluyor: seçilmeyen değişiklikler DURUYOR. */
  it('seçilmeyen değişiklik DOKUNULMADAN kalıyor', async () => {
    projeKur([b('1', 'BİR YENİ'), b('2', 'İKİ YENİ')]);
    await ciz(platformKur(await paketle([b('1', 'bir'), b('2', 'iki')])));
    await surumSec();
    sec('1');
    geriGetir();
    expect(metinler()).toEqual(['bir', 'İKİ YENİ']);
  });

  it('seçilen SİLİNMİŞ blok eski yerine geri konuyor', async () => {
    projeKur([b('1', 'bir'), b('3', 'üç')]);
    await ciz(platformKur(await paketle([b('1', 'bir'), b('2', 'iki'), b('3', 'üç')])));
    await surumSec();
    sec('2');
    geriGetir();
    // Sona eklenseydi geri getirilen satır belgenin sonunda kalırdı.
    expect(metinler()).toEqual(['bir', 'iki', 'üç']);
  });

  it('seçilen EKLENMİŞ blok kaldırılıyor', async () => {
    projeKur([b('1', 'bir'), b('9', 'sonradan')]);
    await ciz(platformKur(await paketle([b('1', 'bir')])));
    await surumSec();
    sec('9');
    geriGetir();
    expect(metinler()).toEqual(['bir']);
  });

  it('birden çok seçim tek adımda uygulanıyor', async () => {
    projeKur([b('1', 'BİR YENİ'), b('9', 'sonradan')]);
    await ciz(platformKur(await paketle([b('1', 'bir')])));
    await surumSec();
    sec('1');
    sec('9');
    geriGetir();
    expect(metinler()).toEqual(['bir']);
  });

  /* Yanlış seçim UCUZ olmalı: tek geri alma adımı. */
  it('geri getirme TEK geri alma adımı', async () => {
    projeKur([b('1', 'BİR YENİ'), b('2', 'İKİ YENİ')]);
    await ciz(platformKur(await paketle([b('1', 'bir'), b('2', 'iki')])));
    await surumSec();
    useProjectStore.getState().undoManager.stopCapturing();
    sec('1');
    sec('2');
    geriGetir();
    expect(metinler()).toEqual(['bir', 'iki']);

    act(() => { useProjectStore.getState().undo(); });
    expect(metinler()).toEqual(['BİR YENİ', 'İKİ YENİ']);
  });

  it('uygulandıktan sonra seçim TEMİZLENİYOR — kazara ikinci kez uygulanmasın', async () => {
    projeKur([b('1', 'BİR YENİ')]);
    await ciz(platformKur(await paketle([b('1', 'bir')])));
    await surumSec();
    sec('1');
    geriGetir();
    expect((el('secileni-geri-getir') as HTMLButtonElement).disabled).toBe(true);
  });
});
