// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { KadroSekmesi } from '@storyboard/core/components/inspector/KadroSekmesi';
import { useUiStore } from '@storyboard/core/store/ui';
import { useProjectStore } from '@storyboard/core/store/project';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';
import type { ScriptBlock } from '@storyboard/core/model/script';

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

const blok = (i: number, tip: ScriptBlock['type'], metin: string): ScriptBlock => ({
  id: `b${i}`, fp: `f${i}`, type: tip, text: metin, scene: '', sceneId: `s${i}`,
});

function projeKur(bloklar: ScriptBlock[] = []) {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  M.setScript(doc, { name: 's', blocks: bloklar });
  return doc;
}

function ciz(oge: React.ReactNode) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(oge); });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

beforeEach(() => {
  useUiStore.setState({ viewMode: 'senaryo', scriptCursor: null, scriptLang: 'tr' });
});

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

describe('kadro sekmesi — boş durum', () => {
  it('hiç karakter/lokasyon yokken ne olduğunu söylüyor', () => {
    projeKur();
    ciz(<KadroSekmesi />);
    expect(el('kadro-sekmesi')!.textContent).toMatch(/hiç karakter yok/);
    expect(el('kadro-sekmesi')!.textContent).toMatch(/hiç sahne başlığı yok/);
  });
});

describe('kadro sekmesi — karakter listesi', () => {
  it('senaryoda geçen karakterler listeleniyor', () => {
    projeKur([
      blok(0, 'character', 'AYŞE'),
      blok(1, 'dialogue', 'Gitmiyorum.'),
      blok(2, 'character', 'MEHMET'),
    ]);
    ciz(<KadroSekmesi />);
    expect(el('karakter-git-AYŞE')).not.toBeNull();
    expect(el('karakter-git-MEHMET')).not.toBeNull();
  });

  it('uzantılı ad (V.O.) AYNI satırda birleşiyor — iki satır açmıyor', () => {
    projeKur([
      blok(0, 'character', 'AYŞE'),
      blok(1, 'character', 'AYŞE (V.O.)'),
    ]);
    ciz(<KadroSekmesi />);
    expect(yer!.querySelectorAll('[data-testid^="karakter-git-"]')).toHaveLength(1);
  });

  it('karaktere tıklamak İLK göründüğü satıra gidiyor', () => {
    projeKur([
      blok(0, 'action', 'Sahne açılır.'),
      blok(1, 'character', 'AYŞE'),
    ]);
    ciz(<KadroSekmesi />);
    act(() => { (el('karakter-git-AYŞE') as HTMLButtonElement).click(); });
    expect(useUiStore.getState().scriptCursor).toBe('b1');
    expect(useUiStore.getState().viewMode).toBe('senaryo');
  });

  it('kayıtlı ama senaryoda GEÇMEYEN karakterin gitme düğmesi devre dışı', () => {
    const doc = projeKur();
    M.karakterEkle(doc, { ad: 'Kayıp Karakter' });
    ciz(<KadroSekmesi />);
    expect((el('karakter-git-Kayıp Karakter') as HTMLButtonElement).disabled).toBe(true);
  });

  it('kayıtlı karakterin açıklaması gösteriliyor', () => {
    const doc = projeKur([blok(0, 'character', 'AYŞE')]);
    M.karakterEkle(doc, { ad: 'Ayşe', aciklama: 'Baş karakter' });
    ciz(<KadroSekmesi />);
    expect(el('karakter-git-Ayşe')!.textContent).toContain('Baş karakter');
  });
});

describe('kadro sekmesi — lokasyon listesi', () => {
  it('sahne başlıklarından lokasyon çıkarılıyor', () => {
    projeKur([
      blok(0, 'scene', 'İÇ. MUTFAK - GÜN'),
      blok(1, 'scene', 'DIŞ. SOKAK - GECE'),
    ]);
    ciz(<KadroSekmesi />);
    expect(el('lokasyon-git-MUTFAK')!.textContent).toMatch(/İÇ/);
    expect(el('lokasyon-git-SOKAK')!.textContent).toMatch(/DIŞ/);
  });

  it('lokasyona tıklamak ilk sahnesine gidiyor', () => {
    projeKur([blok(0, 'scene', 'İÇ. MUTFAK - GÜN')]);
    ciz(<KadroSekmesi />);
    act(() => { (el('lokasyon-git-MUTFAK') as HTMLButtonElement).click(); });
    expect(useUiStore.getState().scriptCursor).toBe('b0');
  });

  it('aynı mekân tekrar eden sahnelerde TEK satır gösteriliyor', () => {
    projeKur([
      blok(0, 'scene', 'İÇ. MUTFAK - GÜN'),
      blok(1, 'scene', 'İÇ. MUTFAK - GECE'),
    ]);
    ciz(<KadroSekmesi />);
    expect(yer!.querySelectorAll('[data-testid^="lokasyon-git-"]')).toHaveLength(1);
  });
});
