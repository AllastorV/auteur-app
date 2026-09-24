import { describe, expect, it } from 'vitest';
import { odakCoz, odakKur, type Odak } from '@storyboard/core/store/odak';
import { createPanel, createProject } from '@storyboard/core/model/factory';
import type { Project, ScriptBlock, ScriptBlockType } from '@storyboard/core/model/types';

const blok = (
  id: string,
  sceneId: string,
  type: ScriptBlockType = 'action',
  text = 'metin',
): ScriptBlock => ({ id, fp: '', type, text, scene: '', sceneId });

/**
 * İki sahnelik senaryo, üç panel.
 * - `pn1` → `b2` (sahne 1)
 * - `pn2` → `b2` ve `b3` (aynı bloğa ikinci panel)
 * - `pn3` → hiçbir şey
 */
function proje(): Project {
  const p = createProject({ panels: [] });
  const paneller = [createPanel(), createPanel(), createPanel()].map((x, i) => ({
    ...x,
    id: `pn${i + 1}`,
  }));
  paneller[0].scriptRefs = ['b2'];
  paneller[1].scriptRefs = ['b2', 'b3'];
  paneller[2].scriptRefs = [];
  return {
    ...p,
    panels: paneller,
    script: {
      name: 'x',
      blocks: [
        blok('b1', 'sc1', 'scene', 'İÇ. ODA - GECE'),
        blok('b2', 'sc1'),
        blok('b3', 'sc1'),
        blok('b4', 'sc2', 'scene', 'DIŞ. SOKAK - GÜN'),
        blok('b5', 'sc2'),
      ],
    },
  };
}

const BELGE = 'doc1';

describe('eksenler arası eşleme BELGEDEN türetiliyor', () => {
  /* Yazan mod yalnız kendi eksenini yazar. Ötekileri doldurmak, senaryo
     modunu "bu blok hangi panele bağlı" bilmeye zorlardı — yani modları
     birbirine tanıtırdı (§7: "modlar birbirini tanımaz"). */
  it('bloktan sahne türetiliyor', () => {
    expect(odakKur(BELGE, { blockId: 'b5' }, proje()).sceneId).toBe('sc2');
  });

  it('bloktan panel türetiliyor', () => {
    expect(odakKur(BELGE, { blockId: 'b2' }, proje()).boardId).toBe('pn1');
  });

  it('panelden blok ve sahne türetiliyor', () => {
    const o = odakKur(BELGE, { boardId: 'pn2' }, proje());
    expect(o.blockId).toBe('b2');
    expect(o.sceneId).toBe('sc1');
  });

  it('sahneden ilk blok türetiliyor', () => {
    expect(odakKur(BELGE, { sceneId: 'sc2' }, proje()).blockId).toBe('b4');
  });

  it('sahne ekseninden panel de türetiliyor (zincir)', () => {
    // sc1 → ilk blok b1 → b1'e bağlı panel yok, o yüzden boardId düşer.
    expect(odakKur(BELGE, { sceneId: 'sc1' }, proje()).boardId).toBeUndefined();
  });

  it('belge kimliği her zaman korunuyor', () => {
    expect(odakKur(BELGE, { blockId: 'b2' }, proje()).documentId).toBe(BELGE);
  });
});

describe('çözücü UYDURMAZ', () => {
  /* Türetilemeyen eksende rastgele bir yere atlamak, kullanıcıyı bağlamı
     korunmuş sanarak yanlış yere götürürdü. */
  it('bağlı paneli olmayan blokta boardId boş kalıyor', () => {
    expect(odakKur(BELGE, { blockId: 'b1' }, proje()).boardId).toBeUndefined();
  });

  it('bağı olmayan panelde blockId boş kalıyor', () => {
    const o = odakKur(BELGE, { boardId: 'pn3' }, proje());
    expect(o.boardId).toBe('pn3');
    expect(o.blockId).toBeUndefined();
    expect(o.sceneId).toBeUndefined();
  });

  it('boş projede hiçbir eksen türemiyor', () => {
    const bos = { ...createProject({ panels: [] }), panels: [], script: { name: '', blocks: [] } };
    expect(odakCoz({ documentId: BELGE, blockId: 'yok' }, bos)).toEqual({ documentId: BELGE });
  });
});

describe('BAYAT kimlikler düşürülüyor', () => {
  /* Silinmiş bir bloğun kimliği odakta kalmışsa ondan panel türetmek, var
     olmayan bir panele işaret ederdi. */
  it('silinmiş blok kimliği düşüyor', () => {
    const o = odakCoz({ documentId: BELGE, blockId: 'silindi' }, proje());
    expect(o.blockId).toBeUndefined();
  });

  it('silinmiş panel kimliği düşüyor', () => {
    const o = odakCoz({ documentId: BELGE, boardId: 'silindi' }, proje());
    expect(o.boardId).toBeUndefined();
  });

  it('hiçbir bloğun taşımadığı sahne kimliği düşüyor', () => {
    expect(odakCoz({ documentId: BELGE, sceneId: 'sc99' }, proje()).sceneId).toBeUndefined();
  });

  /* Bayat bir eksen, GEÇERLİ olan öteki ekseni bozmamalı. */
  it('bayat panel, geçerli bloğu bozmuyor', () => {
    const o = odakCoz({ documentId: BELGE, blockId: 'b2', boardId: 'silindi' }, proje());
    expect(o.blockId).toBe('b2');
    expect(o.boardId).toBe('pn1');
  });

  it('panelin BAYAT bağı atlanıp geçerli olanı bulunuyor', () => {
    const p = proje();
    p.panels[1].scriptRefs = ['silindi', 'b3'];
    expect(odakCoz({ documentId: BELGE, boardId: 'pn2' }, p).blockId).toBe('b3');
  });
});

describe('yeni eksen yazınca ötekiler DÜŞER ve yeniden türetilir', () => {
  /* Eksenleri biriktirmek "kullanıcı en son hangisini seçti?" bulmacası
     doğururdu. Düşürüp yeniden türetmek o soruyu ortadan kaldırıyor. */
  it('panel yazınca eski blok korunmuyor, panelden yeniden türetiliyor', () => {
    const p = proje();
    const once = odakKur(BELGE, { blockId: 'b5' }, p);
    expect(once.sceneId).toBe('sc2');

    const sonra = odakKur(BELGE, { boardId: 'pn1' }, p);
    expect(sonra.blockId).toBe('b2');
    expect(sonra.sceneId).toBe('sc1');
  });

  it('çözme İDEMPOTENT — çözülmüşü yeniden çözmek değiştirmiyor', () => {
    const p = proje();
    const bir = odakKur(BELGE, { boardId: 'pn2' }, p);
    expect(odakCoz(bir, p)).toEqual(bir);
  });
});

describe('birden çok panele bağlı blok DETERMİNİSTİK çözülüyor', () => {
  /* `b2` hem `pn1` hem `pn2`'ye bağlı. Belge sırasında ilki seçilir; sıra
     `scriptLinkIndex`'in ekleme sırasına bırakılırsa aynı belge iki
     istemcide farklı panele giderdi. */
  it('belge sırasındaki İLK panel seçiliyor', () => {
    expect(odakKur(BELGE, { blockId: 'b2' }, proje()).boardId).toBe('pn1');
  });

  it('panel sırası değişince seçim de değişiyor — sıra gerçekten okunuyor', () => {
    const p = proje();
    p.panels = [p.panels[1], p.panels[0], p.panels[2]]; // pn2 artık ilk
    expect(odakKur(BELGE, { blockId: 'b2' }, p).boardId).toBe('pn2');
  });
});

describe('entityId taşınıyor ama türetilmiyor', () => {
  it('verilen entityId korunuyor', () => {
    const o: Odak = { documentId: BELGE, entityId: 'kar_1', blockId: 'b2' };
    expect(odakCoz(o, proje()).entityId).toBe('kar_1');
  });

  it('verilmemişse uydurulmuyor', () => {
    expect(odakKur(BELGE, { blockId: 'b2' }, proje()).entityId).toBeUndefined();
  });
});
