// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { VersionsDialog } from '@storyboard/core/components/dialogs/VersionsDialog';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { useProjectStore } from '@storyboard/core/store/project';
import type { PlatformAdapter } from '@storyboard/core/platform/types';

/**
 * §15.2.2'nin ARAYÜZ tarafı — "Geri dönüş noktaları" sekmesi.
 *
 * Alt katman (`kontrolNoktasinaDon`) zaten `geri-donus.test.ts`'te test
 * edilmiş; burada ölçülen KABLOLAMA: kancanın kabuğu doğru sırayla çağırıp
 * çağırmadığı, listenin doğru sıralanıp sıralanmadığı, çözmenin gerçekten
 * TEMBEL olup olmadığı.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
  vi.restoreAllMocks();
});

interface Kabuk {
  cipaHalkasi: (id: string) => Promise<{ id: string; zaman: number }[]>;
  cipaOku: (projeId: string, id: string) => Promise<Uint8Array>;
  cipaYazVeGunlugeKes: (projeId: string, cipa: Uint8Array) => Promise<void>;
}

function platformKur(kabuk: Kabuk): PlatformAdapter {
  return {
    kind: 'desktop',
    canSaveLocally: true,
    canExportVideo: false,
    dil: null,
    baslangic: null,
    listVersions: async () => [],
    restoreVersion: async () => null,
    veriGuvenligi: {
      async gunlugeEkle() {},
      async gunlukOku() { return null; },
      cipaHalkasi: kabuk.cipaHalkasi,
      cipaOku: kabuk.cipaOku,
      cipaYazVeGunlugeKes: kabuk.cipaYazVeGunlugeKes,
      async gunluguArsivle() { return null; },
    },
  } as unknown as PlatformAdapter;
}

async function ciz(platform: PlatformAdapter) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  await act(async () => {
    kok!.render(
      <PlatformProvider platform={platform}>
        <VersionsDialog onClose={() => {}} />
      </PlatformProvider>,
    );
    await Promise.resolve();
  });
  // "Geri dönüş noktaları" sekmesine geç.
  const sekmeBtn = yer.querySelector('[data-testid="versions-sekme-noktalar"]') as HTMLButtonElement;
  await act(async () => { sekmeBtn.click(); await Promise.resolve(); await Promise.resolve(); });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const hepsi = (sel: string) => [...yer!.querySelectorAll(sel)] as HTMLElement[];

/** Bellekte geçerli, boş bir Yjs çıpası — `Y.encodeStateAsUpdate(new Y.Doc())`. */
function bosCipa(): Uint8Array {
  return Y.encodeStateAsUpdate(new Y.Doc());
}

describe('nokta listesi', () => {
  it('en yeniden eskiye sıralı gösteriliyor', async () => {
    const kayitlar = [
      { id: 'eski', zaman: 1_000 },
      { id: 'en-yeni', zaman: 3_000 },
      { id: 'orta', zaman: 2_000 },
    ];
    await ciz(platformKur({
      cipaHalkasi: async () => kayitlar,
      cipaOku: async () => bosCipa(),
      cipaYazVeGunlugeKes: async () => {},
    }));
    const idler = hepsi('li[data-testid^="nokta-"]')
      .filter((n) => /^nokta-(en-yeni|orta|eski)$/.test(n.getAttribute('data-testid') ?? ''))
      .map((n) => n.getAttribute('data-testid'));
    expect(idler).toEqual(['nokta-en-yeni', 'nokta-orta', 'nokta-eski']);
  });

  it('hiç nokta yoksa sade bir boş durum mesajı gösteriliyor', async () => {
    await ciz(platformKur({
      cipaHalkasi: async () => [],
      cipaOku: async () => bosCipa(),
      cipaYazVeGunlugeKes: async () => {},
    }));
    expect(el('noktalar-bos')).not.toBeNull();
  });
});

describe('tembel çözme', () => {
  it('bir nokta seçilene kadar hiçbir çıpa çözülmüyor', async () => {
    const okumalar: string[] = [];
    await ciz(platformKur({
      cipaHalkasi: async () => [{ id: 'n1', zaman: 1_000 }],
      cipaOku: async (_p, id) => { okumalar.push(id); return bosCipa(); },
      cipaYazVeGunlugeKes: async () => {},
    }));
    // Liste çizildi, hiç seçim yapılmadı.
    expect(el('nokta-n1')).not.toBeNull();
    expect(okumalar).toEqual([]);

    // Seçilince TEK bir çözme olur.
    const onizleBtn = el('nokta-onizle-n1') as HTMLButtonElement;
    await act(async () => { onizleBtn.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(okumalar).toEqual(['n1']);
  });
});

describe('dönüş — önce güvenlik noktası, sonra hedef', () => {
  it('"Bu ana dön" çağrıldığında güvenlik noktası hedeften ÖNCE yazılıyor', async () => {
    const sira: string[] = [];
    await ciz(platformKur({
      cipaHalkasi: async () => [{ id: 'n1', zaman: 1_000 }],
      cipaOku: async (_p, id) => { sira.push(`oku:${id}`); return bosCipa(); },
      cipaYazVeGunlugeKes: async () => { sira.push('guvenlik'); },
    }));
    const donBtn = el('nokta-don-n1') as HTMLButtonElement;
    await act(async () => { donBtn.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(sira).toEqual(['guvenlik', 'oku:n1']);
  });

  it('güvenlik noktası yazılamazsa hedef HİÇ okunmuyor ve belge dokunulmuyor', async () => {
    const sira: string[] = [];
    const oncekiDoc = useProjectStore.getState().doc;
    await ciz(platformKur({
      cipaHalkasi: async () => [{ id: 'n1', zaman: 1_000 }],
      cipaOku: async (_p, id) => { sira.push(`oku:${id}`); return bosCipa(); },
      cipaYazVeGunlugeKes: async () => { sira.push('guvenlik'); throw new Error('disk dolu'); },
    }));
    const donBtn = el('nokta-don-n1') as HTMLButtonElement;
    await act(async () => { donBtn.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(sira).toEqual(['guvenlik']);
    expect(useProjectStore.getState().doc).toBe(oncekiDoc);
  });
});

describe('masaüstü olmayan kabuk', () => {
  it('veriGuvenligi yoksa bölüm "yalnızca masaüstü" diyor', async () => {
    const platform = {
      kind: 'web',
      canSaveLocally: false,
      canExportVideo: false,
      dil: null,
      baslangic: null,
      veriGuvenligi: null,
      listVersions: async () => [],
      restoreVersion: async () => null,
    } as unknown as PlatformAdapter;
    await ciz(platform);
    expect(el('noktalar-desteklenmiyor')).not.toBeNull();
    expect(el('noktalar-bolumu')).toBeNull();
  });
});
