// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { AnalizPanosuDialog } from '@storyboard/core/components/dialogs/AnalizPanosuDialog';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * Panel GERÇEKTEN çiziliyor mu.
 *
 * Kaynak dizgisi arayan testler bir bileşenin çalıştığını söylemez —
 * yalnız yazıldığını söyler. Buradaki testler paneli jsdom'a mount edip
 * çıktısını okuyor: bir çalışma zamanı hatası (tanımsız alan, boş dizide
 * `Math.max`, kırık binding) burada kırmızıya döner.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;
let sayac = 0;

const b = (tip: ScriptBlock['type'], text: string, sceneId: string): ScriptBlock =>
  ({ id: `b${sayac++}`, fp: `${text}${sayac}`, type: tip, text, scene: '', sceneId });

function projeKur(bloklar: ScriptBlock[]) {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  M.setScript(doc, { name: 's', blocks: bloklar });
  return doc;
}

function ciz() {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(<AnalizPanosuDialog onClose={() => {}} />); });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

const SENARYO = (): ScriptBlock[] => {
  sayac = 0;
  return [
    b('scene', 'İÇ. MUTFAK - GECE', 'sc1'),
    b('action', 'Demir masaya oturur, uzun uzun düşünür.', 'sc1'),
    b('character', 'DEMİR', 'sc1'),
    b('dialogue', 'Bu iş burada bitmez.', 'sc1'),
    b('character', 'NALAN', 'sc1'),
    b('dialogue', 'Bitmesini kim istedi ki zaten söyle bana.', 'sc1'),
    b('scene', 'DIŞ. İSKELE - GÜNDÜZ', 'sc2'),
    b('character', 'NALAN', 'sc2'),
    b('dialogue', 'Geç oldu.', 'sc2'),
    b('scene', 'DIŞ. İSKELE - GECE', 'sc3'),
    b('character', 'HAKKI', 'sc3'),
    b('dialogue', 'Kimse yok burada.', 'sc3'),
  ];
};

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
  useUiStore.setState({ scriptCursor: null });
});

describe('panel mount oluyor', () => {
  it('senaryo varken çiziliyor ve özet doğru', () => {
    projeKur(SENARYO());
    ciz();
    const metin = el('analiz-panosu')!.textContent!;
    expect(metin).toMatch(/3 sahne/);
    expect(metin).toMatch(/kelime/);
  });

  it('boş senaryoda çökmüyor, durumu söylüyor', () => {
    projeKur([]);
    ciz();
    expect(el('analiz-panosu')!.textContent).toMatch(/Çözümlenecek senaryo yok/);
  });

  it('tek karakterli senaryoda matris yerine açıklama var', () => {
    sayac = 0;
    projeKur([
      b('scene', 'İÇ. ODA - GÜN', 'sc1'),
      b('character', 'DEMİR', 'sc1'),
      b('dialogue', 'Yalnızım.', 'sc1'),
    ]);
    ciz();
    expect(el('karsilasma-matrisi')).toBeNull();
    expect(el('analiz-panosu')!.textContent).toMatch(/en az iki karakter/i);
  });
});

describe('grafikler çizildi', () => {
  it('karşılaşma matrisi ve sahne şeridi var', () => {
    projeKur(SENARYO());
    ciz();
    expect(el('karsilasma-matrisi')).not.toBeNull();
    expect(el('sahne-seridi')).not.toBeNull();
    expect(el('anlati-hikaye')).not.toBeNull();
  });

  it('her sahne için bir çubuk var', () => {
    projeKur(SENARYO());
    ciz();
    expect(el('analiz-sahne-0')).not.toBeNull();
    expect(el('analiz-sahne-2')).not.toBeNull();
    expect(el('analiz-sahne-3')).toBeNull();
  });

  it('çubuğa tıklamak senaryoda o sahneye götürüyor', () => {
    const bloklar = SENARYO();
    projeKur(bloklar);
    ciz();
    act(() => { (el('analiz-sahne-1') as HTMLButtonElement).click(); });
    expect(useUiStore.getState().scriptCursor).toBe(bloklar[6].id);
  });
});

describe('çift detayı', () => {
  it('matris hücresine tıklamak detayı açıyor', () => {
    projeKur(SENARYO());
    ciz();
    expect(el('analiz-detay')).toBeNull();
    const hucre = yer!.querySelector('[data-testid^="matris-"]') as HTMLButtonElement;
    expect(hucre, 'matris hücresi çizilmemiş').not.toBeNull();
    act(() => { hucre.click(); });
    expect(el('analiz-detay')).not.toBeNull();
  });

  it('detay kapatılabiliyor', () => {
    projeKur(SENARYO());
    ciz();
    act(() => { (yer!.querySelector('[data-testid^="matris-"]') as HTMLButtonElement).click(); });
    act(() => { (el('detay-kapat') as HTMLButtonElement).click(); });
    expect(el('analiz-detay')).toBeNull();
  });

  it('paylaşılan sahnesi olan çiftte liste dolu ve tıklanabilir', () => {
    const bloklar = SENARYO();
    projeKur(bloklar);
    ciz();
    /* DEMİR–NALAN ilk sahneyi paylaşıyor. */
    const hucre = yer!.querySelector('[data-testid="matris-NALAN-DEMİR"]')
      ?? yer!.querySelector('[data-testid="matris-DEMİR-NALAN"]');
    expect(hucre, 'DEMİR–NALAN hücresi bulunamadı').not.toBeNull();
    act(() => { (hucre as HTMLButtonElement).click(); });
    const satir = el('detay-sahne-0');
    expect(satir, 'paylaşılan sahne listede yok').not.toBeNull();
    act(() => { (satir as HTMLButtonElement).click(); });
    expect(useUiStore.getState().scriptCursor).toBe(bloklar[0].id);
  });

  it('hiç karşılaşmayan çiftte açık cümle var, boş liste değil', () => {
    projeKur(SENARYO());
    ciz();
    /* HAKKI kimseyle sahne paylaşmıyor. */
    const hucre = yer!.querySelector('[data-testid^="matris-HAKKI-"]')
      ?? yer!.querySelector('[data-testid$="-HAKKI"]');
    expect(hucre).not.toBeNull();
    act(() => { (hucre as HTMLButtonElement).click(); });
    expect(el('analiz-detay')!.textContent).toMatch(/hiç aynı sahnede konuşmuyor/);
  });
});

describe('detay BÜTÜN ölçülerden açılıyor', () => {
  const ac = (testid: string) => {
    const d = yer!.querySelector(`[data-testid="${testid}"]`) as HTMLElement | null;
    expect(d, `${testid} bulunamadı`).not.toBeNull();
    act(() => { d!.click(); });
    return el('analiz-detay');
  };

  it('mekân halkasından', () => {
    projeKur(SENARYO());
    ciz();
    const d = yer!.querySelector('[data-testid^="halka-sec-"]') as HTMLElement;
    expect(d, 'halka efsanesi tıklanabilir değil').not.toBeNull();
    act(() => { d.click(); });
    expect(el('analiz-detay')).not.toBeNull();
  });

  it('karakter nokta dizisinden', () => {
    projeKur(SENARYO());
    ciz();
    const d = yer!.querySelector('[data-testid^="nokta-sec-"]') as HTMLElement;
    expect(d, 'nokta dizisi satırı tıklanabilir değil').not.toBeNull();
    act(() => { d.click(); });
    const detay = el('analiz-detay');
    expect(detay).not.toBeNull();
    /* Karakter seçiminde liste o karakterin konuştuğu sahneleri taşır. */
    expect(detay!.textContent).toMatch(/konuştuğu sahneler/);
  });

  it('seçim değiştirilebiliyor — detay kapanmadan', () => {
    projeKur(SENARYO());
    ciz();
    act(() => { (yer!.querySelector('[data-testid^="matris-"]') as HTMLElement).click(); });
    const ilk = el('analiz-detay')!.textContent;
    act(() => { (yer!.querySelector('[data-testid^="nokta-sec-"]') as HTMLElement).click(); });
    expect(el('analiz-detay')!.textContent).not.toBe(ilk);
  });

  it('boş seçimde açık cümle var, boş liste değil', () => {
    sayac = 0;
    /* Etiketlenmemiş senaryoda "geriye dönüş" katmanı boştur. */
    projeKur(SENARYO());
    ciz();
    const dilimler = [...yer!.querySelectorAll('[data-testid^="halka-sec-"]')] as HTMLElement[];
    /* Dil ortama göre değişebilir; iki karşılığı da kabul ediyoruz. */
    const geri = dilimler.find((d) => /flashback|geriye dönüş/i.test(d.textContent ?? ''));
    expect(geri, 'katman efsanesinde geriye dönüş satırı yok').not.toBeNull();
    act(() => { geri!.click(); });
    expect(el('analiz-detay')!.textContent).toMatch(/hiç sahne yok|No scenes/i);
  });
});

describe('detay DOĞRU sahneleri listeliyor', () => {
  /* SENARYO(): sc1 = MUTFAK/GECE (DEMİR+NALAN), sc2 = İSKELE/GÜNDÜZ (NALAN),
     sc3 = İSKELE/GECE (HAKKI). Testler listenin İÇERİĞİNİ doğruluyor —
     "detay açıldı" demek yetmez, yanlış sahneleri listeleyen bir detay
     açılmış olur ve sessizce yanlış olur. */
  const sahneVar = (sira: number) => el(`detay-sahne-${sira}`) !== null;

  it('karakter seçiminde YALNIZ o karakterin sahneleri', () => {
    projeKur(SENARYO());
    ciz();
    const hakki = yer!.querySelector('[data-testid="nokta-sec-HAKKI"]') as HTMLElement;
    expect(hakki, 'HAKKI satırı bulunamadı').not.toBeNull();
    act(() => { hakki.click(); });
    expect(sahneVar(2), 'HAKKI 3. sahnede konuşuyor').toBe(true);
    expect(sahneVar(0), 'HAKKI 1. sahnede yok').toBe(false);
    expect(sahneVar(1), 'HAKKI 2. sahnede yok').toBe(false);
  });

  it('mekân seçiminde YALNIZ o mekânın sahneleri', () => {
    projeKur(SENARYO());
    ciz();
    const iskele = yer!.querySelector('[data-testid="halka-sec-İSKELE"]') as HTMLElement;
    expect(iskele, 'İSKELE satırı bulunamadı').not.toBeNull();
    act(() => { iskele.click(); });
    expect(sahneVar(1), 'İSKELE 2. sahne').toBe(true);
    expect(sahneVar(2), 'İSKELE 3. sahne').toBe(true);
    expect(sahneVar(0), 'MUTFAK sahnesi İSKELE listesinde olmamalı').toBe(false);
  });

  it('gün/gece seçiminde YALNIZ o saatteki sahneler', () => {
    /* Seçim ANAHTAR taşımalı ('gece'), görüntü metni değil: metin
       geçirilirse hiçbir sahneyle eşleşmez ve liste sessizce boş kalır.
       Bu hata bir kez yapıldı ve testler yakalamamıştı. */
    projeKur(SENARYO());
    ciz();
    const dilimler = [...yer!.querySelectorAll('[data-testid^="halka-sec-"]')] as HTMLElement[];
    const gece = dilimler.find((d) => /^(gece|night)/i.test(d.textContent ?? ''));
    expect(gece, 'gece dilimi bulunamadı').not.toBeNull();
    act(() => { gece!.click(); });
    expect(sahneVar(0), 'MUTFAK GECE').toBe(true);
    expect(sahneVar(2), 'İSKELE GECE').toBe(true);
    expect(sahneVar(1), 'İSKELE GÜNDÜZ gece listesinde olmamalı').toBe(false);
  });

  it('çift seçiminde YALNIZ paylaşılan sahne', () => {
    projeKur(SENARYO());
    ciz();
    const h = yer!.querySelector('[data-testid="matris-NALAN-DEMİR"]')
      ?? yer!.querySelector('[data-testid="matris-DEMİR-NALAN"]');
    act(() => { (h as HTMLElement).click(); });
    expect(sahneVar(0), 'DEMİR–NALAN 1. sahneyi paylaşıyor').toBe(true);
    expect(sahneVar(1), 'NALAN yalnız, paylaşım yok').toBe(false);
  });
});

describe('tek değerli halkalar — %100 dilim', () => {
  /**
   * SVG yayı başlangıç ve bitiş noktası çakıştığında HİÇBİR ŞEY çizmez;
   * 360°'lik bir dilim tam olarak budur. Tek mekânlı, tek karakterli bir
   * senaryoda bütün halkalar boş çıkıyordu — ve bu EN SIK hâl, çünkü yeni
   * bir senaryoda her dağılım tek değerlidir. Kullanıcı gerçek panoda
   * gördü (2026-08-30).
   *
   * "Hatasız render oldu" bunu yakalamıyordu: boş bir `<path d="">` de
   * hatasız render olur. Ölçüt ÇİZİM YOLUNUN KENDİSİ.
   */
  it('tam çember gerçek bir yay çiziyor', () => {
    sayac = 0;
    projeKur([
      b('scene', 'İÇ. ATÖLYE — GECE', 'sc1'),
      b('action', 'Torna tezgâhı döner.', 'sc1'),
      b('character', 'DEMİR', 'sc1'),
      b('dialogue', 'Bu iş burada bitmez.', 'sc1'),
    ]);
    ciz();

    const yollar = [...yer!.querySelectorAll('svg path')]
      .map((p) => p.getAttribute('d') ?? '')
      .filter((d) => d.length > 10);
    expect(yollar.length, 'hiç dolu yay yok — halkalar boş çiziliyor').toBeGreaterThan(0);

    /* Tam çember İKİ yaydan kuruluyor (dört `A` komutu: dış+iç, iki
       yarım). Tek yayla çizmeye çalışan eski hâl hiçbir şey çizmiyordu. */
    const tam = yollar.filter((d) => (d.match(/A/g) ?? []).length >= 4);
    expect(tam.length, 'tam çember iki yaya bölünmemiş').toBeGreaterThan(0);
  });

  it('tek sahnede ritim çubuğu şeridi kaplamıyor', () => {
    /* Tek sahnede `flex-1` çubuğu bütün şeride yayıyor ve grafik dev bir
       mavi duvara dönüyordu. Üst sınır YALNIZ az veride devreye giriyor;
       çok sahnede çubuk zaten daha dar. */
    sayac = 0;
    projeKur([
      b('scene', 'İÇ. ATÖLYE — GECE', 'sc1'),
      b('action', 'Torna tezgâhı döner.', 'sc1'),
    ]);
    ciz();
    const cubuklar = [...yer!.querySelectorAll('[data-testid^="analiz-sahne-"]')];
    expect(cubuklar.length).toBe(1);
    expect((cubuklar[0] as HTMLElement).style.maxWidth,
      'çubuğa genişlik sınırı konmamış').toBeTruthy();
  });
});
