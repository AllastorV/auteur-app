import { describe, expect, it } from 'vitest';
import {
  SEKME_ADLARI, SEKME_GRUPLARI, sekmeGrubu, type SekmeId,
} from '@storyboard/core/model/denetci-sekme';

/**
 * DENETÇİ SEKME GRUPLARI.
 *
 * Dokuz sekme 300 px'e sığmıyordu; benzer alanlar tek başlık altında
 * toplandı (kullanıcı kararı 2026-08-30). Buradaki tehlike bir bölümü
 * gruplarken KAYBETMEK: erişilemeyen bir bölüm, silinmiş bir bölümdür ve
 * kimse fark etmez.
 */

const TUM: SekmeId[] = [
  'sahne', 'yazim', 'imler', 'dunya', 'analiz', 'yapi', 'kadro', 'dokum', 'cop',
];

describe('sekme grupları', () => {
  it('HER bölüm tam olarak BİR grupta', () => {
    const gorulen = SEKME_GRUPLARI.flatMap((g) => g.uyeler);
    expect([...gorulen].sort()).toEqual([...TUM].sort());
    /* Yinelenen üye iki grupta birden çıkardı ve `sekmeGrubu` ilkini
       seçip ötekini erişilemez bırakırdı. */
    expect(new Set(gorulen).size).toBe(gorulen.length);
  });

  it('her bölümün bir adı var', () => {
    for (const id of TUM) expect(SEKME_ADLARI[id], id).toBeTruthy();
  });

  it('şerit dört başlıktan uzun değil — sığmama sorunu geri gelmesin', () => {
    /* SAYI BİR SÖZLEŞME: 300 px panelde beş başlık yine kırpılmaya
       başlıyor. Yeni bir bölüm eklenirse var olan bir grubun ALTINA
       girmeli, onuncu başlık olarak değil. */
    expect(SEKME_GRUPLARI.length).toBeLessThanOrEqual(4);
  });

  it('sekmeGrubu üyeyi kendi grubunda bulur', () => {
    expect(sekmeGrubu('imler').id).toBe('yazim');
    expect(sekmeGrubu('dunya').id).toBe('yazim');
    expect(sekmeGrubu('yapi').id).toBe('analiz');
    expect(sekmeGrubu('dokum').id).toBe('yapim');
    expect(sekmeGrubu('sahne').id).toBe('sahne');
  });

  it('tanınmayan bölüm ilk gruba düşer, patlamaz', () => {
    /* Kayıtlı tercih eski bir sürümden gelebilir. */
    expect(sekmeGrubu('olmayan' as SekmeId)).toBe(SEKME_GRUPLARI[0]);
  });

  it('her grubun ilk üyesi kendi grubuna geri götürüyor', () => {
    /* Gruba tıklamak ilk üyesini açıyor; ilk üye başka bir gruba aitse
       tıklamak kullanıcıyı BAŞKA sekmeye atardı. */
    for (const g of SEKME_GRUPLARI) expect(sekmeGrubu(g.uyeler[0]).id).toBe(g.id);
  });
});
