import React, { useState } from 'react';
import { t } from '../../dil/arayuz';
import type { OturumKurtarma } from '../../veri/anlik';
import { kurtarilanSure } from '../../veri/kurtarma';
import { kurtarmaOzeti, sureMetni, type KurtarmaOzeti } from '../../veri/kurtarma-ozeti';
import * as Y from 'yjs';

/**
 * §15.3 — kurtarma penceresi.
 *
 * Program günlüğü **sessizce oynatmaz, sorar.** Üç çıkış var ve üçü de veri
 * kaybetmez:
 * - **Kurtar** — günlük oynatılmış belge kullanılır.
 * - **Farkı gör** — uygulamadan ÖNCE ne geleceği gösterilir.
 * - **Yoksay ve yedeği koru** — günlük SİLİNMEZ, `kurtarma/` altına taşınır.
 *   "Kullanıcının yanlış tuşa basması veri kaybı olmamalıdır."
 *
 * Kapatma düğmesi (X) ve dış tıklama YOK: kararsız kapatmak günlüğü belirsiz
 * bırakır. Kullanıcı üç seçenekten birini seçmek zorunda.
 */
export function RecoveryDialog({
  kurtarma,
  cipaDoc,
  onKurtar,
  onYoksay,
}: {
  kurtarma: OturumKurtarma;
  /** Günlük oynatılmadan ÖNCEki durum — fark bunun üzerine hesaplanır. */
  cipaDoc: Y.Doc;
  onKurtar: () => void;
  onYoksay: () => void;
}) {
  const [ozet, setOzet] = useState<KurtarmaOzeti | null>(null);
  const sure = sureMetni(kurtarilanSure(kurtarma), kurtarma.uygulanan);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kurtarma-baslik"
        data-testid="kurtarma-diyalogu"
        className="w-full max-w-lg border border-amber-700/50 bg-panel p-5 text-metin-guclu shadow-2xl"
      >
        <h2 id="kurtarma-baslik" className="text-base font-semibold text-amber-200">
          {t('Son oturum beklenmedik şekilde kapandı')}
        </h2>
        <p className="mt-2 text-sm">
          {t('Kaydedilmemiş')} <strong data-testid="kurtarma-sure">{sure}</strong> {t('bulundu.')}
        </p>

        {kurtarma.durum !== 'tam' && (
          <p data-testid="kurtarma-eksik" className="mt-2 text-xs text-amber-300">
            {t('Günlüğün sonu eksik')} ({kurtarma.durum === 'kirpik' ? t('yarım kalmış yazım') : t('bozuk kayıt')}).
            {t('Sağlam kısım kurtarılacak; son birkaç saniye eksik olabilir.')}
          </p>
        )}
        {kurtarma.uygulanamayan > 0 && (
          <p data-testid="kurtarma-uygulanamayan" className="mt-2 text-xs text-amber-300">
            {kurtarma.uygulanamayan} {t('güncelleme bu projeye uygulanamadı.')}
          </p>
        )}
        {kurtarma.elenen.length > 0 && (
          <p data-testid="kurtarma-elenen" className="mt-2 text-xs text-metin-zayif">
            {kurtarma.elenen.length} {t('yedek kaydı açılamadı, bir öncekine düşüldü.')}
          </p>
        )}

        {ozet && (
          <table data-testid="kurtarma-ozet" className="mt-3 w-full text-xs">
            <thead className="text-metin-zayif">
              <tr><th className="text-left font-normal">{t('Ölçü')}</th><th>{t('Şimdi')}</th><th>{t('Kurtarınca')}</th></tr>
            </thead>
            <tbody className="tabular-nums">
              {([
                [t('Panel'), 'panel'],
                [t('Senaryo satırı'), 'blok'],
                [t('Sahne'), 'sahne'],
                [t('Kelime'), 'kelime'],
              ] as const).map(([etiket, alan]) => (
                <tr key={alan} className={ozet.onceki[alan] !== ozet.sonraki[alan] ? 'text-amber-200' : ''}>
                  <td className="text-left">{etiket}</td>
                  <td className="text-center">{ozet.onceki[alan]}</td>
                  <td className="text-center">{ozet.sonraki[alan]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {ozet && !ozet.degisti && (
          <p data-testid="kurtarma-fark-yok" className="mt-2 text-xs text-metin-zayif">
            {t('Ölçülebilir bir değişiklik yok — kurtarma yalnızca küçük düzeltmeler getiriyor olabilir.')}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onKurtar}
            className="bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500"
          >
            {t('Kurtar')}
          </button>
          <button
            type="button"
            data-testid="farki-gor"
            onClick={() => setOzet(kurtarmaOzeti(cipaDoc, kurtarma.doc))}
            className="bg-denetim px-3 py-1.5 text-sm hover:bg-denetim"
          >
            {t('Farkı gör')}
          </button>
          <button
            type="button"
            data-testid="yoksay"
            onClick={onYoksay}
            className="ml-auto px-3 py-1.5 text-sm text-metin-zayif hover:bg-denetim"
          >
            {t('Yoksay ve yedeği koru')}
          </button>
        </div>
      </div>
    </div>
  );
}
