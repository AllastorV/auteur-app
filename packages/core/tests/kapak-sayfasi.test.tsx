// @vitest-environment jsdom
import * as Y from 'yjs';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { setScript } from '@storyboard/core/doc/mutations';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { readBaslikSayfasi } from '@storyboard/core/doc/schema';
import { KapakSayfasi } from '@storyboard/core/components/script/KapakSayfasi';
import { ScriptEditor } from '@storyboard/core/components/script/ScriptEditor';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { ORAN } from '@storyboard/core/disa/baslik-sayfasi';
import type { PlatformAdapter } from '@storyboard/core/platform/types';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * KAPAK SAYFASI — senaryonun ilk sayfası, yerinde düzenlenir.
 *
 * Kullanıcı kararı (2026-08-27): dialogda değil, senaryo kağıdının ÜSTÜNDE
 * gerçek bir sayfa; varsayılan AÇIK.
 *
 * Buradaki en önemli iddia YERLEŞİMİN TEK EVDEN geldiği: alanların dikey
 * konumu `ORAN` tablosundan okunuyor. Ekran kendi oranını yazsaydı biri
 * düzeltilip öteki unutulduğunda önizleme PDF'ten sessizce ıraksardı ve
 * "gördüğün şey basılan şey" sözü çökerdi.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

const SENARYO = {
  name: 'kapak',
  blocks: [{ id: 'sb_1', fp: '', type: 'action', text: 'Gece.',
    scene: '1', sceneId: 'sc_1' } as ScriptBlock],
};

const SAHTE_PLATFORM = {
  kind: 'web', canSaveLocally: true, canExportVideo: false, veriGuvenligi: null, dil: null,
} as unknown as PlatformAdapter;

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
  useUiStore.setState({ kapakKapali: false });
});

function ciz(ogeler: React.ReactNode, rol: 'owner' | 'commenter' = 'owner') {
  const doc = new Y.Doc();
  setScript(doc, SENARYO);
  useProjectStore.getState().attachDoc(doc, rol);
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => {
    kok!.render(<PlatformProvider platform={SAHTE_PLATFORM}>{ogeler}</PlatformProvider>);
  });
  return doc;
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLInputElement | null;

function yaz(id: string, deger: string) {
  const alan = el(id)!;
  const yerlesik = Object.getOwnPropertyDescriptor(
    alan.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  )!.set!;
  act(() => {
    yerlesik.call(alan, deger);
    alan.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('kapak sayfası — yerinde düzenleme', () => {
  it('varsayılan AÇIK ve senaryo kağıdından ÖNCE geliyor', () => {
    ciz(<ScriptEditor />);
    const kapak = yer!.querySelector('[data-testid="kapak-sayfasi"]');
    const kagit = yer!.querySelector('.senaryo-kagit');
    expect(kapak).not.toBeNull();
    expect(kagit).not.toBeNull();
    /* Sıra: DOM'da kapak önce gelmeli — `compareDocumentPosition` 4 =
       "following". Mutant kapağı kağıdın ALTINA koyarsa burada ölür. */
    expect(kapak!.compareDocumentPosition(kagit!) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it('kapalıyken hiç çizilmiyor', () => {
    useUiStore.setState({ kapakKapali: true });
    ciz(<ScriptEditor />);
    expect(yer!.querySelector('[data-testid="kapak-sayfasi"]')).toBeNull();
    expect(yer!.querySelector('.senaryo-kagit')).not.toBeNull();
  });

  it('alanlar belgeye yazılıyor — başlık, yazar, tarih', () => {
    const doc = ciz(<KapakSayfasi />);
    yaz('kapak-baslik', 'KÜÇÜK KIYAMET');
    yaz('kapak-yazar', 'Ayşe Yılmaz\nMehmet Demir');
    yaz('kapak-tarih', '27 Ağustos 2026');
    const kayit = readBaslikSayfasi(doc);
    expect(kayit.baslik).toBe('KÜÇÜK KIYAMET');
    /* Çok satırlı yazar KORUNUYOR — birden fazla yazar alt alta. */
    expect(kayit.yazar).toBe('Ayşe Yılmaz\nMehmet Demir');
    expect(kayit.tarih).toBe('27 Ağustos 2026');
  });

  it('iletişim satırlara bölünüyor, taslak ayrı alanda', () => {
    const doc = ciz(<KapakSayfasi />);
    yaz('kapak-iletisim', 'Ajans A\n0212 000 00 00');
    yaz('kapak-surum', '2. taslak');
    const kayit = readBaslikSayfasi(doc);
    expect(kayit.iletisim).toEqual(['Ajans A', '0212 000 00 00']);
    /* Taslak ve tarih AYRI alanlar — tek alana sıkıştırılmıyor. */
    expect(kayit.surum).toBe('2. taslak');
  });

  it('YERLEŞİM ORAN tablosundan — ekran ile PDF aynı sayıyı okuyor', () => {
    ciz(<KapakSayfasi />);
    /* Mutant: bileşen kendi oranını yazarsa (ör. 0.4) bu iddia düşer. */
    expect(el('kapak-baslik')!.style.top).toBe(`${ORAN.baslikUst * 100}%`);
    expect(el('kapak-yazar')!.style.top).toBe(`${ORAN.yazarUst * 100}%`);
    expect(el('kapak-iletisim')!.style.bottom).toBe(`${ORAN.iletisimAlt * 100}%`);
    expect(el('kapak-tarih')!.style.bottom).toBe(`${ORAN.tarihAlt * 100}%`);
    /* Tarih taslaktan AYRI yükseklikte — üst üste binmiyor. */
    expect(el('kapak-tarih')!.style.bottom).not.toBe(el('kapak-surum')!.style.bottom);
  });

  it('"yazan" satırı yazar BOŞKEN yazılmıyor — PDF ile aynı kural', () => {
    ciz(<KapakSayfasi />);
    expect(el('kapak-yazan')!.textContent).toBe('');
    yaz('kapak-yazar', 'Ayşe');
    expect(el('kapak-yazan')!.textContent).toBe('yazan');
  });

  it('yorumcu rolünde alanlar SALT OKUNUR', () => {
    ciz(<KapakSayfasi />, 'commenter');
    expect(el('kapak-baslik')!.readOnly).toBe(true);
    expect(el('kapak-yazar')!.readOnly).toBe(true);
  });
});
