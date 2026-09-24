import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { packProject, unpackProject } from '@storyboard/core/model/project-io';
import {
  ROOT,
  baslikSayfasiMap,
  breakdownMap,
  ciftlerArray,
  copArray,
  docToProject,
  dunyalarMap,
  karakterlerMap,
  loadProjectIntoDoc,
  lokasyonlarMap,
  revizyonIsaretleriMap,
  revizyonlarArray,
  sozlukMap,
  yerImleriMap,
} from '@storyboard/core/doc/schema';
import { yerImiKoy, revizyonYayinla, revizyonIsaretle } from '@storyboard/core/doc/mutations';
import { createProject } from '@storyboard/core/model/factory';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * KAYIT KAPSAMI — kullanıcıya dönük kayıt biçimi (.sbp) neyi taşıyor?
 *
 * `saveProject` ve `autosave` `packProject` çağırıyor, o da bir `Project`
 * paketliyor. `Project` yalnız meta/settings/panels/script taşıyor. Belgede
 * bunların YANINDA duran kökler (yer imleri, çekim dökümü, karakterler,
 * sözlük, başlık sayfası, Fransız çiftleri, revizyonlar...) bu yoldan
 * geçmezse kaydedip yeniden açan yazar onları kaybeder — §15'in yasakladığı
 * SESSİZ kayıp.
 *
 * Bu dosya kayıp olup olmadığını TAHMİN ETMİYOR, ÖLÇÜYOR. Yeni bir kök
 * eklendiğinde buraya da bir satır eklenmeli; eklenmezse yeni kök sessizce
 * kaybolur ve bunu hiçbir test söylemez.
 */

async function turDon(doc: Y.Doc): Promise<Y.Doc> {
  const paket = await packProject({ project: docToProject(doc), assets: {} });
  const geri = await unpackProject(paket);
  const yeni = new Y.Doc();
  loadProjectIntoDoc(yeni, geri.project);
  return yeni;
}

function bosProje(): Y.Doc {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject({ panels: [] }));
  return doc;
}

describe('.sbp gidiş-dönüşü — taşındığı bilinenler', () => {
  it('meta korunuyor', async () => {
    const doc = bosProje();
    const geri = await turDon(doc);
    expect(docToProject(geri).meta.id).toBe(docToProject(doc).meta.id);
  });
});

describe('.sbp gidiş-dönüşü — belgenin ÖTEKİ kökleri', () => {
  it('yer imi korunuyor', async () => {
    const doc = bosProje();
    yerImiKoy(doc, 'b1', { etiket: 'Dönüm noktası' });
    expect(yerImleriMap(await turDon(doc)).get('b1')?.etiket).toBe('Dönüm noktası');
  });

  it('sözlük korunuyor', async () => {
    const doc = bosProje();
    sozlukMap(doc).set('mizansen', 'mise-en-scène');
    expect(sozlukMap(await turDon(doc)).get('mizansen')).toBe('mise-en-scène');
  });

  it('karakter kaydı korunuyor', async () => {
    const doc = bosProje();
    karakterlerMap(doc).set('k1', { id: 'k1', ad: 'DEMİR' } as never);
    expect(karakterlerMap(await turDon(doc)).has('k1')).toBe(true);
  });

  it('lokasyon kaydı korunuyor', async () => {
    const doc = bosProje();
    lokasyonlarMap(doc).set('l1', { id: 'l1', ad: 'ATÖLYE' } as never);
    expect(lokasyonlarMap(await turDon(doc)).has('l1')).toBe(true);
  });

  it('dünya kaydı korunuyor', async () => {
    const doc = bosProje();
    dunyalarMap(doc).set('d1', { id: 'd1', ad: 'Kuzey Kıyı' } as never);
    expect(dunyalarMap(await turDon(doc)).has('d1')).toBe(true);
  });

  it('başlık sayfası korunuyor', async () => {
    const doc = bosProje();
    baslikSayfasiMap(doc).set('baslik', 'ÖRNEK SENARYO');
    expect(baslikSayfasiMap(await turDon(doc)).get('baslik')).toBe('ÖRNEK SENARYO');
  });

  it('çekim dökümü korunuyor', async () => {
    const doc = bosProje();
    breakdownMap(doc).set('sc1', { zamanKatmani: 'geri' } as never);
    expect(breakdownMap(await turDon(doc)).has('sc1')).toBe(true);
  });

  it('Fransız çiftleri korunuyor — İKİ SÜTUNLU BELGENİN METNİ', async () => {
    const doc = bosProje();
    const m = new Y.Map<unknown>();
    m.set('id', 'c1');
    ciftlerArray(doc).push([m]);
    expect(ciftlerArray(await turDon(doc)).length).toBe(1);
  });

  it('geri dönüşüm kutusu korunuyor', async () => {
    const doc = bosProje();
    const m = new Y.Map<unknown>();
    m.set('id', 'cop1');
    copArray(doc).push([m]);
    expect(copArray(await turDon(doc)).length).toBe(1);
  });

  it('revizyonlar ve işaretler korunuyor', async () => {
    const doc = bosProje();
    const rev = revizyonYayinla(doc, 'Mavi');
    revizyonIsaretle(doc, ['b1']);
    const geri = await turDon(doc);
    expect(revizyonlarArray(geri).length).toBe(1);
    expect(revizyonIsaretleriMap(geri).get('b1')).toBe(rev.id);
  });
});

describe('yükleme GÜVENLİĞİ — bilmeyen bir çağıran veriyi süpüremez', () => {
  it('`belge` alanı YOKSA belgede duran kökler silinmiyor', () => {
    const doc = bosProje();
    yerImiKoy(doc, 'b1', { etiket: 'Kalsın' });
    sozlukMap(doc).set('a', 'b');

    /* Yeni alanı bilmeyen bir çağıran (eski sürüm, eski `.sbp`) böyle bir
       proje yollar. Yükleyici kökleri temizlerse düzeltmenin kendisi kayba
       dönüşür. */
    const eski = createProject({ panels: [] });
    loadProjectIntoDoc(doc, eski);

    expect(yerImleriMap(doc).get('b1')?.etiket).toBe('Kalsın');
    expect(sozlukMap(doc).get('a')).toBe('b');
  });

  it('bozuk şekildeki alan kökü süpürmüyor', () => {
    const doc = bosProje();
    sozlukMap(doc).set('a', 'b');
    ciftlerArray(doc).push([new Y.Map<unknown>()]);

    loadProjectIntoDoc(doc, {
      ...createProject({ panels: [] }),
      belge: { sozluk: ['dizi olmamalı'], ciftler: { dizi: 'değil' } } as never,
    });

    expect(sozlukMap(doc).get('a')).toBe('b');
    expect(ciftlerArray(doc).length).toBe(1);
  });

  it('geri yüklenen çift ALAN BAZINDA düzenlenebilir kalıyor — Y.Map olarak yazılıyor', async () => {
    const doc = bosProje();
    const m = new Y.Map<unknown>();
    m.set('id', 'c1');
    m.set('tip', 'action');
    m.set('metin', 'ilk');
    ciftlerArray(doc).push([m]);

    const geri = await turDon(doc);
    const oge = ciftlerArray(geri).get(0);
    expect(oge).toBeInstanceOf(Y.Map);
    oge.set('metin', 'ikinci');
    expect(ciftlerArray(geri).get(0).get('metin')).toBe('ikinci');
  });
});


describe('kaydeden YOLLAR belgeyi tam yolluyor', () => {
  /* Kaynak metnine bakan bir test — zayıf bir biçim ama koruduğu regresyon
     hatanın ta kendisi: `state.project` doğrudan yollanırsa kayıp geri
     gelir ve çalışma zamanında hiçbir şey bağırmaz. İki çağrı yeri var,
     ikisi de burada. */
  const kok = fileURLToPath(new URL('../src/', import.meta.url));
  const oku = (yol: string) => readFileSync(kok + yol, 'utf8');

  it('Studio.doSave `kayitIcinProje` kullanıyor', () => {
    const src = oku('components/Studio.tsx');
    expect(src).toMatch(/platform\.saveProject\(\s*kayitIcinProje\(/);
  });

  it('otomatik kayıt `kayitIcinProje` kullanıyor', () => {
    const src = oku('hooks/useAutosave.ts');
    expect(src).toMatch(/platform\.autosave\(\s*kayitIcinProje\(/);
  });
});

describe('kök sayımı — yeni kök sessizce eklenemesin', () => {
  it('bilinen kök listesi değişmediyse geçer', () => {
    expect(Object.keys(ROOT).sort()).toEqual(
      [
        'assets',
        'baslikSayfasi',
        'breakdown',
        'ciftler',
        'cop',
        'dunyalar',
        'karakterler',
        'lokasyonlar',
        'meta',
        'panels',
        'revizyonIsaretleri',
        'revizyonlar',
        'script',
        'senaryo',
        'settings',
        'sozluk',
        'worldMaps',
        'yerImleri',
      ].sort(),
    );
  });
});
