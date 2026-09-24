import { describe, expect, it } from 'vitest';
import {
  bloklariKarsilastir,
  farkOzeti,
  sahnelereBol,
} from '@storyboard/core/model/karsilastir';
import type { ScriptBlock } from '@storyboard/core/model/script';

const b = (
  id: string,
  text: string,
  tip: ScriptBlock['type'] = 'action',
  sceneId = 'sc1',
): ScriptBlock => ({ id, fp: text, type: tip, text, scene: '', sceneId });

describe('blok farkı', () => {
  it('değişmemiş belge FARKSIZ', () => {
    const s = [b('1', 'bir'), b('2', 'iki')];
    const f = bloklariKarsilastir(s, s);
    expect(f.every((x) => x.tur === 'ayni')).toBe(true);
    expect(farkOzeti(f).fark).toBe(false);
  });

  it('metin değişimi DEĞİŞTİ, silme+ekleme değil', () => {
    const f = bloklariKarsilastir([b('1', 'eski')], [b('1', 'yeni')]);
    expect(f.map((x) => x.tur)).toEqual(['degisti']);
    expect(f[0].onceki!.text).toBe('eski');
    expect(f[0].sonraki!.text).toBe('yeni');
  });

  it('blok tipi değişimi de DEĞİŞTİ sayılıyor', () => {
    const f = bloklariKarsilastir([b('1', 'AYŞE')], [b('1', 'AYŞE', 'character')]);
    expect(f[0].tur).toBe('degisti');
  });

  it('yeni blok EKLENDİ', () => {
    const f = bloklariKarsilastir([b('1', 'bir')], [b('1', 'bir'), b('2', 'iki')]);
    expect(f.map((x) => x.tur)).toEqual(['ayni', 'eklendi']);
  });

  /* Sona toplansaydı kullanıcı neyin NEREDEN silindiğini göremezdi. */
  it('silinen blok, silindiği YERDE gösteriliyor', () => {
    const f = bloklariKarsilastir(
      [b('1', 'bir'), b('2', 'iki'), b('3', 'üç')],
      [b('1', 'bir'), b('3', 'üç')],
    );
    expect(f.map((x) => x.tur)).toEqual(['ayni', 'silindi', 'ayni']);
    expect(f[1].blockId).toBe('2');
  });

  it('baştan silme de yerinde gösteriliyor', () => {
    const f = bloklariKarsilastir([b('1', 'bir'), b('2', 'iki')], [b('2', 'iki')]);
    expect(f.map((x) => x.tur)).toEqual(['silindi', 'ayni']);
  });

  it('sondan silme yakalanıyor', () => {
    const f = bloklariKarsilastir([b('1', 'bir'), b('2', 'iki')], [b('1', 'bir')]);
    expect(f.map((x) => x.tur)).toEqual(['ayni', 'silindi']);
  });

  it('her şey silinince hepsi silindi', () => {
    const f = bloklariKarsilastir([b('1', 'bir'), b('2', 'iki')], []);
    expect(f.map((x) => x.tur)).toEqual(['silindi', 'silindi']);
  });

  it('boş belgeden başlayınca hepsi eklendi', () => {
    const f = bloklariKarsilastir([], [b('1', 'bir')]);
    expect(f.map((x) => x.tur)).toEqual(['eklendi']);
  });
});

describe('taşınma AYRI bir durum', () => {
  /* Taşınmayı "sil + ekle" göstermek, bir sahnenin yerini değiştiren
     revizyonu, o sahnenin yeniden yazıldığı revizyondan ayırt edilemez
     kılardı — yazar için bu ikisi apayrı kararlar. */
  it('yer değiştiren blok TAŞINDI, silinip eklenmiş değil', () => {
    const f = bloklariKarsilastir(
      [b('1', 'bir'), b('2', 'iki'), b('3', 'üç')],
      [b('3', 'üç'), b('1', 'bir'), b('2', 'iki')],
    );
    expect(f.filter((x) => x.tur === 'silindi')).toHaveLength(0);
    expect(f.filter((x) => x.tur === 'eklendi')).toHaveLength(0);
    expect(f.filter((x) => x.tur === 'tasindi').map((x) => x.blockId)).toEqual(['3']);
  });

  /* Basit "sıra numarası değişti mi" ölçüsü, araya tek blok eklendiğinde
     aşağıdaki HER bloğu taşınmış gösterirdi. */
  it('araya ekleme aşağıdakileri TAŞINDI yapmıyor', () => {
    const f = bloklariKarsilastir(
      [b('1', 'bir'), b('2', 'iki'), b('3', 'üç')],
      [b('1', 'bir'), b('9', 'yeni'), b('2', 'iki'), b('3', 'üç')],
    );
    expect(f.filter((x) => x.tur === 'tasindi')).toHaveLength(0);
    expect(f.filter((x) => x.tur === 'eklendi').map((x) => x.blockId)).toEqual(['9']);
  });

  it('taşınan blok eski ve yeni sırasını taşıyor', () => {
    const f = bloklariKarsilastir(
      [b('1', 'bir'), b('2', 'iki')],
      [b('2', 'iki'), b('1', 'bir')],
    );
    const tasinan = f.find((x) => x.tur === 'tasindi')!;
    expect(tasinan.onceSira).not.toBe(tasinan.sonraSira);
  });

  it('hem taşınmış hem değişmiş blok DEĞİŞTİ sayılıyor — içerik önce gelir', () => {
    const f = bloklariKarsilastir(
      [b('1', 'bir'), b('2', 'iki')],
      [b('2', 'iki'), b('1', 'BİR YENİ')],
    );
    expect(f.find((x) => x.blockId === '1')!.tur).toBe('degisti');
  });
});

describe('sahnelere bölme', () => {
  /* Yazar revizyonu sahne sahne okur; düz bir blok listesi 400 sayfalık
     senaryoda okunamaz. */
  it('bloklar sahne kimliğine göre gruplanıyor', () => {
    const eski = [
      b('1', 'İÇ. MUTFAK', 'scene', 'sc1'), b('2', 'bir', 'action', 'sc1'),
      b('3', 'DIŞ. SOKAK', 'scene', 'sc2'), b('4', 'iki', 'action', 'sc2'),
    ];
    const gruplar = sahnelereBol(bloklariKarsilastir(eski, eski));
    expect(gruplar).toHaveLength(2);
    expect(gruplar[0].baslik).toBe('İÇ. MUTFAK');
    expect(gruplar[1].baslik).toBe('DIŞ. SOKAK');
  });

  it('değişmemiş sahne `degisti: false` — arayüz kapalı gösterebilir', () => {
    const eski = [b('1', 'İÇ. MUTFAK', 'scene', 'sc1'), b('2', 'bir', 'action', 'sc1')];
    const yeni = [b('1', 'İÇ. MUTFAK', 'scene', 'sc1'), b('2', 'BİR YENİ', 'action', 'sc1')];
    const [grup] = sahnelereBol(bloklariKarsilastir(eski, yeni));
    expect(grup.degisti).toBe(true);
    expect(sahnelereBol(bloklariKarsilastir(eski, eski))[0].degisti).toBe(false);
  });

  /* Grup ölçütü `sceneId`, başlık DEĞİL: başlık revizyonda değişebilir ve
     o zaman sahne ikiye bölünmüş görünürdü. */
  it('başlığı değişen sahne İKİYE BÖLÜNMÜYOR', () => {
    const eski = [b('1', 'İÇ. MUTFAK', 'scene', 'sc1'), b('2', 'bir', 'action', 'sc1')];
    const yeni = [b('1', 'İÇ. MUTFAK - GECE', 'scene', 'sc1'), b('2', 'bir', 'action', 'sc1')];
    expect(sahnelereBol(bloklariKarsilastir(eski, yeni))).toHaveLength(1);
  });

  it('başlıksız açılış sahnesi boş başlıkla geliyor — uydurulmuyor', () => {
    const s = [b('1', 'bir', 'action', 'sc1')];
    expect(sahnelereBol(bloklariKarsilastir(s, s))[0].baslik).toBe('');
  });
});

describe('özet TEK yerden sayılıyor', () => {
  it('her tür ayrı sayılıyor', () => {
    const f = bloklariKarsilastir(
      [b('1', 'bir'), b('2', 'iki'), b('3', 'üç')],
      [b('3', 'üç'), b('1', 'BİR'), b('9', 'yeni')],
    );
    const o = farkOzeti(f);
    expect(o.silinen).toBe(1);
    expect(o.eklenen).toBe(1);
    expect(o.degisen).toBe(1);
    expect(o.fark).toBe(true);
  });

  it('fark yoksa `fark: false`', () => {
    const s = [b('1', 'bir')];
    expect(farkOzeti(bloklariKarsilastir(s, s)).fark).toBe(false);
  });
});
