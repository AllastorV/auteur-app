import { describe, expect, it } from 'vitest';
import { panelSirasiHesapla, siraylaTasimalar } from '@storyboard/core/model/sahne-panel';
import type { ScriptBlock } from '@storyboard/core/model/script';
import type { Panel } from '@storyboard/core/model/types';

const blok = (id: string): ScriptBlock =>
  ({ id, fp: id, type: 'action', text: id, scene: '', sceneId: 'sc1' });

const panel = (id: string, refs: string[] = []): Panel =>
  ({ id, scriptRefs: refs } as unknown as Panel);

const sira = (bloklar: ScriptBlock[], paneller: Panel[]) =>
  panelSirasiHesapla(bloklar, paneller).sira;

describe('sahne sırası panele taşınıyor', () => {
  /* F5 bitiş ölçütü: sahneyi taşı → kartı taşınıyor. Yoksa iki görünüm
     ayrışır ve storyboard senaryoyu anlatmaz hâle gelir. */
  it('senaryo sırası değişince panel sırası izliyor', () => {
    const bloklar = [blok('b3'), blok('b1'), blok('b2')];
    const paneller = [panel('p1', ['b1']), panel('p2', ['b2']), panel('p3', ['b3'])];
    expect(sira(bloklar, paneller)).toEqual(['p3', 'p1', 'p2']);
  });

  it('sıra zaten doğruysa DEĞİŞMEDİ bildiriliyor', () => {
    const bloklar = [blok('b1'), blok('b2')];
    const paneller = [panel('p1', ['b1']), panel('p2', ['b2'])];
    expect(panelSirasiHesapla(bloklar, paneller).degisti).toBe(false);
  });

  /* Bir panel birden çok satıra bağlı olabilir; "hangi sahnenin planı"
     sorusunun cevabı İLK satırıdır. Ortalama alınsaydı iki uzak satıra
     bağlı panel ikisinin de olmadığı bir yere düşerdi. */
  it('çok bağlı panel EN ERKEN satırına göre yerleşiyor', () => {
    const bloklar = [blok('b1'), blok('b2'), blok('b3')];
    const paneller = [panel('p1', ['b3']), panel('p2', ['b1', 'b3'])];
    expect(sira(bloklar, paneller)).toEqual(['p2', 'p1']);
  });

  /* Sıralanmaya çalışılsaydı hepsi başa ya da sona yığılır ve kullanıcının
     kendi düzeni yok olurdu. */
  it('BAĞSIZ panel yerinde kalıyor', () => {
    const bloklar = [blok('b2'), blok('b1')];
    const paneller = [panel('p1', ['b1']), panel('eskiz'), panel('p2', ['b2'])];
    const s = sira(bloklar, paneller);
    expect(s[1]).toBe('eskiz');
    expect([s[0], s[2]]).toEqual(['p2', 'p1']);
  });

  it('hepsi bağsızsa hiçbir şey değişmiyor', () => {
    const paneller = [panel('a'), panel('b')];
    expect(panelSirasiHesapla([blok('b1')], paneller).degisti).toBe(false);
  });

  /* Silinmiş bloğa bağlı panel BAĞSIZ sayılıyor: bayat kimliğe göre
     sıralamak paneli rastgele bir yere atardı. */
  it('bayat bağı olan panel yerinde kalıyor', () => {
    const bloklar = [blok('b1')];
    const paneller = [panel('p1', ['yok-olan']), panel('p2', ['b1'])];
    expect(panelSirasiHesapla(bloklar, paneller).degisti).toBe(false);
  });

  /* Aynı sahneye bağlı iki plan arasındaki sırayı kullanıcı elle kurmuş
     olabilir; kararlı sıralama onu bozmuyor. */
  it('aynı çapaya bağlı paneller MEVCUT sırasını koruyor', () => {
    const bloklar = [blok('b1')];
    const paneller = [panel('p1', ['b1']), panel('p2', ['b1']), panel('p3', ['b1'])];
    expect(sira(bloklar, paneller)).toEqual(['p1', 'p2', 'p3']);
  });

  it('boş projede çökmüyor', () => {
    expect(panelSirasiHesapla([], [])).toEqual({ sira: [], degisti: false });
  });
});

describe('taşıma adımları', () => {
  /* Toptan yazım ortak çalışmada başkasının aynı anda eklediği paneli
     SİLERDİ — Yjs dizisi değiştirme değil, ekleme/çıkarma üzerinden birleşir. */
  it('hedef sıraya götüren adımları üretiyor', () => {
    const adimlar = siraylaTasimalar(['a', 'b', 'c'], ['c', 'a', 'b']);
    const calisma = ['a', 'b', 'c'];
    for (const { panelId, toIndex } of adimlar) {
      calisma.splice(calisma.indexOf(panelId), 1);
      calisma.splice(toIndex, 0, panelId);
    }
    expect(calisma).toEqual(['c', 'a', 'b']);
  });

  it('sıra aynıysa hiç adım yok', () => {
    expect(siraylaTasimalar(['a', 'b'], ['a', 'b'])).toEqual([]);
  });

  it('en az adım üretiyor — gereksiz taşıma yok', () => {
    // Yalnız `c` başa alınmalı.
    expect(siraylaTasimalar(['a', 'b', 'c'], ['c', 'a', 'b'])).toHaveLength(1);
  });

  it('hedefte olmayan kimlik adım üretmiyor', () => {
    expect(siraylaTasimalar(['a'], ['yok'])).toEqual([]);
  });
});
