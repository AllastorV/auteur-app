import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { ciftlerArray, ciftleriOku, loadProjectIntoDoc } from '@storyboard/core/doc/schema';
import { createProject } from '@storyboard/core/model/factory';
import { docToProject } from '@storyboard/core/doc/schema';
import * as M from '@storyboard/core/doc/mutations';
import { protectedProjection } from '@storyboard/core/model/projection';
import { DOKUMAN_TIPLERI } from '@storyboard/core/model/dokuman-tipi';
import { tipProfili } from '@storyboard/core/format/profil';
import { sayfalaIkiSutun, sureTahmini, yerlesim } from '@storyboard/core/format/iki-sutun';

/**
 * İKİ SÜTUNLU BELGE — depolama katmanı (§6.6).
 *
 * Motor ve PDF F1d'de yazılmıştı; eksik olan BELGEYDİ. Bu testler o
 * belgenin kurallarını tutuyor: çift bölünmez, tip yerinde değişmez,
 * metin korumalı.
 */

function kur() {
  const doc = new Y.Doc();
  loadProjectIntoDoc(doc, createProject(), 'load');
  return doc;
}

/* YERLEŞİM DÜZELTİLDİ: her girdi TEK sütunda (olay solda, diyalog sağda)
   ve bir sonraki girdi öncekinin bittiği satırdan başlıyor. Önceki model
   yan yana eşleşen çiftler kuruyordu; referans örnek böyle değil. */
const olay = (id: string, metin: string) => ({ id, tip: 'action', metin });
const diyalog = (id: string, metin: string) => ({ id, tip: 'dialogue', metin });

describe('çift depolama', () => {
  it('girdi ekleniyor ve motorun beklediği biçimde okunuyor', () => {
    const doc = kur();
    M.ciftEkle(doc, { id: 'c1', tip: 'scene', metin: 'İÇ. ODA — GECE' });
    M.ciftEkle(doc, olay('c2', 'Kapı açılır.'));
    M.ciftEkle(doc, diyalog('c3', 'Gıcırtı.'));
    expect(ciftleriOku(doc)).toEqual([
      { id: 'c1', tip: 'scene', metin: 'İÇ. ODA — GECE' },
      { id: 'c2', tip: 'action', metin: 'Kapı açılır.' },
      { id: 'c3', tip: 'dialogue', metin: 'Gıcırtı.' },
    ]);
  });

  /* Girdinin YARISI diye bir şey yok: bölünmezlik yapıdan geliyor,
     korunması gereken bir davranıştan değil (§6.6). */
  it('silme girdinin TÜMÜNÜ götürüyor', () => {
    const doc = kur();
    M.ciftEkle(doc, olay('c1', 'görüntü'));
    expect(M.ciftSil(doc, 'c1')).toBe(true);
    expect(ciftleriOku(doc)).toHaveLength(0);
  });

  /* Sahne başlığı iki sütuna YAYILIR, çift yayılmaz. Tipi yerinde
     çevirmek hücrelerden birini sessizce düşürmek olurdu. */
  /* Girdinin SÜTUNU değişebilir, metni yerinde kalır: aynı cümle bazen
     yanlış sütuna yazılır ve düzeltmenin yolu silip yeniden yazmak
     olmamalı. Sahne başlığı bu yoldan geçmez — o iki sütuna yayılır,
     "sütunu" yoktur. */
  /* Kullanıcı kararı: sütun ayrı bir ayar değil, PRESETİN SONUCU.
     İkisini ayrı tutmak "sağ sütunda duran bir aksiyon" gibi tutarsız bir
     durum üretebilirdi. */
  it('preset değişince girdi ÖTEKİ SÜTUNA geçiyor, metin korunuyor', () => {
    const doc = kur();
    M.ciftEkle(doc, olay('c1', 'Kapı açılır.'));
    expect(yerlesim(ciftleriOku(doc)[0].tip).sutun).toBe('sol');
    expect(M.ciftTipiDegistir(doc, 'c1', 'dialogue')).toBe(true);
    expect(ciftleriOku(doc)[0]).toEqual({ id: 'c1', tip: 'dialogue', metin: 'Kapı açılır.' });
    expect(yerlesim('dialogue').sutun).toBe('sag');
  });

  /* Karakter, parantez ve diyalog Amerikan formattaki gibi AYRI satırlar —
     "Ali: nasıl yani" gibi tek satıra sıkıştırılmıyor. Üçü de sağ sütunda
     ama farklı girintide: okuyucu kim/nasıl/ne ayrımını biçimden yapar. */
  it('karakter, parantez ve diyalog AYRI girdiler ve hepsi sağ sütunda', () => {
    for (const t of ['character', 'parenthetical', 'dialogue']) {
      expect(yerlesim(t).sutun, t).toBe('sag');
    }
    expect(yerlesim('character').girinti)
      .toBeGreaterThan(yerlesim('parenthetical').girinti);
    expect(yerlesim('parenthetical').girinti)
      .toBeGreaterThan(yerlesim('dialogue').girinti);
  });

  it('bilinmeyen preset REDDEDİLİYOR — görünmez sütuna yazılmıyor', () => {
    const doc = kur();
    M.ciftEkle(doc, olay('c1', 'x'));
    expect(M.ciftTipiDegistir(doc, 'c1', 'yok-boyle-blok')).toBe(false);
    expect(ciftleriOku(doc)[0].tip).toBe('action');
  });

  /* Sahne başlığı İKİ SÜTUNA YAYILIR (§6.6: "ortak") — sağ ya da sol
     diye bir sorusu yok. */
  it('sahne başlığı iki sütuna yayılıyor', () => {
    expect(yerlesim('scene').sutun).toBe('tam');
  });

  it('taşıma sırayı değiştiriyor ve içeriği koruyor', () => {
    const doc = kur();
    M.ciftEkle(doc, olay('c1', 'bir'));
    M.ciftEkle(doc, olay('c2', 'iki'));
    M.ciftEkle(doc, olay('c3', 'üç'));
    expect(M.ciftTasi(doc, 'c3', 0)).toBe(true);
    expect(ciftleriOku(doc).map((c) => c.id)).toEqual(['c3', 'c1', 'c2']);
    expect(ciftleriOku(doc)[0]).toEqual(olay('c3', 'üç'));
  });

  it('olmayan çift sessizce başarılı sayılmıyor', () => {
    const doc = kur();
    expect(M.ciftSil(doc, 'yok')).toBe(false);
    expect(M.ciftGuncelle(doc, 'yok', 'x')).toBe(false);
    expect(M.ciftTipiDegistir(doc, 'yok', 'dialogue')).toBe(false);
    expect(M.ciftTasi(doc, 'yok', 0)).toBe(false);
  });
});

describe('rol denetimi', () => {
  /* Dışarıda bıraksaydık yorumcu ve İZLEYİCİ rolü iki sütunlu bir belgenin
     bütün metnini değiştirebilirdi ve sunucunun izin denetimi bunu hiç
     görmezdi — tek sütunlu `script` için verilen kararın aynısı. */
  it('çiftler KORUMALI izdüşümde', () => {
    const doc = kur();
    const once = protectedProjection(doc);
    M.ciftEkle(doc, olay('c1', 'görüntü'));
    expect(protectedProjection(doc)).not.toBe(once);
  });

  it('hücre metnini değiştirmek de izdüşümü değiştiriyor', () => {
    const doc = kur();
    M.ciftEkle(doc, olay('c1', 'görüntü'));
    const once = protectedProjection(doc);
    M.ciftGuncelle(doc, 'c1', 'başka metin');
    expect(protectedProjection(doc)).not.toBe(once);
  });
});

describe('belge tipi ve sayfalama', () => {
  const profil = tipProfili('goruntu-ses', 'a4', 'tr');

  it('tip kayıtlı ve iki sütun bayrağı açık', () => {
    expect(DOKUMAN_TIPLERI['goruntu-ses'].ikiSutun).toBe(true);
  });

  it('belgedeki çiftler ekranın sayfalayıcısına doğrudan giriyor', () => {
    const doc = kur();
    M.ciftEkle(doc, { id: 's1', tip: 'scene', metin: 'İÇ. ODA — GECE' });
    for (let i = 0; i < 30; i++) {
      M.ciftEkle(doc, olay(`c${i}`, `Görüntü ${i} — uzunca bir betim.`));
    }
    const sayfalar = sayfalaIkiSutun(ciftleriOku(doc), profil);
    expect(sayfalar.length).toBeGreaterThan(1);
    /* Sayfa sayısı TEK kaynaktan (Karar 34): ekran da PDF de bu listeyi
       kullanıyor, ikinci bir hesap yok. */
    expect(sayfalar.every((s) => s.satirlar.length > 0)).toBe(true);
  });

  /* §6.6: "Katsayı kalibre edilmeden süre gösterilmez." */
  it('süre kalibre edilmemişken null — uydurulmuş sayı üretilmiyor', () => {
    const doc = kur();
    M.ciftEkle(doc, olay('c1', 'g'));
    expect(sureTahmini(ciftleriOku(doc), { kelimeHizi: null })).toBeNull();
  });
});

describe('proje yaratılırken tip', () => {
  /* SESSİZ DÜŞÜŞ: `createProject` meta alanlarını tek tek kopyalıyor ve
     `dokumanTipi` listede yoktu — "yeni proje" diyaloğunda tür seçmek
     hiçbir zaman işe yaramamış, her proje senaryo olarak açılmıştı.
     Ekranda görülene kadar da fark edilmedi: tip yalnız açıldığında
     görünür. */
  it('seçilen doküman tipi projeye YAZILIYOR', () => {
    const p = createProject({ meta: { name: 'Belgesel', dokumanTipi: 'goruntu-ses' } });
    expect(p.meta.dokumanTipi).toBe('goruntu-ses');
  });

  it('tip belgeye kadar taşınıyor', () => {
    const doc = new Y.Doc();
    loadProjectIntoDoc(doc, createProject({ meta: { dokumanTipi: 'goruntu-ses' } }), 'load');
    expect(docToProject(doc).meta.dokumanTipi).toBe('goruntu-ses');
  });

  it('verilmezse tanımsız kalıyor — okuyucu senaryo varsayıyor', () => {
    expect(createProject().meta.dokumanTipi).toBeUndefined();
  });
});
