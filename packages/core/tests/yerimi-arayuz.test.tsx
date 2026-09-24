// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { YerImleriCekmecesi } from '@storyboard/core/components/script/YerImleriCekmecesi';
import { useShortcuts } from '@storyboard/core/hooks/useShortcuts';
import { useUiStore } from '@storyboard/core/store/ui';
import { useProjectStore } from '@storyboard/core/store/project';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';
import type { ScriptBlock } from '@storyboard/core/model/script';

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

const blok = (i: number): ScriptBlock => ({
  id: `b${i}`, fp: `f${i}`, type: 'action', text: `Satır ${i}`, scene: '', sceneId: '',
});

function projeKur() {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  M.setScript(doc, { name: 's', blocks: [0, 1, 2, 3, 4].map(blok) });
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
  useUiStore.setState({
    viewMode: 'senaryo', yerImiCekmecesi: true, scriptCursor: null, scriptSelection: [],
  });
});

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

describe('çekmece — sağ denetçinin sekmesi', () => {
  /* Panel artık sağ denetçinin SEKMESİ: üç ayrı sütun 1440px'te sayfayı
     ezerdi ve tasarımın "sayfa odaktadır" kararını bozardı. Hangi sekmenin
     açık olduğu oturumluk `inspectorTab`'da. */
  it('sekme seçimi OTURUMLUK mağazada, belgede değil', () => {
    const doc = projeKur();
    const once = Y.encodeStateAsUpdate(doc).length;
    useUiStore.setState({ inspectorTab: 'imler' });
    expect(useUiStore.getState().inspectorTab).toBe('imler');
    expect(Y.encodeStateAsUpdate(doc).length).toBe(once);
  });

  it('panel gövdesi sekme içinde çiziliyor', () => {
    projeKur();
    ciz(<YerImleriCekmecesi />);
    expect(el('yer-imleri-cekmecesi')).not.toBeNull();
  });

  /* Boş bir kutu kullanıcıya bir şeyin yüklenmediğini düşündürür. */
  it('hiç im yokken ne yapılacağını SÖYLÜYOR', () => {
    projeKur();
    ciz(<YerImleriCekmecesi />);
    expect(el('yer-imleri-cekmecesi')!.textContent).toMatch(/Henüz yer imi yok/);
  });
});

describe('çekmece listesi', () => {
  it('imler BELGE SIRASINA göre listeleniyor', () => {
    const doc = projeKur();
    M.yerImiKoy(doc, 'b3', { etiket: 'sonra' });
    M.yerImiKoy(doc, 'b1', { etiket: 'once' });
    ciz(<YerImleriCekmecesi />);
    const satirlar = [...yer!.querySelectorAll('li')].map((l) => l.textContent ?? '');
    expect(satirlar[0]).toContain('once');
    expect(satirlar[1]).toContain('sonra');
  });

  /* Etiket boşsa "isimsiz" gibi bir doldurma metni hangi satır olduğunu
     söylemezdi. */
  it('etiketsiz im SATIR METNİYLE gösteriliyor', () => {
    const doc = projeKur();
    M.yerImiKoy(doc, 'b2');
    ciz(<YerImleriCekmecesi />);
    expect(el('ime-git-b2')!.textContent).toContain('Satır 2');
  });

  it('silinmiş bloğun imi listede GÖRÜNMÜYOR ama veriden atılmıyor', () => {
    const doc = projeKur();
    M.yerImiKoy(doc, 'yok-olan', { etiket: 'bayat' });
    M.yerImiKoy(doc, 'b1', { etiket: 'canlı' });
    ciz(<YerImleriCekmecesi />);
    expect(yer!.textContent).not.toContain('bayat');
    expect(yer!.querySelectorAll('li')).toHaveLength(1);
    expect(useProjectStore.getState().yerImleri['yok-olan']).toBeDefined();
  });

  it('etiket düzenlemesi belgeye yazılıyor', () => {
    const doc = projeKur();
    M.yerImiKoy(doc, 'b1');
    ciz(<YerImleriCekmecesi />);
    const girdi = el('etiket-b1') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
      )!.set!;
      setter.call(girdi, 'Arzu itirafi');
      girdi.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(useProjectStore.getState().yerImleri.b1.etiket).toBe('Arzu itirafi');
  });

  it('renk seçimi belgeye yazılıyor ve etiketi bozmuyor', () => {
    const doc = projeKur();
    M.yerImiKoy(doc, 'b1', { etiket: 'ad' });
    ciz(<YerImleriCekmecesi />);
    act(() => { (el('renk-b1-mavi') as HTMLButtonElement).click(); });
    expect(useProjectStore.getState().yerImleri.b1).toEqual({ etiket: 'ad', renk: 'mavi' });
  });

  it('silme düğmesi imi kaldırıyor', () => {
    const doc = projeKur();
    M.yerImiKoy(doc, 'b1');
    ciz(<YerImleriCekmecesi />);
    act(() => { (el('imi-sil-b1') as HTMLButtonElement).click(); });
    expect(useProjectStore.getState().yerImleri.b1).toBeUndefined();
  });

  /* Gezinmek belgeyi değiştirmez; salt-okur kullanıcı da imlere gidebilmeli. */
  it('salt-okurda düzenleme kapalı ama GİTME açık', () => {
    const doc = projeKur();
    M.yerImiKoy(doc, 'b1', { etiket: 'x' });
    useProjectStore.getState().setRole('viewer');
    ciz(<YerImleriCekmecesi />);
    expect((el('imi-sil-b1') as HTMLButtonElement).disabled).toBe(true);
    expect((el('etiket-b1') as HTMLInputElement).disabled).toBe(true);
    expect((el('ime-git-b1') as HTMLButtonElement).disabled).toBe(false);
    useProjectStore.getState().setRole('owner');
  });

  it('ime tıklamak imleci o satıra taşıyor', () => {
    const doc = projeKur();
    M.yerImiKoy(doc, 'b3', { etiket: 'x' });
    ciz(<YerImleriCekmecesi />);
    act(() => { (el('ime-git-b3') as HTMLButtonElement).click(); });
    expect(useUiStore.getState().scriptCursor).toBe('b3');
    expect(useUiStore.getState().viewMode).toBe('senaryo');
  });
});

describe('kısayollar', () => {
  function Sonda() {
    useShortcuts({ onSave: () => {} });
    return null;
  }
  /* `altKey` AÇIK: yer imi kısayolları senaryo görünümünde yaşıyor ve orada
     çıplak harf kısayolu yoktur (kullanıcı kararı, 2026-08-26) — yazarken
     `b` harfi yer imi koymamalı. */
  const bas = (key: string) => {
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }),
      );
    });
  };

  it('B imleçteki satırda im koyup kaldırıyor', () => {
    projeKur();
    useUiStore.setState({ scriptCursor: 'b2' });
    ciz(<Sonda />);
    bas('b');
    expect(useProjectStore.getState().yerImleri.b2).toBeDefined();
    bas('b');
    expect(useProjectStore.getState().yerImleri.b2).toBeUndefined();
  });

  it('imleç yokken B hiçbir şey yapmıyor', () => {
    projeKur();
    useUiStore.setState({ scriptCursor: null });
    ciz(<Sonda />);
    bas('b');
    expect(Object.keys(useProjectStore.getState().yerImleri)).toHaveLength(0);
  });

  /* İm bir SATIRA ait; panoda imlenecek satır yok. */
  it('pano görünümünde B sessiz kalıyor', () => {
    projeKur();
    useUiStore.setState({ viewMode: 'board', scriptCursor: 'b2' });
    ciz(<Sonda />);
    bas('b');
    expect(Object.keys(useProjectStore.getState().yerImleri)).toHaveLength(0);
  });

  it('salt-okur kullanıcı im koyamıyor', () => {
    projeKur();
    useProjectStore.getState().setRole('viewer');
    useUiStore.setState({ scriptCursor: 'b2' });
    ciz(<Sonda />);
    bas('b');
    expect(Object.keys(useProjectStore.getState().yerImleri)).toHaveLength(0);
    useProjectStore.getState().setRole('owner');
  });

  it('> sonraki, < önceki ime gidiyor', () => {
    const doc = projeKur();
    M.yerImiKoy(doc, 'b1');
    M.yerImiKoy(doc, 'b3');
    useUiStore.setState({ scriptCursor: 'b0' });
    ciz(<Sonda />);
    bas('>');
    expect(useUiStore.getState().scriptCursor).toBe('b1');
    bas('>');
    expect(useUiStore.getState().scriptCursor).toBe('b3');
    bas('<');
    expect(useUiStore.getState().scriptCursor).toBe('b1');
  });

  /* Sarmasaydı son imdeyken tuş sessizce hiçbir şey yapmaz ve kullanıcı
     kısayolun bozulduğunu sanardı. */
  it('son imden sonra başa SARMALIYOR', () => {
    const doc = projeKur();
    M.yerImiKoy(doc, 'b1');
    M.yerImiKoy(doc, 'b3');
    useUiStore.setState({ scriptCursor: 'b3' });
    ciz(<Sonda />);
    bas('>');
    expect(useUiStore.getState().scriptCursor).toBe('b1');
  });

  it('hiç im yokken gezinme imleci OYNATMIYOR', () => {
    projeKur();
    useUiStore.setState({ scriptCursor: 'b2' });
    ciz(<Sonda />);
    bas('>');
    expect(useUiStore.getState().scriptCursor).toBe('b2');
  });

  it('salt-okur kullanıcı imler arasında GEZEBİLİYOR', () => {
    const doc = projeKur();
    M.yerImiKoy(doc, 'b3');
    useProjectStore.getState().setRole('viewer');
    useUiStore.setState({ scriptCursor: 'b0' });
    ciz(<Sonda />);
    bas('>');
    expect(useUiStore.getState().scriptCursor).toBe('b3');
    useProjectStore.getState().setRole('owner');
  });
});
