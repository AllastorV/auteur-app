// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { useBaglamMenusu } from '@storyboard/core/hooks/useBaglamMenusu';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';
import { baglamMenusu, type MenuDurumu } from '@storyboard/core/dil/menu';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * Ana süreç menüyü çiziyor ama menünün DURUMUNU ve belgeye dokunan
 * eylemlerin nasıl uygulanacağını bilmiyor. Köprü bu ikisini taşıyor.
 * Kararın kendisi saf `baglamMenusu`'nda — burası yalnız ona girdi üretiyor.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

const blok = (i: number, tip: ScriptBlock['type'] = 'action'): ScriptBlock => ({
  id: `b${i}`, fp: `f${i}`, type: tip, text: `Satır ${i}`, scene: '', sceneId: '',
});

function projeKur() {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel(), createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  M.setScript(doc, { name: 's', blocks: [0, 1, 2].map((i) => blok(i)) });
  return doc;
}

function Sonda() { useBaglamMenusu(); return null; }

function ciz() {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(<Sonda />); });
}

const durum = () => window.__mizansenMenuDurumu!() as MenuDurumu;
const eylem = (e: Parameters<NonNullable<typeof window.__mizansenMenuEylem>>[0]) =>
  act(() => { window.__mizansenMenuEylem!(e); });

beforeEach(() => {
  projeKur();
  useUiStore.setState({ viewMode: 'senaryo', scriptSelection: [], scriptSecili: [], scriptCursor: null, yoksayilanKelimeler: [] });
  ciz();
});

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

describe('köprü kuruluyor ve sökülüyor', () => {
  it('iki global de tanımlı', () => {
    expect(typeof window.__mizansenMenuDurumu).toBe('function');
    expect(typeof window.__mizansenMenuEylem).toBe('function');
  });

  /* Sökülmezse kapatılan bir belgenin mutasyonları çağrılabilir kalırdı. */
  it('sökülünce globaller kalkıyor', () => {
    act(() => { kok?.unmount(); kok = null; });
    expect(window.__mizansenMenuDurumu).toBeUndefined();
    expect(window.__mizansenMenuEylem).toBeUndefined();
  });
});

describe('menü durumu', () => {
  it('seçim yokken satır sayısı sıfır', () => {
    expect(durum().seciliSatir).toBe(0);
    expect(durum().secimVar).toBe(false);
  });

  it('tek tip seçimde blok tipi bildiriliyor', () => {
    useUiStore.setState({ scriptSelection: ['b0', 'b1'] });
    expect(durum().blokTipi).toBe('action');
  });

  /* Karışık seçimde `undefined` — menü o zaman hiçbirini pasif yapmıyor,
     yani kullanıcı hepsini tek tipe çevirebiliyor. */
  it('karışık seçimde blok tipi UNDEFINED', () => {
    const p = useProjectStore.getState();
    M.setScript(p.doc, { name: 's', blocks: [blok(0, 'scene'), blok(1, 'action')] });
    useUiStore.setState({ scriptSelection: ['b0', 'b1'] });
    expect(durum().blokTipi).toBeUndefined();
    expect(baglamMenusu(durum()).flat().filter((x) => x.eylem.tur === 'blok-tipi' && x.pasif))
      .toHaveLength(0);
  });

  it('rol durumdan okunuyor', () => {
    useProjectStore.getState().setRole('viewer');
    expect(durum().duzenlenebilir).toBe(false);
    useProjectStore.getState().setRole('owner');
    expect(durum().duzenlenebilir).toBe(true);
  });

  it('bağlı panel bildiriliyor', () => {
    const p = useProjectStore.getState();
    useUiStore.setState({ scriptSelection: ['b1'] });
    expect(durum().bagliPanelVar).toBe(false);
    act(() => { M.linkPanelScript(p.doc, p.project.panels[0].id, ['b1']); });
    expect(durum().bagliPanelVar).toBe(true);
  });
});

describe('eylemler', () => {
  it('sözlüğe ekleme belgeye yazıyor', () => {
    eylem({ tur: 'sozluge-ekle', kelime: 'Ayşe' });
    expect(Object.values(useProjectStore.getState().sozluk)).toContain('Ayşe');
  });

  /* Yoksayma belgeye yazılsaydı bir yazarın "bu kelime önemsiz" kararı
     bütün ekibin sözlüğüne girerdi. */
  it('yoksayma OTURUMLUK — belgeye yazılmıyor', () => {
    const doc = useProjectStore.getState().doc;
    const once = Y.encodeStateAsUpdate(doc).length;
    eylem({ tur: 'yoksay', kelime: 'zzz' });
    expect(useUiStore.getState().yoksayilanKelimeler).toContain('zzz');
    expect(Y.encodeStateAsUpdate(doc).length).toBe(once);
  });

  it('blok tipi YALNIZ seçili satırları değiştiriyor', () => {
    useUiStore.setState({ scriptSelection: ['b1'] });
    eylem({ tur: 'blok-tipi', tip: 'scene' });
    const bloklar = useProjectStore.getState().project.script!.blocks;
    expect(bloklar.find((b) => b.id === 'b1')!.type).toBe('scene');
    expect(bloklar.find((b) => b.id === 'b0')!.type).toBe('action');
  });

  it('panele bağlama aktif panele yazıyor', () => {
    const p = useProjectStore.getState();
    p.setActivePanel(p.project.panels[1].id);
    useUiStore.setState({ scriptSelection: ['b2'] });
    eylem({ tur: 'panele-bagla' });
    const panel = useProjectStore.getState().project.panels[1];
    expect(panel.scriptRefs).toContain('b2');
  });

  it('bağı kaldırma yalnız SEÇİLİ satırı çıkarıyor', () => {
    const p = useProjectStore.getState();
    act(() => { M.linkPanelScript(p.doc, p.project.panels[0].id, ['b0', 'b1']); });
    useUiStore.setState({ scriptSelection: ['b1'] });
    eylem({ tur: 'bagi-kaldir' });
    const refs = useProjectStore.getState().project.panels[0].scriptRefs ?? [];
    expect(refs).toEqual(['b0']);
  });

  it('panele git modu değiştiriyor', () => {
    const p = useProjectStore.getState();
    act(() => { M.linkPanelScript(p.doc, p.project.panels[1].id, ['b2']); });
    useUiStore.setState({ scriptSelection: ['b2'], viewMode: 'senaryo' });
    eylem({ tur: 'panele-git' });
    expect(useUiStore.getState().viewMode).toBe('board');
    expect(useProjectStore.getState().activePanelId).toBe(p.project.panels[1].id);
  });

  /* Pano ve öneri eylemleri ana süreçte uygulanıyor; buraya ulaşmaları bir
     köprü hatası olurdu ve sessizce yutulmaları doğru. */
  it('pano eylemleri köprüde SESSİZ geçiyor, çökmüyor', () => {
    const doc = useProjectStore.getState().doc;
    const once = Y.encodeStateAsUpdate(doc).length;
    for (const tur of ['kes', 'kopyala', 'yapistir', 'tumunu-sec'] as const) {
      expect(() => eylem({ tur })).not.toThrow();
    }
    expect(Y.encodeStateAsUpdate(doc).length).toBe(once);
  });
});


describe('sağ tık revizyon rengi', () => {
  it('üst şeritle aynı revizyonu günceller ve on renkli menüyü seçili renkle döndürür', () => {
    const doc = useProjectStore.getState().doc;
    act(() => { M.revizyonYayinla(doc); useUiStore.setState({ viewMode: 'senaryo' }); });
    const renkler = baglamMenusu(durum()).flat().filter((o) => o.eylem.tur === 'revizyon-rengi');
    expect(renkler).toHaveLength(10);
    expect(renkler.filter((o) => o.secili)).toHaveLength(1);
    eylem({ tur: 'revizyon-rengi', renk: 'tan' });
    expect(durum().revizyonRengi).toBe('tan');
    expect(M.revizyonlariOku(doc)).toHaveLength(1);
  });

  it('salt okunur rolde menü pasiftir ve doğrudan eylem de reddedilir', () => {
    const doc = useProjectStore.getState().doc;
    act(() => {
      M.revizyonYayinla(doc);
      useUiStore.setState({ viewMode: 'senaryo' });
      useProjectStore.getState().setRole('viewer');
    });
    const renkler = baglamMenusu(durum()).flat().filter((o) => o.eylem.tur === 'revizyon-rengi');
    expect(renkler).toHaveLength(10);
    expect(renkler.every((o) => o.pasif)).toBe(true);
    eylem({ tur: 'revizyon-rengi', renk: 'tan' });
    expect(M.etkinRevizyon(doc)?.renk).toBe('beyaz');
  });

  it('storyboard görünümünde renk menüsü ve renk yazımı yok', () => {
    const doc = useProjectStore.getState().doc;
    act(() => { M.revizyonYayinla(doc); useUiStore.setState({ viewMode: 'board' }); });
    expect(durum().revizyonRengi).toBeUndefined();
    eylem({ tur: 'revizyon-rengi', renk: 'tan' });
    expect(M.etkinRevizyon(doc)?.renk).toBe('beyaz');
  });
});

it('sağ tık karışık seçimi işaretleyip kaldırır', () => {
  const doc = useProjectStore.getState().doc;
  act(() => { M.revizyonYayinla(doc); M.revizyonIsaretle(doc, ['b0']); });
  useUiStore.setState({ scriptSecili: ['b0', 'b1'], scriptCursor: 'b0' });
  expect(durum().revizyonIsaretleme).toBe('isaretle');
  eylem({ tur: 'revizyon-isaretle' });
  expect(M.revizyonIsaretleriniOku(doc).size).toBe(2);
  expect(durum().revizyonIsaretleme).toBe('kaldir');
  eylem({ tur: 'revizyon-isaretle' });
  expect(M.revizyonIsaretleriniOku(doc).size).toBe(0);
});

it('etkin revizyon, seçim veya yazma yetkisi yoksa sağ tık işaretlemez', () => {
  const doc = useProjectStore.getState().doc;
  useUiStore.setState({ scriptSecili: ['b0'] });
  expect(durum().revizyonIsaretleme).toBeUndefined();
  eylem({ tur: 'revizyon-isaretle' });
  act(() => { M.revizyonYayinla(doc); useProjectStore.getState().setRole('viewer'); });
  expect(durum().revizyonIsaretleme).toBeUndefined();
  eylem({ tur: 'revizyon-isaretle' });
  expect(M.revizyonIsaretleriniOku(doc).size).toBe(0);
  act(() => { useProjectStore.getState().setRole('owner'); });
  useUiStore.setState({ scriptSecili: [], scriptSelection: [], scriptCursor: null });
  expect(durum().revizyonIsaretleme).toBeUndefined();
});


it('tuvalde eski senaryo seçimi menüye ve eylemlere sızmaz', () => {
  useUiStore.setState({ viewMode: 'board', scriptSelection: ['b0'], scriptCursor: 'b0' });
  const before = Y.encodeStateAsUpdate(useProjectStore.getState().doc);
  expect(baglamMenusu(durum()).flat().map(x => x.eylem.tur)).not.toContain('blok-tipi');
  expect(durum().seciliSatir).toBe(0);
  eylem({ tur: 'blok-tipi', tip: 'scene' });
  expect(Y.encodeStateAsUpdate(useProjectStore.getState().doc)).toEqual(before);
});
