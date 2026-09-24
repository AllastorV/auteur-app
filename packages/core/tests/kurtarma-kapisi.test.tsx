// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { useKurtarma } from '@storyboard/core/hooks/useKurtarma';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { useProjectStore } from '@storyboard/core/store/project';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import type { PlatformAdapter } from '@storyboard/core/platform/types';

/**
 * §15.3 kurtarma KAPISI — `cozuldu`, günlük yazıcısının anahtarıdır
 * (`Studio`: `enabled = canSaveLocally && kurtarma.cozuldu`).
 *
 * Kapı yanlış açılırsa yazıcı, kurtarma denetimi daha diski okurken
 * incelenmemiş günlüğün SONUNA yazar. Sonraki açılışta iki oturumun
 * çerçeveleri birlikte oynatılır ve Yjs bunları çakıştırmaz, BİRLEŞTİRİR —
 * kullanıcı metnini çift görür ve hiçbir hata bildirilmez.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

function ciz(ogeler: React.ReactNode) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(ogeler); });
}

function sahtePlatform(veriGuvenligi: PlatformAdapter['veriGuvenligi']): PlatformAdapter {
  return {
    kind: 'desktop',
    canSaveLocally: true,
    canExportVideo: false,
    veriGuvenligi,
  } as unknown as PlatformAdapter;
}

type Kabuk = NonNullable<PlatformAdapter['veriGuvenligi']>;

/** Günlük okuması ASILI kalan kabuk — denetim hiç bitmez. */
function asiliKabuk(): Kabuk {
  return {
    async gunlugeEkle(_id: string, _c: Uint8Array) {},
    gunlukOku: (_id: string) => new Promise<Uint8Array | null>(() => {}),
    async cipaYazVeGunlugeKes(_id: string, _c: Uint8Array) {},
    async cipaHalkasi(_id: string) { return []; },
    async cipaOku(_id: string, _c: string) { return new Uint8Array(); },
    async gunluguArsivle(_id: string) { return null; },
  };
}

function projeYukle() {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  return doc;
}

function Sonda({ gor }: { gor: (c: boolean) => void }) {
  gor(useKurtarma(true).cozuldu);
  return null;
}

describe('kurtarma kapısı — proje değişiminde YENİDEN kapanıyor', () => {
  it('ikinci projede kapı, denetim bitene kadar KAPALI kalıyor', async () => {
    // 1. proje: günlük yok → denetim biter, kapı açılır.
    // 2. proje: denetim ASILI kalır — kapının gerçekten yeniden kapanıp
    // kapanmadığı ancak o aralıkta ölçülebilir.
    let cagri = 0;
    projeYukle();
    const gorulen: boolean[] = [];
    const kademeliKabuk: Kabuk = {
      ...asiliKabuk(),
      gunlukOku: (_id: string) =>
        cagri++ === 0
          ? Promise.resolve<Uint8Array | null>(null)
          : new Promise<Uint8Array | null>(() => {}),
    };
    ciz(
      <PlatformProvider platform={sahtePlatform(kademeliKabuk)}>
        <Sonda gor={(c) => gorulen.push(c)} />
      </PlatformProvider>,
    );
    await act(async () => { await Promise.resolve(); });
    expect(gorulen.at(-1)).toBe(true);

    // 2. proje: denetim ASILI. Kapı önceki projeden kalma `true` ile
    // gelirse yazıcı incelenmemiş günlüğe yazmaya başlar.
    await act(async () => { projeYukle(); await Promise.resolve(); });
    expect(gorulen.at(-1)).toBe(false);
  });

  it('kabuk yoksa kapı açık — koruma zaten yok, yazıcı da yok', () => {
    projeYukle();
    const gorulen: boolean[] = [];
    ciz(
      <PlatformProvider platform={sahtePlatform(null)}>
        <Sonda gor={(c) => gorulen.push(c)} />
      </PlatformProvider>,
    );
    expect(gorulen.at(-1)).toBe(true);
  });

  it('denetim sürerken kapı KAPALI — ilk projede de', async () => {
    projeYukle();
    const gorulen: boolean[] = [];
    ciz(
      <PlatformProvider platform={sahtePlatform(asiliKabuk())}>
        <Sonda gor={(c) => gorulen.push(c)} />
      </PlatformProvider>,
    );
    await act(async () => { await Promise.resolve(); });
    expect(gorulen.at(-1)).toBe(false);
  });
});
