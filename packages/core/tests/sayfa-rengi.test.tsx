// @vitest-environment jsdom
import * as Y from 'yjs';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { setScript } from '@storyboard/core/doc/mutations';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { ScriptEditor } from '@storyboard/core/components/script/ScriptEditor';
import { PlatformProvider } from '@storyboard/core/platform/context';
import type { PlatformAdapter } from '@storyboard/core/platform/types';
import { AyarlarDialog } from '@storyboard/core/components/dialogs/AyarlarDialog';
import { YazimSekmesi } from '@storyboard/core/components/inspector/YazimSekmesi';
import {
  SAYFA_RENKLERI,
  VARSAYILAN_SAYFA_RENGI,
  sayfaRengiCoz,
  sayfaRenkStili,
  type SayfaRengi,
} from '@storyboard/core/format/sayfa-rengi';
import { tercihiCoz, tercihiYaz, VARSAYILAN_TERCIH } from '@storyboard/core/format/tercih';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * Senaryo sayfası rengi — kullanıcı kararı (2026-08-27).
 *
 * Dört sabit seçenek (serbest renk YOK); metin açık zeminde siyah, koyu
 * zeminde beyaz. YALNIZ EKRAN: dışa aktarım her zaman beyaz zemine siyah
 * yazı üretir — bu dosyanın son bölümü o sınırı ÖLÇÜYOR: `disa/` modülleri
 * palete ya da UI durumuna dokunamaz.
 *
 * Bu oturumun dersi tekrar etmesin diye (yeşil test ≠ bağlanmış özellik)
 * bağlantı da test ediliyor: seçim GERÇEK editör kökünde CSS değişkeni
 * olarak görünmeli, yalnız tabloda değil.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
  useUiStore.setState({ scriptSayfaRengi: VARSAYILAN_SAYFA_RENGI });
});

const SAHTE_PLATFORM = {
  kind: 'web', canSaveLocally: true, canExportVideo: false, veriGuvenligi: null, dil: null,
} as unknown as PlatformAdapter;

function ciz(ogeler: React.ReactNode) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => {
    kok!.render(<PlatformProvider platform={SAHTE_PLATFORM}>{ogeler}</PlatformProvider>);
  });
}

/** Göreli parlaklık kabası — "açık mı koyu mu" sorusuna yetecek kadar. */
function parlaklik(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3;
}

describe('palet sözleşmesi — 4 sabit renk, doğru kontrast yönü', () => {
  it('tam olarak beyaz/siyah/sepya/gri var', () => {
    expect(Object.keys(SAYFA_RENKLERI).sort()).toEqual(['beyaz', 'gri', 'sepya', 'siyah']);
  });

  it('açık zeminde koyu metin, koyu zeminde açık metin (kullanıcı kuralı)', () => {
    for (const [ad, p] of Object.entries(SAYFA_RENKLERI)) {
      const zeminAcik = parlaklik(p.kagit) > 128;
      const metinAcik = parlaklik(p.metin) > 128;
      expect({ ad, zeminAcik, metinAcik }).toEqual({ ad, zeminAcik, metinAcik: !zeminAcik });
      /* Sönük metin de zeminden ayrışmalı — koyu zeminde koyu sönük,
         üst bilgiyi ve sayfa numarasını görünmez yapardı. */
      expect(Math.abs(parlaklik(p.sonuk) - parlaklik(p.kagit))).toBeGreaterThan(60);
    }
  });

  it('VARSAYILAN beyaz ve kabuğun eski görünümüyle BİREBİR aynı — ekran kendiliğinden değişmedi', () => {
    expect(VARSAYILAN_SAYFA_RENGI).toBe('beyaz');
    expect(SAYFA_RENKLERI.beyaz).toEqual({
      kagit: '#f7f5f0', metin: '#1c1a17', sonuk: '#a49d90', parantez: '#6f695e',
    });
  });

  it('sepya gerçekten sarı tonlu — kırmızı+yeşil kanal maviden belirgin yüksek', () => {
    const n = parseInt(SAYFA_RENKLERI.sepya.kagit.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    expect(r).toBeGreaterThan(b + 25);
    expect(g).toBeGreaterThan(b + 15);
  });

  it('sayfaRenkStili dört --mzn-kagit* değişkenini üretir', () => {
    const stil = sayfaRenkStili('gri') as Record<string, string>;
    expect(stil['--mzn-kagit']).toBe(SAYFA_RENKLERI.gri.kagit);
    expect(stil['--mzn-kagit-metin']).toBe(SAYFA_RENKLERI.gri.metin);
    expect(stil['--mzn-kagit-sonuk']).toBe(SAYFA_RENKLERI.gri.sonuk);
    expect(stil['--mzn-kagit-parantez']).toBe(SAYFA_RENKLERI.gri.parantez);
  });
});

describe('tercih kalıcılığı — güven sınırı', () => {
  it('yaz→çöz turu rengi korur', () => {
    const metin = tercihiYaz({ ...VARSAYILAN_TERCIH, sayfaRengi: 'siyah' });
    expect(tercihiCoz(metin).sayfaRengi).toBe('siyah');
  });

  it('tanınmayan değer varsayılana düşer — localStorage kullanıcının elinde', () => {
    expect(sayfaRengiCoz('mor')).toBe(VARSAYILAN_SAYFA_RENGI);
    expect(sayfaRengiCoz(42)).toBe(VARSAYILAN_SAYFA_RENGI);
    const metin = tercihiYaz(VARSAYILAN_TERCIH).replace('"sepya"', '"mor"');
    expect(tercihiCoz(metin).sayfaRengi).toBe(VARSAYILAN_SAYFA_RENGI);
  });
});

describe('bağlantı — seçim gerçek editör kökünde görünüyor', () => {
  const SENARYO = {
    name: 'renk',
    blocks: [{ id: 'sb_1', fp: '', type: 'action', text: 'Gece.',
      scene: '1', sceneId: 'sc_1' } as ScriptBlock],
  };

  it('ScriptEditor kökü seçilen paletin değişkenlerini taşır', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    useProjectStore.getState().attachDoc(doc, 'owner');
    useUiStore.setState({ scriptSayfaRengi: 'siyah' });
    ciz(<ScriptEditor />);
    const kokOge = yer!.firstElementChild as HTMLElement;
    expect(kokOge.style.getPropertyValue('--mzn-kagit')).toBe(SAYFA_RENKLERI.siyah.kagit);
    expect(kokOge.style.getPropertyValue('--mzn-kagit-metin')).toBe(SAYFA_RENKLERI.siyah.metin);
  });

  it("Yazım sekmesindeki dört renk düğmesi seçimi değiştirir", () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    useProjectStore.getState().attachDoc(doc, 'owner');
    ciz(<YazimSekmesi />);
    for (const ad of Object.keys(SAYFA_RENKLERI) as SayfaRengi[]) {
      expect(yer!.querySelector(`[data-testid="sayfa-rengi-${ad}"]`)).not.toBeNull();
    }
    /* Serbest renk girişi YOK — kullanıcı kararının öbür yarısı. */
    expect(yer!.querySelector('input[type="color"]')).toBeNull();
    act(() => {
      (yer!.querySelector('[data-testid="sayfa-rengi-gri"]') as HTMLButtonElement).click();
    });
    expect(useUiStore.getState().scriptSayfaRengi).toBe('gri');
    expect(
      yer!.querySelector('[data-testid="sayfa-rengi-gri"]')!.getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('kullanıcıya "yalnız ekranda" açıkça söyleniyor (§15.4 ruhu)', () => {
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    useProjectStore.getState().attachDoc(doc, 'owner');
    ciz(<YazimSekmesi />);
    expect(yer!.textContent).toContain('Yalnız ekranda');
  });
});

describe('dışa aktarım sınırı — çıktı HER ZAMAN beyaz zemine siyah yazı', () => {
  /* Kanıt kod düzeyinde: `disa/` modülleri paleti de UI durumunu da İTHAL
     EDEMEZ. Bir gün biri "önizleme rengiyle bassak" derse bu test kırılır
     ve karar bilerek verilir — sessizce sızmaz. */
  it('disa/ modülleri sayfa-rengi ya da scriptSayfaRengi bilmiyor', () => {
    const dizin = path.join(__dirname, '..', 'src', 'disa');
    const dosyalar = fs.readdirSync(dizin).filter((a) => a.endsWith('.ts'));
    expect(dosyalar.length).toBeGreaterThan(5); // dizin gerçekten okunuyor
    for (const ad of dosyalar) {
      const icerik = fs.readFileSync(path.join(dizin, ad), 'utf8');
      expect({ ad, sizinti: /sayfa-rengi|scriptSayfaRengi|SAYFA_RENKLERI/.test(icerik) })
        .toEqual({ ad, sizinti: false });
    }
  });
});
