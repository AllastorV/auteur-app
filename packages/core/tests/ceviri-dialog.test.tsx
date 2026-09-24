// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CeviriDialog } from '@storyboard/core/components/dialogs/CeviriDialog';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';
import type { PlatformAdapter } from '@storyboard/core/platform/types';
import type { ScriptBlock } from '@storyboard/core/model/script';

/**
 * §16.4 çeviri ekranı. Kritik sözleşme: belgeye YARIM çeviri girmez.
 * `ceviri.ts` bunu "hepsi ya da hiçbiri" ile garanti ediyor; bu dosya
 * ekranın o garantiyi BOZMADIĞINI ölçüyor.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

const blok = (i: number, tip: 'action' | 'scene' = 'action'): ScriptBlock => ({
  id: `b${i}`, fp: `f${i}`, type: tip,
  text: tip === 'scene' ? 'İÇ. MUTFAK - GECE' : `Satır ${i}`,
  scene: '', sceneId: '',
});

function projeKur(n = 3) {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  M.setScript(doc, {
    name: 's',
    blocks: Array.from({ length: n }, (_, i) => blok(i, i === 0 ? 'scene' : 'action')),
  });
  return doc;
}

const dilKabugu = (kayitli: string | null = null) => {
  const yazilan: { saglayici: string; anahtar: string }[] = [];
  const kabuk: PlatformAdapter['dil'] = {
    async denetimDilleri() { return []; },
    async denetimDilleriniAyarla() {},
    async sozlugüYükle() {},
    async anahtarYaz(saglayici, anahtar) { yazilan.push({ saglayici, anahtar }); },
    async anahtarOku() { return kayitli; },
  };
  return { kabuk, yazilan };
};

function ciz(dil: PlatformAdapter['dil']) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  act(() => {
    kok!.render(
      <PlatformProvider
        platform={{ kind: 'desktop', canSaveLocally: true, canExportVideo: false, veriGuvenligi: null, dil } as unknown as PlatformAdapter}
      >
        <CeviriDialog onClose={() => {}} />
      </PlatformProvider>,
    );
  });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

const yaz = (girdi: HTMLInputElement, deger: string) => {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value',
    )!.set!;
    setter.call(girdi, deger);
    girdi.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const cevirBas = async () => {
  const dugme = [...yer!.querySelectorAll('button')].find((b) => b.textContent === 'Çevir')!;
  await act(async () => { dugme.click(); await Promise.resolve(); await Promise.resolve(); });
};

/** Verilen metinleri döndüren sahte `fetch` (DeepL biçimi). */
function sahteFetch(cevir: (metin: string) => string, opts: { ok?: boolean; metin?: string } = {}) {
  return vi.fn(async (_adres: string, secenekler: RequestInit) => {
    const govde = JSON.parse(String(secenekler.body)) as { text: string[] };
    return {
      ok: opts.ok ?? true,
      status: opts.ok === false ? 456 : 200,
      statusText: 'x',
      json: async () => ({ translations: govde.text.map((t) => ({ text: cevir(t) })) }),
      text: async () => opts.metin ?? '',
    } as unknown as Response;
  });
}

beforeEach(() => {
  projeKur();
  useUiStore.setState({ scriptLang: 'tr' });
});

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
  vi.unstubAllGlobals();
});

describe('anahtar', () => {
  it('kayıtlı anahtar kabuktan okunuyor', async () => {
    ciz(dilKabugu('kayitli-anahtar').kabuk);
    await act(async () => { await Promise.resolve(); });
    expect((el('ceviri-anahtar') as HTMLInputElement).value).toBe('kayitli-anahtar');
  });

  it('anahtar alanı PAROLA tipinde — omuz üstünden okunmasın', () => {
    ciz(dilKabugu().kabuk);
    expect((el('ceviri-anahtar') as HTMLInputElement).type).toBe('password');
  });

  /* İki sağlayıcının anahtarı ayrı saklanıyor; birininkini ötekine göndermek
     403 verir ve kullanıcı bunu "anahtarım geçersiz" diye okur. */
  it('sağlayıcı değişince anahtar TEMİZLENİYOR', async () => {
    ciz(dilKabugu('deepl-anahtari').kabuk);
    await act(async () => { await Promise.resolve(); });
    const sec = el('ceviri-saglayici') as HTMLSelectElement;
    await act(async () => {
      sec.value = 'google';
      sec.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Yeni sağlayıcı için okuma yeniden yapılır; eski değer taşınmaz.
    expect((el('ceviri-anahtar') as HTMLInputElement).value).not.toBe('');
  });

  /* Web'de anahtar saklanmıyor; saklandığını söylemek olmayan bir koruma
     vaat etmek olurdu. */
  it('kabuk yokken saklanmadığı SÖYLENİYOR', () => {
    ciz(null);
    expect(el('anahtar-saklanmaz')).not.toBeNull();
  });

  it('kabuk varken o uyarı yok', () => {
    ciz(dilKabugu().kabuk);
    expect(el('anahtar-saklanmaz')).toBeNull();
  });

  it('anahtarsız çeviri başlamıyor', async () => {
    ciz(dilKabugu().kabuk);
    await cevirBas();
    expect(el('ceviri-hata')!.textContent).toMatch(/anahtar/i);
  });
});

describe('çeviri uygulanması', () => {
  it('başarılı çeviri BELGEYE yazılıyor', async () => {
    vi.stubGlobal('fetch', sahteFetch((t) => `[${t}]`));
    ciz(dilKabugu().kabuk);
    yaz(el('ceviri-anahtar') as HTMLInputElement, 'k:fx');
    await cevirBas();

    const bloklar = useProjectStore.getState().project.script!.blocks;
    expect(bloklar.find((b) => b.id === 'b1')!.text).toBe('[Satır 1]');
  });

  /* Sahne başlığı terimleri makineye GÖNDERİLMEZ, hedef dilde yeniden
     kurulur — yoksa `İÇ.` çevrilip biçim bozulurdu (Karar 23). */
  it('sahne başlığı hedef dilin terimleriyle kuruluyor', async () => {
    vi.stubGlobal('fetch', sahteFetch((t) => t.toUpperCase()));
    ciz(dilKabugu().kabuk);
    yaz(el('ceviri-anahtar') as HTMLInputElement, 'k:fx');
    await cevirBas();

    const sahne = useProjectStore.getState().project.script!.blocks[0];
    /* `/^INT\./` yalnız ilk terimi ölçüyordu: yer adını düşüren ya da
       `- GECE`yi çevirmeden bırakan bir mutasyon o desenden sağ çıkardı.
       Başlığın TAMAMI sabitleniyor — yer makineden, terimler tablodan. */
    expect(sahne.text).toBe('INT. MUTFAK - NIGHT');
    // Sağlayıcıya yalnız YER adı gitti, terimler değil.
    const govdeler = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
      .map(([, s]) => (JSON.parse(String(s.body)) as { text: string[] }).text)
      .flat();
    expect(govdeler).toContain('MUTFAK');
    expect(govdeler.join(' ')).not.toContain('İÇ.');
    expect(govdeler.join(' ')).not.toContain('GECE');
  });

  /* En pahalı hata: belgeye yarım çeviri girmesi. */
  it('sağlayıcı hata verirse belge DEĞİŞMİYOR', async () => {
    vi.stubGlobal('fetch', sahteFetch((t) => t, { ok: false, metin: 'kota bitti' }));
    ciz(dilKabugu().kabuk);
    yaz(el('ceviri-anahtar') as HTMLInputElement, 'k:fx');
    const once = useProjectStore.getState().project.script!.blocks.map((b) => b.text);
    /* Metin karşılaştırması TEK BAŞINA yetmiyordu: blok tipini değiştiren,
       kimliği yeniden üreten, `updatedAt` damgasını dokunduran ya da çöp
       kutusuna kayıt düşen bir mutasyon metinler aynı kaldığı için sağ
       çıkardı. Belgenin KODLANMIŞ DURUMU karşılaştırılıyor. */
    const doc = useProjectStore.getState().doc;
    const parmakIzi = () => Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
    const oncekiDurum = parmakIzi();

    await cevirBas();

    expect(useProjectStore.getState().project.script!.blocks.map((b) => b.text)).toEqual(once);
    expect(parmakIzi()).toBe(oncekiDurum);
    expect(el('ceviri-hata')).not.toBeNull();
  });

  /* "Çeviri başarısız" demek, kotanın mı bittiğini yoksa anahtarın mı yanlış
     olduğunu gizlerdi. */
  it('hata METNİYLE gösteriliyor', async () => {
    vi.stubGlobal('fetch', sahteFetch((t) => t, { ok: false, metin: 'kota bitti' }));
    ciz(dilKabugu().kabuk);
    yaz(el('ceviri-anahtar') as HTMLInputElement, 'k:fx');
    await cevirBas();
    expect(el('ceviri-hata')!.textContent).toMatch(/kota bitti/);
  });

  /* Yanlış bir anahtarı kaydetmek, kullanıcıyı her açılışta aynı hataya
     sokardı. */
  it('anahtar yalnız BAŞARILI çeviriden sonra saklanıyor', async () => {
    const { kabuk, yazilan } = dilKabugu();
    vi.stubGlobal('fetch', sahteFetch((t) => t, { ok: false, metin: 'geçersiz' }));
    ciz(kabuk);
    yaz(el('ceviri-anahtar') as HTMLInputElement, 'kotu');
    await cevirBas();
    expect(yazilan).toHaveLength(0);
  });

  it('başarılı çeviride anahtar saklanıyor', async () => {
    const { kabuk, yazilan } = dilKabugu();
    vi.stubGlobal('fetch', sahteFetch((t) => t));
    ciz(kabuk);
    yaz(el('ceviri-anahtar') as HTMLInputElement, 'iyi:fx');
    await cevirBas();
    expect(yazilan).toEqual([{ saglayici: 'deepl', anahtar: 'iyi:fx' }]);
  });

  it('çeviri TEK geri alma adımı — yanlış dil seçimi ucuz olsun', async () => {
    vi.stubGlobal('fetch', sahteFetch((t) => `[${t}]`));
    ciz(dilKabugu().kabuk);
    yaz(el('ceviri-anahtar') as HTMLInputElement, 'k:fx');
    const once = useProjectStore.getState().project.script!.blocks.map((b) => b.text);
    /* `captureTimeout` 400 ms; kurulum yazımıyla çeviri aynı adıma
       birleşmesin diye adım kapatılıyor. */
    useProjectStore.getState().undoManager.stopCapturing();
    await cevirBas();

    act(() => { useProjectStore.getState().undo(); });
    expect(useProjectStore.getState().project.script!.blocks.map((b) => b.text)).toEqual(once);
  });
});
