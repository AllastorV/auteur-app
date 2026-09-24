// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { useVeriGuvenligi } from '@storyboard/core/hooks/useVeriGuvenligi';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { useProjectStore } from '@storyboard/core/store/project';
import { loadProjectIntoDoc, metaMap } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import { gunlukBasligi } from '@storyboard/core/veri/gunluk';
import { oturumuKurtar } from '@storyboard/core/veri/anlik';
import type { PlatformAdapter } from '@storyboard/core/platform/types';

/**
 * BELGE DEĞİŞİMİ ÇIPASIZ BIRAKILAMAZ — 2026-08-27 taramasının 2. bulgusu.
 *
 * Yaşayan belgeyi değiştiren yollardan yalnız biri (kurtarma "Kurtar")
 * yeni durumu çıpalayıp günlüğü kesiyordu. Diğerlerinde:
 *
 * - Sürüm geri yükleme `replaceProject` ile YENİ bir Yjs soyu kurar. Yeni
 *   soyun ilk tam durumu hiçbir çıpaya girmezse, sonraki kurtarma "eski
 *   soylu çıpa + yeni soylu günlük" oynatır: yeni soyun çerçeveleri
 *   bağlanacak öğeyi bulamaz, Yjs FIRLATMAZ (bekleyen yapı olarak saklar)
 *   ve dönüşten sonra yazılan HER ŞEY sessizce kaybolur — yeşil raporla.
 * - Aynı soylu geri dönüşte halkanın en yeni noktası "dönülmeden önceki
 *   durum" kalır; kurtarma dönüşü sessizce GERİ ALIR.
 *
 * Düzeltme tek evde (Karar 2): `useVeriGuvenligi` belge değişimini gören
 * tek yer — kurulumda YENİ belgeyi çıpalar (günlük kesilir), sökülürken
 * ESKİ belgenin son hâlini çıpalar (son ≤5 dk yalnız günlükte kalmasın).
 *
 * Buradaki sahte kabuk main.ts'in sözleşmesini birebir taklit eder:
 * `cipaYazVeGunlugeKes` çıpayı halkaya koyar VE günlüğü keser; `ekle`
 * çerçeveleri ekler. Kurtarma GERÇEK `oturumuKurtar` ile oynatılır — iddia
 * "çağrı yapıldı" değil, "kurtarılan belge doğru".
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
  vi.useRealTimers();
});

function ciz(ogeler: React.ReactNode) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(ogeler); });
}

function Sonda() {
  useVeriGuvenligi(true);
  return null;
}

/** main.ts + gunluk-deposu.ts sözleşmesinin bellek içi taklidi. */
function sahteKabuk() {
  const halka: { id: string; zaman: number; bayt: Uint8Array }[] = [];
  let gunluk: Uint8Array[] = [];
  let sira = 0;
  const kabuk: PlatformAdapter['veriGuvenligi'] = {
    async gunlugeEkle(_id, c) { gunluk.push(c); },
    async gunlukOku() {
      const govde = gunluk.reduce((t, p) => t + p.length, 0);
      const baslik = gunlukBasligi();
      const cikti = new Uint8Array(baslik.length + govde);
      cikti.set(baslik, 0);
      let k = baslik.length;
      for (const p of gunluk) { cikti.set(p, k); k += p.length; }
      return cikti;
    },
    /* Sıra sözleşmedir: önce çıpa halkaya, SONRA günlük kesilir. */
    async cipaYazVeGunlugeKes(_id, cipa) {
      sira += 1;
      halka.unshift({ id: `cipa-${sira}.yjs`, zaman: sira, bayt: new Uint8Array(cipa) });
      gunluk = [];
    },
    async cipaHalkasi() { return halka.map(({ id, zaman }) => ({ id, zaman })); },
    async cipaOku(_id, id) { return halka.find((c) => c.id === id)!.bayt; },
    async gunluguArsivle() { gunluk = []; return 'arsiv'; },
  };
  return { kabuk, halka, gunlukOku: () => kabuk.gunlukOku('p') };
}

const platformYap = (veriGuvenligi: PlatformAdapter['veriGuvenligi']): PlatformAdapter =>
  ({ kind: 'desktop', canSaveLocally: true, canExportVideo: false, veriGuvenligi } as unknown as PlatformAdapter);

/** Sahte kabuğun diskinden GERÇEK kurtarma koşar. */
async function kurtarilanBelge(depo: ReturnType<typeof sahteKabuk>, projeId: string): Promise<Y.Doc> {
  const gunluk = await depo.gunlukOku();
  const sonuc = oturumuKurtar(
    depo.halka.map((c) => ({ id: c.id, oku: () => c.bayt })),
    gunluk!,
    projeId,
  );
  return sonuc.doc;
}

describe('belge değişiminde çıpa — sürüm geri yükleme kayıpsız', () => {
  it('yeni soya geçiş + düzenleme + çökme: kurtarılan belge YENİ soyun son hâli', async () => {
    vi.useFakeTimers();
    const depo = sahteKabuk();
    const proje = createProject({ panels: [createPanel()] });

    /* A oturumu: belge A yaşıyor, düzenleniyor. */
    const docA = new Y.Doc();
    loadProjectIntoDoc(docA, proje, 'load');
    useProjectStore.getState().attachDoc(docA, 'owner');
    ciz(
      <PlatformProvider platform={platformYap(depo.kabuk)}>
        <Sonda />
      </PlatformProvider>,
    );
    await act(async () => {
      metaMap(docA).set('title', 'A-son');
      await vi.advanceTimersByTimeAsync(1000);
    });

    /* Sürüm geri yükleme: replaceProject gibi AYNI proje verisinden YENİ
       soy kurulur (yeni Yjs kimlikleri) ve yaşayan belge değişir. */
    const docB = new Y.Doc();
    loadProjectIntoDoc(docB, proje, 'load');
    await act(async () => {
      useProjectStore.getState().attachDoc(docB, 'owner');
      await vi.advanceTimersByTimeAsync(0);
    });

    /* Yeni soyda düzenleme, sonra ÇÖKME (temiz kapanış yok). */
    await act(async () => {
      metaMap(docB).set('title', 'B-yeni');
      await vi.advanceTimersByTimeAsync(1000);
    });

    const kurtarilan = await kurtarilanBelge(depo, proje.meta.id);
    /* Mutant (açılış çıpası silinir): halkanın en yeni noktası A soylu
       kalır; B'nin çerçevesi bekleyen yapıya düşer ve başlık 'B-yeni'
       OLMAZ — dönüşten sonra yazılan iş yeşil raporla kaybolur. */
    expect(metaMap(kurtarilan).get('title')).toBe('B-yeni');
    /* Çiftlenme de yok: paneller tek kopya. */
    expect(kurtarilan.getArray('panels').length).toBe(proje.panels.length);
    kurtarilan.destroy();
  });

  it('sökülürken eski belgenin SON hâli halkaya girer (son ≤5 dk kaybolmaz)', async () => {
    vi.useFakeTimers();
    const depo = sahteKabuk();
    const proje = createProject({ panels: [createPanel()] });

    const docA = new Y.Doc();
    loadProjectIntoDoc(docA, proje, 'load');
    useProjectStore.getState().attachDoc(docA, 'owner');
    ciz(
      <PlatformProvider platform={platformYap(depo.kabuk)}>
        <Sonda />
      </PlatformProvider>,
    );
    /* Son düzenleme çıpalar ARASINDA kalır — yalnız günlükte. */
    await act(async () => {
      metaMap(docA).set('title', 'A-son-dakika');
      await vi.advanceTimersByTimeAsync(1000);
    });

    const docB = new Y.Doc();
    loadProjectIntoDoc(docB, proje, 'load');
    await act(async () => {
      useProjectStore.getState().attachDoc(docB, 'owner');
      await vi.advanceTimersByTimeAsync(0);
    });

    /* Mutant (sökülüş çıpası `bosalt`a geriletilir): A'nın son düzenlemesi
       hiçbir çıpaya girmeden günlük yeni belge için kesilir — iş gider.
       Düzeltmeyle halkada 'A-son-dakika' taşıyan bir nokta OLMALI. */
    const tasiyan = depo.halka.some((c) => {
      const d = new Y.Doc();
      try {
        Y.applyUpdate(d, c.bayt, 'test');
        return metaMap(d).get('title') === 'A-son-dakika';
      } finally {
        d.destroy();
      }
    });
    expect(tasiyan).toBe(true);
  });
});
