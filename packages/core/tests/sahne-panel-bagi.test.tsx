// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { useSahnePanelBagi } from '@storyboard/core/hooks/useSahnePanelBagi';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * F5 bitiş ölçütü: **sahneyi taşı → kartı taşınıyor.**
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

const blok = (id: string, sceneId: string): ScriptBlock =>
  ({ id, fp: id, type: 'action', text: id, scene: '', sceneId });

function Sonda() { useSahnePanelBagi(); return null; }

function ciz() {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(<Sonda />); });
}

/** Üç panelli proje; her panel bir sahneye bağlı. */
function projeKur() {
  const doc = new Y.Doc();
  const paneller = [createPanel(), createPanel(), createPanel()].map((p, i) => ({
    ...p, id: `p${i + 1}`,
  }));
  loadProjectIntoDoc(doc, createProject({ panels: paneller }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  M.setScript(doc, {
    name: 's',
    blocks: [blok('b1', 'sc1'), blok('b2', 'sc2'), blok('b3', 'sc3')],
  });
  M.linkPanelScript(doc, 'p1', ['b1']);
  M.linkPanelScript(doc, 'p2', ['b2']);
  M.linkPanelScript(doc, 'p3', ['b3']);
  return doc;
}

const panelSirasi = () => useProjectStore.getState().project.panels.map((p) => p.id);

const senaryoyuSirala = (doc: Y.Doc, sira: string[]) =>
  act(() => {
    M.setScript(doc, {
      name: 's',
      blocks: sira.map((id, i) => blok(id, `sc${i + 1}`)),
    });
  });

beforeEach(() => { useUiStore.setState({ sahnePanelBagi: true }); });

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

describe('canlı bağ', () => {
  it('açılışta kullanıcı düzenini senaryo değişmemişken ezmez', () => {
    const doc = projeKur();
    M.movePanel(doc, 'p3', 0);
    ciz();
    expect(panelSirasi()).toEqual(['p3', 'p1', 'p2']);
  });
  it('yalnız elle taşınan kartı senaryo değişmeden geri sıralamaz', () => {
    const doc = projeKur();
    ciz();
    act(() => { M.movePanel(doc, 'p3', 0); });
    expect(panelSirasi()).toEqual(['p3', 'p1', 'p2']);
  });
  it('sahne taşınınca KART da taşınıyor', () => {
    const doc = projeKur();
    ciz();
    expect(panelSirasi()).toEqual(['p1', 'p2', 'p3']);

    senaryoyuSirala(doc, ['b3', 'b1', 'b2']);
    expect(panelSirasi()).toEqual(['p3', 'p1', 'p2']);
  });

  it('sıra değişmediyse hiç yazım yapılmıyor', () => {
    const doc = projeKur();
    ciz();
    const once = Y.encodeStateAsUpdate(doc).length;
    senaryoyuSirala(doc, ['b1', 'b2', 'b3']);
    // Senaryo yazımı var ama PANEL taşıması olmamalı; boyut yalnız senaryodan artar.
    expect(panelSirasi()).toEqual(['p1', 'p2', 'p3']);
    expect(Y.encodeStateAsUpdate(doc).length).toBeGreaterThanOrEqual(once);
  });

  /* Otomatik sıralama panodaki elle düzeni ezebilir; karar kullanıcının. */
  it('bağ KAPALIYKEN paneller dokunulmadan kalıyor', () => {
    const doc = projeKur();
    useUiStore.setState({ sahnePanelBagi: false });
    ciz();
    senaryoyuSirala(doc, ['b3', 'b1', 'b2']);
    expect(panelSirasi()).toEqual(['p1', 'p2', 'p3']);
  });

  it('salt-okur kullanıcı sıralama YAZMIYOR', () => {
    const doc = projeKur();
    useProjectStore.getState().setRole('viewer');
    ciz();
    senaryoyuSirala(doc, ['b3', 'b1', 'b2']);
    expect(panelSirasi()).toEqual(['p1', 'p2', 'p3']);
    useProjectStore.getState().setRole('owner');
  });

  it('bağsız panel YERİNDE kalıyor', () => {
    const doc = projeKur();
    // p2'nin bağını kaldır: artık hiçbir satıra bağlı değil.
    act(() => { M.unlinkPanelScript(doc, 'p2', ['b2']); });
    ciz();
    senaryoyuSirala(doc, ['b3', 'b2', 'b1']);
    // p2 ortada kalmalı; p1 ve p3 kendi aralarında yer değiştirmeli.
    expect(panelSirasi()[1]).toBe('p2');
    expect([panelSirasi()[0], panelSirasi()[2]]).toEqual(['p3', 'p1']);
  });

  /* Ayrı adım olsaydı Ctrl+Z bir kez metni, bir kez kartları geri alırdı —
     aynı eylemin iki kez geri alınması. */
  it('geri alma metni VE kartları birlikte döndürüyor', () => {
    const doc = projeKur();
    ciz();
    useProjectStore.getState().undoManager.stopCapturing();
    senaryoyuSirala(doc, ['b3', 'b1', 'b2']);
    expect(panelSirasi()).toEqual(['p3', 'p1', 'p2']);

    act(() => { useProjectStore.getState().undo(); });
    expect(panelSirasi()).toEqual(['p1', 'p2', 'p3']);
  });

  it('tek panelli projede çalışmıyor — taşınacak bir şey yok', () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
    useProjectStore.getState().attachDoc(doc, 'owner');
    M.setScript(doc, { name: 's', blocks: [blok('b1', 'sc1')] });
    ciz();
    expect(() => senaryoyuSirala(doc, ['b1'])).not.toThrow();
  });
});
