import type { CSSProperties } from 'react';

/**
 * Senaryo sayfasının EKRAN rengi — kullanıcı kararı (2026-08-27):
 * serbest renk seçimi YOK, dört sabit seçenek var. Metin açık zeminlerde
 * siyah, koyu zeminlerde beyaz.
 *
 * YALNIZ GÖRÜNÜM: dışa aktarım (PDF, Fountain, FDX, DOCX) her zaman beyaz
 * zemine siyah yazı üretir. Bu modül o yüzden `disa/` ve `export/`
 * tarafından İTHAL EDİLMEZ — `sayfa-rengi-sinirlari.test.ts` bunu ölçüyor;
 * bir gün biri "önizleme rengiyle bassak" derse test kırılır ve karar
 * bilerek verilir.
 *
 * Renkler TEK EVDE (Karar 2): ekran stili `--mzn-kagit*` değişkenlerini
 * okuyor (format/ekran.ts, styles.css); buradaki tablo o değişkenleri
 * senaryo görünümünün kökünde ezer. styles.css'teki varsayılanlar "sepya"
 * ile birebir aynı — tablo eklenirken ekran rengi DEĞİŞMEDİ.
 */

export type SayfaRengi = 'beyaz' | 'siyah' | 'sepya' | 'gri';

export interface SayfaPaleti {
  /** Kağıdın kendisi. */
  kagit: string;
  /** Ana metin — açık zeminde siyah, koyu zeminde beyaz (kullanıcı kararı). */
  metin: string;
  /** Sönük metin: üst bilgi, sayfa numarası, yer tutucu. */
  sonuk: string;
  /** Parantez içi ve yönetmen notları. */
  parantez: string;
}

export const SAYFA_RENKLERI: Record<SayfaRengi, SayfaPaleti> = {
  /* Beyaz = bugüne kadarki tek görünüm (styles.css varsayılanları) —
     kullanıcı kararı (2026-08-27): "beyaz" bu kırık beyazdır, #ffffff
     değil; saf beyaz ekranda göz yakar ve kabuğun kâğıt dili buydu. */
  beyaz: { kagit: '#f7f5f0', metin: '#1c1a17', sonuk: '#a49d90', parantez: '#6f695e' },
  /* Gerçek sepya — sarı tonlu kâğıt (kullanıcı düzeltmesi: önceki "sepya"
     aslında kırık beyazdı). Sönük/parantez de sıcak tonda kalıyor. */
  sepya: { kagit: '#f4e8cd', metin: '#211a0f', sonuk: '#9c8a60', parantez: '#77653f' },
  /* Koyu zeminde sönük/parantez AÇIK griye döner — koyu gri koyu zeminde
     kaybolurdu; kontrast yönü zeminle birlikte terslenmek zorunda. */
  siyah: { kagit: '#121212', metin: '#f5f5f5', sonuk: '#8b8b8b', parantez: '#a8a8a8' },
  gri: { kagit: '#43464b', metin: '#ffffff', sonuk: '#a9adb3', parantez: '#c3c7cd' },
};

export const VARSAYILAN_SAYFA_RENGI: SayfaRengi = 'beyaz';

export const SAYFA_RENGI_ADLARI: Record<SayfaRengi, string> = {
  beyaz: 'Beyaz',
  siyah: 'Siyah',
  sepya: 'Sepya',
  gri: 'Gri',
};

/** Tercih dosyasından gelen ham değeri doğrular — tanınmayan değer varsayılana düşer. */
export function sayfaRengiCoz(ham: unknown): SayfaRengi {
  return typeof ham === 'string' && ham in SAYFA_RENKLERI
    ? (ham as SayfaRengi)
    : VARSAYILAN_SAYFA_RENGI;
}

/**
 * Senaryo görünümünün köküne verilecek stil — `--mzn-kagit*` değişkenlerini
 * seçilen palete çevirir. Kök öğede ezildiği için dışa aktarım kodu ve
 * diğer pencereler etkilenmez.
 */
export function sayfaRenkStili(rengi: SayfaRengi): CSSProperties {
  const p = SAYFA_RENKLERI[rengi];
  return {
    '--mzn-kagit': p.kagit,
    '--mzn-kagit-metin': p.metin,
    '--mzn-kagit-sonuk': p.sonuk,
    '--mzn-kagit-parantez': p.parantez,
  } as CSSProperties;
}
