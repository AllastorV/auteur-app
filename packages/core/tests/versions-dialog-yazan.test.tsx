// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { VersionsDialog } from '@storyboard/core/components/dialogs/VersionsDialog';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { colorForUser } from '@storyboard/core/util/color';
import type { HistoryVersion, PlatformAdapter } from '@storyboard/core/platform/types';

/**
 * "Sürümler" sekmesinde yazan adı — bkz. `store.ts` / `VersionsDialog.tsx`
 * başlığı. Burada ölçülen: liste doğru geldiğinde ad METİN olarak görünüyor
 * mu (yalnız renk değil) ve yazan bilgisi olmayan eski sürümlerde hiç
 * uydurma isim çıkmıyor mu.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

function platformKur(versions: HistoryVersion[]): PlatformAdapter {
  return {
    kind: 'desktop',
    canSaveLocally: true,
    canExportVideo: false,
    dil: null,
    baslangic: null,
    listVersions: async () => versions,
    restoreVersion: async () => null,
    veriGuvenligi: null,
  } as unknown as PlatformAdapter;
}

async function ciz(versions: HistoryVersion[]) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  await act(async () => {
    kok!.render(
      <PlatformProvider platform={platformKur(versions)}>
        <VersionsDialog onClose={() => {}} />
      </PlatformProvider>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Sürümler sekmesi — yazan adı', () => {
  it('yazan adı olan sürümde ad METİN olarak görünüyor', async () => {
    await ciz([{ id: '1.sbp', savedAt: 1000, label: 'Proje X — otomatik kayıt', size: 2048, savedBy: 'Ayşe Yılmaz' }]);
    const etiket = yer!.querySelector('[data-testid="versions-yazan-1.sbp"]') as HTMLElement;
    expect(etiket).not.toBeNull();
    expect(etiket.textContent).toBe('Ayşe Yılmaz');
  });

  it('etiket ortak çalışma renk kaynağını (colorForUser) kullanıyor — yeni bir renk şeması değil', async () => {
    await ciz([{ id: '1.sbp', savedAt: 1000, label: 'Proje X — otomatik kayıt', size: 2048, savedBy: 'Ayşe Yılmaz' }]);
    const etiket = yer!.querySelector('[data-testid="versions-yazan-1.sbp"]') as HTMLElement;
    // colorForUser hex döndürüyor; jsdom style.color'ı rgb() olarak normalize
    // eder — aynı dönüşümü burada yapıp DOM'da GERÇEKTEN o rengin kullanıldığını
    // doğrula (yalnız "boş değil" değil, kaynağın kendisi).
    const hex = colorForUser('Ayşe Yılmaz');
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    expect(etiket.style.color).toBe(`rgb(${rgb.join(', ')})`);
  });

  it('yazan bilgisi olmayan (eski) sürümde ad hiç gösterilmiyor — uydurma isim yok', async () => {
    await ciz([{ id: '1.sbp', savedAt: 1000, label: 'Proje X — otomatik kayıt', size: 2048 }]);
    expect(yer!.querySelector('[data-testid="versions-yazan-1.sbp"]')).toBeNull();
  });
});
