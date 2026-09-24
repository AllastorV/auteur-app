// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { RevizyonSeridi } from '@storyboard/core/components/script/RevizyonSeridi';
import { arayuzDiliniAyarla } from '@storyboard/core/dil/arayuz';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { loadProjectIntoDoc, revizyonIsaretleriMap } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';
import { RENK_ZEMINI } from '@storyboard/core/model/revizyon';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * REVİZYON ŞERİDİ — senaryo panelinde, kanvasın kendisinde.
 *
 * jsdom'a mount edip çıktısını okuyor: kaynak dizgisi arayan bir test
 * bileşenin çalıştığını değil yalnız yazıldığını söyler.
 */

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
    blocks: [b('scene', 'İÇ. ATÖLYE — GECE'), b('action', 'Torna döner.'), b('character', 'DEMİR')],
  });
  return doc;
}

function ciz(duzenlenebilir = true) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(<RevizyonSeridi duzenlenebilir={duzenlenebilir} />); });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const tikla = (id: string) => act(() => { (el(id) as HTMLElement).click(); });

beforeEach(() => arayuzDiliniAyarla('tr'));
afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
  useUiStore.setState({ scriptSecili: [], scriptCursor: null });
  arayuzDiliniAyarla('tr');
});

describe('yetki', () => {
  it('düzenleyemeyen rolde şerit HİÇ çizilmiyor', () => {
    projeKur();
    ciz(false);
    expect(el('revizyon-seridi')).toBeNull();
  });
});

describe('revizyon yokken', () => {
  it('"Revizyon yok" ve yalnız yayınlama düğmesi', () => {
    projeKur();
    ciz();
    expect(el('serit-yok')).not.toBeNull();
    expect(el('serit-yayinla')).not.toBeNull();
    expect(el('serit-isaretle')).toBeNull();
  });

  it('yayınlayınca ilk revizyon açılıyor', () => {
    const doc = projeKur();
    ciz();
    tikla('serit-yayinla');
    expect(M.revizyonlariOku(doc)).toHaveLength(1);
    expect(el('serit-ad')?.textContent).toContain('BEYAZ REVİZYON');
  });
});

describe('revizyon varken', () => {
  it('etkin revizyonun rengi ve adı gösteriliyor', () => {
    const doc = projeKur();
    M.revizyonYayinla(doc);
    M.revizyonYayinla(doc, 'Çekim öncesi');
    ciz();
    const [r, g, bl] = RENK_ZEMINI.mavi.map((k) => Math.round(k * 255));
    expect(el('serit-renk')?.style.background).toBe(`rgb(${r}, ${g}, ${bl})`);
    expect(el('serit-ad')?.textContent).toContain('ÇEKİM ÖNCESİ REVİZYON');
  });

  it('English UI shows the colour and revision heading in English', () => {
    const doc = projeKur();
    M.revizyonYayinla(doc);
    M.revizyonYayinla(doc);
    arayuzDiliniAyarla('en');
    ciz();
    expect(el('serit-ad')?.textContent).toContain('BLUE REVISION');
  });

  it('English revision toast translates the default colour name', () => {
    const doc = projeKur();
    M.revizyonYayinla(doc);
    arayuzDiliniAyarla('en');
    ciz();
    tikla('serit-yayinla');
    expect(useUiStore.getState().toast?.message).toContain('Blue revision opened');
  });

  it('seçim yokken işaretlemiyor — kullanıcıya söylüyor', () => {
    const doc = projeKur();
    M.revizyonYayinla(doc);
    ciz();
    tikla('serit-isaretle');
    expect(revizyonIsaretleriMap(doc).size).toBe(0);
  });

  it('seçili satırları işaretliyor ve sayaç güncelleniyor', () => {
    const doc = projeKur();
    M.revizyonYayinla(doc);
    const bloklar = useProjectStore.getState().project.script.blocks;
    act(() => { useUiStore.setState({ scriptSecili: [bloklar[0].id, bloklar[1].id] }); });
    ciz();
    tikla('serit-isaretle');
    expect(revizyonIsaretleriMap(doc).size).toBe(2);
    expect(el('serit-sayi')?.textContent).toContain('2');
  });

  it('ikinci tıklama işareti KALDIRIYOR', () => {
    const doc = projeKur();
    M.revizyonYayinla(doc);
    const bloklar = useProjectStore.getState().project.script.blocks;
    act(() => { useUiStore.setState({ scriptSecili: [bloklar[0].id] }); });
    ciz();
    tikla('serit-isaretle');
    expect(revizyonIsaretleriMap(doc).size).toBe(1);
    tikla('serit-isaretle');
    expect(revizyonIsaretleriMap(doc).size).toBe(0);
  });

  it('sayaç YALNIZ etkin revizyonun işaretlerini sayıyor', () => {
    const doc = projeKur();
    const bloklar = useProjectStore.getState().project.script.blocks;
    M.revizyonYayinla(doc, 'İlk');
    M.revizyonIsaretle(doc, [bloklar[0].id, bloklar[1].id]);
    M.revizyonYayinla(doc, 'İkinci');
    M.revizyonIsaretle(doc, [bloklar[2].id]);
    ciz();
    expect(el('serit-sayi')?.textContent).toContain('1');
  });

  it('yeni revizyon yayınlamak ESKİ işaretleri silmiyor', () => {
    const doc = projeKur();
    const bloklar = useProjectStore.getState().project.script.blocks;
    M.revizyonYayinla(doc, 'İlk');
    M.revizyonIsaretle(doc, [bloklar[0].id]);
    ciz();
    tikla('serit-yayinla');
    expect(revizyonIsaretleriMap(doc).size).toBe(1);
    expect(el('serit-sayi')?.textContent).toContain('0');
  });
});


describe('renk açılır menüsü', () => {
  it('on kare önizleme ve tek seçili renk; seçim belgeyi ve şeridi günceller', () => {
    const doc = projeKur();
    const rev = M.revizyonYayinla(doc, 'Çekim');
    ciz();
    tikla('revizyon-renk-secici');
    const menu = el('revizyon-renk-menusu')!;
    expect(menu.querySelectorAll('[role="menuitemradio"]')).toHaveLength(10);
    expect(menu.querySelectorAll('[data-renk]')).toHaveLength(10);
    expect(menu.querySelectorAll('[aria-checked="true"]')).toHaveLength(1);
    tikla('revizyon-renk-tan');
    expect(M.etkinRevizyon(doc)).toEqual({ ...rev, renk: 'tan' });
    expect(el('revizyon-renk-menusu')).toBeNull();
    expect(document.activeElement).toBe(el('revizyon-renk-secici'));
    const rgb = RENK_ZEMINI.tan.map((k) => Math.round(k * 255)).join(', ');
    expect(el('serit-renk')?.style.background).toBe(`rgb(${rgb})`);
  });
});
