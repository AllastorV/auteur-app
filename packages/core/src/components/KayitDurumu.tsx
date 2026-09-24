import React from 'react';
import { t } from '../dil/arayuz';

/**
 * KAYIT DURUMU — disk, çevresinde dönen yay, köşesinde sonuç rozeti.
 *
 * Kullanıcı seçimi (2026-08-27, "A4"): yazarken diskin çevresinde bir yay
 * döner; iş bitince o yay küçülerek köşedeki rozete dönüşür. Bekleme ile
 * sonuç aynı nesne — gösterge yer değiştirmez, göz onu yeniden aramaz.
 * Yazarken rozet YOK: dönen yay zaten "sürüyor" diyor, ikisi birden
 * gereksiz gürültü.
 *
 * DURUM YALNIZ RENKLE SÖYLENMİYOR. `VeriSeridi`'nin kuralı burada da
 * geçerli: renk körü bir kullanıcı yeşili yeşil görmez, ama dönen yayı,
 * tiki ve çarpıyı BİÇİM olarak ayırır. Üstüne her durumun okunabilir bir
 * adı var (`aria-label` + `title`), yani ekran okuyucu da durumu söyler.
 *
 * Hareket SVG'nin kendi zamanlamasıyla (SMIL), CSS ile değil: kabuk
 * stilleri iki ayrı `styles.css` dosyasında kopyalanmış durumda ve oraya
 * kural eklemek aynı kuralı iki yere yazmak olurdu. Bileşen kendi
 * hareketini taşıyınca kopya sorunu hiç doğmuyor.
 */

export type KayitDurumuAdi = 'yaziliyor' | 'kaydedildi' | 'hata';

/* FONKSİYON, SABİT DEĞİL — dil değişiminde donmasın diye; gerekçenin
   tamamı `i18n-kapsam.test.ts`teki `donmusCeviriler` başlığında. */
const ETIKETLER = (): Record<KayitDurumuAdi, string> => ({
  yaziliyor: t('Yazılıyor'),
  kaydedildi: t('Kaydedildi'),
  hata: t('Kaydedilemedi'),
});

const RENKLER: Record<KayitDurumuAdi, string> = {
  yaziliyor: 'var(--mzn-amber)',
  kaydedildi: 'var(--mzn-kayitli, #4fae74)',
  hata: 'var(--mzn-hata, #d8544a)',
};

/* Disk 24'lük kutuda r=11 halkanın İÇİNE sığacak şekilde çizili: gövde
   5,5–18,5 arası, sağ üstte disketin kendi pahı, üstte sürgü, altta etiket
   alanı. Halka dışarıda döndüğü için gövde büyütülemez. */
const GOVDE =
  'M6.8 5.5h9.1L18.5 8.1v9.1a1.3 1.3 0 0 1-1.3 1.3H6.8a1.3 1.3 0 0 1-1.3-1.3V6.8a1.3 1.3 0 0 1 1.3-1.3z';
const SURGU = 'M9 5.5v3.8h4.6V5.5';
const ETIKET_ALANI = 'M8.3 18.5v-5.4h7.4v5.4';
/* Yaklaşık 100°'lik yay — tam çember "bitti" der, yarım yay "sürüyor". */
const YAY = 'M12 1A11 11 0 0 1 22.83 13.91';

function hareketsizMi(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

export function KayitDurumu({
  durum,
  boyut = 16,
  ek,
}: {
  durum: KayitDurumuAdi;
  boyut?: number;
  /** Etikete eklenecek ayrıntı — örneğin son yazımın saati. */
  ek?: string;
}) {
  const [duruk] = React.useState(hareketsizMi);
  const etiketler = ETIKETLER();
  const etiket = ek ? `${etiketler[durum]} · ${ek}` : etiketler[durum];
  const kalinlik = boyut <= 18 ? 2 : 1.7;
  const zemin = 'var(--mzn-cubuk, #14171c)';

  return (
    <svg
      data-testid="kayit-durumu"
      data-durum={durum}
      width={boyut}
      height={boyut}
      viewBox="0 0 24 24"
      role="img"
      aria-label={etiket}
      style={{ color: RENKLER[durum], flexShrink: 0 }}
    >
      <title>{etiket}</title>

      <g fill="none" stroke="currentColor" strokeWidth={kalinlik} strokeLinecap="round" strokeLinejoin="round">
        <path d={GOVDE} />
        <path d={SURGU} />
        <path d={ETIKET_ALANI} />
      </g>

      {durum === 'yaziliyor' ? (
        <g fill="none" stroke="currentColor" strokeWidth={kalinlik + 0.3} strokeLinecap="round">
          <path d={YAY} />
          {!duruk && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 12 12"
              to="360 12 12"
              dur="1.05s"
              repeatCount="indefinite"
            />
          )}
        </g>
      ) : (
        /* Rozet köşede: dıştaki halka zeminle boyanıyor ki disk çizgisinden
           ayrılsın — üst üste binen iki çizgi küçük boyutta lekeye döner. */
        <g transform="translate(18 18)">
          <g>
            {!duruk && (
              <animateTransform
                attributeName="transform"
                type="scale"
                values="2.3;0.86;1"
                keyTimes="0;0.55;1"
                dur="0.42s"
                fill="freeze"
                calcMode="spline"
                keySplines="0.3 0.9 0.4 1;0.3 0.9 0.4 1"
              />
            )}
            <circle r={boyut <= 18 ? 5.8 : 5.6} fill={zemin} />
            <circle r="4.4" fill="currentColor" />
            {durum === 'kaydedildi' ? (
              <path
                d="M-2 0l1.4 1.5L2 -1.5"
                fill="none"
                stroke={zemin}
                strokeWidth={boyut <= 18 ? 1.9 : 1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <path
                d="M-1.6-1.6l3.2 3.2M1.6-1.6l-3.2 3.2"
                fill="none"
                stroke={zemin}
                strokeWidth={boyut <= 18 ? 1.9 : 1.7}
                strokeLinecap="round"
              />
            )}
          </g>
        </g>
      )}
    </svg>
  );
}
