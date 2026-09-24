// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { YardimPaneli } from '@storyboard/core/components/dialogs/YardimPaneli';
import { konular, type YardimKomutu } from '@storyboard/core/yardim/icerik';

/**
 * YARDIM PANELİ — düğmeler gerçekten bir yere gidiyor mu.
 *
 * Yardımın değeri metninde değil, EYLEMİNDE: "Geri dönüş noktalarını aç"
 * yazan bir düğme hiçbir şey açmıyorsa yardım, kullanıcıyı iki kez
 * yoruyor demektir. Bu dosya iki şeyi ölçüyor:
 *
 *   1. Panelde her eylem düğmesi tıklanınca onKomut'u çağırıyor mu,
 *   2. İçerikteki her komut Studio'nun switch'inde KARŞILIĞI var mı.
 *
 * İkincisi statik bir okuma ama gerçek bir tuzağı kapatıyor: icerik.ts'e
 * yeni bir komut eklenip Studio'daki switch unutulursa düğme sessizce
 * hiçbir şey yapmaz (§15.4 sessiz başarısızlık yasağı).
 */

let kok: Root | null = null;
let kap: HTMLDivElement | null = null;

afterEach(() => {
  act(() => kok?.unmount());
  kap?.remove();
  kok = null;
  kap = null;
});

function ciz(onKomut: (k: YardimKomutu) => void, konu?: string) {
  kap = document.createElement('div');
  document.body.append(kap);
  kok = createRoot(kap);
  act(() => {
    kok!.render(<YardimPaneli onClose={() => {}} onKomut={onKomut} baslangicKonusu={konu} />);
  });
  return kap;
}

/** İçerikte geçen bütün eylem komutları, konusuyla birlikte. */
function tumEylemler(): { konu: string; komut: YardimKomutu }[] {
  return konular().flatMap((k) =>
    k.parcalar
      .filter((p): p is { tip: 'eylem'; etiket: string; komut: YardimKomutu } => p.tip === 'eylem')
      .map((p) => ({ konu: k.id, komut: p.komut })),
  );
}

describe('yardım paneli — eylem düğmeleri', () => {
  it('her eylem düğmesi tıklanınca komutunu bildiriyor', () => {
    const eylemler = tumEylemler();
    expect(eylemler.length).toBeGreaterThan(0);

    for (const { konu, komut } of eylemler) {
      const gelen: YardimKomutu[] = [];
      const el = ciz((k) => gelen.push(k), konu);
      const dugme = el.querySelector<HTMLButtonElement>(`[data-testid="yardim-eylem-${komut}"]`);
      expect(dugme, `${konu} konusunda ${komut} düğmesi yok`).not.toBeNull();

      act(() => {
        dugme!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(gelen, `${komut} tıklandı ama komut gelmedi`).toEqual([komut]);

      act(() => kok!.unmount());
      kap!.remove();
      kok = null;
      kap = null;
    }
  });

  it('içerikteki her komut Studio tarafından karşılanıyor', () => {
    const studio = readFileSync(
      path.join(__dirname, '..', 'src', 'components', 'Studio.tsx'),
      'utf-8',
    );
    /* onKomut switch'i: <YardimPaneli ...> bloğunun içindeki case'ler. */
    const blok = studio.slice(studio.indexOf('<YardimPaneli'));
    const karsilanan = new Set(
      [...blok.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]),
    );

    const eksik = [...new Set(tumEylemler().map((e) => e.komut))].filter(
      (k) => !karsilanan.has(k),
    );
    expect(eksik, `Studio'da karşılığı olmayan yardım komutları: ${eksik.join(', ')}`).toEqual([]);
  });
});
