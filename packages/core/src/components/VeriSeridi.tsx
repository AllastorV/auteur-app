import React from 'react';
import { t, tf } from '../dil/arayuz';
import { KayitDurumu, type KayitDurumuAdi } from './KayitDurumu';
import type { YaziciDurumu } from '../veri/yazici';

/**
 * §15.4 — sessiz başarısızlık yasağının arayüz yarısı.
 *
 * Üç ayrı durum, üç ayrı görünürlük düzeyi:
 * - **Koruma yok** (`durum === null`): kalıcı uyarı. Kullanıcının korunduğunu
 *   sanması, korunmamasından daha tehlikelidir.
 * - **Arka arkaya ikinci hata**: ENGELLEYİCİ şerit. "Bildirimi kaçırmak
 *   mümkündür, şeridi kaçırmak değildir."
 * - **Sağlam**: son yazımın anı her zaman görünür. "Kaydedildi mi?" sorusu
 *   kullanıcının aklına gelmemelidir.
 *
 * İlk hata burada şerit AÇMAZ — o bir bildirimdir (toast) ve çağıran tarafta
 * gösterilir; her tek seferlik hatada ekranın üstünü kapamak, şeridi
 * anlamsızlaştırırdı.
 */
export function VeriSeridi({ durum }: { durum: YaziciDurumu | null }) {
  if (durum === null) {
    return (
      <div
        data-testid="veri-korumasiz"
        role="status"
        className="shrink-0 border-b border-amber-kenar bg-amber-zemin px-3 py-1 text-center text-[11px] text-amber"
      >
        {t('Bu oturumda çökme koruması yok — yazdıkların diske günlüklenmiyor.')}
      </div>
    );
  }

  if (durum.engelleyici) {
    return (
      <div
        data-testid="veri-engelleyici"
        role="alert"
        className="shrink-0 bg-[#7a2b22] px-3 py-1.5 text-center text-[12px] font-medium text-[#ffe6e0]"
      >
        {tf('Yazdıkların diske kaydedilemiyor: %s. Projeni başka bir yere kaydet — bu pencereyi kapatma.', durum.sonHata ?? '')}
      </div>
    );
  }

  return null;
}

/**
 * Son yazımın anı — §15.4: "arayüzde HER ZAMAN görünür".
 *
 * Henüz hiç yazım olmadıysa "—" değil, ne olduğunu söyleyen bir metin:
 * boş bir gösterge kullanıcıya bir şeyin ters gittiğini düşündürür.
 */
export function SonYazim({ durum }: { durum: YaziciDurumu | null }) {
  if (durum === null) return null;
  const metin =
    durum.sonYazim === null
      ? t('günlük bekliyor')
      : `${t('günlüğe işlendi')} ${new Date(durum.sonYazim).toLocaleTimeString('tr-TR')}`;
  /* Durum RENKLE DEĞİL, renk VE BİÇİMLE söyleniyor — renk körü bir
     kullanıcı yeşili ayırmaz ama dönen yayı, tiki ve çarpıyı ayırır.
     Metin de duruyor: ikon neyin olduğunu, metin ne zaman olduğunu söyler. */
  const sorunVar = durum.engelleyici || durum.ardArdaHata > 0;
  const durumAdi: KayitDurumuAdi = sorunVar
    ? 'hata'
    : durum.bekleyen > 0
      ? 'yaziliyor'
      : 'kaydedildi';
  /* Kullanıcı kararı (2026-08-27): kelime YOK — gösterge durumu, yanındaki
     SAYI da son yazımın saatini söylüyor. Açıklama metni kaybolmadı,
     ikonun `title`/`aria-label` değerine taşındı.

     Saat `mzn-sayi` ile: projede ölçü gösteren her sayı Courier ve tabular —
     rakamlar sabit genişlikte olmasa saat her saniye milimetrik kayar ve
     yanındaki her şeyi oynatırdı. */
  const ayrinti = metin + (durum.bekleyen > 0 ? ` · ${durum.bekleyen} ${t('bekliyor')}` : '');
  const saat =
    durum.sonYazim === null
      ? null
      : new Date(durum.sonYazim).toLocaleTimeString('tr-TR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
  return (
    <span data-testid="son-yazim" className="flex items-center gap-1.5" title={ayrinti}>
      <KayitDurumu durum={durumAdi} ek={ayrinti} />
      {saat && (
        <span
          data-testid="son-yazim-saat"
          className={'mzn-sayi text-[11px] ' + (sorunVar ? 'text-amber' : 'text-metin-zayif')}
        >
          {saat}
        </span>
      )}
    </span>
  );
}
