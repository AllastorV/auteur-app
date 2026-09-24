// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionsDialog } from '@storyboard/core/components/dialogs/VersionsDialog';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { useProjectStore } from '@storyboard/core/store/project';
import type { PlatformAdapter } from '@storyboard/core/platform/types';

/**
 * §15.2.2 — "Geri dönmek mevcut durumu SİLMEZ: geri dönmeden hemen önce
 * otomatik bir kontrol noktası daha yazılır, yani geri dönüşten de geri
 * dönülebilir."
 *
 * Bu yol `replaceProject` çağırıyor; o da `undoManager.destroy()` ile geri
 * almayı da bitiriyor. Güvenlik noktası yazılmazsa kullanıcının mevcut
 * oturumdaki bütün kaydedilmemiş işi tek onay kutusuyla, geri dönüşsüz gider.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

const surum = { id: 'v1.sbp', savedAt: 1_700_000_000_000, label: 'otomatik', size: 2048 };

function kur(opts: {
  cipaYaz: (id: string, cipa: Uint8Array) => Promise<void>;
  restore?: () => Promise<Uint8Array | null>;
}) {
  const sira: string[] = [];
  const platform = {
    kind: 'desktop',
    canSaveLocally: true,
    canExportVideo: false,
    listVersions: async () => [surum],
    restoreVersion: async () => {
      sira.push('restore');
      return opts.restore ? await opts.restore() : null;
    },
    veriGuvenligi: {
      async gunlugeEkle() {},
      async gunlukOku() { return null; },
      cipaYazVeGunlugeKes: async (id: string, cipa: Uint8Array) => {
        sira.push('guvenlik');
        return opts.cipaYaz(id, cipa);
      },
      async cipaHalkasi() { return []; },
      async cipaOku() { return new Uint8Array(); },
      async gunluguArsivle() { return null; },
    },
  } as unknown as PlatformAdapter;

  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => {
    kok!.render(
      <PlatformProvider platform={platform}>
        <VersionsDialog onClose={() => {}} />
      </PlatformProvider>,
    );
  });
  return sira;
}

async function geriYukleyeBas(sira: string[]) {
  await act(async () => { await Promise.resolve(); });
  const dugme = [...yer!.querySelectorAll('button')].find(
    (b) => b.textContent?.includes('Geri yükle'),
  ) as HTMLButtonElement;
  expect(dugme, 'Geri yükle düğmesi çizilmedi').toBeDefined();
  await act(async () => { dugme.click(); await Promise.resolve(); await Promise.resolve(); });
  return sira;
}

describe('sürüm geri yükleme — ÖNCE güvenlik noktası', () => {
  it('güvenlik noktası sürümü okumadan ÖNCE yazılıyor', async () => {
    const sira = kur({ cipaYaz: async () => {} });
    await geriYukleyeBas(sira);
    expect(sira[0]).toBe('guvenlik');
    expect(sira).toContain('restore');
  });

  /* Sıra ters olsaydı ikisi arasındaki bir çökme kullanıcıyı eski duruma
     kilitlerdi. Yazılamıyorsa dönüş HİÇ başlamamalı — hatayı sonradan
     bildirmek, iş gittikten sonra bildirmek olurdu. */
  it('güvenlik noktası YAZILAMAZSA sürüm hiç okunmuyor', async () => {
    const sira = kur({ cipaYaz: async () => { throw new Error('disk dolu'); } });
    await geriYukleyeBas(sira);
    expect(sira).toEqual(['guvenlik']);
    expect(sira).not.toContain('restore');
  });

  it('belge gerçekten değişmedi — iptal edilen dönüş iz bırakmıyor', async () => {
    const oncekiDoc = useProjectStore.getState().doc;
    const sira = kur({ cipaYaz: async () => { throw new Error('izin reddedildi'); } });
    await geriYukleyeBas(sira);
    expect(useProjectStore.getState().doc).toBe(oncekiDoc);
  });
});
