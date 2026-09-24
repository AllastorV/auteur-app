// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { YazarlikDialog } from '@storyboard/core/components/dialogs/YazarlikDialog';
import { ShortcutsDialog } from '@storyboard/core/components/dialogs/ShortcutsDialog';
import { useShortcuts } from '@storyboard/core/hooks/useShortcuts';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import type { PlatformAdapter, YazarlikKaydi } from '@storyboard/core/platform/types';

/**
 * "Kim ne yazdı" penceresi — §arayüz tarafı.
 *
 * Alt katman (`yazarlikCozumle`, `birlestir`, `kimYazdi`) zaten
 * `veri/yazarlik.test.ts`'te ölçülü; burada ÖLÇÜLEN şey KABLOLAMA: liste
 * sıralaması, imleç sorgusu, uydurma isim yasağı, kısayol ve web kapısı.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

beforeEach(() => {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  useUiStore.setState({ scriptCursor: null, viewMode: 'board' });
});

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

function platformKur(yazarlik: PlatformAdapter['yazarlik']): PlatformAdapter {
  return {
    kind: yazarlik ? 'desktop' : 'web',
    canSaveLocally: Boolean(yazarlik),
    canExportVideo: false,
    dil: null,
    baslangic: null,
    veriGuvenligi: null,
    yazarlik,
  } as unknown as PlatformAdapter;
}

async function ciz(platform: PlatformAdapter) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  await act(async () => {
    kok!.render(
      <PlatformProvider platform={platform}>
        <YazarlikDialog onClose={() => {}} />
      </PlatformProvider>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const hepsi = (sel: string) => [...yer!.querySelectorAll(sel)] as HTMLElement[];

describe('liste — en yeniden eskiye', () => {
  it('kayıtlar en yeniden eskiye sıralı gösteriliyor', async () => {
    const kayitlar: YazarlikKaydi[] = [
      { zaman: 1_000, yazar: 'Eski Yazar', bloklar: ['b1'] },
      { zaman: 3_000, yazar: 'Yeni Yazar', bloklar: ['b2'] },
      { zaman: 2_000, yazar: 'Orta Yazar', bloklar: ['b3'] },
    ];
    await ciz(platformKur({ ekle: async () => {}, oku: async () => kayitlar }));
    const isimler = hepsi('[data-testid^="yazarlik-kayit-yazar-"]').map((n) => n.textContent);
    expect(isimler).toEqual(['Yeni Yazar', 'Orta Yazar', 'Eski Yazar']);
  });

  it('hiç kayıt yoksa tek cümlelik boş durum gösteriliyor', async () => {
    await ciz(platformKur({ ekle: async () => {}, oku: async () => [] }));
    expect(el('yazarlik-bos')).not.toBeNull();
    expect(el('yazarlik-bos')?.textContent).toContain('Henüz kayıt yok');
  });

  it('ad METİN olarak görünüyor — yalnız renk taşıyıcı değil', async () => {
    await ciz(platformKur({
      ekle: async () => {},
      oku: async () => [{ zaman: 1_000, yazar: 'Ada Lovelace', bloklar: ['b1'] }],
    }));
    const ad = el('yazarlik-kayit-yazar-0');
    expect(ad?.textContent).toBe('Ada Lovelace');
  });
});

describe('imleçteki satırın yazarı', () => {
  it('kimYazdi bir kayıt bulursa adı ve zamanı gösteriyor', async () => {
    useUiStore.setState({ scriptCursor: 'b-hedef' });
    await ciz(platformKur({
      ekle: async () => {},
      oku: async () => [{ zaman: Date.now() - 60_000, yazar: 'Zeynep', bloklar: ['b-hedef'] }],
    }));
    expect(el('yazarlik-imlec-yazar')).not.toBeNull();
    expect(el('yazarlik-imlec-yazar-ad')?.textContent).toBe('Zeynep');
    expect(el('yazarlik-imlec-bilinmiyor')).toBeNull();
  });

  it('kimYazdi null dönerse "Bilinmiyor" yazıyor — UYDURMA İSİM YOK', async () => {
    useUiStore.setState({ scriptCursor: 'baska-blok' });
    await ciz(platformKur({
      ekle: async () => {},
      oku: async () => [{ zaman: Date.now(), yazar: 'Zeynep', bloklar: ['b-baska'] }],
    }));
    expect(el('yazarlik-imlec-bilinmiyor')).not.toBeNull();
    expect(el('yazarlik-imlec-bilinmiyor')?.textContent?.toLowerCase()).toContain('bilinmiyor');
    // Hiçbir isim uydurulmadı — imleç bölümünde "yazar" testid'i hiç çizilmedi
    // (kayıttaki "Zeynep" adı alttaki listede görünse de imleç sorusunu cevaplamıyor).
    expect(el('yazarlik-imlec-yazar')).toBeNull();
    expect(el('yazarlik-imlec-yazar-ad')).toBeNull();
  });

  it('imleç bir satırda değilse "bilinmiyor" değil, ayrı bir durum gösteriyor', async () => {
    await ciz(platformKur({ ekle: async () => {}, oku: async () => [] }));
    expect(el('yazarlik-imlec-yok')).not.toBeNull();
    expect(el('yazarlik-imlec-bilinmiyor')).toBeNull();
  });
});

describe('web kabuğu — yazarlik yeteneği yok', () => {
  it('platform.yazarlik === null ise "yalnızca masaüstü" gösteriyor', async () => {
    await ciz(platformKur(null));
    expect(el('yazarlik-desteklenmiyor')).not.toBeNull();
    expect(el('yazarlik-liste')).toBeNull();
  });
});

describe('kısayol — `Y`', () => {
  function Sonda({ tetikle }: { tetikle: () => void }) {
    useShortcuts({ onSave: () => {}, onYazarlik: tetikle });
    return null;
  }

  it('panoda çıplak `Y` pencereyi açıyor', () => {
    useUiStore.setState({ viewMode: 'board' });
    let acildi = 0;
    yer = document.createElement('div');
    document.body.appendChild(yer);
    kok = createRoot(yer);
    act(() => { kok!.render(<Sonda tetikle={() => { acildi += 1; }} />); });
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'y', altKey: false, bubbles: true, cancelable: true }),
      );
    });
    expect(acildi).toBe(1);
  });

  it('senaryo görünümünde ÇIPLAK `Y` açmıyor, Alt+Y açıyor', () => {
    useUiStore.setState({ viewMode: 'senaryo' });
    let acildi = 0;
    yer = document.createElement('div');
    document.body.appendChild(yer);
    kok = createRoot(yer);
    act(() => { kok!.render(<Sonda tetikle={() => { acildi += 1; }} />); });
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'y', altKey: false, bubbles: true, cancelable: true }),
      );
    });
    expect(acildi).toBe(0);
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'y', altKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(acildi).toBe(1);
  });
});

describe('kısayol listesinde yer alıyor', () => {
  it('ShortcutsDialog "Y" satırını listeliyor', () => {
    yer = document.createElement('div');
    document.body.appendChild(yer);
    kok = createRoot(yer);
    act(() => { kok!.render(<ShortcutsDialog onClose={() => {}} />); });
    expect(yer.textContent).toContain('Kim ne yazdı');
    const kbdler = [...yer.querySelectorAll('kbd')].map((k) => k.textContent);
    expect(kbdler).toContain('Y / Alt+Y');
  });
});
