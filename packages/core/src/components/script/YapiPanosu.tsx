import React, { useMemo } from 'react';
import { useProjectStore } from '../../store/project';
import { blogaGit } from '../../store/mod';
import { useSenaryoProfili } from '../../hooks/useSenaryoProfili';
import { DOKUMAN_TIPLERI, dokumanTipi } from '../../model/dokuman-tipi';
import { yapiIstatistigiCikar } from '../../model/yapi';
import { arayuzDili, t, tf } from '../../dil/arayuz';

/**
 * Yapı panosu — F7 (§13.1 "Yapı" / "İstatistik" sütunları, AÇIK KALAN kısmı).
 *
 * `AnalizPanosu`'nun deseni: her satır bloğa gider (`blogaGit`), her sayı
 * gösterdiği şeyin kendisidir. Fark, birimin ne olduğu tipe göre değişiyor —
 * senaryoda sahne, romanda bölüm, çizgi romanda sayfa, sahne oyununda perde —
 * ve etiket sabit yazılmıyor, `tip.yapiAdi`'ndan geliyor.
 */
export function YapiPanosu() {
  const bloklar = useProjectStore((s) => s.project.script?.blocks) ?? [];
  const tipAdi = useProjectStore((s) => s.project.meta.dokumanTipi);
  const tip = dokumanTipi(tipAdi) ?? DOKUMAN_TIPLERI.senaryo;
  const { profil } = useSenaryoProfili();

  const istatistik = useMemo(
    () => yapiIstatistigiCikar(bloklar, tip, profil),
    [bloklar, tip, profil],
  );

  const enBuyukSayfa = Math.max(...istatistik.birimler.map((b) => b.sayfa), 0.0001);

  return (
    <section data-testid="yapi-panosu" className="flex min-h-0 flex-1 flex-col">
      {istatistik.toplamBirim === 0 ? (
        <p className="px-3.5 py-6 text-center text-[11px] text-metin-cok-zayif">
          {t('Çözümlenecek yapı yok.')}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
          <p data-testid="yapi-ozet" className="mzn-sayi mb-1 text-[10px] text-metin-cok-zayif">
            {istatistik.toplamBirim} {t(tip.yapiAdi)} · {istatistik.toplamKelime} {t('kelime')} ·{' '}
            {istatistik.toplamSayfa} {t('sayfa')}
          </p>
          <p className="mzn-sayi mb-3 text-[10px] text-metin-cok-zayif">
            {t('ortalama')} {istatistik.ortalamaSayfa.toFixed(1)} {t('sayfa')}/{t(tip.yapiAdi).toLocaleLowerCase(arayuzDili())}
            {istatistik.enUzun && istatistik.enKisa && (
              <>
                {' '}· {t('en uzun')} {t(istatistik.enUzun.ad)} ({istatistik.enUzun.sayfa} {t('sayfa')}) · {t('en kısa')}{' '}
                {t(istatistik.enKisa.ad)} ({istatistik.enKisa.sayfa} {t('sayfa')})
              </>
            )}
          </p>

          <h3 className="mzn-etiket mb-2 block">{t(tip.yapiAdi)} {t('listesi')}</h3>
          <ul className="space-y-1">
            {istatistik.birimler.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  data-testid={`yapi-birim-${b.sira}`}
                  className="flex w-full items-center gap-1 text-left"
                  title={tf('%d blok · %d kelime', b.blokSayisi, b.kelime)}
                  onClick={() => blogaGit(b.ilkBlokId)}
                >
                  <span className="mzn-sayi w-5 shrink-0 text-right text-[10px] text-metin-cok-zayif">
                    {b.sira + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block h-2 bg-amber/70"
                      style={{ width: `${Math.max(2, (b.sayfa / enBuyukSayfa) * 100)}%` }}
                    />
                    <span className="flex items-baseline justify-between gap-1">
                      <span className="truncate text-[10px] text-metin-zayif">{t(b.ad)}</span>
                      <span className="mzn-sayi shrink-0 text-[10px] text-metin-cok-zayif">
                        {b.sayfa} {t('sayfa')}
                        {/* Süre YALNIZ sayfa=dakika sözleşmesi geçerli tiplerde (§6.2) —
                            romanda göstermek yazara olmayan bir bilgi vermek olurdu. */}
                        {tip.sayfaDakika && <> · ~{b.sayfa} {t('dk')}</>}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
