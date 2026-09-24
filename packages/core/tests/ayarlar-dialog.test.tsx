// @vitest-environment jsdom
import React from 'react';
import * as Y from 'yjs';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { AyarlarDialog } from '@storyboard/core/components/dialogs/AyarlarDialog';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { setScript } from '@storyboard/core/doc/mutations';
import type { PlatformAdapter } from '@storyboard/core/platform/types';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * AYARLAR — uygulamanın bütün tercihlerinin TEK evi.
 *
 * Kullanıcı kararı (2026-08-27): "anlık ulaşmak gerekmeyen ayarları genel
 * ayarlara taşı" + "genel ayarlara bir kısayol tablosu da ekle".
 *
 * Bu dosyanın işi taşınan her ayarın GERÇEKTEN burada olduğunu ve
 * ÇALIŞTIĞINI ölçmek. Bu oturumun dersi: bir özelliğin testi yeşil olabilir
 * ama üretimde hiç bağlanmamış olabilir — o yüzden her ayar tıklanıp
 * mağazaya yazıldığı doğrulanıyor.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

const SAHTE_PLATFORM = {
  kind: 'web', canSaveLocally: true, canExportVideo: false,
  veriGuvenligi: null, dil: null, baslangic: null,
} as unknown as PlatformAdapter;

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
  useUiStore.setState({
    daktiloModu: false, akilliDuzeltme: true, arayuzOlcegi: 1,
    sayfaSonuSurekliligi: false, kapakKapali: false,
  });
});

function ciz() {
  const doc = new Y.Doc();
  setScript(doc, {
    name: 'a',
    blocks: [{ id: 'b1', fp: '', type: 'action', text: 'x', scene: '', sceneId: '' } as ScriptBlock],
  });
  useProjectStore.getState().attachDoc(doc, 'owner');
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => {
    kok!.render(
      <PlatformProvider platform={SAHTE_PLATFORM}>
        <AyarlarDialog onClose={() => {}} />
      </PlatformProvider>,
    );
  });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLInputElement | null;
const tikla = (id: string) => act(() => { el(id)!.click(); });

describe('Ayarlar — taşınan her ayar burada', () => {
  it('Yazım sekmesinden taşınanlar Ayarlar\'da', () => {
    ciz();
    /* Kağıt, belge dili, kilitli ölçüler. */
    expect(el('kagit-sec')).not.toBeNull();
    expect(el('dil-sec')).not.toBeNull();
    expect(el('kilit-yaziTipi')).not.toBeNull();
    /* SAYFA RENGİ BURADA DEĞİL — kullanıcı düzeltmesi (2026-08-28):
       yazarken değiştirilen bir ayar, evi Yazım sekmesi. Tek ev (Karar 2):
       ikisinde birden dursaydı biri güncellenip öteki eskirdi. */
    expect(el('sayfa-rengi-sepya')).toBeNull();
  });

  it('yeni senaryo ayarları Ayarlar\'da', () => {
    ciz();
    expect(el('sahne-no')).not.toBeNull();
    expect(el('diyalog-no')).not.toBeNull();
    expect(el('sayfa-sonu-surekliligi')).not.toBeNull();
    expect(el('sure-yontemi')).not.toBeNull();
  });

  it('yazma paketleri ve görünüm Ayarlar\'da', () => {
    ciz();
    expect(el('akilli-duzeltme')).not.toBeNull();
    expect(el('daktilo-modu')).not.toBeNull();
    expect(el('daktilo-sesi')).not.toBeNull();
    expect(el('arayuz-olcegi')).not.toBeNull();
    expect(el('arayuz-dili')).not.toBeNull();
  });

  it('KISAYOL TABLOSU Ayarlar\'da — kullanıcı kararı', () => {
    ciz();
    /* Tablo gövdesi ShortcutsDialog ile ORTAK; burada varlığı ve gerçek
       kısayol satırı taşıdığı ölçülüyor. */
    expect(yer!.textContent).toContain('Ctrl+S');
    expect(yer!.textContent).toContain('Ctrl+Z');
  });
});

describe('Ayarlar — ayarlar GERÇEKTEN bağlı', () => {
  it('daktilo modu tıklanınca mağazaya yazılıyor', () => {
    ciz();
    expect(useUiStore.getState().daktiloModu).toBe(false);
    tikla('daktilo-modu');
    expect(useUiStore.getState().daktiloModu).toBe(true);
  });

  it('sayfa sonu sürekliliği tıklanınca mağazaya yazılıyor', () => {
    ciz();
    tikla('sayfa-sonu-surekliligi');
    expect(useUiStore.getState().sayfaSonuSurekliligi).toBe(true);
  });

  it('kapak sayfası anahtarı TERS mantıkla doğru bağlı', () => {
    ciz();
    /* Mağaza `kapakKapali` tutuyor, kutu "göster" diyor — ters çevirim
       yanlış bağlansaydı kutu açıkken kapak gizlenirdi. */
    expect(el('kapak-goster')!.checked).toBe(true);
    tikla('kapak-goster');
    expect(useUiStore.getState().kapakKapali).toBe(true);
  });

  it('sayfa sonu sürekliliği UYARI ile işaretli — sayfa sayısını değiştirir', () => {
    ciz();
    /* Kullanıcı sayfa sayısını değiştiren bir ayarı uyarısız açmamalı. */
    const etiket = el('sayfa-sonu-surekliligi')!.closest('label')!;
    expect(etiket.textContent).toContain('SAYFA SAYISINI');
  });
});

describe('Ayarlar POPUP değil, tam ekran PANEL', () => {
  /* Kullanıcı kararı (2026-08-27): "ayarlar ekranı popup değil normal bir
     panel olucak." İçerik altı bölüme çıktı ve dar bir kutuda her ayar için
     kaydırmak gerekiyordu. */
  it('modal kabuğu YOK — tam ekran panel var', () => {
    ciz();
    expect(el('ayarlar-paneli')).not.toBeNull();
    /* Modal'ın yarı saydam örtüsü kalmamalı: bu bir kesinti değil,
       gidilen bir yer. */
    expect(yer!.querySelector('[data-testid="modal-ortu"]')).toBeNull();
    /* Panel kabuğu ekranı tümüyle kaplıyor — dar bir kutu değil. */
    expect(el('ayarlar-paneli')!.className).toContain('inset-0');
  });

  it('sol bölüm listesi VAR ve bölümlere bağlı', () => {
    ciz();
    for (const kid of ['gorunum', 'yazma', 'senaryo', 'kisayollar']) {
      const bag = yer!.querySelector(`[data-testid="ayar-git-${kid}"]`) as HTMLAnchorElement | null;
      expect(bag, kid).not.toBeNull();
      /* Bağlantı gerçek bir bölüme gitmeli — ölü çapa olmasın. */
      expect(bag!.getAttribute('href')).toBe(`#ayar-${kid}`);
      expect(yer!.querySelector(`#ayar-${kid}`), `${kid} bölümü`).not.toBeNull();
    }
  });

  it('platforma bağlı bölümler listede de YOK', () => {
    /* Sahte platformda `iliskilendirme` ve `baslangic` null; listede ölü
       bağlantı bırakmamalı. */
    ciz();
    expect(el('ayar-git-dosya')).toBeNull();
    expect(el('ayar-git-baslangic')).toBeNull();
  });

  it('geri düğmesi paneli kapatıyor', () => {
    let kapandi = false;
    yer = document.createElement('div');
    document.body.appendChild(yer);
    kok = createRoot(yer);
    const doc = new Y.Doc();
    setScript(doc, {
      name: 'a',
      blocks: [{ id: 'b1', fp: '', type: 'action', text: 'x', scene: '', sceneId: '' } as ScriptBlock],
    });
    useProjectStore.getState().attachDoc(doc, 'owner');
    act(() => {
      kok!.render(
        <PlatformProvider platform={SAHTE_PLATFORM}>
          <AyarlarDialog onClose={() => { kapandi = true; }} />
        </PlatformProvider>,
      );
    });
    tikla('ayarlar-kapat');
    expect(kapandi).toBe(true);
  });
});
