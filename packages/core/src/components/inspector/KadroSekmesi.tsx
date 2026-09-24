import React from 'react';
import { t } from '../../dil/arayuz';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { blogaGit } from '../../store/mod';
import { karakterSatirlari, type KarakterSatiri } from '../../model/karakter';
import { lokasyonSatirlari } from '../../model/lokasyon';
import { projectActions } from '../../store/project';

/**
 * Kadro sekmesi — §13.2 (`characterinformation`, `locationinformation`, F8).
 *
 * Liste iki kaynağı BİRLEŞTİRİR: elle kaydedilmiş karakter/lokasyon
 * kayıtları (`Y.Map`, aciklama taşıyabilir) ve senaryodan OTOMATİK TOPLANAN
 * adlar (`karakterSatirlari`/`lokasyonSatirlari`). Yalnız kayıtlı olanı
 * göstermek, henüz kaydedilmemiş ama zaten konuşan bir karakteri gizlerdi;
 * yalnız senaryodakini göstermek, kullanıcının elle girdiği notu kaybederdi.
 *
 * `YerImleriCekmecesi` ile aynı desen: gezinme `blogaGit`, mod kabuğunun
 * kendi kelimesi (§7) — bu sekme hangi modda olduğumuzu bilmiyor.
 */
export function KadroSekmesi() {
  const bloklar = useProjectStore((s) => s.project.script?.blocks) ?? [];
  const karakterler = useProjectStore((s) => s.karakterler);
  const lokasyonlar = useProjectStore((s) => s.lokasyonlar);
  const dil = useUiStore((s) => s.scriptLang);
  const focusedLocationId = useUiStore((s) => s.focusedLocationId);
  const doc = useProjectStore((s) => s.doc);
  const editable = useProjectStore((s) => s.allowed('edit'));
  const focusedLocation = focusedLocationId ? lokasyonlar[focusedLocationId] : null;

  const karakterSatir = karakterSatirlari(karakterler, bloklar);
  const lokasyonSatir = lokasyonSatirlari(lokasyonlar, bloklar, dil);

  return (
    <section data-testid="kadro-sekmesi" className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
      {focusedLocation && <div data-testid="focused-location-note" className="mb-4 space-y-2 border-l-2 border-amber bg-etkin p-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-medium text-metin">{focusedLocation.ad}</h3>
          <button type="button" onClick={() => useUiStore.setState({ focusedLocationId: null })}
            aria-label={t('Kapat')} className="text-metin-zayif">×</button>
        </div>
        <label className="block text-[11px] text-metin-etiket">{t('Açıklama')}
          <textarea aria-label={t('Mekân açıklaması')} value={focusedLocation.aciklama} disabled={!editable}
            onChange={(event) => projectActions.lokasyonGuncelle(doc, focusedLocation.id, { aciklama: event.target.value })}
            className="mzn-girdi mt-1 min-h-16 w-full p-2 text-xs" /></label>
        <label className="block text-[11px] text-metin-etiket">{t('Notlar')}
          <textarea aria-label={t('Mekân notları')} value={focusedLocation.notlar} disabled={!editable}
            onChange={(event) => projectActions.lokasyonGuncelle(doc, focusedLocation.id, { notlar: event.target.value })}
            className="mzn-girdi mt-1 min-h-16 w-full p-2 text-xs" /></label>
      </div>}
      <h3 className="mzn-etiket mb-2 block">{t('Karakterler')}</h3>
      {karakterSatir.length === 0 ? (
        <p className="pb-4 text-[11px] text-metin-cok-zayif">{t('Senaryoda hiç karakter yok.')}</p>
      ) : (
        <ul className="mb-4 space-y-1">
          {karakterSatir.map((satir) => (
            <KadroSatiri key={satir.id ?? satir.ad} satir={satir} />
          ))}
        </ul>
      )}

      <h3 className="mzn-etiket mb-2 block">{t('Lokasyonlar')}</h3>
      {lokasyonSatir.length === 0 ? (
        <p className="text-[11px] text-metin-cok-zayif">{t('Senaryoda hiç sahne başlığı yok.')}</p>
      ) : (
        <ul className="space-y-1">
          {lokasyonSatir.map((satir) => (
            <li key={satir.id ?? satir.ad}>
              <button
                type="button"
                data-testid={`lokasyon-git-${satir.ad}`}
                disabled={!satir.ilkBlokId}
                className="flex w-full items-center gap-1.5 px-1 py-1 text-left disabled:opacity-40"
                onClick={() => satir.ilkBlokId && blogaGit(satir.ilkBlokId)}
              >
                <span className="mzn-sayi shrink-0 text-[9px] uppercase text-metin-cok-zayif">
                  {satir.tip === 'dis' ? 'DIŞ' : 'İÇ'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-metin-guclu">{satir.ad}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function KadroSatiri({ satir }: { satir: KarakterSatiri }) {
  return (
    <li>
      <button
        type="button"
        data-testid={`karakter-git-${satir.ad}`}
        disabled={!satir.ilkBlokId}
        className="w-full px-1 py-1 text-left disabled:opacity-40"
        onClick={() => satir.ilkBlokId && blogaGit(satir.ilkBlokId)}
      >
        <span className="block truncate text-[12px] text-metin-guclu">{satir.ad}</span>
        {satir.aciklama && (
          <span className="block truncate text-[10px] text-metin-cok-zayif">{satir.aciklama}</span>
        )}
      </button>
    </li>
  );
}
