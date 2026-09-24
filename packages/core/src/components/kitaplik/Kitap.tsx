import React from 'react';
import type { RecentProject } from '../../platform/types';
import { DOKUMAN_TIPLERI, dokumanTipi } from '../../model/dokuman-tipi';
import { varsayilanKapak } from './kapaklar';

/** Kitap ölçüsü — 148 planlar şeridindeki küçük resimle AYNI genişlik. */
const EN = 148;
const BOY = 208;
/** Kapak resminin yüksekliği; kalanı ad bandı. */
const RESIM_BOY = 130;

/**
 * Bir proje — kitap olarak.
 *
 * ## Neden kitap
 *
 * Kullanıcı istedi ("projeler kitap gibi görünsün") ama metafor bu programda
 * zaten doğru: burada yazılan şey bir senaryo, bir roman, bir tiyatro
 * metnidir. Rafta duran şeyler dosya değil, YAZILMIŞ ŞEYLER.
 *
 * ## Kapak + ad bandı
 *
 * Kapak resmi üstte, ad ALTTA kendi bandında duruyor. Adı resmin üstüne
 * bindirmek her kapakta ayrı bir okunabilirlik sorunu açardı — çizim koyu
 * bir yere denk geldiğinde ad kaybolurdu. Bant her zaman aynı zemin, ad her
 * zaman okunur.
 *
 * ## Renk İCAT EDİLMEDİ
 *
 * Yedi belge tipine yedi renk uydurmak DESIGN.md'nin "yeni renk icat
 * edilmez" kuralını çiğnerdi. Bütün ciltler aynı koyu bez; ayrım kapağın
 * KOMPOZİSYONUNDAN geliyor. Tek amber, tek işe ayrıldı: **en son açılan
 * kitabın şeridi** — "kaldığın yer" başka hiçbir şeyle karışmasın.
 *
 * Sırt gerçek: 9px'lik daha koyu şerit ve sağında 1px menteşe çizgisi.
 * Yalnız kapak olsaydı kart olurdu, kitap değil.
 */
export function Kitap({
  proje,
  sonAcilan,
  onAc,
}: {
  proje: RecentProject;
  sonAcilan: boolean;
  onAc: () => void;
}) {
  const tarih = new Date(proje.openedAt);
  const tip = dokumanTipi(proje.tip) ?? DOKUMAN_TIPLERI.senaryo;

  return (
    <div className="flex flex-col items-start border-b border-kenar px-5 pb-5 pt-6">
      <button
        type="button"
        data-testid={`kitap-${proje.path}`}
        onClick={onAc}
        title={proje.path}
        className="mzn-kitap group relative block overflow-hidden border border-kenar bg-panel text-left transition-[transform,border-color] duration-[160ms] ease-[cubic-bezier(.32,.72,0,1)] hover:-translate-y-[3px] hover:border-amber"
        style={{ width: EN, height: BOY }}
      >
        {/* KAPAK — kullanıcının görseli varsa o, yoksa tipine göre çizilmiş
            varsayılan. Kitap hiçbir zaman boş cilt olarak durmuyor. */}
        {/* Kapak da AÇIKÇA konumlanıyor: `<button>` içeriğini dikey
            ortalıyor ve akışa bırakılan kapak 39px aşağı kayıp bandın
            altında kesiliyordu (ÖLÇÜLDÜ: kapak.y = 39, (208-130)/2).
            Kitabın üç parçası da — kapak, sırt, bant — mutlak. */}
        <span
          className="absolute inset-x-0 top-0 block"
          style={{ height: RESIM_BOY }}
          data-testid="kitap-kapak"
        >
          {proje.kapak ? (
            <img
              src={proje.kapak}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            varsayilanKapak(proje.tip, proje.path)
          )}
        </span>

        {/* SIRT — kapaktan daha koyu, sağında menteşe çizgisi. Kapak
            resminin ÜSTÜNDE: cilt resmin üzerine kapanır. */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[9px] border-r border-kenar-denetim bg-kutu"
        />

        {/* Şerit yalnız en son açılanda: "kaldığın yer". */}
        {sonAcilan && (
          <span
            aria-hidden
            data-testid="kitap-serit"
            className="absolute left-[26px] top-0 h-[26px] w-[3px] bg-amber"
          />
        )}

        <span
          className="absolute inset-x-0 bottom-0 flex flex-col justify-center gap-1 border-t border-kenar-ic bg-panel py-2.5 pl-[22px] pr-3"
          style={{ height: BOY - RESIM_BOY }}
        >
          <span className="line-clamp-2 text-[13px] leading-[1.25] text-metin">{proje.name}</span>
          <span className="mzn-etiket">{tip.ad}</span>
        </span>
      </button>

      {/* Tarih kapağın DIŞINDA: kitabın üstüne basılan bir şey değil,
          rafta duran nesne hakkında bir not. */}
      <time
        className="mzn-sayi mt-2 block text-[10px] text-metin-cok-zayif"
        dateTime={tarih.toISOString()}
      >
        {tarih.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
      </time>
    </div>
  );
}

export const KITAP_EN = EN;
