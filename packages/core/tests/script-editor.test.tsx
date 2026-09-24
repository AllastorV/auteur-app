// @vitest-environment jsdom
import * as Y from 'yjs';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { act } from 'react';
import { describe, expect, it, afterEach } from 'vitest';
import { blogaGit } from '@storyboard/core/store/mod';
import { komutCalistir } from '@storyboard/core/editor/gorunum';
import { setScript, revizyonYayinla, revizyonIsaretle } from '@storyboard/core/doc/mutations';
import { readScript } from '@storyboard/core/doc/schema';
import { useProjectStore } from '@storyboard/core/store/project';
import { ScriptEditor } from '@storyboard/core/components/script/ScriptEditor';
import { useUiStore } from '@storyboard/core/store/ui';
import { profilOlustur, sayaclar } from '@storyboard/core/format';
import type { ScriptBlock } from '@storyboard/core/model/script';

const SENARYO = {
  name: 'deneme',
  blocks: [{ id: 'sb_1', fp: '', type: 'action', text: 'Ayşe girer.',
    scene: '1', sceneId: 'sc_1' } as ScriptBlock],
};

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

function bagla(rol: 'owner' | 'commenter') {
  const doc = new Y.Doc();
  setScript(doc, SENARYO);
  useProjectStore.getState().attachDoc(doc, rol);
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(<ScriptEditor />); });
  return doc;
}

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
  /* `useUiStore` modül düzeyinde TEKİLDİR: yakınlaştırma bir testten
     diğerine sızıyordu ve sonraki testin başlangıç ölçeği 1 değil 1,1
     oluyordu (ölçüldü). Sızıntı burada kesilir. */
  useUiStore.setState({ scriptZoom: 1, scriptPaper: 'letter', scriptLang: 'tr', scriptSayfaRengi: 'beyaz' });
});

describe('ScriptEditor — bağ ve rol kapısı', () => {
  it('belgedeki metni ekrana getirir', () => {
    bagla('owner');
    expect(yer!.querySelector('[data-testid="senaryo-editor"]')).not.toBeNull();
    expect(yer!.textContent).toContain('Ayşe girer.');
  });

  it('YORUMCU düzenleyemez, SAHİP düzenleyebilir', () => {
    bagla('commenter');
    const pm = yer!.querySelector('.ProseMirror') as HTMLElement;
    /* ÖN KOŞUL: editör gerçekten kuruldu, yoksa "düzenlenemez" boş bir iddia.
       jsdom `contentEditable` ÖZELLİĞİNİ uygulamıyor (undefined döner) —
       ProseMirror'un yazdığı attribute okunur. */
    expect(pm).not.toBeNull();
    expect(pm.getAttribute('contenteditable')).toBe('false');

    act(() => { kok!.unmount(); }); yer!.remove();
    bagla('owner');
    expect((yer!.querySelector('.ProseMirror') as HTMLElement).getAttribute('contenteditable')).toBe('true');
  });

  it('YORUMCU için editör ETKİ ÇALIŞMADAN ÖNCE de kilitli', () => {
    /* `editable` prop'u kurucuda da verilir; ikinci effect'in tazelemesi mount
       sonrası koşar ve arada boyanmış bir kare vardır. `act()` effect'leri
       hemen boşalttığı için o pencere normal testte görünmez — burada
       `flushSync` ile render edilip effect'ler KASITLI olarak boşaltılmadan
       bakılır. İzin yüzeyi; bir kare bile düzenlenebilir kalmamalı. */
    const doc = new Y.Doc();
    setScript(doc, SENARYO);
    useProjectStore.getState().attachDoc(doc, 'commenter');
    yer = document.createElement('div');
    document.body.appendChild(yer);
    kok = createRoot(yer);
    flushSync(() => { kok!.render(<ScriptEditor />); });
    const pm = yer.querySelector('.ProseMirror') as HTMLElement;
    expect(pm).not.toBeNull();
    expect(pm.getAttribute('contenteditable')).toBe('false');
  });

  it('rol SAHİP’ten YORUMCU’ya düşünce görünüm yeniden kurulmadan kilitlenir', () => {
    bagla('owner');
    const pm = yer!.querySelector('.ProseMirror') as HTMLElement;
    act(() => { useProjectStore.getState().setRole('commenter'); });
    // AYNI DOM düğümü — yeniden kurulsaydı imleç ve kaydırma düşerdi.
    expect(yer!.querySelector('.ProseMirror')).toBe(pm);
    expect(pm.getAttribute('contenteditable')).toBe('false');
  });

  it('belge değişince bağ YENİ belgeye kurulur — bayat metin kalmaz', () => {
    bagla('owner');
    const yeni = new Y.Doc();
    setScript(yeni, { name: 'yeni', blocks: [{ ...SENARYO.blocks[0], id: 'sb_9',
      text: 'Bambaşka bir sahne.' }] });
    act(() => { useProjectStore.getState().attachDoc(yeni, 'owner'); });
    expect(yer!.textContent).toContain('Bambaşka bir sahne.');
    expect(yer!.textContent).not.toContain('Ayşe girer.');
    expect(readScript(yeni).blocks[0].id).toBe('sb_9');
  });
});

/* ---------------------- F1b-3: sayfa yüzeyi ---------------------- */

/** Uzunca bir senaryo — birden çok sayfa etsin. */
function uzunSenaryo(n: number) {
  return {
    name: 'uzun',
    blocks: Array.from({ length: n }, (_, i) => ({
      id: `sb_${i}`, fp: '', type: 'action', text: `Satır ${i} biraz metin taşır.`,
      scene: '', sceneId: '',
    })) as ScriptBlock[],
  };
}

function baglaSenaryo(senaryo: { name: string; blocks: ScriptBlock[] }) {
  const doc = new Y.Doc();
  setScript(doc, senaryo);
  useProjectStore.getState().attachDoc(doc, 'owner');
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(<ScriptEditor />); });
  return doc;
}

const kagitStili = () =>
  (yer!.querySelector('.senaryo-yuzey') as HTMLElement).style;

describe('ScriptEditor — ölçülen sayfa geometrisi', () => {
  it('yalnız işaretli sayfanın zemini değişir; editör düğümü yerinde kalır', () => {
    useUiStore.setState({ scriptSayfaRengi: 'siyah' });
    const doc = baglaSenaryo(uzunSenaryo(120));
    const pm = yer!.querySelector('.ProseMirror');
    expect(Number(yer!.querySelector('[data-testid="sayac-sayfa"]')!.textContent!.replace(/\D/g, '')))
      .toBeGreaterThan(1);
    act(() => { revizyonYayinla(doc); revizyonIsaretle(doc, ['sb_0']); });
    const renkli = yer!.querySelectorAll('[data-revizyon-sayfa]');
    expect(renkli).toHaveLength(1);
    expect(renkli[0].getAttribute('data-revizyon-sayfa')).toBe('1');
    expect(yer!.querySelector('.ProseMirror')).toBe(pm);
    expect((yer!.querySelector('.senaryo-yuzey')!.parentElement as HTMLElement)
      .style.getPropertyValue('--mzn-kagit-metin')).toBe('#1c1a17');
    act(() => { revizyonYayinla(doc); });
    expect(yer!.querySelectorAll('[data-revizyon-sayfa]')).toHaveLength(0);
  });
  it('kağıt geometrisi CSS değişkenleri olarak uygulanır', () => {
    baglaSenaryo(SENARYO);
    const stil = kagitStili();
    expect(stil.getPropertyValue('--birim')).toBe('1mm');
    // US Letter genişliği (§6.3) — sabit değil, `kagitGeometrisi`'nden gelir.
    expect(stil.getPropertyValue('--sayfa-genislik')).toContain('215.9');
    expect(stil.getPropertyValue('--sutun')).toBe('60ch');
    // Diyalog girintisi profilden türer, Tailwind sınıfından değil.
    expect(stil.getPropertyValue('--girinti-dialogue')).toBe('10ch');
  });

  it('sayaçlar motorun sayfa sayısını gösterir', () => {
    const doc = baglaSenaryo(uzunSenaryo(120));
    const bloklar = readScript(doc).blocks;
    const beklenen = sayaclar(bloklar, profilOlustur('amerikan', 'letter', 'tr'));
    const oku = (ad: string) =>
      Number(yer!.querySelector(`[data-testid="${ad}"]`)!.textContent!.replace(/\D/g, ''));
    expect(oku('sayac-sayfa')).toBe(beklenen.sayfa);
    expect(oku('sayac-kelime')).toBe(beklenen.kelime);
    expect(beklenen.sayfa).toBeGreaterThan(1);
  });

  it('sayfa sınırı çizgileri sayfa sayısının bir eksiği kadardır', () => {
    const doc = baglaSenaryo(uzunSenaryo(120));
    const sayfa = sayaclar(readScript(doc).blocks, profilOlustur('amerikan', 'letter', 'tr')).sayfa;
    expect(yer!.querySelectorAll('.senaryo-sinir')).toHaveLength(sayfa - 1);
  });

  /* §16.1 BAĞLAYICI: "yakınlaştırma sayfa genişliğini değil ÖLÇEĞİ değiştirir
     — satır sonları ve sayfa numaraları asla kaymaz". Ekrandaki karşılığı:
     yalnız `--birim` değişir, sütun ve sayfa sayısı aynı kalır. */
  it('yakınlaştırma sarma genişliğini ve sayfa sayısını DEĞİŞTİRMEZ', () => {
    baglaSenaryo(uzunSenaryo(120));
    const sayfaOnce = yer!.querySelector('[data-testid="sayac-sayfa"]')!.textContent;
    const sinirOnce = yer!.querySelectorAll('.senaryo-sinir').length;

    act(() => {
      (yer!.querySelector('[aria-label="Yakınlaştır"]') as HTMLButtonElement).click();
    });

    const stil = kagitStili();
    expect(stil.getPropertyValue('--birim')).toBe('1.1mm');
    expect(stil.getPropertyValue('--sutun')).toBe('60ch');
    expect(yer!.querySelector('[data-testid="sayac-sayfa"]')!.textContent).toBe(sayfaOnce);
    expect(yer!.querySelectorAll('.senaryo-sinir')).toHaveLength(sinirOnce);
  });

  it('%100 düğmesi ölçeği sıfırlar', () => {
    baglaSenaryo(SENARYO);
    act(() => {
      (yer!.querySelector('[aria-label="Uzaklaştır"]') as HTMLButtonElement).click();
    });
    expect(useUiStore.getState().scriptZoom).toBeCloseTo(0.9, 5);
    act(() => {
      (yer!.querySelector('[data-testid="olcek"]') as HTMLButtonElement).click();
    });
    expect(useUiStore.getState().scriptZoom).toBe(1);
    expect(kagitStili().getPropertyValue('--birim')).toBe('1mm');
  });
});


describe('QA ayar ve yer imi regresyonları', () => {
  it('numaralandırma yazı yazmadan yenileniyor', () => {
    useUiStore.setState({ numaraAyari: { sahne: 'kapali', diyalog: false } });
    const doc = baglaSenaryo({ name: 'numara', blocks: [{ ...SENARYO.blocks[0], type: 'scene' }] });
    const before = Y.encodeStateAsUpdate(doc);
    expect(yer!.querySelector('[data-no-sag]')).toBeNull();
    act(() => { useUiStore.setState({ numaraAyari: { sahne: 'sag', diyalog: false } }); });
    expect(yer!.querySelector('[data-no-sag]')).not.toBeNull();
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    act(() => { useUiStore.setState({ numaraAyari: { sahne: 'kapali', diyalog: false } }); });
    expect(yer!.querySelector('[data-no-sag]')).toBeNull();
  });
  it('yer imi editör seçimini hedefe taşır ve kaydırır', () => {
    useUiStore.setState({ viewMode: 'senaryo' });
    const doc = baglaSenaryo(uzunSenaryo(120));
    const before = Y.encodeStateAsUpdate(doc);
    let scrolls = 0;
    komutCalistir((_state, _dispatch, view) => {
      view!.setProps({ handleScrollToSelection: () => { scrolls += 1; return true; } });
      return false;
    });
    act(() => { expect(blogaGit('sb_110')).toBe(true); });
    komutCalistir((state) => {
      expect(state.selection.$from.parent.attrs.id).toBe('sb_110');
      return false;
    });
    expect(scrolls).toBeGreaterThan(0);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });
});
