// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { OdakKenari } from '@storyboard/core/components/script/OdakKenari';
import { useShortcuts } from '@storyboard/core/hooks/useShortcuts';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';
import type { ScriptBlock } from '@storyboard/core/model/script';
import type { YaziciDurumu } from '@storyboard/core/veri/yazici';

/**
 * B · Odak modu. Bütün paneller çekilir; kenarda kalan ÜÇ şey bilinçlidir:
 * sahne konumu, sayaçlar, kayıt göstergesi. Üçü de yazarken göz kaydırmadan
 * okunabilir ama dikkat çekmez.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;
let sayac = 0;

const b = (tip: ScriptBlock['type'], text: string): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `f${sayac}`, type: tip, text, scene: '', sceneId: `sc${sayac}` });

const durum = (yama: Partial<YaziciDurumu> = {}): YaziciDurumu => ({
  ardArdaHata: 0, sonHata: null, engelleyici: false,
  sonYazim: 1_700_000_000_000, bekleyen: 0, ...yama,
});

function projeKur() {
  sayac = 0;
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  M.setScript(doc, {
    name: 's',
    blocks: [
      b('scene', 'İÇ. MUTFAK - GECE'),
      b('action', 'Ayşe girer ve masaya oturur.'),
      b('scene', 'DIŞ. SOKAK - GÜNDÜZ'),
      b('action', 'Yağmur.'),
    ],
  });
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
  projeKur();
  useUiStore.setState({ viewMode: 'senaryo', odakModu: false, chromeHidden: false, scriptCursor: null });
});

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

describe('kenar bilgisi', () => {
  it('sahne konumu gösteriliyor', () => {
    ciz(<OdakKenari durum={durum()} />);
    expect(el('odak-konum')!.textContent).toMatch(/\/ 2/);
  });

  it('imleç ikinci sahnedeyken konum 2 diyor', () => {
    const bloklar = useProjectStore.getState().project.script!.blocks;
    useUiStore.setState({ scriptCursor: bloklar[3].id });
    ciz(<OdakKenari durum={durum()} />);
    expect(el('odak-konum')!.textContent).toMatch(/sahne 2 \/ 2/);
  });

  /* Sahne başlığı olmayan bir açılışta sayım yine bir cevap üretmeli;
     `undefined` göstermek kullanıcıyı yönelimsiz bırakırdı. */
  it('imleç hiç yokken konum kırılmıyor', () => {
    ciz(<OdakKenari durum={durum()} />);
    expect(el('odak-konum')).not.toBeNull();
  });

  it('sahne yoksa konum hiç çizilmiyor', () => {
    const doc = useProjectStore.getState().doc;
    act(() => { M.setScript(doc, { name: 's', blocks: [b('action', 'Tek satır.')] }); });
    ciz(<OdakKenari durum={durum()} />);
    expect(el('odak-konum')).toBeNull();
  });

  it('sayaçlar sol altta ve Courier', () => {
    ciz(<OdakKenari durum={durum()} />);
    expect(el('odak-sayaclar')!.className).toContain('mzn-sayi');
    expect(el('odak-sayaclar')!.textContent).toMatch(/kelime/);
  });

  /* §15.4: "kaydedildi mi?" sorusu kullanıcının aklına gelmemeli — odak
     modunda da. */
  it('kayıt göstergesi durumu SÖYLÜYOR', () => {
    ciz(<OdakKenari durum={durum()} />);
    expect(el('odak-kayit')!.textContent).toMatch(/kaydedildi/);
  });

  it('henüz yazılmadıysa bunu söylüyor', () => {
    ciz(<OdakKenari durum={durum({ sonYazim: null })} />);
    expect(el('odak-kayit')!.textContent).toMatch(/bekliyor/);
  });

  it('koruma yoksa gösterge hiç çizilmiyor — olmayan bir şey vaat edilmiyor', () => {
    ciz(<OdakKenari durum={null} />);
    expect(el('odak-kayit')).toBeNull();
  });

  /* Odak modunda menü yok; kullanıcı nasıl çıkacağını tahmin etmek zorunda
     kalmamalı. */
  it('çıkış yolu YAZILI ve çalışıyor', () => {
    useUiStore.setState({ odakModu: true, chromeHidden: true });
    ciz(<OdakKenari durum={durum()} />);
    expect(el('odak-cik')!.textContent).toMatch(/Esc/);
    act(() => { (el('odak-cik') as HTMLButtonElement).click(); });
    expect(useUiStore.getState().odakModu).toBe(false);
    expect(useUiStore.getState().chromeHidden).toBe(false);
  });
});

describe('Escape en KAPSAYICI şeyden çıkıyor', () => {
  function Sonda() { useShortcuts({ onSave: () => {} }); return null; }
  const esc = () => act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });

  /* Ters sırada odak modundan çıkmak iki Esc isterdi ve kullanıcı ilkinde
     hiçbir şey olmadığını görüp tuşun çalışmadığını sanardı. */
  it('odak modundayken TEK Esc çıkarıyor', () => {
    useUiStore.setState({ odakModu: true, chromeHidden: true });
    ciz(<Sonda />);
    esc();
    expect(useUiStore.getState().odakModu).toBe(false);
    expect(useUiStore.getState().chromeHidden).toBe(false);
  });

  it('yalnız arayüz gizliyken Esc onu geri getiriyor', () => {
    useUiStore.setState({ odakModu: false, chromeHidden: true });
    ciz(<Sonda />);
    esc();
    expect(useUiStore.getState().chromeHidden).toBe(false);
  });
});
