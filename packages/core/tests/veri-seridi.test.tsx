// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { SonYazim, VeriSeridi } from '@storyboard/core/components/VeriSeridi';
import { useVeriGuvenligi } from '@storyboard/core/hooks/useVeriGuvenligi';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { useProjectStore } from '@storyboard/core/store/project';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { gunlukCozumle } from '@storyboard/core/veri/gunluk';
import type { PlatformAdapter } from '@storyboard/core/platform/types';
import type { YaziciDurumu } from '@storyboard/core/veri/yazici';

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

const saglam = (yama: Partial<YaziciDurumu> = {}): YaziciDurumu => ({
  ardArdaHata: 0, sonHata: null, engelleyici: false, sonYazim: 1_700_000_000_000, bekleyen: 0,
  ...yama,
});

describe('§15.4 — sessiz başarısızlık yasağının arayüz yarısı', () => {
  /* Kullanıcının korunduğunu SANMASI, korunmamasından daha tehlikelidir. */
  it('koruma yoksa kalıcı uyarı gösterilir', () => {
    ciz(<VeriSeridi durum={null} />);
    expect(yer!.querySelector('[data-testid="veri-korumasiz"]')).not.toBeNull();
    expect(yer!.textContent).toContain('çökme koruması yok');
  });

  it('ilk hata şerit AÇMAZ — o bir bildirimdir', () => {
    ciz(<VeriSeridi durum={saglam({ ardArdaHata: 1, sonHata: 'ENOSPC', engelleyici: false })} />);
    expect(yer!.querySelector('[data-testid="veri-engelleyici"]')).toBeNull();
    expect(yer!.textContent).toBe('');
  });

  it('arka arkaya ikinci hatada ENGELLEYİCİ şerit açılır ve sebebi yazar', () => {
    ciz(<VeriSeridi durum={saglam({ ardArdaHata: 2, sonHata: 'ENOSPC: disk dolu', engelleyici: true })} />);
    const serit = yer!.querySelector('[data-testid="veri-engelleyici"]')!;
    expect(serit.getAttribute('role')).toBe('alert');
    expect(serit.textContent).toContain('disk dolu');
  });

  it('sağlam durumda şerit yer kaplamaz', () => {
    ciz(<VeriSeridi durum={saglam()} />);
    expect(yer!.textContent).toBe('');
  });
});

describe('son yazım göstergesi', () => {
  it('son yazımın saatini gösterir', () => {
    ciz(<SonYazim durum={saglam()} />);
    expect(yer!.querySelector('[data-testid="son-yazim"]')!.textContent)
      .toContain('günlüğe işlendi');
  });

  /* Boş bir gösterge kullanıcıya bir şeyin ters gittiğini düşündürür. */
  it('henüz yazım yokken boş değil, ne olduğunu söyler', () => {
    ciz(<SonYazim durum={saglam({ sonYazim: null })} />);
    expect(yer!.textContent).toContain('günlük bekliyor');
  });

  it('bekleyen çerçeve sayısı görünür', () => {
    ciz(<SonYazim durum={saglam({ bekleyen: 3 })} />);
    expect(yer!.textContent).toContain('3 bekliyor');
  });

  it('koruma yoksa gösterge hiç çizilmez — şerit zaten uyarıyor', () => {
    ciz(<SonYazim durum={null} />);
    expect(yer!.textContent).toBe('');
  });
});

/* ------------------------- kanca ------------------------- */

function sahtePlatform(veriGuvenligi: PlatformAdapter['veriGuvenligi']): PlatformAdapter {
  return {
    kind: 'desktop',
    canSaveLocally: true,
    canExportVideo: false,
    veriGuvenligi,
  } as unknown as PlatformAdapter;
}

function Sonda({ durum, acik = true }: { durum: (d: YaziciDurumu | null) => void; acik?: boolean }) {
  durum(useVeriGuvenligi(acik));
  return null;
}

describe('useVeriGuvenligi', () => {
  it('kabukta katman yoksa null döner', () => {
    const goruldu: (YaziciDurumu | null)[] = [];
    ciz(
      <PlatformProvider platform={sahtePlatform(null)}>
        <Sonda durum={(d) => goruldu.push(d)} />
      </PlatformProvider>,
    );
    expect(goruldu.at(-1)).toBeNull();
  });

  it('düzenlemeler günlüğe gider ve durum yayılır', async () => {
    vi.useFakeTimers();
    try {
      const yazilan: Uint8Array[] = [];
      const kabuk: PlatformAdapter['veriGuvenligi'] = {
        async gunlugeEkle(_id, c) { yazilan.push(c); },
        async gunlukOku() { return null; },
        async cipaYazVeGunlugeKes() {},
        async cipaHalkasi() { return []; },
        async cipaOku() { return new Uint8Array(); },
        async gunluguArsivle() { return null; },
      };

      const doc = new Y.Doc();
      loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
      useProjectStore.getState().attachDoc(doc, 'owner');

      const goruldu: (YaziciDurumu | null)[] = [];
      ciz(
        <PlatformProvider platform={sahtePlatform(kabuk)}>
          <Sonda durum={(d) => goruldu.push(d)} />
        </PlatformProvider>,
      );

      await act(async () => {
        doc.getMap('meta').set('title', 'yazıldı');
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(yazilan).toHaveLength(1);
      expect(goruldu.at(-1)?.sonYazim).not.toBeNull();
      // Yazılan gerçekten çözümlenebilir çerçeveler mi?
      const baslikli = new Uint8Array([0x4d, 0x5a, 0x47, 0x4e, 1, 0, ...yazilan[0]]);
      expect(gunlukCozumle(baslikli).guncellemeler.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('kapanış ve KAPI — §15.2 kayıp tavanı', () => {
  const sahteYazan = () => {
    const yazilan: Uint8Array[] = [];
    const kabuk: PlatformAdapter['veriGuvenligi'] = {
      async gunlugeEkle(_id: string, c: Uint8Array) { yazilan.push(c); },
      async gunlukOku() { return null; },
      async cipaYazVeGunlugeKes() {},
      async cipaHalkasi() { return []; },
      async cipaOku() { return new Uint8Array(); },
      async gunluguArsivle() { return null; },
    };
    return { kabuk, yazilan };
  };

  /* Cleanup'ta son kez boşaltılmazsa tamponda bekleyen çerçeveler SESSİZCE
     düşer — §15.2'nin "≤1 sn kayıp" sözünün delindiği tek yer burası.
     Belge/proje değişiminde ve kapanışta olur. */
  it('sökülürken tamponda bekleyen çerçeveler diske gidiyor', async () => {
    const { kabuk, yazilan } = sahteYazan();
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
    useProjectStore.getState().attachDoc(doc, 'owner');

    ciz(
      <PlatformProvider platform={sahtePlatform(kabuk)}>
        <Sonda durum={() => {}} />
      </PlatformProvider>,
    );

    // Zamanlayıcı HİÇ çalışmadan söküyoruz: tek yol cleanup boşaltmasıdır.
    await act(async () => { doc.getMap('meta').set('title', 'son saniye'); });
    expect(yazilan).toHaveLength(0);

    await act(async () => { kok?.unmount(); kok = null; });
    expect(yazilan.length).toBeGreaterThan(0);
  });

  /* `enabled` kapısı `Studio`'da `canSaveLocally && kurtarma.cozuldu`.
     Düşerse yazıcı kurtarma çözülmeden başlar ve incelenmemiş günlüğe yazar. */
  it('kapı KAPALIYKEN yazıcı hiç kurulmuyor', async () => {
    const { kabuk, yazilan } = sahteYazan();
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
    useProjectStore.getState().attachDoc(doc, 'owner');

    const goruldu: (YaziciDurumu | null)[] = [];
    ciz(
      <PlatformProvider platform={sahtePlatform(kabuk)}>
        <Sonda acik={false} durum={(d) => goruldu.push(d)} />
      </PlatformProvider>,
    );
    await act(async () => { doc.getMap('meta').set('title', 'kapalıyken'); });
    await act(async () => { kok?.unmount(); kok = null; });

    expect(goruldu.at(-1)).toBeNull();
    expect(yazilan).toHaveLength(0);
  });
});
