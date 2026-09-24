// @vitest-environment jsdom
import React from 'react';
import * as Y from 'yjs';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pdfYaziTipleri } from '@storyboard/core/disa/yazitipi';
import { fonPaketiKur } from '@storyboard/core/fon/paket';
import { useUiStore } from '@storyboard/core/store/ui';
import { FonPaneli } from '@storyboard/core/components/fon/FonPaneli';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { useProjectStore } from '@storyboard/core/store/project';
import { setScript } from '@storyboard/core/doc/mutations';
import { fonProjesiKur } from '@storyboard/core/fon/kur';
import { createProject } from '@storyboard/core/model/factory';
import { packProject } from '@storyboard/core/model/project-io';
import { fonSablonu } from '@storyboard/core/fon/sablon';
import { senaryoyuCozumle } from '@storyboard/core/model/analiz';
import { yapiIstatistigiCikar } from '@storyboard/core/model/yapi';
import { DOKUMAN_TIPLERI } from '@storyboard/core/model/dokuman-tipi';
import { tipProfili } from '@storyboard/core/format/profil';
import type { PlatformAdapter } from '@storyboard/core/platform/types';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * FON KONTROL LİSTESİ — ekranda gerçekten ne söylüyor.
 *
 * Bu pencerenin bütün değeri "neyin eksik olduğunu söylemek": eksik ek
 * Eurimages'ta başvuruyu doğrudan eliyor. Sessiz kalan bir liste, hiç
 * olmayan bir listeden kötüdür — kullanıcı ona güvenip göndermez.
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
];

const SENARYO_TIPI = DOKUMAN_TIPLERI.senaryo;

function fonProjesi(sablonId: string) {
  const sablon = fonSablonu(sablonId)!;
  return fonProjesiKur({
    sablon,
    girdi: {
      bloklar: SENARYO,
      analiz: senaryoyuCozumle(SENARYO, { dil: 'tr' }),
      yapi: yapiIstatistigiCikar(SENARYO, SENARYO_TIPI, tipProfili(SENARYO_TIPI.id, 'a4', 'tr')),
      tip: SENARYO_TIPI,
      baslikSayfasi: { baslik: 'Bavul' },
      meta: {
        id: 'p1', name: 'Bavul', createdAt: 0, updatedAt: 1_700_000_000_000,
        author: 'Alp Cavas', description: '',
      },
      breakdown: {},
      karakterler: [],
      lokasyonlar: [],
      dil: sablon.dil,
    },
    kimlik: (() => { let n = 0; return () => `fb${n++}`; })(),
  });
}

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

function ciz(sablonId: string | null) {
  const doc = new Y.Doc();
  if (sablonId) {
    const proje = fonProjesi(sablonId);
    setScript(doc, proje.script);
    useProjectStore.getState().attachDoc(doc, 'owner');
    /* Şablon kimliği AYARLARDA yaşıyor; mağazayı gerçek projeyle
       eşitlemek testin ölçtüğü şeyin ta kendisi. */
    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        meta: { ...s.project.meta, dokumanTipi: 'fon-dosyasi', name: 'Bavul' },
        settings: { ...s.project.settings, fonSablonu: sablonId },
      },
    }));
  } else {
    setScript(doc, { name: 'x', blocks: [] });
    useProjectStore.getState().attachDoc(doc, 'owner');
    useProjectStore.setState((s) => ({
      project: {
        ...s.project,
        meta: { ...s.project.meta, dokumanTipi: 'fon-dosyasi' },
        settings: { ...s.project.settings, fonSablonu: undefined },
      },
    }));
  }
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => {
    kok!.render(
      <PlatformProvider platform={SAHTE_PLATFORM}>
        <FonPaneli onClose={() => {}} />
      </PlatformProvider>,
    );
  });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

/** Kaynak senaryonun ikinci sahne EKLENMİŞ hâli — tazelemenin görmesi gereken. */
const SENARYO_SONRA: ScriptBlock[] = [
  ...SENARYO,
  { id: 'b3', fp: '3', type: 'scene', text: 'DIŞ. SOKAK - GÜN', scene: '', sceneId: 'sc2' },
  { id: 'b4', fp: '4', type: 'action', text: 'Yağmur başlar.', scene: '', sceneId: 'sc2' },
];

/**
 * Tazeleme için çizim: belgeye `fonKaynak` yazılıyor ve platform, kayıtlı
 * yoldan GERÇEK bir `.sbp` döndürüyor.
 */
async function cizTazelemeli(okunanBayt: Uint8Array, yol: string | null = 'C:/p/bavul.sbp') {
  const doc = new Y.Doc();
  const proje = fonProjesi('sgm-senaryo');
  setScript(doc, proje.script);
  useProjectStore.getState().attachDoc(doc, 'owner');
  useProjectStore.setState((s) => ({
    project: {
      ...s.project,
      meta: { ...s.project.meta, dokumanTipi: 'fon-dosyasi', name: 'Bavul' },
      settings: {
        ...s.project.settings,
        fonSablonu: 'sgm-senaryo',
        fonKaynak: { projeId: 'p1', ad: 'Bavul', yol, turetildi: 1_700_000_000_000 },
      },
    },
  }));
  const platform = {
    ...SAHTE_PLATFORM,
    async readProjectFile() { return okunanBayt; },
    async openProjectDialog() { return { path: 'C:/p/secilen.sbp', data: okunanBayt }; },
  } as unknown as PlatformAdapter;
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  await act(async () => {
    kok!.render(
      <PlatformProvider platform={platform}>
        <FonPaneli onClose={() => {}} />
      </PlatformProvider>,
    );
  });
  return doc;
}

/** Belgedeki bir bölümün gövde satırları. */
function govde(baslik: string): string[] {
  const bloklar = useProjectStore.getState().project.script.blocks;
  const i = bloklar.findIndex((x) => x.type === 'bolum' && x.text === baslik);
  const cikti: string[] = [];
  for (let j = i + 1; j < bloklar.length && bloklar[j].type !== 'bolum'; j++) {
    cikti.push(bloklar[j].text);
  }
  return cikti;
}

/** Kaynak senaryonun paketlenmiş hâli — gerçek `.sbp` baytları. */
async function kaynakPaketi(bloklar: ScriptBlock[], id = 'p1'): Promise<Uint8Array> {
  const proje = createProject({
    meta: { name: 'Bavul', dokumanTipi: 'senaryo' },
    script: { name: 'Bavul', blocks: bloklar },
  });
  return packProject({ project: { ...proje, meta: { ...proje.meta, id } }, assets: {} });
}

describe('senaryodan tazeleme — ÜRETİM ÇAĞRI YOLU', () => {
  /* Bu testin işi çekirdeği değil DÜĞMEYİ ölçmek: `fon/tazele.ts` kendi
     testinde yeşil olduğu hâlde düğme onu hiç çağırmıyor olabilirdi. Bu
     depoda "yeşil test, ölü kod" hatası üç kez yaşandı. */
  it('düğme kaynağı okuyup türetilen bölümü yeniliyor', async () => {
    await cizTazelemeli(await kaynakPaketi(SENARYO_SONRA));
    expect(govde('Tretman').join(' ')).not.toContain('SOKAK');

    await act(async () => { (el('fon-tazele') as HTMLButtonElement).click(); });
    /* Okuma → açma → türetme zinciri asenkron; sabit tur beklemek yüklü
       koşuda kırılgan. */
    await vi.waitFor(() => expect(govde('Tretman').join(' ')).toContain('SOKAK'));
  });

  /* ELLE YAZILAN EZİLMİYOR — özelliğin tek gerçek riski. */
  it('elle yazılan bölüm tazelemeden etkilenmiyor', async () => {
    await cizTazelemeli(await kaynakPaketi(SENARYO_SONRA));
    expect(govde('Sinopsis')).toEqual([]);
    await act(async () => { (el('fon-tazele') as HTMLButtonElement).click(); });
    await vi.waitFor(() => expect(govde('Tretman').join(' ')).toContain('SOKAK'));
    expect(govde('Sinopsis')).toEqual([]);
  });

  /* KAYNAK SATIRI görünüyor: belge anlık kopya ve kullanıcı hangi
     senaryodan ne zaman türetildiğini görmeden güncelliğini bilemez. */
  it('kaynak ve türetilme tarihi ekranda', async () => {
    await cizTazelemeli(await kaynakPaketi(SENARYO));
    expect(el('fon-kaynak')!.textContent).toContain('Bavul');
    expect(el('fon-kaynak')!.textContent).toContain('elle yazdıkların');
  });

  /* KAYNAK YOKSA DÜĞME DE YOK: gri bir düğme bir kez tıklanır ve "bozuk"
     denir. */
  it('kaynağı olmayan belgede tazele düğmesi çizilmiyor', () => {
    ciz('sgm-senaryo');
    expect(el('fon-tazele')).toBeNull();
    expect(el('fon-kaynak')).toBeNull();
  });
});

describe('fon kontrol listesi', () => {
  /* Kurumun listesi yıllık değişiyor ve yanlış listeyle yapılan başvuru
     eleniyor: şerit HER ZAMAN görünüyor, katlanabilir bir ayrıntı değil. */
  it('şablon şeridi kurumu, sürümü ve kaynağı gösteriyor', () => {
    ciz('eurimages-coprod');
    const serit = el('fon-serit')!;
    expect(serit.textContent).toContain('Eurimages');
    expect(serit.textContent).toContain('2026');
    expect(serit.textContent).toContain('coe.int');
    expect(serit.textContent).toContain('doğrula');
  });

  it('belgeye giren her bölüm listede', () => {
    ciz('sgm-senaryo');
    for (const id of ['sinopsis', 'tretman', 'yazar-gorusu', 'yazar-biyo']) {
      expect(el(`fon-bolum-${id}`), id).not.toBeNull();
    }
  });

  /* Türetilen bölüm kurulumdan DOLU geliyor, elle yazılan BOŞ: rozet
     ikisini ayırmalı, yoksa liste hiçbir şey söylemiyor demektir. */
  it('dolu ve boş bölüm rozetle ayrılıyor', () => {
    ciz('sgm-senaryo');
    expect(el('fon-bolum-tretman')!.textContent).toContain('dolu');
    expect(el('fon-bolum-sinopsis')!.textContent).toContain('boş');
  });

  /* Eurimages sinopsisi için yazılı sınır var: liste ölçüyü ve sınırı
     birlikte gösteriyor, yoksa kullanıcı 3 sayfanın neye göre olduğunu
     bilemez. */
  it('sınırı olan bölümde ölçü ve sınır birlikte', () => {
    ciz('eurimages-coprod');
    expect(el('fon-bolum-synopsis:en')!.textContent).toContain('/ 3');
  });

  /* Auteur'ün üretmediği ekler GİZLENMİYOR: eksik ek başvuruyu düşürüyor
     ve unutulmaları en pahalı hata. */
  it('dışarıdan alınacak ekler ayrı listede', () => {
    ciz('sgm-senaryo');
    expect(el('fon-harici-listesi')!.textContent).toContain('Noter onaylı imza beyannamesi');
  });

  it('paket düğmesi var', () => {
    ciz('sgm-senaryo');
    expect(el('fon-paket')).not.toBeNull();
  });

  /* §15.4: şablon kimliği düşerse liste neyi eksik sayacağını bilemez ve
     bunu SÖYLEMEK zorunda — boş bir liste göstermek sessiz başarısızlık. */
  it('şablonsuz belgede sessiz kalmıyor', () => {
    ciz(null);
    expect(el('fon-sablonsuz')).not.toBeNull();
    expect(el('fon-bolum-listesi')).toBeNull();
  });
});


vi.mock('@storyboard/core/disa/yazitipi', () => ({ pdfYaziTipleri: vi.fn(async () => ({ duz: new Uint8Array([1]) })) }));
vi.mock('@storyboard/core/fon/paket', () => ({ fonPaketiKur: vi.fn(async () => ({ zip: new Uint8Array([1]) })) }));
it('fon paketi ölçümdeki Tinos fontunu gömer', async () => {
  useUiStore.setState({ scriptYazi: 'tinos' });
  ciz('sgm-senaryo');
  await act(async () => { el('fon-paket')!.click(); });
  expect(pdfYaziTipleri).toHaveBeenLastCalledWith('tinos');
  expect(fonPaketiKur).toHaveBeenLastCalledWith(expect.objectContaining({ profil: expect.objectContaining({ yazi: expect.objectContaining({ id: 'tinos' }) }) }));
  useUiStore.setState({ scriptYazi: 'courier-prime' });
});
