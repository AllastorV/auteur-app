// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { SozlukBolumu } from '@storyboard/core/components/inspector/SozlukBolumu';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { useProjectStore } from '@storyboard/core/store/project';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';
import type { PlatformAdapter } from '@storyboard/core/platform/types';

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

const platform = (dil: PlatformAdapter['dil']): PlatformAdapter =>
  ({ kind: 'desktop', canSaveLocally: true, canExportVideo: false, veriGuvenligi: null, dil }) as unknown as PlatformAdapter;

const sahteDil = (): PlatformAdapter['dil'] => ({
  async denetimDilleri() { return ['tr', 'en-US']; },
  async denetimDilleriniAyarla() {},
  async sozlugüYükle() {},
  async anahtarYaz() {},
  async anahtarOku() { return null; },
});

function projeKur() {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  return doc;
}

function ciz(dil: PlatformAdapter['dil'] = sahteDil()) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => {
    kok!.render(
      <PlatformProvider platform={platform(dil)}>
        <SozlukBolumu />
      </PlatformProvider>,
    );
  });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

const yaz = (girdi: HTMLInputElement, deger: string) => {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    )!.set!;
    setter.call(girdi, deger);
    girdi.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => { projeKur(); });

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

describe('sözlüğe ekleme', () => {
  it('kelime belgeye yazılıyor ve listede görünüyor', () => {
    ciz();
    yaz(el('sozluk-girdi') as HTMLInputElement, 'Ayşe');
    act(() => { (el('sozluk-ekle') as HTMLButtonElement).click(); });
    expect(Object.values(useProjectStore.getState().sozluk)).toContain('Ayşe');
    expect(el('sozluk-listesi')!.textContent).toContain('Ayşe');
  });

  it('Enter da ekliyor — fareye uzanmak gerekmiyor', () => {
    ciz();
    const girdi = el('sozluk-girdi') as HTMLInputElement;
    yaz(girdi, 'Kenji');
    act(() => {
      girdi.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(Object.values(useProjectStore.getState().sozluk)).toContain('Kenji');
  });

  it('ekledikten sonra girdi TEMİZLENİYOR — art arda ekleme kolay olsun', () => {
    ciz();
    yaz(el('sozluk-girdi') as HTMLInputElement, 'Ayşe');
    act(() => { (el('sozluk-ekle') as HTMLButtonElement).click(); });
    expect((el('sozluk-girdi') as HTMLInputElement).value).toBe('');
  });

  /* Uygunsuz kelime sessizce yutulsaydı kullanıcı eklediğini sanıp kırmızı
     altçizginin sürmesine şaşırırdı. */
  it('uygunsuz kelime REDDEDİLİYOR ve sebebi söyleniyor', () => {
    ciz();
    yaz(el('sozluk-girdi') as HTMLInputElement, '123');
    act(() => { (el('sozluk-ekle') as HTMLButtonElement).click(); });
    expect(el('sozluk-hata')).not.toBeNull();
    expect(Object.keys(useProjectStore.getState().sozluk)).toHaveLength(0);
  });

  it('yeni yazmaya başlayınca hata mesajı kalkıyor', () => {
    ciz();
    yaz(el('sozluk-girdi') as HTMLInputElement, '123');
    act(() => { (el('sozluk-ekle') as HTMLButtonElement).click(); });
    yaz(el('sozluk-girdi') as HTMLInputElement, 'Ay');
    expect(el('sozluk-hata')).toBeNull();
  });
});

describe('sözlükten çıkarma ve liste', () => {
  it('çarpı kelimeyi kaldırıyor', () => {
    const doc = projeKur();
    M.sozlugeEkle(doc, 'Ayşe');
    ciz();
    act(() => { (el('sozluk-sil-Ayşe') as HTMLButtonElement).click(); });
    expect(Object.keys(useProjectStore.getState().sozluk)).toHaveLength(0);
  });

  it('liste TÜRKÇE sıralanıyor — ASCII sırası Ç ve Ş harflerini sona atardı', () => {
    const doc = projeKur();
    for (const k of ['Zeynep', 'Çiğdem', 'Ayşe']) M.sozlugeEkle(doc, k);
    ciz();
    const metin = el('sozluk-listesi')!.textContent!;
    expect(metin.indexOf('Ayşe')).toBeLessThan(metin.indexOf('Çiğdem'));
    expect(metin.indexOf('Çiğdem')).toBeLessThan(metin.indexOf('Zeynep'));
  });

  it('boş sözlükte durum söyleniyor', () => {
    ciz();
    expect(el('sozluk-bolumu')!.textContent).toMatch(/kelime yok/);
  });

  it('salt-okur kullanıcıda ekleme ve silme kapalı', () => {
    const doc = projeKur();
    M.sozlugeEkle(doc, 'Ayşe');
    useProjectStore.getState().setRole('viewer');
    ciz();
    expect((el('sozluk-girdi') as HTMLInputElement).disabled).toBe(true);
    expect((el('sozluk-ekle') as HTMLButtonElement).disabled).toBe(true);
    expect((el('sozluk-sil-Ayşe') as HTMLButtonElement).disabled).toBe(true);
    useProjectStore.getState().setRole('owner');
  });
});

describe('kabuk yoksa DÜRÜST olunuyor', () => {
  /* §15.4'ün ruhu: vaat edilen yetenek gerçek olmalı. Web'de denetleyici yok;
     kullanıcı eklediği kelimenin bir işe yaradığını sanmamalı. */
  it('dil kabuğu yokken uyarı gösteriliyor', () => {
    ciz(null);
    expect(el('denetim-yok')).not.toBeNull();
    expect(el('denetim-yok')!.textContent).toMatch(/yazım denetimi yok/);
  });

  it('uyarı, sözlüğün yine de SAKLANDIĞINI söylüyor', () => {
    ciz(null);
    expect(el('denetim-yok')!.textContent).toMatch(/projeyle birlikte/);
  });

  it('kabuk varken uyarı YOK', () => {
    ciz();
    expect(el('denetim-yok')).toBeNull();
  });

  it('kabuk yokken bile kelime eklenebiliyor — proje sözlüğü belgede yaşar', () => {
    ciz(null);
    yaz(el('sozluk-girdi') as HTMLInputElement, 'Ayşe');
    act(() => { (el('sozluk-ekle') as HTMLButtonElement).click(); });
    expect(Object.values(useProjectStore.getState().sozluk)).toContain('Ayşe');
  });
});
