// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { useDilKabugu } from '@storyboard/core/hooks/useDilKabugu';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { useProjectStore } from '@storyboard/core/store/project';
import { useUiStore } from '@storyboard/core/store/ui';
import { loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import * as M from '@storyboard/core/doc/mutations';
import type { PlatformAdapter } from '@storyboard/core/platform/types';

/**
 * Sözlük belgede, denetleyici kabukta. İkisi bağlanmazsa kullanıcı kelimeyi
 * ekler, listede görür ve kırmızı altçizginin sürmesine şaşırır.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

function kabukKur(diller: string[] = ['tr', 'en-US']) {
  const yuklenen: string[][] = [];
  const ayarlanan: string[][] = [];
  const kabuk: PlatformAdapter['dil'] = {
    async denetimDilleri() { return diller; },
    async denetimDilleriniAyarla(d) { ayarlanan.push([...d]); },
    async sozlugüYükle(k) { yuklenen.push([...k]); },
    async anahtarYaz() {},
    async anahtarOku() { return null; },
  };
  return { kabuk, yuklenen, ayarlanan };
}

function Sonda() { useDilKabugu(); return null; }

async function ciz(dil: PlatformAdapter['dil']) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  await act(async () => {
    kok!.render(
      <PlatformProvider
        platform={{ kind: 'desktop', canSaveLocally: true, canExportVideo: false, veriGuvenligi: null, dil } as unknown as PlatformAdapter}
      >
        <Sonda />
      </PlatformProvider>,
    );
    await Promise.resolve();
  });
}

function projeKur() {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [createPanel()] }), 'load');
  useProjectStore.getState().attachDoc(doc, 'owner');
  return doc;
}

beforeEach(() => { useUiStore.setState({ scriptLang: 'tr' }); });

afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

describe('sözlük kabuğa taşınıyor', () => {
  it('mevcut kelimeler açılışta yükleniyor', async () => {
    const doc = projeKur();
    M.sozlugeEkle(doc, 'Ayşe');
    M.sozlugeEkle(doc, 'Kenji');
    const { kabuk, yuklenen } = kabukKur();
    await ciz(kabuk);
    expect(yuklenen.at(-1)!.sort()).toEqual(['Ayşe', 'Kenji']);
  });

  it('sonradan eklenen kelime de yükleniyor', async () => {
    const doc = projeKur();
    const { kabuk, yuklenen } = kabukKur();
    await ciz(kabuk);
    await act(async () => { M.sozlugeEkle(doc, 'Şişli'); await Promise.resolve(); });
    expect(yuklenen.at(-1)).toContain('Şişli');
  });

  it('boş sözlükte gereksiz çağrı yapılmıyor', async () => {
    projeKur();
    const { kabuk, yuklenen } = kabukKur();
    await ciz(kabuk);
    expect(yuklenen).toHaveLength(0);
  });

  it('kabuk yoksa sessiz — web çökmüyor', async () => {
    const doc = projeKur();
    M.sozlugeEkle(doc, 'Ayşe');
    await expect(ciz(null)).resolves.toBeUndefined();
  });
});

describe('denetim dili kabuktan SORULUYOR', () => {
  /* Sabit bir liste, `setSpellCheckerLanguages`'in fırlatacağı bir dili
     kullanıcıya seçtirmek olurdu. */
  it('kabuğun desteklediği eşleşen dil ayarlanıyor', async () => {
    projeKur();
    const { kabuk, ayarlanan } = kabukKur(['tr', 'en-US', 'de']);
    await ciz(kabuk);
    expect(ayarlanan.at(-1)).toEqual(['tr']);
  });

  it('bölge kodlu varyant da eşleşiyor', async () => {
    projeKur();
    useUiStore.setState({ scriptLang: 'en' });
    const { kabuk, ayarlanan } = kabukKur(['tr', 'en-US', 'en-GB']);
    await ciz(kabuk);
    expect(ayarlanan.at(-1)).toEqual(['en-US', 'en-GB']);
  });

  /* Desteklenmeyen dil GÖNDERİLMİYOR: `setSpellCheckerLanguages` fırlatır ve
     kullanıcı hiç denetim alamaz duruma düşerdi. */
  it('kabuk o dili desteklemiyorsa hiç ayarlanmıyor', async () => {
    projeKur();
    useUiStore.setState({ scriptLang: 'en' });
    const { kabuk, ayarlanan } = kabukKur(['tr']);
    await ciz(kabuk);
    expect(ayarlanan).toHaveLength(0);
  });

  /**
   * HIZLI DİL DEĞİŞİMİ — bayat zincir SON SÖZÜ söylememeli.
   *
   * `denetimDilleri()` yavaş bir IPC çağrısı. Kullanıcı tr → en → de diye
   * hızlıca geçerse üç zincir birden uçuşta olur. Bayat olanlar `iptal`
   * bayrağına takılıp dönmezse denetleyici, kullanıcının ARTIK yazmadığı
   * bir dile ayarlanmış kalır ve her kelime kırmızı görünür.
   *
   * Çözümlemeler BİLEREK ters sırada yapılıyor (önce sonuncu, sonra ilki):
   * "sonuncu çağrı kazanır" varsayımı yeterli olsaydı bu test onu yakalardı.
   */
  it('hızlı tr→en geçişinde BAYAT zincir kabuğu ele geçirmiyor', async () => {
    projeKur();
    useUiStore.setState({ scriptLang: 'tr' });

    const ayarlanan: string[][] = [];
    const bekleyenler: ((d: string[]) => void)[] = [];
    const kabuk: PlatformAdapter['dil'] = {
      denetimDilleri: () => new Promise<string[]>((coz) => bekleyenler.push(coz)),
      async denetimDilleriniAyarla(d) { ayarlanan.push([...d]); },
      async sozlugüYükle() {},
      async anahtarYaz() {},
      async anahtarOku() { return null; },
    };

    await ciz(kabuk);
    expect(bekleyenler).toHaveLength(1); // tr zinciri uçuşta, henüz yanıt yok

    // Kullanıcı İngilizceye geçiyor: ikinci zincir açılıyor.
    await act(async () => {
      useUiStore.setState({ scriptLang: 'en' });
      await Promise.resolve();
    });
    expect(bekleyenler).toHaveLength(2);

    // ÖNCE yeni (en) zinciri, SONRA bayat (tr) zinciri çözülüyor.
    await act(async () => {
      bekleyenler[1](['tr', 'en-US']);
      bekleyenler[0](['tr', 'en-US']);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Bayat zincir `iptal` bayrağına takıldı: kabuğa YALNIZ İngilizce gitti.
    expect(ayarlanan).toEqual([['en-US']]);
  });
});
