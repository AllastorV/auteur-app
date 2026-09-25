import React, { useMemo } from 'react';
import { t, tf } from '../../dil/arayuz';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { blogaGit } from '../../store/mod';
import { enUzunYokluk, senaryoyuCozumle } from '../../model/analiz';
import { Ikon } from '../Ikon';

/**
 * Analiz panosu — F4.
 *
 * ## Bitiş ölçütü: grafikten SAHNEYE tıklanabiliyor
 *
 * Bir analiz ekranı, gösterdiği şeye götürmüyorsa rapor olur, araç olmaz.
 * Her çubuk ve her karakter satırı senaryodaki yerine gider; gidiş yolu
 * `blogaGit`, yani mod kabuğunun kendi kelimesi — pano hangi modda
 * olduğumuzu bilmiyor (§7).
 *
 * ## Neden çubuk, neden sayı değil
 *
 * "Sahne 12: 340 kelime" bir yazara ritim hakkında bir şey söylemez;
 * yan yana çubuklar söyler. Sayı yine de çubuğun başlığında duruyor —
 * grafik yaklaşık, sayı kesindir.
 */
export function AnalizPanosu() {
  const bloklar = useProjectStore((s) => s.project.script?.blocks);
  const analiz = useMemo(() => senaryoyuCozumle(bloklar ?? []), [bloklar]);

  const enBuyukPay = Math.max(...analiz.sahneler.map((s) => s.pay), 0.0001);

  return (
    <section data-testid="analiz-panosu" className="flex min-h-0 flex-1 flex-col">
      {/* Sekme dar; bütün ölçüler tam ekran panelde. Bağlantı olmadan
          kullanıcı panelin varlığını yalnız menüyü tararsa öğrenirdi. */}
      <button
        type="button"
        data-testid="analiz-panele-git"
        onClick={() => useUiStore.getState().analizTamEkranAyarla(true)}
        className="mzn-denetim mx-3.5 mt-3 flex items-center justify-between border border-kenar-denetim bg-denetim px-2.5 py-1.5 text-[11px] text-metin-govde hover:border-amber hover:text-metin focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
      >
        <span className="flex items-center gap-2"><Ikon ad="grafik" boyut={14} />{t('Bütün ölçüler — analiz panosu')}</span>
        <span className="mzn-sayi text-[10px] text-metin-cok-zayif">Ctrl+Shift+A</span>
      </button>

      {analiz.sahneler.length === 0 ? (
        <p className="px-3.5 py-6 text-center text-[11px] text-metin-cok-zayif">
          {t('Çözümlenecek senaryo yok.')}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
          <p data-testid="analiz-ozet" className="mzn-sayi mb-3 text-[10px] text-metin-cok-zayif">
            {analiz.sahneler.length} {t('sahne')} · {analiz.toplamKelime} {t('kelime')} ·{' '}
            {analiz.icSahne} {t('iç')} / {analiz.disSahne} {t('dış')}
          </p>

          <h3 className="mzn-etiket mb-2 block">{t('Sahne ritmi')}</h3>
          <ul className="mb-4 space-y-1">
            {analiz.sahneler.map((s) => (
              <li key={`${s.sceneId}-${s.sira}`}>
                <button
                  type="button"
                  data-testid={`sahne-cubuk-${s.sira}`}
                  className="flex w-full items-center gap-1 text-left"
                  title={tf('%d kelime · %d diyalog / %d aksiyon', s.kelime, s.diyalogSatir, s.aksiyonSatir)}
                  onClick={() => blogaGit(s.ilkBlokId)}
                >
                  <span className="mzn-sayi w-5 shrink-0 text-right text-[10px] text-metin-cok-zayif">
                    {s.sira + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block h-2 bg-amber/70"
                      style={{ width: `${Math.max(2, (s.pay / enBuyukPay) * 100)}%` }}
                    />
                    <span className="block truncate text-[10px] text-metin-zayif">
                      {s.baslik || t('(başlıksız)')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <h3 className="mzn-etiket mb-2 block">{t('Karakterler')}</h3>
          {analiz.karakterler.length === 0 ? (
            <p className="text-[10px] text-metin-cok-zayif">{t('Konuşan karakter yok.')}</p>
          ) : (
            <ul className="space-y-1">
              {analiz.karakterler.map((k) => {
                const yokluk = enUzunYokluk(k);
                return (
                  <li key={k.ad}>
                    <button
                      type="button"
                      data-testid={`karakter-${k.ad}`}
                      className="w-full text-left"
                      onClick={() => {
                        /* Karaktere tıklamak İLK göründüğü sahneye götürüyor:
                           "bu karakter nereden giriyor" en sık sorulan soru. */
                        const sahne = analiz.sahneler[k.ilkSahne];
                        if (sahne) blogaGit(sahne.ilkBlokId);
                      }}
                    >
                      <span className="flex items-baseline justify-between gap-1">
                        <span className="truncate text-[12px] text-metin-guclu">{k.ad}</span>
                        <span className="mzn-sayi shrink-0 text-[10px] text-metin-cok-zayif">
                          {k.replik} replik · {k.kelime} kelime
                        </span>
                      </span>
                      {/* Sahne dağılımı: karakterin senaryo boyunca nerede
                          olduğunu tek bakışta gösterir. */}
                      <span className="mt-0.5 flex gap-px" data-testid={`dagilim-${k.ad}`}>
                        {analiz.sahneler.map((s) => (
                          <span
                            key={s.sira}
                            className={`h-1.5 flex-1 ${
                              k.sahneler.includes(s.sira) ? 'bg-[#5a8fd6]' : 'bg-[#2f3a47]'
                            }`}
                          />
                        ))}
                      </span>
                      {/* Uzun yokluk dramaturjik bir SORU, hata değil — o
                          yüzden uyarı gibi değil, bilgi gibi gösteriliyor. */}
                      {yokluk >= 5 && (
                        <span
                          data-testid={`yokluk-${k.ad}`}
                          className="text-[10px] text-metin-cok-zayif"
                        >
                          {yokluk} sahne boyunca yok
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
