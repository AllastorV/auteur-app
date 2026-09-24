import React from 'react';
import { RevizyonRenkSecici } from './RevizyonRenkSecici';
import { ustbilgiMetniArayuz } from '../../dil/revizyon';
import { t } from '../../dil/arayuz';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import * as M from '../../doc/mutations';
import { RENK_ZEMINI } from '../../model/revizyon';
import { revizyonIsaretleEylemi, revizyonYayinlaEylemi } from '../../model/revizyon-eylem';

/**
 * REVİZYON ŞERİDİ — senaryo biçim çubuğunda.
 *
 * Ayrı bir panel AÇILMADI (kullanıcı kararı 2026-08-29): revizyon işaretlemek
 * yazmanın içinde olan bir iş, ayrı bir pencereye gitmek akışı kesiyordu.
 *
 * Şerit YALNIZ senaryo düzenlenebilirken çiziliyor: izleyici ve yorumcu
 * rolü revizyon yayınlayamaz ve işaret koyamaz — hangi sayfaların
 * dağıtılacağını belirleyen bir karardır, işaretleme katmanına ait değil
 * (`model/projection.ts`teki kararın arayüz karşılığı).
 */
export function RevizyonSeridi({ duzenlenebilir }: { duzenlenebilir: boolean }) {
  const doc = useProjectStore((s) => s.doc);
  const showToast = useUiStore((s) => s.showToast);
  /* Şerit belge değişiminde yeniden çiziliyor; `project` referansı her
     mutasyonda tazeleniyor (`touch`). Ayrı bir abonelik kurmak aynı bilgiyi
     iki yerden okumak olurdu. */
  useProjectStore((s) => s.project);

  const etkin = M.etkinRevizyon(doc);
  const isaretler = M.revizyonIsaretleriniOku(doc);
  const kendiIsaretleri = etkin
    ? [...isaretler].filter(([, rev]) => rev === etkin.id).length
    : 0;

  /* Seçili bloklar editörün yaydığı durumdan: imleç tek bloktaysa tek
     elemanlı. İkinci bir seçim izleyici kurmak aynı bilgiyi iki yerde
     tutmak olurdu (Karar 2). */
  const secili = useUiStore((s) => s.scriptSecili);

  /* EYLEMLER ORTAK MODÜLDE: aynı ikisi Alt+M / Alt+Shift+M kısayollarından
     da çağrılıyor (`useShortcuts`). Burada ikinci bir kopya dursaydı iki yol
     ayrışırdı — şerit uyarır, kısayol sessiz kalırdı (Karar 2). */
  const yayinla = () => revizyonYayinlaEylemi(doc, showToast);
  const isaretle = () => revizyonIsaretleEylemi(doc, secili, showToast);

  if (!duzenlenebilir) return null;

  return (
    <div
      data-testid="revizyon-seridi"
      className="flex shrink-0 items-center gap-1.5 text-[11px] text-metin-govde"
    >
      {etkin ? (
        <>
          <RevizyonRenkSecici renk={etkin.renk} onChange={(renk) => {
            if (useProjectStore.getState().allowed('edit')) M.revizyonRenginiDegistir(doc, renk);
          }} />
          <span
            aria-hidden
            data-testid="serit-renk"
            className="hidden h-3 w-3 rounded-sm border border-cizgi xl:inline-block"
            style={{
              background: `rgb(${RENK_ZEMINI[etkin.renk].map((k) => Math.round(k * 255)).join(',')})`,
            }}
          />
          <span data-testid="serit-ad" className="hidden font-medium xl:inline">
            {ustbilgiMetniArayuz(etkin)}
          </span>
          <span className="hidden text-metin-sonuk 2xl:inline" data-testid="serit-sayi">
            {kendiIsaretleri} {t('işaretli satır')}
          </span>
          <button
            type="button"
            data-testid="serit-isaretle"
            onClick={isaretle}
            className="mzn-denetim whitespace-nowrap px-2 py-1"
          >
            {t('Seçimi işaretle')}
          </button>
        </>
      ) : (
        <span className="hidden text-metin-sonuk xl:inline" data-testid="serit-yok">
          {t('Revizyon yok')}
        </span>
      )}
      <button
        type="button"
        data-testid="serit-yayinla"
        onClick={yayinla}
        className="mzn-denetim whitespace-nowrap px-2 py-1"
      >
        {t('Revizyon yayınla')}
      </button>
    </div>
  );
}
