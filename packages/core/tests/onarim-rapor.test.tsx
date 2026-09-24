// @vitest-environment jsdom
import * as Y from 'yjs';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { docToProject, readScript } from '@storyboard/core/doc/schema';
import { setScript } from '@storyboard/core/doc/mutations';
import {
  onarimAnahtari,
  onarimMesaji,
  onarimOzeti,
} from '@storyboard/core/editor/onarim-rapor';
import { OnarimSeridi } from '@storyboard/core/components/OnarimSeridi';
import type { Onarim } from '@storyboard/core/editor/sema';
import type { ScriptBlock } from '@storyboard/core/model/script';

const blok = (id: string, text: string): ScriptBlock => ({
  id, fp: '', type: 'action', text, scene: '', sceneId: '',
});

/** İki yazarın eşzamanlı içe aktarımı — gerçekten yinelenen kimlik üretir. */
function bozukBelge(): Y.Doc {
  const a = new Y.Doc();
  setScript(a, { name: 'X', blocks: [blok('sb_1', 'İlk.'), blok('sb_2', 'İkinci.')] });
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  setScript(a, { name: 'A', blocks: [blok('sb_1', 'A yazdı.')] });
  setScript(b, { name: 'B', blocks: [blok('sb_1', 'B yazdı.')] });
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  return a;
}

const o = (indeks: number, sebep: Onarim['sebep'], atanan: string): Onarim => ({
  indeks, bulunan: 'sb_1', atanan, sebep,
});

describe('onarım özeti ve mesajı', () => {
  it('sağlam belgede mesaj BOŞ — uyarı yoktan var edilmez', () => {
    expect(onarimMesaji([])).toBe('');
    expect(onarimOzeti([])).toEqual({ toplam: 0, kimliksiz: 0, yinelenen: 0 });
  });

  it('sebepler ayrı ayrı sayılıyor', () => {
    const ozet = onarimOzeti([
      o(0, 'yinelenen', 'sb_1__2'),
      o(1, 'kimliksiz', 'sb_onarilmis_1__2'),
      o(2, 'yinelenen', 'sb_1__3'),
    ]);
    expect(ozet).toEqual({ toplam: 3, kimliksiz: 1, yinelenen: 2 });
  });

  /* Mesaj üç şeyi söylemek zorunda: ne olduğu, neyin KAYBOLMADIĞI, ne
     yapılacağı. "Bir sorun oluştu" demek kullanıcıyı metninden şüphe
     ettirirdi. */
  it('mesaj sayıyı, metnin korunduğunu ve yapılacak işi söylüyor', () => {
    const metin = onarimMesaji([o(0, 'yinelenen', 'sb_1__2'), o(3, 'kimliksiz', 'x__2')]);
    expect(metin).toContain('2 blok');
    expect(metin).toContain('1 yinelenen');
    expect(metin).toContain('1 eksik');
    expect(metin).toContain('Metin kaybı yok');
    expect(metin).toContain('Kaydettiğinde');
  });

  it('tek sebep varsa öteki sayı mesaja girmiyor', () => {
    const metin = onarimMesaji([o(0, 'yinelenen', 'sb_1__2')]);
    expect(metin).toContain('1 yinelenen');
    expect(metin).not.toContain('eksik');
  });
});

describe('kapatma anahtarı İÇERİĞE bağlı, referansa değil', () => {
  /* Onarım OKUMA yolunda yapılıyor ve belgeye geri yazılmıyor: aynı bozuk
     belge her okunduğunda YENİ bir dizi nesnesi üretir. Referansa bakan bir
     kapatma, şeridi her tuş vuruşunda geri getirirdi. */
  it('aynı bozukluk = aynı anahtar (dizi yeni nesne olsa da)', () => {
    const bir = [o(0, 'yinelenen', 'sb_1__2')];
    const iki = [o(0, 'yinelenen', 'sb_1__2')];
    expect(bir).not.toBe(iki);
    expect(onarimAnahtari(bir)).toBe(onarimAnahtari(iki));
  });

  /* Kullanıcının bir kez kapattığı uyarı İKİNCİ bir bozukluğu da gizleseydi
     §15.4'ün sessiz başarısızlık yasağı çiğnenirdi. */
  it('YENİ bir bozukluk = yeni anahtar', () => {
    const once = [o(0, 'yinelenen', 'sb_1__2')];
    const sonra = [o(0, 'yinelenen', 'sb_1__2'), o(5, 'kimliksiz', 'y__2')];
    expect(onarimAnahtari(sonra)).not.toBe(onarimAnahtari(once));
  });

  it('farklı indeks farklı anahtar verir', () => {
    expect(onarimAnahtari([o(0, 'yinelenen', 'sb_1__2')])).not.toBe(
      onarimAnahtari([o(1, 'yinelenen', 'sb_1__2')]),
    );
  });
});

describe('"Kaydettiğinde kalıcı olur" — ÖLÇÜLDÜ, varsayılmadı', () => {
  it('kayıt yolu onarılmış kimlikleri taşıyor, yeniden açılan belge SAĞLAM', () => {
    const bozuk = bozukBelge();
    // ÖN KOŞUL: belge gerçekten bozuk olmalı, yoksa test boşa döner.
    expect(readScript(bozuk).onarimlar.length).toBeGreaterThan(0);

    // Kayıt yolu: docToProject → scriptDocu → readScript (onarılmış bloklar).
    const kaydedilen = docToProject(bozuk).script;
    const idler = kaydedilen.blocks.map((b) => b.id);
    expect(new Set(idler).size).toBe(idler.length);

    // Yeniden açma.
    const yeni = new Y.Doc();
    setScript(yeni, kaydedilen);
    expect(readScript(yeni).onarimlar).toEqual([]);
  });
});

describe('şerit — sessizce açılmama kuralının arayüz yarısı', () => {
  let kok: Root | null = null;
  let yer: HTMLDivElement | null = null;
  afterEach(() => {
    act(() => { kok?.unmount(); });
    yer?.remove();
    kok = null; yer = null;
  });

  function ciz(onarimlar: readonly Onarim[]) {
    yer = document.createElement('div');
    document.body.appendChild(yer);
    kok = createRoot(yer);
    const kap = yer;
    act(() => { kok!.render(<OnarimSeridi onarimlar={onarimlar} />); });
    return {
      kap,
      tikla: (secici: string) =>
        act(() => { kap.querySelector<HTMLButtonElement>(secici)!.click(); }),
      yenile: (yeni: readonly Onarim[]) =>
        act(() => { kok!.render(<OnarimSeridi onarimlar={yeni} />); }),
    };
  }

  it('sağlam belgede şerit YOK', () => {
    const { kap } = ciz([]);
    expect(kap.querySelector('[data-testid="onarim-seridi"]')).toBeNull();
  });

  it('bozuk belgede şerit VAR ve sayıyı söylüyor', () => {
    const { kap } = ciz([o(0, 'yinelenen', 'sb_1__2')]);
    const serit = kap.querySelector('[data-testid="onarim-seridi"]');
    expect(serit).not.toBeNull();
    expect(serit!.textContent).toContain('1 blok');
  });

  it('kapatılınca gizleniyor', () => {
    const { kap, tikla } = ciz([o(0, 'yinelenen', 'sb_1__2')]);
    tikla('[data-testid="onarim-kapat"]');
    expect(kap.querySelector('[data-testid="onarim-seridi"]')).toBeNull();
  });

  /* Kullanıcının bir kez kapattığı uyarı, SONRADAN çıkan bir bozukluğu da
     gizleseydi §15.4'ün sessiz başarısızlık yasağı arayüzde çiğnenirdi. */
  it('kapatıldıktan sonra YENİ bozukluk şeridi geri getiriyor', () => {
    const ilk = [o(0, 'yinelenen', 'sb_1__2')];
    const { kap, tikla, yenile } = ciz(ilk);
    tikla('[data-testid="onarim-kapat"]');
    expect(kap.querySelector('[data-testid="onarim-seridi"]')).toBeNull();

    yenile([...ilk, o(7, 'kimliksiz', 'sb_onarilmis_7__2')]);
    expect(kap.querySelector('[data-testid="onarim-seridi"]')).not.toBeNull();
    expect(kap.textContent).toContain('2 blok');
  });

  /* Onarım OKUMA yolunda: aynı bozuk belge her okunduğunda YENİ bir dizi
     nesnesi üretiyor. Kapatma referansa baksaydı şerit her tuşta geri
     gelirdi. */
  it('aynı bozukluk yeniden okunduğunda şerit KAPALI kalıyor', () => {
    const { kap, tikla, yenile } = ciz([o(0, 'yinelenen', 'sb_1__2')]);
    tikla('[data-testid="onarim-kapat"]');
    yenile([o(0, 'yinelenen', 'sb_1__2')]); // yeni dizi, aynı içerik
    expect(kap.querySelector('[data-testid="onarim-seridi"]')).toBeNull();
  });

  it('ayrıntı bozuk değeri ve yerine konanı gösteriyor', () => {
    const { kap, tikla } = ciz([o(2, 'yinelenen', 'sb_1__2')]);
    expect(kap.textContent).not.toContain('sb_1__2');
    tikla('button'); // ilk düğme: "Ayrıntı"
    expect(kap.textContent).toContain('sb_1__2');
    expect(kap.textContent).toContain('3. blok');
  });
});
