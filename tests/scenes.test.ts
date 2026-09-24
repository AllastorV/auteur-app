import { describe, expect, it } from 'vitest';
import { parseFountain, type ScriptBlock } from '@storyboard/core/model/script';
import { deriveScenes } from '@storyboard/core/model/scenes';

const IKI_SAHNE = `İÇ. MUTFAK - GECE

Buzdolabı uğulduyor.

SELİM
Gitmiyorum.

DIŞ. SOKAK - GECE

Yağmur başlıyor.`;

describe('deriveScenes', () => {
  it('her sahne başlığı için bir sahne üretir', () => {
    const sahneler = deriveScenes(parseFountain(IKI_SAHNE));
    expect(sahneler).toHaveLength(2);
    expect(sahneler[0].heading).toBe('İÇ. MUTFAK - GECE');
    expect(sahneler[1].heading).toBe('DIŞ. SOKAK - GECE');
  });

  it('sahne kimliği bloklardan gelir, üretilmez', () => {
    const bloklar = parseFountain(IKI_SAHNE);
    const sahneler = deriveScenes(bloklar);
    expect(sahneler[0].id).toBe(bloklar[0].sceneId);
  });

  it('sahnenin blokları başlık dahil sırayla listelenir', () => {
    const bloklar = parseFountain(IKI_SAHNE);
    const sahneler = deriveScenes(bloklar);
    const ilkSahneBloklari = bloklar.filter((b) => b.sceneId === sahneler[0].id).map((b) => b.id);
    expect(sahneler[0].blockIds).toEqual(ilkSahneBloklari);
    // İlk sahne: başlık + aksiyon + karakter + diyalog = 4 blok.
    expect(sahneler[0].blockIds).toHaveLength(4);
  });

  it('sahne uzunluğu bloklardaki metin uzunluklarının toplamıdır', () => {
    const sahneler = deriveScenes(parseFountain(IKI_SAHNE));
    expect(sahneler[0].length).toBeGreaterThan(sahneler[1].length);
  });

  it('sahne başlığı öncesi bloklar sahnesiz sayılmaz — ilk sahneye girer', () => {
    const sahneler = deriveScenes(parseFountain('Kara ekran.\n\nİÇ. MUTFAK - GECE\n\nSes.'));
    expect(sahneler).toHaveLength(2);
    expect(sahneler[0].heading).toBe('');
    expect(sahneler[0].blockIds).toHaveLength(1);
  });

  /* k-1: `!sahne.heading` koruması. `sceneId` dosyadan gelir; bozuk ya da elle
     kurcalanmış bir projede iki başlık aynı sahne kimliğini paylaşabilir.
     Koruma olmadan SONRAKİ başlık öncekini ezer ve sahne, başlığıyla numarasını
     hiç beklenmedik bir bloktan devralır. Kural: ilk başlık kazanır. */
  it('aynı sahne kimliğinde ikinci başlık ilkini ezmez', () => {
    const blok = (
      id: string,
      type: ScriptBlock['type'],
      text: string,
      scene: string,
    ): ScriptBlock => ({ id, fp: id, type, text, scene, sceneId: 'sc_a' });

    const sahneler = deriveScenes([
      blok('sb_1', 'scene', 'İÇ. MUTFAK - GECE', '1'),
      blok('sb_2', 'action', 'Buzdolabı uğulduyor.', '1'),
      blok('sb_3', 'scene', 'İÇ. MUTFAK - ŞAFAK', '9'),
    ]);

    expect(sahneler).toHaveLength(1);
    expect(sahneler[0].heading).toBe('İÇ. MUTFAK - GECE');
    expect(sahneler[0].number).toBe('1');
  });

  it('boş senaryo boş liste verir', () => {
    expect(deriveScenes([])).toEqual([]);
  });
});
