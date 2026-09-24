// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Kitaplik } from '@storyboard/core/components/kitaplik/Kitaplik';
import { PlatformProvider } from '@storyboard/core/platform/context';
import { gununSozu, SOZLER } from '@storyboard/core/components/kitaplik/sozler';
import { aileKapaklari, kapakAilesi } from '@storyboard/core/components/kitaplik/kapaklar';
import type { PlatformAdapter, RecentProject } from '@storyboard/core/platform/types';
import { DOKUMAN_TIPLERI, type DokumanTipiAdi } from '@storyboard/core/model/dokuman-tipi';

/**
 * KİTAPLIK — giriş ekranı.
 *
 * Bu ekran uygulamanın İLK gördüğü yüzü: kullanıcı her açılışta buradan
 * geçiyor. Bir eyleminin sessizce çizilmemesi, programın açılamaması demek.
 */

let kok: Root | null = null;
let yer: HTMLDivElement | null = null;

function kabuk(projeler: RecentProject[]): PlatformAdapter {
  return {
    listRecentProjects: async () => projeler,
    readProjectFile: async () => new Uint8Array(),
    openProjectDialog: async () => null,
  } as unknown as PlatformAdapter;
}

/* Proje listesi ASENKRON geliyor (`listRecentProjects`). `act`'i beklemeden
   ölçmek rafı her seferinde boş bulurdu — yani raf testleri kodun değil,
   zamanlamanın testi olurdu. */
async function ciz(projeler: RecentProject[] = []) {
  yer = document.createElement('div');
  document.body.appendChild(yer);
  kok = createRoot(yer);
  await act(async () => {
    kok!.render(
      <PlatformProvider platform={kabuk(projeler)}>
        <Kitaplik onAcildi={() => {}} />
      </PlatformProvider>,
    );
  });
}

const el = (id: string) => yer!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

const p = (ad: string, yol: string, tip?: string): RecentProject =>
  ({ name: ad, path: yol, openedAt: 1_700_000_000_000, tip });

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => {
  act(() => { kok?.unmount(); });
  yer?.remove();
  kok = null; yer = null;
});

describe('sol sütun', () => {
  it('kimlik ve günün sözü çiziliyor', async () => {
    await ciz();
    expect(el('kitaplik-soz')!.textContent).toContain(gununSozu().metin);
  });

  /* Bu test bir HATA yüzünden yazıldı: eylemler ilk çalıştırmada ekranda
     hiç görünmedi. Programın açılış ekranında "yeni proje" ve "aç"
     yoksa program AÇILAMAZ — sessizce kaybolmalarını yakalayan bir şey
     olmalı. */
  it('iki eylem de VAR — kitaplığa girip çıkılabiliyor', async () => {
    await ciz();
    expect(el('kitaplik-yeni'), 'Yeni proje düğmesi').not.toBeNull();
    expect(el('kitaplik-ac'), 'Dosyadan aç düğmesi').not.toBeNull();
  });

  it('Yeni proje diyaloğu açılıyor', async () => {
    await ciz();
    act(() => { (el('kitaplik-yeni') as HTMLButtonElement).click(); });
    expect(el('yeni-proje-tip'), 'tür seçimi diyalogda').not.toBeNull();
  });
});

/**
 * TÜR SEÇİMİ — açılır liste değil kart ızgarası (2026-09-01).
 *
 * Kartlar `<select>`in yerine geçtiği için "seçim gerçekten değişiyor mu"
 * artık tarayıcının değil BİZİM sorumluluğumuz: `<option>` tıklandığında
 * değeri değiştirmek tarayıcının işiydi, kart tıklandığında değiştirmek
 * bizim kodumuzun. Test bu yüzden seçimin GÖRÜNÜR sonucunu ölçüyor.
 */
describe('yeni proje — tür kartları', () => {
  async function diyalog() {
    await ciz();
    act(() => { (el('kitaplik-yeni') as HTMLButtonElement).click(); });
  }

  /* SIFIRDAN kurulabilen her tip kart olarak DURMALI. Liste elle
     yazılmıyor: kayıt defterine yeni bir tip eklenip pencereye
     bağlanmazsa test kırılsın (bu depoda üç kez yaşanmış hata —
     "yeşil test ölü koda kefil olabilir"). */
  const SIFIRDAN = Object.values(DOKUMAN_TIPLERI).filter((d) => !d.turetilen);

  it('sıfırdan kurulabilen her tip kart olarak çiziliyor', async () => {
    await diyalog();
    for (const d of SIFIRDAN) {
      expect(el(`yeni-proje-tip-${d.id}`), `${d.id} kartı`).not.toBeNull();
    }
  });

  /* TÜRETİLEN tip burada OLMAMALI: fon başvuru dosyası boş bir kabuk
     olarak seçilebilseydi kullanıcı bomboş bir belge alırdı. */
  it('türetilen tip kart olarak ÇİZİLMİYOR', async () => {
    await diyalog();
    expect(el('yeni-proje-tip-fon-dosyasi')).toBeNull();
  });

  it('her kart sayfanın minyatürünü taşıyor', async () => {
    await diyalog();
    for (const d of SIFIRDAN) {
      expect(el(`sayfa-onizleme-${d.id}`), `${d.id} önizlemesi`).not.toBeNull();
    }
  });

  /* Varsayılan senaryo: pencere açıldığında hiçbir şey seçmeden
     `Oluştur`a basan kullanıcı senaryo açmalı — en sık yol budur. */
  it('senaryo seçili başlıyor ve açıklaması görünüyor', async () => {
    await diyalog();
    expect(el('yeni-proje-tip-senaryo')!.getAttribute('aria-pressed')).toBe('true');
    expect(el('yeni-proje-aciklama')!.textContent)
      .toContain(DOKUMAN_TIPLERI.senaryo.aciklama);
  });

  it('kart tıklanınca seçim ve açıklama değişiyor', async () => {
    await diyalog();
    act(() => { (el('yeni-proje-tip-roman') as HTMLButtonElement).click(); });
    expect(el('yeni-proje-tip-roman')!.getAttribute('aria-pressed')).toBe('true');
    expect(el('yeni-proje-tip-senaryo')!.getAttribute('aria-pressed')).toBe('false');
    expect(el('yeni-proje-aciklama')!.textContent)
      .toContain(DOKUMAN_TIPLERI.roman.aciklama);
    expect(el('yeni-proje-aciklama')!.textContent)
      .toContain(DOKUMAN_TIPLERI.roman.yapiAdi);
  });

  /* İki grubun ayrımı ELLE YAZILMIŞ bir taksonomi değil, `sayfaDakika`dan
     türetiliyor. Türetimi kırıp bir tipi yanlış gruba düşürmek, ürünün
     birinci sözleşmesini ("1 sayfa ≈ 1 dakika") yanlış yerde vaat etmek
     olurdu — Fransız yerleşimi tam da bu yüzden süre ölçmeyen grupta. */
  it('gruplar sayfaDakika ekseninden türüyor', async () => {
    await diyalog();
    const kap = el('yeni-proje-tip')!;
    const gruplar = Array.from(kap.children);
    expect(gruplar).toHaveLength(2);
    const kimlikler = (g: Element) =>
      Array.from(g.querySelectorAll('[data-testid^="yeni-proje-tip-"]'))
        .map((b) => b.getAttribute('data-testid')!.replace('yeni-proje-tip-', ''));
    expect(kimlikler(gruplar[0]).every((id) => DOKUMAN_TIPLERI[id as DokumanTipiAdi].sayfaDakika)).toBe(true);
    expect(kimlikler(gruplar[1]).some((id) => DOKUMAN_TIPLERI[id as DokumanTipiAdi].sayfaDakika)).toBe(false);
    expect(kimlikler(gruplar[1])).toContain('goruntu-ses');
  });
});

describe('raf', () => {
  it('proje yoksa boş durum, raf değil', async () => {
    await ciz();
    expect(el('kitaplik-bos')).not.toBeNull();
    expect(el('raf')).toBeNull();
  });

  it('her proje bir kitap', async () => {
    await ciz([p('Bavul', '/a.sbp', 'senaryo'), p('Kuyu', '/b.sbp', 'roman')]);
    expect(el('kitap-/a.sbp')!.textContent).toContain('Bavul');
    expect(el('kitap-/b.sbp')!.textContent).toContain('Roman');
  });

  /* Amber TEK işe ayrıldı: en son açılan kitabın şeridi. İkinci bir kitapta
     da çıksaydı "kaldığın yer" bilgisi anlamını yitirirdi. */
  it('şerit YALNIZ en son açılanda', async () => {
    await ciz([p('Bavul', '/a.sbp'), p('Kuyu', '/b.sbp')]);
    expect(el('kitap-/a.sbp')!.querySelector('[data-testid="kitap-serit"]')).not.toBeNull();
    expect(el('kitap-/b.sbp')!.querySelector('[data-testid="kitap-serit"]')).toBeNull();
  });

  it('tipi olmayan eski kayıt da çiziliyor', async () => {
    await ciz([p('Eski', '/e.sbp')]);
    expect(el('kitap-/e.sbp')).not.toBeNull();
  });
});

describe('günün sözü', () => {
  /* Rastgele olsaydı her yeniden çizimde değişir, kullanıcı okurken cümle
     altından kayardı. */
  it('aynı gün aynı söz', () => {
    expect(gununSozu(19_000)).toBe(gununSozu(19_000));
    expect(gununSozu(19_001)).not.toBe(gununSozu(19_000));
  });

  it('gün listeden taşsa da bir söz dönüyor', () => {
    for (const g of [0, -1, 99_999]) {
      expect(SOZLER).toContain(gununSozu(g));
    }
  });
});

describe('varsayılan kapaklar', () => {
  /* Kullanıcı isteği: senaryoysa senaryo kapaklarından, romansa roman
     kapaklarından. Aile `sayfaDakika` ekseninden türetiliyor — ayrı bir
     liste tutulsaydı yeni bir tip eklenince kapak ailesini yazmayı
     unutmak mümkün olurdu. */
  it('oynanan belgeler film ailesi, okunanlar kitap ailesi', () => {
    for (const t of ['senaryo', 'dizi', 'sahne-oyunu', 'radyo-oyunu']) {
      expect(kapakAilesi(t), t).toBe('film');
    }
    for (const t of ['roman', 'cizgi-roman', 'duz-metin']) {
      expect(kapakAilesi(t), t).toBe('kitap');
    }
  });

  it('bilinmeyen/eksik tip film ailesine düşüyor', () => {
    expect(kapakAilesi(undefined)).toBe('film');
    expect(kapakAilesi('yok-boyle-bir-tip')).toBe('film');
  });

  it('her ailede BEŞ kapak var', () => {
    expect(aileKapaklari('film')).toHaveLength(5);
    expect(aileKapaklari('kitap')).toHaveLength(5);
  });

  /* Gerçek rastgelelik her yeniden çizimde başka kapak verirdi ve kullanıcı
     kitabını kapağından tanıyamazdı. Seçim projenin kimliğinden türüyor. */
  it('aynı proje her zaman aynı kapak', async () => {
    await ciz([p('Bavul', '/a.sbp', 'senaryo')]);
    const ilk = el('kitap-/a.sbp')!.querySelector('[data-testid="kitap-kapak"]')!.innerHTML;
    act(() => { kok!.unmount(); });
    yer!.remove();
    await ciz([p('Bavul', '/a.sbp', 'senaryo')]);
    expect(el('kitap-/a.sbp')!.querySelector('[data-testid="kitap-kapak"]')!.innerHTML).toBe(ilk);
  });

  /* Hepsi aynı kapağı alsaydı raf tek tip görünürdü — atamanın amacı da
     buydu. */
  it('farklı projeler farklı kapaklar alıyor', async () => {
    const yollar = ['/1.sbp', '/2.sbp', '/3.sbp', '/4.sbp', '/5.sbp', '/6.sbp'];
    await ciz(yollar.map((y, i) => p(`P${i}`, y, 'senaryo')));
    const kapaklar = new Set(
      yollar.map((y) => el(`kitap-${y}`)!.querySelector('[data-testid="kitap-kapak"]')!.innerHTML),
    );
    expect(kapaklar.size).toBeGreaterThan(1);
  });

  it('kullanıcının görseli varsa çizim DEĞİL o kullanılıyor', async () => {
    await ciz([{ ...p('Bavul', '/a.sbp', 'senaryo'), kapak: 'blob:kendi-kapagim' }]);
    const kapak = el('kitap-/a.sbp')!.querySelector('[data-testid="kitap-kapak"]')!;
    expect(kapak.querySelector('img')?.getAttribute('src')).toBe('blob:kendi-kapagim');
    expect(kapak.querySelector('svg')).toBeNull();
  });
});
