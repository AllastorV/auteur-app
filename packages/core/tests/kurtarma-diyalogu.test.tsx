// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { RecoveryDialog } from '@storyboard/core/components/dialogs/RecoveryDialog';
import { durumOlc, kurtarmaOzeti, sureMetni } from '@storyboard/core/veri/kurtarma-ozeti';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import * as M from '@storyboard/core/doc/mutations';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import type { OturumKurtarma } from '@storyboard/core/veri/anlik';

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;
afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

function ciz(oge: React.ReactNode) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => { kok!.render(oge); });
}

function proje(): Y.Doc {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  return doc;
}

const senaryo = (doc: Y.Doc, n: number) =>
  M.setScript(doc, {
    name: 's',
    blocks: Array.from({ length: n }, (_, i) => ({
      id: `sb_${i}`, fp: '',
      type: (i % 4 === 0 ? 'scene' : 'action') as 'scene' | 'action',
      text: `Satır ${i} iki kelime`, scene: '', sceneId: '',
    })),
  });

const kurtarma = (doc: Y.Doc, yama: Partial<OturumKurtarma> = {}): OturumKurtarma => ({
  doc,
  uygulanan: 12,
  uygulanamayan: 0,
  cozumlenen: 12,
  durum: 'tam',
  ilkZaman: 1_700_000_000_000,
  sonZaman: 1_700_000_000_000 + 3 * 60_000,
  cipa: 'cipa-1',
  elenen: [],
  ...yama,
});

describe('sureMetni', () => {
  /* Süre sıfır ama İŞ varsa "0 dakika" denmez: kullanıcı o cümleyi okuyup
     "demek ki bir şey yok" der ve yazdığını atar. */
  it('bir dakikadan kısa iş de iş sayılır', () => {
    expect(sureMetni(0, 1)).toBe('bir dakikadan kısa iş');
    expect(sureMetni(30_000, 5)).toBe('bir dakikadan kısa iş');
  });

  it('gerçekten iş yoksa açıkça söyler', () => {
    expect(sureMetni(0, 0)).toBe('kaydedilmemiş iş yok');
  });

  it('dakika ve saat okunur biçimde', () => {
    expect(sureMetni(3 * 60_000, 4)).toBe('3 dakikalık iş');
    expect(sureMetni(95 * 60_000, 4)).toBe('1 saat 35 dakikalık iş');
  });
});

describe('durum ölçüsü', () => {
  it('panel, satır, sahne ve kelime sayar', () => {
    const doc = proje();
    senaryo(doc, 8);
    const olcu = durumOlc(doc);
    expect(olcu.panel).toBe(1);
    expect(olcu.blok).toBe(8);
    expect(olcu.sahne).toBe(2);
    expect(olcu.kelime).toBe(8 * 4);
  });

  it('değişiklik yoksa özet bunu bildirir', () => {
    const a = proje();
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(kurtarmaOzeti(a, b).degisti).toBe(false);
  });

  it('satır sayısı değişince özet farkı yakalar', () => {
    const a = proje();
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    senaryo(b, 5);
    const ozet = kurtarmaOzeti(a, b);
    expect(ozet.degisti).toBe(true);
    expect(ozet.onceki.blok).toBe(0);
    expect(ozet.sonraki.blok).toBe(5);
  });
});

describe('§15.3 — kurtarma penceresi', () => {
  it('süreyi gösterir ve üç çıkışı sunar', () => {
    const doc = proje();
    ciz(<RecoveryDialog kurtarma={kurtarma(doc)} cipaDoc={proje()} onKurtar={() => {}} onYoksay={() => {}} />);
    expect(yer!.querySelector('[data-testid="kurtarma-sure"]')!.textContent).toBe('3 dakikalık iş');
    expect(yer!.textContent).toContain('Kurtar');
    expect(yer!.querySelector('[data-testid="farki-gor"]')).not.toBeNull();
    expect(yer!.querySelector('[data-testid="yoksay"]')).not.toBeNull();
  });

  /* Kararsız kapatmak günlüğü belirsiz bırakır: kullanıcı üç seçenekten
     birini seçmek ZORUNDA. Kapatma düğmesi ya da dış tıklama yok. */
  it('kaçış yolu yok — kapatma düğmesi bulunmaz', () => {
    const doc = proje();
    ciz(<RecoveryDialog kurtarma={kurtarma(doc)} cipaDoc={proje()} onKurtar={() => {}} onYoksay={() => {}} />);
    const dugmeler = [...yer!.querySelectorAll('button')].map((b) => b.textContent);
    expect(dugmeler).toEqual(['Kurtar', 'Farkı gör', 'Yoksay ve yedeği koru']);
    expect(yer!.querySelector('[aria-label="Kapat"]')).toBeNull();
  });

  /* §15.3: fark UYGULANMADAN ÖNCE gösterilir. */
  it('Farkı gör, kurtarma uygulanmadan ölçüleri gösterir', () => {
    const cipaDoc = proje();
    const kurtarilan = new Y.Doc();
    Y.applyUpdate(kurtarilan, Y.encodeStateAsUpdate(cipaDoc));
    senaryo(kurtarilan, 6);

    const kurtarildi = vi.fn();
    ciz(<RecoveryDialog kurtarma={kurtarma(kurtarilan)} cipaDoc={cipaDoc} onKurtar={kurtarildi} onYoksay={() => {}} />);
    expect(yer!.querySelector('[data-testid="kurtarma-ozet"]')).toBeNull();

    act(() => { (yer!.querySelector('[data-testid="farki-gor"]') as HTMLButtonElement).click(); });
    const tablo = yer!.querySelector('[data-testid="kurtarma-ozet"]')!;
    expect(tablo.textContent).toContain('Senaryo satırı');
    // Fark görmek kurtarmayı UYGULAMAZ.
    expect(kurtarildi).not.toHaveBeenCalled();
  });

  it('kırpık günlükte eksiklik açıkça yazılır', () => {
    ciz(<RecoveryDialog kurtarma={kurtarma(proje(), { durum: 'kirpik' })} cipaDoc={proje()} onKurtar={() => {}} onYoksay={() => {}} />);
    expect(yer!.querySelector('[data-testid="kurtarma-eksik"]')!.textContent).toContain('yarım kalmış');
  });

  it('uygulanamayan güncelleme ve elenen yedek bildirilir', () => {
    ciz(
      <RecoveryDialog
        kurtarma={kurtarma(proje(), { uygulanamayan: 3, elenen: [{ id: 'c1', sebep: 'cozumlenemedi' }] })}
        cipaDoc={proje()}
        onKurtar={() => {}}
        onYoksay={() => {}}
      />,
    );
    expect(yer!.querySelector('[data-testid="kurtarma-uygulanamayan"]')!.textContent).toContain('3');
    expect(yer!.querySelector('[data-testid="kurtarma-elenen"]')!.textContent).toContain('1 yedek');
  });

  it('düğmeler geri çağrıları tetikler', () => {
    const kurtar = vi.fn();
    const yoksay = vi.fn();
    ciz(<RecoveryDialog kurtarma={kurtarma(proje())} cipaDoc={proje()} onKurtar={kurtar} onYoksay={yoksay} />);
    act(() => { ([...yer!.querySelectorAll('button')][0] as HTMLButtonElement).click(); });
    act(() => { (yer!.querySelector('[data-testid="yoksay"]') as HTMLButtonElement).click(); });
    expect(kurtar).toHaveBeenCalledTimes(1);
    expect(yoksay).toHaveBeenCalledTimes(1);
  });
});

describe('§15.3 — `degisti` DÖRT ölçüyü de ayrı ayrı görüyor', () => {
  /* `degisti` dört terimin VEYA'sı. Terimler birlikte değiştirilerek
     ölçülürse her biri tek tek SİLİNEBİLİR ve hiçbir test kızarmaz.
     En pahalı kayıp `kelime` terimi: kullanıcı çökmeden önce mevcut
     satırları YENİDEN YAZDIYSA blok, sahne ve panel sayısı aynı kalır;
     terim yoksa özet "değişiklik yok" der ve kullanıcı kurtarmayı
     kendi eliyle atar. */

  /** Aynı sayıda blok, aynı tipler — yalnız METİN farklı. */
  const yenidenYaz = (doc: Y.Doc, n: number) =>
    M.setScript(doc, {
      name: 's',
      blocks: Array.from({ length: n }, (_, i) => ({
        id: `sb_${i}`, fp: '',
        type: (i % 4 === 0 ? 'scene' : 'action') as 'scene' | 'action',
        text: `Bambaska bir cumle ${i} burada uc kelime daha`, scene: '', sceneId: '',
      })),
    });

  it('YALNIZ kelime değişince yakalanıyor', () => {
    const a = proje(); senaryo(a, 8);
    const b = proje(); yenidenYaz(b, 8);
    const o = kurtarmaOzeti(a, b);
    expect(o.onceki.blok).toBe(o.sonraki.blok);
    expect(o.onceki.sahne).toBe(o.sonraki.sahne);
    expect(o.onceki.panel).toBe(o.sonraki.panel);
    expect(o.onceki.kelime).not.toBe(o.sonraki.kelime);
    expect(o.degisti).toBe(true);
  });

  it('YALNIZ panel değişince yakalanıyor', () => {
    const a = proje();
    const b = proje();
    M.addPanel(b);
    const o = kurtarmaOzeti(a, b);
    expect(o.onceki.blok).toBe(o.sonraki.blok);
    expect(o.onceki.kelime).toBe(o.sonraki.kelime);
    expect(o.onceki.panel).not.toBe(o.sonraki.panel);
    expect(o.degisti).toBe(true);
  });

  it('YALNIZ sahne sayısı değişince yakalanıyor', () => {
    // Aynı blok sayısı, aynı kelime sayısı, farklı TİP dağılımı.
    const govde = (tip: 'scene' | 'action') => ({
      name: 's',
      blocks: Array.from({ length: 4 }, (_, i) => ({
        id: `sb_${i}`, fp: '',
        type: (i === 1 ? tip : 'action') as 'scene' | 'action',
        text: 'Ayni metin burada', scene: '', sceneId: '',
      })),
    });
    const a = proje(); M.setScript(a, govde('action'));
    const b = proje(); M.setScript(b, govde('scene'));
    const o = kurtarmaOzeti(a, b);
    expect(o.onceki.blok).toBe(o.sonraki.blok);
    expect(o.onceki.kelime).toBe(o.sonraki.kelime);
    expect(o.onceki.sahne).not.toBe(o.sonraki.sahne);
    expect(o.degisti).toBe(true);
  });

  it('YALNIZ blok sayısı değişince yakalanıyor', () => {
    /* Aynı KELİME sayısı, farklı blok sayısı: kullanıcı bir satırı ikiye
       böldüyse tam olarak bu olur. Ölçülmezse `blok` terimi silinebilir. */
    const blok = (id: string, text: string) => ({
      id, fp: '', type: 'action' as const, text, scene: '', sceneId: '',
    });
    const a = proje();
    M.setScript(a, { name: 's', blocks: [blok('sb_0', 'bir iki'), blok('sb_1', 'uc dort')] });
    const b = proje();
    M.setScript(b, {
      name: 's',
      blocks: [blok('sb_0', 'bir'), blok('sb_1', 'iki'), blok('sb_2', 'uc'), blok('sb_3', 'dort')],
    });
    const o = kurtarmaOzeti(a, b);
    expect(o.onceki.kelime).toBe(o.sonraki.kelime);
    expect(o.onceki.sahne).toBe(o.sonraki.sahne);
    expect(o.onceki.panel).toBe(o.sonraki.panel);
    expect(o.onceki.blok).not.toBe(o.sonraki.blok);
    expect(o.degisti).toBe(true);
  });

  it('hiçbir ölçü değişmediyse `false`', () => {
    const a = proje(); senaryo(a, 5);
    const b = proje(); senaryo(b, 5);
    expect(kurtarmaOzeti(a, b).degisti).toBe(false);
  });
});
