/**
 * DENETÇİ SEKMELERİ İKİ KADEMELİ — 9 sekme 300 px'e sığmıyordu.
 *
 * Tek satırda dokuz `flex-1` düğme sekme başına ~31 px bırakıyor ve
 * etiketler kırpılıyordu (kullanıcı bildirimi 2026-08-30: "sağ tab çok
 * kalabalık oldu"). Çözüm bir düzen hilesi değil, KONU BİRLEŞTİRME: benzer
 * alandaki bölümler tek başlık altında toplandı (kullanıcı: "benzer
 * alandaki ayarları tek tabda topla", "örn writinge marks girebilir",
 * "dünya da yazımın altına girsin").
 *
 * ÜYE KİMLİKLERİ DEĞİŞMEDİ. Gruplama yalnız bir GÖRÜNÜM katmanı; mağazadaki
 * `inspectorTab` hâlâ dokuz değerden biri. Böylece kayıtlı tercih, derin
 * bağlantı ve mevcut testler olduğu gibi çalışmayı sürdürüyor — grup kimliği
 * depoya yazılsaydı bir göç borcu doğardı.
 *
 * Adlar burada TÜRKÇE duruyor ve `t()` ile SARILMIYOR: burası tanım yeri,
 * kullanım yeri değil (`ROLE_LABELS` ile aynı desen). Sarma yükümlülüğü
 * çizen bileşende; `i18n-veri-tablolari` testi ikisini de denetliyor.
 */

/**
 * Denetçi bölümü kimlikleri. Tür BURADA yaşıyor, mağazada değil: grup
 * tablosu ile mağaza alanı aynı kümeden beslenmek zorunda ve iki ayrı
 * yerde yazılsalardı biri değişince öteki sessizce eskirdi (Karar 2).
 */
export type SekmeId =
  | 'sahne' | 'yazim' | 'imler' | 'dunya'
  | 'analiz' | 'yapi' | 'kadro' | 'dokum' | 'cop';

export interface SekmeGrubu {
  id: string;
  ad: string;
  /** Başlıktaki çizgi ikon — `IkonAdi` üyesi (bileşen çözüyor). */
  ikon: string;
  /** Grubun bölümleri. İlki, gruba tıklanınca açılan bölümdür. */
  uyeler: readonly SekmeId[];
}

export const SEKME_GRUPLARI: readonly SekmeGrubu[] = [
  { id: 'sahne', ad: 'Sahne', ikon: 'sayfa', uyeler: ['sahne'] },
  { id: 'yazim', ad: 'Yazım', ikon: 'kalem', uyeler: ['yazim', 'imler', 'dunya'] },
  { id: 'analiz', ad: 'Analiz', ikon: 'grafik', uyeler: ['analiz', 'yapi'] },
  { id: 'yapim', ad: 'Yapım', ikon: 'kadro', uyeler: ['kadro', 'dokum', 'cop'] },
];

/** Alt şeritteki bölüm adları — üstte grup adı, altta bölüm adı. */
export const SEKME_ADLARI: Record<SekmeId, string> = {
  sahne: 'Sahne', yazim: 'Yazım', imler: 'İmler', dunya: 'Dünya',
  analiz: 'Analiz', yapi: 'Yapı', kadro: 'Kadro', dokum: 'Döküm', cop: 'Çöp',
};

/** Bölümün ait olduğu grup. Tanınmayan bölüm ilk gruba düşer. */
export function sekmeGrubu(sekme: SekmeId): SekmeGrubu {
  return SEKME_GRUPLARI.find((g) => g.uyeler.includes(sekme)) ?? SEKME_GRUPLARI[0];
}
