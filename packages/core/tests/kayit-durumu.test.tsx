// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { SonYazim } from '@storyboard/core/components/VeriSeridi';
import type { YaziciDurumu } from '@storyboard/core/veri/yazici';

/**
 * KAYIT GÖSTERGESİ — hangi durum hangi yüzü gösteriyor.
 *
 * Burada ölçülen şey ikonun güzelliği değil, DURUM EŞLEMESİ: gösterge
 * "kaydedildi" derken aslında kaydedilmemişse kullanıcı işini kaybeder ve
 * bunu ancak çok geç fark eder. §15'in koruduğu şey tam olarak bu.
 *
 * Durum yalnız renkle değil BİÇİMLE de söylendiği için (`data-durum` +
 * erişilebilir ad) test renge hiç bakmıyor — renk körü bir kullanıcının
 * gördüğü şey neyse test de onu ölçüyor.
 */

function durumla(kismi: Partial<YaziciDurumu>): YaziciDurumu {
  return {
    sonYazim: Date.UTC(2026, 7, 27, 0, 0, 0),
    bekleyen: 0,
    ardArdaHata: 0,
    engelleyici: false,
    ...kismi,
  } as YaziciDurumu;
}

/* Depoda `@testing-library/react` YOK; komşu bileşen testleri (örn.
   `ceviri-dialog.test.tsx`) doğrudan `react-dom/client` kullanıyor —
   aynı yol izleniyor, yeni bağımlılık eklenmiyor. */
let kap: HTMLDivElement | null = null;
let kok: Root | null = null;

function ciz(ogeler: React.ReactElement): HTMLDivElement {
  kap = document.createElement('div');
  document.body.appendChild(kap);
  kok = createRoot(kap);
  act(() => {
    kok!.render(ogeler);
  });
  return kap;
}

afterEach(() => {
  act(() => kok?.unmount());
  kap?.remove();
  kok = null;
  kap = null;
});

const bul = (ad: string) => kap!.querySelector(`[data-testid="${ad}"]`);
const gosterge = () => {
  const el = bul('kayit-durumu');
  if (!el) throw new Error('kayıt göstergesi hiç çizilmedi');
  return el;
};

describe('kayıt göstergesi durum eşlemesi', () => {
  it('sorun yokken ve bekleyen yokken KAYDEDİLDİ', () => {
    ciz(<SonYazim durum={durumla({})} />);
    expect(gosterge().getAttribute('data-durum')).toBe('kaydedildi');
  });

  it('bekleyen yazım varsa YAZILIYOR', () => {
    ciz(<SonYazim durum={durumla({ bekleyen: 3 })} />);
    expect(gosterge().getAttribute('data-durum')).toBe('yaziliyor');
  });

  it('engelleyici hata HER ŞEYİ bastırır — bekleyen varken bile HATA', () => {
    /* Sıra önemli: önce "bekleyen var mı" diye baksaydık, yazamayan bir
       kuyruk sonsuza kadar "yazılıyor" görünürdü ve kullanıcı hatayı hiç
       görmezdi. */
    ciz(<SonYazim durum={durumla({ engelleyici: true, bekleyen: 5 })} />);
    expect(gosterge().getAttribute('data-durum')).toBe('hata');
  });

  it('art arda hata da HATA sayılır', () => {
    ciz(<SonYazim durum={durumla({ ardArdaHata: 2 })} />);
    expect(gosterge().getAttribute('data-durum')).toBe('hata');
  });

  it('durumun okunabilir bir adı var — renk körü kullanıcı ve ekran okuyucu için', () => {
    ciz(<SonYazim durum={durumla({ engelleyici: true })} />);
    const ad = gosterge().getAttribute('aria-label') ?? '';
    expect(ad).toContain('Kaydedilemedi');
  });

  it('yanında yalnız SAAT var, kelime yok', () => {
    ciz(<SonYazim durum={durumla({})} />);
    const saat = bul('son-yazim-saat')?.textContent ?? '';
    /* Yalnız rakam ve iki nokta — "günlüğe işlendi" gibi bir kelime kalmamalı. */
    expect(saat).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    /* Şeridin KENDİ metni boş: ikonun içindeki `<title>` (araç ipucu) ve
       saat kutusu dışında hiçbir kelime çizilmiyor. `textContent` ile
       ölçseydik `<title>` de sayılır, iddia yanlış yerden geçerdi. */
    const serit = bul('son-yazim')!;
    const dogrudanMetin = Array.from(serit.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? '')
      .join('')
      .trim();
    expect(dogrudanMetin).toBe('');
  });

  it('hiç yazım olmamışken saat gösterilmiyor', () => {
    /* Boş bir saat yerine hiç saat: "00:00:00" yazan bir gösterge, o anda
       yazılmış gibi okunur. */
    ciz(<SonYazim durum={durumla({ sonYazim: null })} />);
    expect(bul('son-yazim-saat')).toBeNull();
  });

  it('durum yoksa şerit hiç çizilmiyor', () => {
    expect(ciz(<SonYazim durum={null} />).innerHTML).toBe('');
  });
});
