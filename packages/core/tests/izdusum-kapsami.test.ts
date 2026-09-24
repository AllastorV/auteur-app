import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { ROOT, assetsMap, senaryoFragment, worldMapsMap } from '@storyboard/core/doc/schema';
import { protectedProjection } from '@storyboard/core/model/projection';

/**
 * Korumalı izdüşümün KÖK KAPSAMI.
 *
 * Bu dosya tek bir hata sınıfını kovalıyor: şemaya yeni bir kök eklenip
 * izdüşüme eklenmemesi. O zaman İzleyici ve Yorumcu rolü o kökü sınırsız
 * yazabilir ve sunucunun izin denetimi bunu HİÇ GÖRMEZ — hata mesajı da
 * çıkmaz, yalnız yetkisiz yazım sessizce kabul edilir.
 *
 * Bu tam olarak iki kez oldu: `sozluk` F2b'de fark edilip kapatıldı,
 * `assets` bağımsız incelemede yakalandı. Üçüncüsü olmasın diye kapsam
 * artık tek tek değil, `ROOT` üzerinden TOPLU doğrulanıyor.
 */

/** İzdüşümde KENDİ adıyla görünmeyen kökler ve nedenleri. */
const BASKA_ADLA: Record<string, string> = {
  // Senaryo metni `script` anahtarının içinde taşınıyor (`scriptDocu`).
  senaryo: 'script',
};

describe('korumalı izdüşüm HER kökü kapsıyor', () => {
  it('şemadaki her kök izdüşümde karşılık buluyor', () => {
    const anahtarlar = new Set(Object.keys(JSON.parse(protectedProjection(new Y.Doc()))));
    for (const kok of Object.values(ROOT)) {
      const beklenen = BASKA_ADLA[kok] ?? kok;
      expect(anahtarlar, `"${kok}" kökü korumalı izdüşümde yok`).toContain(beklenen);
    }
  });

  /* Gömülü görseller işaretleme katmanına ait değil, panellerin kalıcı
     içeriği. Dışarıda kalsaydı Yorumcu her görseli değiştirebilir ya da
     sınırsız dataURL yazıp katılımcıların diskini şişirebilirdi. */
  it('gömülü görsel yazmak izdüşümü DEĞİŞTİRİYOR', () => {
    const doc = new Y.Doc();
    const once = protectedProjection(doc);
    assetsMap(doc).set('a1', 'data:image/png;base64,AAAA');
    expect(protectedProjection(doc)).not.toBe(once);
  });

  it('harita işaretini değiştirmek korumalı izdüşümü değiştirir', () => {
    const doc = new Y.Doc();
    const before = protectedProjection(doc);
    worldMapsMap(doc).set('dn_1/marker/m_1', { id: 'm_1', worldId: 'dn_1', x: 0.4, y: 0.5 });
    expect(protectedProjection(doc)).not.toBe(before);
  });

  it('görselin İÇERİĞİ izdüşümde taşınıyor — anahtar değişimi yetmez', () => {
    const doc = new Y.Doc();
    assetsMap(doc).set('a1', 'data:image/png;base64,AAAA');
    const once = protectedProjection(doc);
    // Aynı anahtar, BAŞKA içerik: görsel değiştirme saldırısının tam şekli.
    assetsMap(doc).set('a1', 'data:image/png;base64,BBBB');
    expect(protectedProjection(doc)).not.toBe(once);
  });

  it('senaryo METNİ izdüşümde — `script` anahtarı fragmanı da taşıyor', () => {
    const doc = new Y.Doc();
    const once = protectedProjection(doc);
    const frag = senaryoFragment(doc);
    const p = new Y.XmlElement('action');
    p.insert(0, [new Y.XmlText('Ahmet girer.')]);
    frag.insert(0, [p]);
    expect(protectedProjection(doc)).not.toBe(once);
  });
});
