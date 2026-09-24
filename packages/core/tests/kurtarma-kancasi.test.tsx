// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { useKurtarma, type KurtarmaDurumu } from '@storyboard/core/hooks/useKurtarma';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { useProjectStore } from '@storyboard/core/store/project';
import { cerceve, gunlukBasligi } from '@storyboard/core/veri/gunluk';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import type { PlatformAdapter } from '@storyboard/core/platform/types';
import { useUiStore } from '@storyboard/core/store/ui';

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;
afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

function birlestir(p: Uint8Array[]): Uint8Array {
  const t = p.reduce((a, b) => a + b.length, 0);
  const c = new Uint8Array(t);
  let k = 0;
  for (const x of p) { c.set(x, k); k += x.length; }
  return c;
}

/* Çökmüş oturum ile mağazadaki proje AYNI projedir. Farklı olsalardı
   `attachDoc` sonrası proje kimliği değişir, denetim yeni proje için baştan
   koşar ve öneri yeniden belirirdi — bu doğru davranıştır ama testin
   kurgusunu yalancı yapardı. */
const PROJE = createProject({ panels: [createPanel()] });

/** Çökmüş bir oturum: çıpa + üstüne düşen günlük. */
function cokmusOturum() {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, PROJE, 'load');
  const cipa = Y.encodeStateAsUpdate(doc);

  const parcalar = [gunlukBasligi()];
  let z = 1_700_000_000_000;
  doc.on('update', (u: Uint8Array) => { z += 1000; parcalar.push(cerceve(u, z)); });
  doc.getMap('meta').set('name', 'kurtarılacak');

  return { doc, cipa, gunluk: birlestir(parcalar) };
}

function kabukKur(over: Partial<NonNullable<PlatformAdapter['veriGuvenligi']>> = {}) {
  const cagri = { arsivle: 0, cipaYaz: 0 };
  const oturum = cokmusOturum();
  const kabuk: NonNullable<PlatformAdapter['veriGuvenligi']> = {
    async gunlukOku() { return oturum.gunluk; },
    async cipaHalkasi() { return [{ id: 'cipa-1', zaman: 1 }]; },
    async cipaOku() { return oturum.cipa; },
    async gunlugeEkle() {},
    async cipaYazVeGunlugeKes() { cagri.cipaYaz++; },
    async gunluguArsivle() { cagri.arsivle++; return 'arsiv'; },
    ...over,
  };
  return { kabuk, cagri, oturum };
}

const platform = (v: PlatformAdapter['veriGuvenligi']): PlatformAdapter =>
  ({ kind: 'desktop', canSaveLocally: true, canExportVideo: false, veriGuvenligi: v } as unknown as PlatformAdapter);

function Sonda({ al }: { al: (d: KurtarmaDurumu) => void }) {
  al(useKurtarma(true));
  return null;
}

async function ciz(p: PlatformAdapter, al: (d: KurtarmaDurumu) => void) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  await act(async () => {
    kok!.render(
      <PlatformProvider platform={p}>
        <Sonda al={al} />
      </PlatformProvider>,
    );
  });
}

function projeyiKur() {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, PROJE, 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
}

describe('§15.3 — açılışta kurtarma denetimi', () => {
  it('kabukta katman yoksa denetim anında çözülür', async () => {
    projeyiKur();
    const g: KurtarmaDurumu[] = [];
    await ciz(platform(null), (d) => g.push(d));
    expect(g.at(-1)!.cozuldu).toBe(true);
    expect(g.at(-1)!.oneri).toBeNull();
  });

  it('boş günlükte kullanıcıya hiçbir şey sorulmaz', async () => {
    projeyiKur();
    const { kabuk } = kabukKur({ async gunlukOku() { return null; } });
    const g: KurtarmaDurumu[] = [];
    await ciz(platform(kabuk), (d) => g.push(d));
    expect(g.at(-1)!.oneri).toBeNull();
    expect(g.at(-1)!.cozuldu).toBe(true);
  });

  /* Karar VERİLENE KADAR `cozuldu` false: çağıran yazıcıyı bu bayrakla
     bekletiyor. True dönseydi yazıcı, henüz oynatılmamış bir günlüğün sonuna
     yeni çerçeveler eklerdi. */
  it('öneri varken denetim ÇÖZÜLMEMİŞ sayılır', async () => {
    projeyiKur();
    const { kabuk } = kabukKur();
    const g: KurtarmaDurumu[] = [];
    await ciz(platform(kabuk), (d) => g.push(d));
    const son = g.at(-1)!;
    expect(son.oneri).not.toBeNull();
    expect(son.cozuldu).toBe(false);
    expect(son.oneri!.kurtarma.uygulanan).toBeGreaterThan(0);
  });

  it('Kurtar belgeyi bağlar, çıpalar ve denetimi çözer', async () => {
    projeyiKur();
    const { kabuk, cagri } = kabukKur();
    const g: KurtarmaDurumu[] = [];
    await ciz(platform(kabuk), (d) => g.push(d));

    await act(async () => { g.at(-1)!.kurtar(); });
    expect(useProjectStore.getState().project.meta.name).toBe('kurtarılacak');
    // Çıpalanmazsa aynı günlük bir sonraki açılışta yeniden sorulurdu.
    expect(cagri.cipaYaz).toBe(1);
    expect(g.at(-1)!.cozuldu).toBe(true);
    expect(g.at(-1)!.oneri).toBeNull();
  });

  /* §15.3: "Yoksay" günlüğü SİLMEZ, taşır. */
  it('Yoksay günlüğü arşivler, silmez', async () => {
    projeyiKur();
    const { kabuk, cagri } = kabukKur();
    const g: KurtarmaDurumu[] = [];
    await ciz(platform(kabuk), (d) => g.push(d));

    await act(async () => { g.at(-1)!.yoksay(); });
    expect(cagri.arsivle).toBe(1);
    expect(cagri.cipaYaz).toBe(0);
    expect(g.at(-1)!.oneri).toBeNull();
  });

  /* Günlük var ama hiçbir güncelleme uygulanamıyorsa kullanıcıya boş bir
     karar sunmak yerine sessizce arşivlenir — ama SİLİNMEZ. */
  it('uygulanabilir iş yoksa sorulmaz, günlük arşivlenir', async () => {
    projeyiKur();
    const { kabuk, cagri } = kabukKur({
      async gunlukOku() { return birlestir([gunlukBasligi(), cerceve(new Uint8Array([9, 9, 9, 9]), 1)]); },
    });
    const g: KurtarmaDurumu[] = [];
    await ciz(platform(kabuk), (d) => g.push(d));
    expect(g.at(-1)!.oneri).toBeNull();
    expect(g.at(-1)!.cozuldu).toBe(true);
    expect(cagri.arsivle).toBe(1);
  });

  /* Sağlaması tutan çerçeveler kullanıcının yazdıklarıdır; hiçbirinin
     uygulanamaması bir ARIZA işaretidir. Sessiz geçilseydi kullanıcı ne
     kaybı ne arşivin yerini öğrenirdi. */
  it('çerçeveler vardı ama uygulanamadıysa kullanıcıya BİLDİRİLİYOR', async () => {
    projeyiKur();
    const { kabuk } = kabukKur({
      async gunlukOku() { return birlestir([gunlukBasligi(), cerceve(new Uint8Array([9, 9, 9, 9]), 1)]); },
    });
    const g: KurtarmaDurumu[] = [];
    await ciz(platform(kabuk), (d) => g.push(d));
    expect(useUiStore.getState().toast?.message ?? '').toMatch(/uygulanamadı/);
  });

  /* Denetim çökerse uygulama AÇILMAYA devam eder; kilitlemek, kurtarılacak
     bir şey olmadığı hâlde kullanıcıyı projesinden etmek olurdu. */
  it('denetim hata verirse uygulama açılmaya devam eder', async () => {
    projeyiKur();
    const { kabuk } = kabukKur({
      async gunlukOku() { throw new Error('okuma hatası'); },
    });
    const g: KurtarmaDurumu[] = [];
    await ciz(platform(kabuk), (d) => g.push(d));
    expect(g.at(-1)!.cozuldu).toBe(true);
    expect(g.at(-1)!.oneri).toBeNull();
  });

  it('en yeni çıpa okunamıyorsa bir öncekine düşülür', async () => {
    projeyiKur();
    const oturum = cokmusOturum();
    const okundu: string[] = [];
    const kabuk: NonNullable<PlatformAdapter['veriGuvenligi']> = {
      async gunlukOku() { return oturum.gunluk; },
      async cipaHalkasi() { return [{ id: 'yeni', zaman: 2 }, { id: 'eski', zaman: 1 }]; },
      async cipaOku(_p, id) {
        okundu.push(id);
        if (id === 'yeni') throw new Error('okunamadı');
        return oturum.cipa;
      },
      async gunlugeEkle() {},
      async cipaYazVeGunlugeKes() {},
      async gunluguArsivle() { return null; },
    };
    const g: KurtarmaDurumu[] = [];
    await ciz(platform(kabuk), (d) => g.push(d));
    expect(okundu).toEqual(['yeni', 'eski']);
    expect(g.at(-1)!.oneri!.kurtarma.cipa).toBe('eski');
    expect(g.at(-1)!.oneri!.kurtarma.elenen[0]).toEqual({ id: 'yeni', sebep: 'okunamadi' });
  });

  /* Platform NESNESİ her render'da yeniden kurulursa (bağlam değeri satır içi
     yazıldığında olağan bir hata) effect bağımlılığı her seferinde değişir ve
     denetim baştan koşar: kullanıcı kurtarma penceresini tekrar tekrar görür,
     hatta seçim yaptıktan sonra bile. Proje kimliği çıpası bunu keser. */
  it('platform nesnesi her render değişse de denetim BİR kez koşar', async () => {
    projeyiKur();
    const oku = vi.fn(async () => null);
    const { kabuk } = kabukKur({ gunlukOku: oku });

    function Kabuk() {
      const [, tazele] = React.useState(0);
      React.useEffect(() => { tazele(1); }, []);
      // Her render'da YENİ nesne — kasıtlı.
      return (
        <PlatformProvider platform={platform(kabuk)}>
          <Sonda al={() => {}} />
        </PlatformProvider>
      );
    }

    yer = document.createElement('div');
    document.body.appendChild(yer);
    kok = createRoot(yer);
    await act(async () => { kok!.render(<Kabuk />); });
    await act(async () => { await Promise.resolve(); });

    expect(oku).toHaveBeenCalledTimes(1);
  });
});
