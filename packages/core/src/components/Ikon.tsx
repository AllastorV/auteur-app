import React from 'react';

/**
 * İkon seti — B · Kesme Masası.
 *
 * Hepsi ÇİZİLMİŞ: tek `stroke` dili, `fill: none`, yuvarlatılmış uç ve
 * birleşim. Unicode glif ya da emoji ikon yerine geçmez — farklı
 * platformlarda farklı çizilir, ağırlığı kontrol edilemez ve tasarımın
 * çizgi kalınlığına oturmaz.
 *
 * Kalınlık ölçeğe göre: 24'lük kutuda 1.7 (ince, araç çubuğu), 1.9–2.2
 * (vurgulu, birincil eylem), 2.6–3 (ok ve artı/eksi gibi saf geometri).
 */
export type IkonAdi =
  | 'menu' | 'yeni' | 'ac' | 'kaydet' | 'disa-aktar' | 'geri' | 'ileri'
  | 'ok-asagi' | 'ok-yukari' | 'eksi' | 'arti' | 'kapat' | 'odak'
  | 'sayfa' | 'baglanti' | 'onay' | 'ara' | 'im'
  | 'kilit'
  | 'sec' | 'kalem' | 'firca' | 'silgi' | 'dikdortgen' | 'elips'
  | 'cizgi' | 'oklu-cizgi' | 'cokgen' | 'metin' | 'kova' | 'kement'
  | 'damlalik' | 'el'
  /* İnce/ferah alt küme — emoji yerine geçenler (kalınlık 1.35-1.5). */
  | 'goz' | 'kilitli' | 'kilitsiz' | 'uyari' | 'oynat' | 'duraklat' | 'basa-sar' | 'nota'
  | 'ayarlar'
  /* Dışa aktarım kapsamı — emoji yerine. */
  | 'kareler' | 'sayfa-kare'
  /* Denetçi sekme başlıkları. */
  | 'grafik' | 'kadro';

const YOLLAR: Record<IkonAdi, { d: string; w?: number }> = {
  /* Sütun grafiği — analiz. Yükselen üç çubuk: ölçüm ve karşılaştırma.
     Pasta değil çünkü panonun kendisi ağırlıklı olarak çubuk ve şerit. */
  grafik: { d: 'M4 20V10M10 20V4M16 20v-7M4 20h16', w: 1.5 },
  /* İki kişi — kadro/yapım. Tek kişi 'kullanıcı' okunurdu; ikincisi
     'topluluk' anlamını taşıyor. */
  kadro: { d: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.3 2.7-5 6-5s6 1.7 6 5M17 9.5a2.2 2.2 0 100-4.4M18 20c0-2.6-1-4-2.5-4.7', w: 1.5 },
  menu: { d: 'M3 4h18v16H3zM3 9h18M8 4v16', w: 1.8 },
  /* Kaydırıcı çizgileri — dişli yerine: dişli mekanik/teknik çağrışım
     yapıyor, kaydırıcılar 'ayarlanabilir değerler' diyor ve programın
     ince çizgi diliyle aynı ailede. */
  ayarlar: { d: 'M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0M16 5v4M10 10v4M18 15v4', w: 1.5 },
  yeni: { d: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M12 12v6M9 15h6' },
  ac: { d: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z' },
  kaydet: { d: 'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8', w: 2.2 },
  'disa-aktar': { d: 'M12 3v12M7 10l5 5 5-5M4 21h16', w: 2.2 },
  /* Storyboard: üç kare, film şeridi delikleriyle. */
  kareler: { d: 'M3 6h18v12H3zM9 6v12M15 6v12M3 9h2M3 15h2M19 9h2M19 15h2', w: 1.5 },
  /* İkisi birlikte: sayfa ve karenin üst üste binmesi. */
  'sayfa-kare': { d: 'M4 3h8l4 4v8H4zM12 3v4h4M9 12h11v8H9zM14 12v8', w: 1.5 },
  geri: { d: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-4', w: 1.9 },
  ileri: { d: 'M15 14l5-5-5-5M20 9H9a5 5 0 000 10h4', w: 1.9 },
  'ok-asagi': { d: 'M6 9l6 6 6-6', w: 2.6 },
  'ok-yukari': { d: 'M6 15l6-6 6 6', w: 2.6 },
  eksi: { d: 'M5 12h14', w: 3 },
  arti: { d: 'M12 5v14M5 12h14', w: 3 },
  kapat: { d: 'M6 6l12 12M18 6L6 18', w: 2.2 },
  odak: { d: 'M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3', w: 1.9 },
  sayfa: { d: 'M5 3h14v18H5zM9 8h6M9 12h6M9 16h3', w: 1.9 },
  baglanti: { d: 'M9 7H6a5 5 0 000 10h3M15 7h3a5 5 0 010 10h-3M8 12h8', w: 1.4 },
  onay: { d: 'M20 6L9 17l-5-5', w: 2 },
  ara: { d: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3', w: 1.9 },
  im: { d: 'M6 3h12v18l-6-4-6 4z', w: 1.8 },
  kilit: { d: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4', w: 1.9 },

  /* Çizim araçları — aynı çizgi dili, aynı 24'lük kutu. */
  sec: { d: 'M5 3l14 8-6 1.6L10 19z', w: 1.8 },
  kalem: { d: 'M15 4l5 5L8 21H3v-5zM13 6l5 5', w: 1.8 },
  firca: { d: 'M6 21c0-3 2-3 2-6 0-2 1-3 3-3l7-8 3 3-8 7c0 2-1 3-3 3-3 0-3 2-4 4z', w: 1.7 },
  silgi: { d: 'M8 21H4l-1-4L14 6l5 5-8 8zM10 10l5 5', w: 1.8 },
  dikdortgen: { d: 'M3 5h18v14H3z', w: 1.8 },
  elips: { d: 'M12 19c4.4 0 8-3.1 8-7s-3.6-7-8-7-8 3.1-8 7 3.6 7 8 7z', w: 1.8 },
  cizgi: { d: 'M4 20L20 4', w: 1.9 },
  'oklu-cizgi': { d: 'M4 20L20 4M20 11V4h-7', w: 1.9 },
  cokgen: { d: 'M12 3l9 6.5-3.4 10.5H6.4L3 9.5z', w: 1.8 },
  metin: { d: 'M5 5h14M12 5v14M9 19h6', w: 1.9 },
  kova: { d: 'M6 3l9 9-7 7-8-8zM19 14c0 1.7 1.3 3 3 3', w: 1.7 },
  kement: { d: 'M12 4c5 0 9 2.7 9 6s-4 6-9 6c-1.4 0-2.7-.2-3.9-.6M8 20c-1.2-.6-2-1.4-2-2.4 0-1 .8-1.9 2-2.6', w: 1.7 },
  damlalik: { d: 'M12 3s6 7 6 10.5A6 6 0 016 13.5C6 10 12 3 12 3z', w: 1.7 },
  el: { d: 'M8 12V5.5a1.5 1.5 0 013 0V11m0-1V4.5a1.5 1.5 0 013 0V11m0-.5V6a1.5 1.5 0 013 0v8a7 7 0 01-7 7h-1a6 6 0 01-6-6v-3a1.5 1.5 0 013 0', w: 1.6 },

  /* İnce/ferah alt küme — bkz. dosya başı. */
  goz: { d: 'M1.4 12s4-7 10.6-7 10.6 7 10.6 7-4 7-10.6 7S1.4 12 1.4 12zM8.6 12a3.4 3.4 0 1 0 6.8 0 3.4 3.4 0 1 0-6.8 0', w: 1.4 },
  kilitli: { d: 'M3.6 10.4h16.8v10.2H3.6zM7.4 10.4V7a4.6 4.6 0 019.2 0v3.4', w: 1.35 },
  kilitsiz: { d: 'M3.6 10.4h16.8v10.2H3.6zM7.4 10.4V7a4.6 4.6 0 018.6-1.6', w: 1.35 },
  uyari: { d: 'M12 3.4L21.6 20.4H2.4ZM12 9.6V14M12 16.8v.01', w: 1.4 },
  /* Oynat — İÇİ BOŞ üçgen, dolu değil: bu ailenin tamamı çizgi ikonu
     (`fill="none"`, yalnız stroke) ve dolu bir üçgen yanındaki `duraklat`ın
     iki ince çubuğunun yanında ağır dururdu. Genişlik `duraklat`ınkiyle
     aynı optik alanda: 8.4–15.6 arası. */
  oynat: { d: 'M8.6 4.6 16.4 12l-7.8 7.4Z', w: 1.5 },
  duraklat: { d: 'M8.4 4.4v15.2M15.6 4.4v15.2', w: 1.5 },
  'basa-sar': { d: 'M4.4 4.4v15.2M19.6 4.4L7.6 12l12 7.6z', w: 1.4 },
  nota: { d: 'M4.4 18a2.6 2.6 0 1 0 5.2 0 2.6 2.6 0 1 0-5.2 0M9.6 18V5M9.6 5c3 .2 5 1.8 5 4.4', w: 1.4 },
};

export function Ikon({
  ad,
  boyut = 15,
  renk = 'currentColor',
  kalinlik,
  className,
}: {
  ad: IkonAdi;
  boyut?: number;
  renk?: string;
  kalinlik?: number;
  className?: string;
}) {
  const yol = YOLLAR[ad];
  return (
    <svg
      width={boyut}
      height={boyut}
      viewBox="0 0 24 24"
      fill="none"
      stroke={renk}
      strokeWidth={kalinlik ?? yol.w ?? 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path d={yol.d} />
    </svg>
  );
}
