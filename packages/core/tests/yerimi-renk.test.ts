import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  VARSAYILAN_RENK, YER_IMI_RENKLERI, sonrakiRenk,
} from '@storyboard/core/model/yerimi';
import { yerImiKoy, yerImiRenginiIlerlet } from '@storyboard/core/doc/mutations';
import { yerImleriMap } from '@storyboard/core/doc/schema';

/**
 * YER İMİ RENGİ — tıklamanın yeni anlamı.
 *
 * Kenar işaretine tıklamak eskiden imi KALDIRIYORDU: tek yanlış tık,
 * etiketiyle birlikte imi siliyor ve o kök geri-al kapsamında olmadığı için
 * geri de gelmiyordu. Kullanıcı gerçek pencerede bildirdi (2026-08-30):
 * "yer imi koyup yer iminin üstüne basınca kayboluyor". Tıklama artık
 * rengi ilerletiyor; kaldırma sağ tık menüsünde.
 */

describe('sonrakiRenk', () => {
  it('paletteki sırayı izler', () => {
    for (let i = 0; i < YER_IMI_RENKLERI.length - 1; i++) {
      expect(sonrakiRenk(YER_IMI_RENKLERI[i])).toBe(YER_IMI_RENKLERI[i + 1]);
    }
  });

  it('sondan başa döner', () => {
    const son = YER_IMI_RENKLERI[YER_IMI_RENKLERI.length - 1];
    expect(sonrakiRenk(son)).toBe(YER_IMI_RENKLERI[0]);
  });

  it('paletin tamamını bir turda geziyor', () => {
    /* TUR TESTİ: "sonrakine geç" yerine "hep aynı rengi ver" diyen bir
       uygulama tek adımlı testlerin bir kısmından geçebilir; tur, palet
       kadar adımda başa dönmeyi ve HİÇBİR rengi atlamamayı birlikte
       sınıyor. */
    const gorulen = new Set<string>();
    let renk = VARSAYILAN_RENK;
    for (let i = 0; i < YER_IMI_RENKLERI.length; i++) {
      gorulen.add(renk);
      renk = sonrakiRenk(renk);
    }
    expect(gorulen.size).toBe(YER_IMI_RENKLERI.length);
    expect(renk).toBe(VARSAYILAN_RENK);
  });
});

describe('yerImiRenginiIlerlet', () => {
  it('imin rengini ilerletir, etiketi korur', () => {
    const doc = new Y.Doc();
    yerImiKoy(doc, 'sb_1', { etiket: 'Dönüm noktası', renk: 'sarı' });

    expect(yerImiRenginiIlerlet(doc, 'sb_1')).toBe(sonrakiRenk('sarı'));
    const im = yerImleriMap(doc).get('sb_1')!;
    expect(im.renk).toBe(sonrakiRenk('sarı'));
    /* ETİKET KAYBOLMAZ. Rengi yazarken imi baştan kurmak, kullanıcının
       yazdığı etiketi sessizce silmek olurdu. */
    expect(im.etiket).toBe('Dönüm noktası');
    doc.destroy();
  });

  it('im yoksa null döner ve im YARATMAZ', () => {
    const doc = new Y.Doc();
    expect(yerImiRenginiIlerlet(doc, 'sb_yok')).toBe(null);
    expect(yerImleriMap(doc).size).toBe(0);
    doc.destroy();
  });

  it('bozuk renk paletin başına döner', () => {
    /* GÜVEN SINIRI: belge ortak çalışandan gelebilir ya da elle
       kurcalanmış olabilir. */
    const doc = new Y.Doc();
    yerImiKoy(doc, 'sb_1');
    yerImleriMap(doc).set('sb_1', { etiket: '', renk: 'fuşya' as never });
    expect(yerImiRenginiIlerlet(doc, 'sb_1')).toBe(sonrakiRenk(VARSAYILAN_RENK));
    doc.destroy();
  });
});
