// @vitest-environment jsdom
import React from 'react';
import * as Y from 'yjs';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { FonOlusturDialog } from '@storyboard/core/components/fon/FonOlusturDialog';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { useProjectStore } from '@storyboard/core/store/project';
import { setScript } from '@storyboard/core/doc/mutations';
import type { PlatformAdapter } from '@storyboard/core/platform/types';
import type { ScriptBlock } from '@storyboard/core/model/script';
import type { Project } from '@storyboard/core/model/types';
import type { FonSablonu } from '@storyboard/core/fon/sablon';

/**
 * ÜRETİMDEKİ ÇAĞRI YOLU — pencere gerçekten proje kuruyor mu.
 *
 * Bu depoda üç kez yaşanmış hata: özellik yazıldı, testleri yeşil, ama
 * üretimde hiç çağrılmadı. `fon/kur.ts`in birim testleri saf fonksiyonu
 * ölçüyor; burada ölçülen şey pencerenin o fonksiyonu GERÇEKTEN çağırdığı
 * ve mağazadan doğru girdiyi topladığı.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

const SAHTE_PLATFORM = {
  kind: 'web', canSaveLocally: true, canExportVideo: false,
  veriGuvenligi: null, dil: null, baslangic: null,
} as unknown as PlatformAdapter;

const SENARYO: ScriptBlock[] = [
  { id: 'b1', fp: '1', type: 'scene', text: 'İÇ. MUTFAK - GECE', scene: '', sceneId: 'sc1' },
  { id: 'b2', fp: '2', type: 'action', text: 'Ayşe masaya oturur.', scene: '', sceneId: 'sc1' },
  { id: 'b3', fp: '3', type: 'character', text: 'AYŞE', scene: '', sceneId: 'sc1' },
  { id: 'b4', fp: '4', type: 'dialogue', text: 'Bu iş burada bitmez.', scene: '', sceneId: 'sc1' },
];

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

let kurulan: { proje: Project; sablon: FonSablonu } | null = null;

function ciz() {
  kurulan = null;
  const doc = new Y.Doc();
  setScript(doc, { name: 'Bavul', blocks: SENARYO });
  useProjectStore.getState().attachDoc(doc, 'owner');
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => {
    kok!.render(
      <PlatformProvider platform={SAHTE_PLATFORM}>
        <FonOlusturDialog
          onKapat={() => {}}
          onKuruldu={(proje, sablon) => { kurulan = { proje, sablon }; }}
        />
      </PlatformProvider>,
    );
  });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const tikla = (id: string) => act(() => { el(id)!.click(); });

describe('fon dosyası oluşturma penceresi', () => {
  it('dört şablon da seçilebilir olarak çiziliyor', () => {
    ciz();
    for (const id of ['sgm-senaryo', 'sgm-uzun-metraj', 'sgm-ortak-yapim', 'eurimages-coprod']) {
      expect(el(`fon-sablon-${id}`), id).not.toBeNull();
    }
  });

  /* Kurumun listesi yıllık değişiyor ve yanlış listeyle yapılan başvuru
     eleniyor: sürüm SEÇİM ANINDA görünmeli. */
  it('şablon satırı kurumu ve sürümü söylüyor', () => {
    ciz();
    const satir = el('fon-sablon-eurimages-coprod')!;
    expect(satir.textContent).toContain('Eurimages');
    expect(satir.textContent).toContain('2026');
  });

  /* Kaç bölümün üretileceği, kaçının elle yazılacağı seçim anında
     görünüyor: "dosyayı program yazacak" beklentisiyle başlayan kullanıcı
     sinopsisi kendisinin yazacağını sonradan öğrenmemeli. */
  it('ne üretileceğini ve ne üretilmeyeceğini sayıyor', () => {
    ciz();
    expect(el('fon-sayim')!.textContent).toMatch(/\d/);
  });

  it('varsayılan şablonla proje kuruluyor', () => {
    ciz();
    tikla('fon-olustur');
    expect(kurulan).not.toBeNull();
    expect(kurulan!.proje.meta.dokumanTipi).toBe('fon-dosyasi');
    expect(kurulan!.proje.settings.fonSablonu).toBe('sgm-senaryo');
  });

  /* Seçim GERÇEKTEN uygulanıyor mu: kartlar `<select>`in yerine geçtiği
     için değeri değiştirmek artık bizim kodumuzun işi. */
  it('seçilen şablon kurulan projeye geçiyor', () => {
    ciz();
    tikla('fon-sablon-eurimages-coprod');
    tikla('fon-olustur');
    expect(kurulan!.sablon.id).toBe('eurimages-coprod');
    expect(kurulan!.proje.settings.fonSablonu).toBe('eurimages-coprod');
  });

  /* Belge senaryodan TÜRETİLİYOR: kaynak mağazadan gerçekten okunuyorsa
     tretman iskeletinde senaryonun sahnesi görünür. Mağazayı hiç okumayan
     bir pencere boş bir belge kurardı ve bu test onu yakalar. */
  it('kurulan belge kaynak senaryonun sahnesini taşıyor', () => {
    ciz();
    tikla('fon-olustur');
    const metin = kurulan!.proje.script.blocks.map((b) => b.text).join('\n');
    expect(metin).toContain('İÇ. MUTFAK - GECE');
    expect(metin).toContain('[bu sahnede ne oluyor?]');
    /* Diyalog KOPYALANMIYOR — tretman özet değil iskelet. */
    expect(metin).not.toContain('Bu iş burada bitmez');
  });

  /* Eurimages dosyası İNGİLİZCE çıkıyor: belge dili şablondan geliyor,
     arayüz dilinden ya da senaryonun dilinden değil. */
  it('şablonun dili belgeye geçiyor', () => {
    ciz();
    tikla('fon-sablon-eurimages-coprod');
    tikla('fon-olustur');
    const metin = kurulan!.proje.script.blocks.map((b) => b.text).join('\n');
    expect(metin).toContain('Scene list');
    expect(metin).not.toContain('Sahne listesi');
  });
});
