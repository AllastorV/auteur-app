// @vitest-environment jsdom
import React from 'react';
import * as Y from 'yjs';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MuhurDialog } from '@storyboard/core/components/dialogs/MuhurDialog';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { useProjectStore } from '@storyboard/core/store/project';
import { setScript } from '@storyboard/core/doc/mutations';
import type { PlatformAdapter, KanitKabugu } from '@storyboard/core/platform/types';
import type { ScriptBlock } from '@storyboard/core/model/script';
import { halka, sifirHalka, type ZincirDurumu, type ZincirKaydi } from '@storyboard/core/veri/zincir';

/**
 * MÜHÜR EKRANI.
 *
 * En önemli iddia: ekran NE KANITLADIĞINI ve NE KANITLAMADIĞINI yazıyor.
 * Bunu yazmayan bir ekran, kullanıcıyı yerel saatin kanıt olduğuna
 * inandırır — ve o yanlış inanç tam olarak mahkemede ortaya çıkar.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

const SENARYO: ScriptBlock[] = [
  { id: 'b1', fp: '1', type: 'scene', text: 'İÇ. MUTFAK - GECE', scene: '', sceneId: 'sc1' },
  { id: 'b2', fp: '2', type: 'action', text: 'Ayşe masaya oturur.', scene: '', sceneId: 'sc1' },
];

function sahteKabuk(kayitlar: ZincirKaydi[] = []): KanitKabugu {
  return {
    async muhurYaz(_p, kayit) { kayitlar.push(kayit); },
    async damgaYaz(_p, kayit) { kayitlar.push(kayit); },
    async oku() { return { kayitlar: [...kayitlar], durum: 'tam' as ZincirDurumu }; },
    async muhurMetni() { return null; },
    async damgaJetonu() { return null; },
  };
}

const platformYap = (kanit: KanitKabugu | null): PlatformAdapter => ({
  kind: 'desktop', canSaveLocally: true, canExportVideo: false,
  veriGuvenligi: null, dil: null, baslangic: null, yazarlik: null, kanit,
} as unknown as PlatformAdapter);

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

async function ciz(kanit: KanitKabugu | null) {
  const doc = new Y.Doc();
  setScript(doc, { name: 'Bavul', blocks: SENARYO });
  useProjectStore.getState().attachDoc(doc, 'owner');
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  await act(async () => {
    kok!.render(
      <PlatformProvider platform={platformYap(kanit)}>
        <MuhurDialog onClose={() => {}} />
      </PlatformProvider>,
    );
  });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

describe('mühür ekranı', () => {
  /* §15.4: web kabuğunda yeteneğin YOKLUĞU söyleniyor. Sessizce boş bir
     liste göstermek "hiç mühür almamışsın" dedirtirdi. */
  it('kabuk yoksa yokluğu söylüyor, boş liste göstermiyor', async () => {
    await ciz(null);
    expect(el('muhur-yok')).not.toBeNull();
    expect(el('muhur-listesi')).toBeNull();
    expect(el('muhur-yok')!.textContent).toContain('Masaüstü');
  });

  /* EKRANIN EN ÖNEMLİ İKİ CÜMLESİ. */
  it('ne kanıtladığını ve ne kanıtlamadığını yazıyor', async () => {
    await ciz(sahteKabuk());
    const vaat = el('muhur-vaat')!.textContent ?? '';
    expect(vaat).toContain('tarihi kanıtlamaz');
    expect(vaat).toContain('saat bu makinenindir');
    expect(vaat).toContain('bağımsız bir otoritenin');
  });

  it('mühür yokken boş durum ve sağlam zincir', async () => {
    await ciz(sahteKabuk());
    expect(el('muhur-bos')).not.toBeNull();
    expect(el('muhur-butunluk')!.textContent).toContain('sağlam');
  });

  it('mühürle düğmesi zincire kayıt düşürüyor', async () => {
    const kayitlar: ZincirKaydi[] = [];
    await ciz(sahteKabuk(kayitlar));
    await act(async () => { (el('muhur-al') as HTMLButtonElement).click(); });
    expect(kayitlar).toHaveLength(1);
    expect(kayitlar[0].tur).toBe('muhur');
    expect(kayitlar[0].tetikleyici).toBe('elle');
    /* Mühürlenen metin BELGEDEN geliyor: ekranın kendi metnini değil,
       senaryonun kanonik hâlini mühürlemesi gerekiyor. */
    expect(kayitlar[0].icerikBayt).toBeGreaterThan(0);
  });

  it('mühür alınınca listede görünüyor ve damga düğmesi çıkıyor', async () => {
    const kayitlar: ZincirKaydi[] = [];
    await ciz(sahteKabuk(kayitlar));
    await act(async () => { (el('muhur-al') as HTMLButtonElement).click(); });
    const zaman = kayitlar[0].zaman;
    await vi.waitFor(() => expect(el(`muhur-${zaman}`)).not.toBeNull());
    expect(el(`muhur-damgala-${zaman}`)).not.toBeNull();
  });

  /**
   * DAMGA ROZETİ DOĞRU MÜHRE DÜŞÜYOR.
   *
   * Ekran her mühür satırına kendi "damga al" düğmesini koyuyor, yani ESKİ
   * bir mührü sonradan damgalamak sunulan bir iş. Rozet önceden "damga,
   * kendinden önceki en yakın mühre aittir" varsayımıyla çiziliyordu ve o
   * durumda YANLIŞ satıra düşüyordu: kullanıcının az önce yaptığı işi
   * başka bir mühre yazıyordu. Rozet artık damga kaydının `icerikOzeti`
   * alanındaki halkayı okuyor.
   */
  it('eski bir mühür damgalanınca rozet o mühre düşüyor', async () => {
    const metin = new TextEncoder().encode('İÇ. MUTFAK - GECE\n');
    const ozet = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', metin as BufferSource));
    const eski: ZincirKaydi = {
      zaman: 1000, tur: 'muhur', tetikleyici: 'elle', oncekiHalka: sifirHalka(),
      icerikOzeti: ozet, icerikBayt: metin.length, yazar: 'Alp', etiket: 'ilk taslak',
    };
    const yeni: ZincirKaydi = {
      ...eski, zaman: 2000, oncekiHalka: await halka(eski), etiket: 'ikinci taslak',
    };
    /* Damga ESKİ mühre dayanıyor ama zincirde SONRA geliyor — eski
       yaklaşımın tam olarak şaşırdığı dizilim. */
    const damga: ZincirKaydi = {
      ...eski, zaman: 3000, tur: 'damga', oncekiHalka: await halka(yeni),
      icerikOzeti: await halka(eski), etiket: 'https://freetsa.org/tsr',
    };
    await ciz(sahteKabuk([eski, yeni, damga]));
    /* Halka hesabı `crypto.subtle` üzerinden asenkron: sabit sayıda tur
       beklemek yüklü koşuda kırılgan — koşul sağlanana kadar bekleniyor. */
    await vi.waitFor(() => expect(el('muhur-damgali-1000')).not.toBeNull());
    expect(el('muhur-damgali-2000')).toBeNull();
    /* Damgasız mühür kendi düğmesini KORUYOR: rozet yanlış satıra
       düşseydi kullanıcı damgalanmamış mührü damgalayamazdı. */
    expect(el('muhur-damgala-2000')).not.toBeNull();
    expect(el('muhur-damgala-1000')).toBeNull();
  });

  /* Damga DIŞARI çıkan tek şey: kullanıcı hangi anda ağa bağlandığını ve
     ne gönderildiğini bilmeli. */
  it('TSA adresi ve neyin gönderildiği ekranda', async () => {
    await ciz(sahteKabuk());
    expect(el('muhur-tsa')).not.toBeNull();
    expect(yer!.textContent).toContain('metnin özetidir');
  });
});
