// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { YazimSekmesi } from '@storyboard/core/components/inspector/YazimSekmesi';
import { useUiStore } from '@storyboard/core/store/ui';
import { AMERIKAN_BLOKLAR } from '@storyboard/core/format/profil';
import { KARAKTER_MM } from '@storyboard/core/format/izgara';
import { PlatformProvider } from '@storyboard/core/platform/context';
import type { PlatformAdapter } from '@storyboard/core/platform/types';

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
  useUiStore.setState({ scriptPresetler: {}, scriptPaper: 'letter', scriptLang: 'tr' });
});

function ciz() {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  /* Sözlük bölümü platform kabuğunu okuyor (denetim var mı) — sekme artık
     sağlayıcı olmadan çizilemiyor. */
  act(() => {
    kok!.render(
      <PlatformProvider
        platform={{ kind: 'web', canSaveLocally: true, canExportVideo: false, veriGuvenligi: null, dil: null } as unknown as PlatformAdapter}
      >
        <YazimSekmesi />
      </PlatformProvider>,
    );
  });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`);
const tikla = (id: string) => act(() => { (el(id) as HTMLInputElement).click(); });

describe('sabit ölçüler ve format eksenleri AYARLARA taşındı', () => {
  /* Kullanıcı kararı (2026-08-27): "anlık ulaşmak gerekmeyen ayarları
     genel ayarlara taşı." Bu testler geri gelmelerini engelliyor —
     iki yerde birden durmaları kullanıcıya iki ayrı doğru gösterirdi. */
  it('kilitli ölçü listesi Yazım sekmesinde YOK', () => {
    ciz();
    expect(el('kilit-yaziTipi')).toBeNull();
    expect(el('kilit-punto')).toBeNull();
  });

  it('kağıt ve belge dili Yazım sekmesinde YOK', () => {
    ciz();
    expect(el('kagit-sec')).toBeNull();
    expect(el('dil-sec')).toBeNull();
  });

  /* SAYFA RENGİ BURADA — kullanıcı düzeltmesi (2026-08-28): Ayarlar'a
     taşınması yanlıştı. Göz yorulunca sepyaya, gece siyaha geçmek
     YAZARKEN yapılan bir şey; iki pencere ötede olmamalı. */
  it('sayfa rengi dört seçenekle Yazım sekmesinde', () => {
    ciz();
    for (const ad of ['beyaz', 'sepya', 'siyah', 'gri']) {
      expect(el(`sayfa-rengi-${ad}`), `${ad} düğmesi yok`).not.toBeNull();
    }
    /* Serbest renk girişi YOK — kullanıcı kararının öbür yarısı. */
    expect(yer!.querySelector('input[type="color"]')).toBeNull();
  });

  it('sayfa rengi seçimi mağazaya yazılıyor', () => {
    ciz();
    act(() => { (el('sayfa-rengi-gri') as HTMLElement).click(); });
    expect(useUiStore.getState().scriptSayfaRengi).toBe('gri');
    expect(el('sayfa-rengi-gri')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('senaryo ayarları (numara, süreklilik, süre) Yazım sekmesinde YOK', () => {
    ciz();
    expect(el('sahne-no')).toBeNull();
    expect(el('sayfa-sonu-surekliligi')).toBeNull();
    expect(el('sure-yontemi')).toBeNull();
  });

  it('YAZARKEN gereken şeyler KALDI — belgenin biçimi ve sözlük', () => {
    ciz();
    expect(el('dokuman-tipi-bolumu')).not.toBeNull();
    expect(yer!.textContent).toContain('sözlü');
  });
});

describe('presetler SABİT — düzenleme yüzeyi yok (kullanıcı kararı 2026-08-27)', () => {
  /* Önceden burada altı blok tipinin kalın/italik/BÜYÜK/boşluk ayarları
     vardı. Kaldırıldı: presetlere kullanıcı dokunmaz. Bu testler geri
     gelmesini de, kayıtlı eski bir presetin sessizce uygulanmasını da
     engelliyor. */
  it('hiçbir blok tipi için preset bölümü çizilmez', () => {
    ciz();
    for (const tip of ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition']) {
      expect(el(`preset-${tip}`), tip).toBeNull();
    }
  });

  it('kayıtlı tercihteki presetler YOK SAYILIR — durum hep boş başlar', async () => {
    /* Önceden preset değiştirmiş bir kullanıcının localStorage kaydı,
       arayüz kalktıktan sonra görünmez bir el olarak sayfayı biçimlemesin. */
    const { tercihiCoz, tercihiYaz, VARSAYILAN_TERCIH } = await import('@storyboard/core/format/tercih');
    const kayit = tercihiCoz(tercihiYaz({
      ...VARSAYILAN_TERCIH,
      presetler: { scene: { kalin: false } },
    }));
    expect(kayit.presetler.scene).toEqual({ kalin: false }); // dosya biçimi hâlâ taşıyor
    expect(useUiStore.getState().scriptPresetler).toEqual({}); // ama mağaza okumuyor
  });
});

