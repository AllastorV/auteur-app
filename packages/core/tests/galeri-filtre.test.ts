import { describe, expect, it } from 'vitest';
import { createPanel } from '@storyboard/core/model/factory';
import { galeriPanelleriSuz, galeriSahneleri } from '@storyboard/core/components/gallery/galeriFiltre';

const p = (id: string, scene: string, scriptRefs: string[] = []) =>
  createPanel({ id, meta: { scene }, scriptRefs });

describe('galeriPanelleriSuz — F8 galeri filtresi (§13.2)', () => {
  const paneller = [
    p('a', '1', ['b1']),
    p('b', '1'),
    p('c', '2', ['b2']),
  ];

  it('"all" hiçbir şeyi elemiyor', () => {
    expect(galeriPanelleriSuz(paneller, 'all', null).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('"linked" yalnız senaryoya bağlı panelleri bırakıyor', () => {
    expect(galeriPanelleriSuz(paneller, 'linked', null).map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('"unlinked" yalnız bağsız panelleri bırakıyor', () => {
    expect(galeriPanelleriSuz(paneller, 'unlinked', null).map((x) => x.id)).toEqual(['b']);
  });

  it('sahne süzgeci filtreyle BİRLİKTE çalışıyor — ikisi de sağlanmalı', () => {
    expect(galeriPanelleriSuz(paneller, 'linked', '1').map((x) => x.id)).toEqual(['a']);
    expect(galeriPanelleriSuz(paneller, 'all', '2').map((x) => x.id)).toEqual(['c']);
  });

  it('sahne null iken hiçbir sahne süzülmüyor', () => {
    expect(galeriPanelleriSuz(paneller, 'all', null)).toHaveLength(3);
  });

  it('boş panel listesinde boş dönüyor, patlamıyor', () => {
    expect(galeriPanelleriSuz([], 'all', null)).toEqual([]);
  });
});

describe('galeriSahneleri — tekrarsız, belge SIRASINDA (sayısal sıralama değil)', () => {
  it('tekrar eden sahneler bir kez listeleniyor', () => {
    const paneller = [p('a', '10'), p('b', '2'), p('c', '10'), p('d', '2')];
    // "10" > "2" sayısal ama BELGE sırasında "10" önce görülüyor — sıralama
    // yapılmıyor, alfabetik/sayısal bir sıralama "sahne 10"u "sahne 2"den
    // önce göstermeyi YANLIŞ bir varsayım olarak dayatırdı.
    expect(galeriSahneleri(paneller)).toEqual(['10', '2']);
  });

  it('boş sahne numarası (henüz atanmamış) listeye girmiyor', () => {
    const paneller = [p('a', ''), p('b', '3')];
    expect(galeriSahneleri(paneller)).toEqual(['3']);
  });

  it('panel yoksa boş liste', () => {
    expect(galeriSahneleri([])).toEqual([]);
  });
});
