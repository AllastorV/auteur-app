import React from 'react';
import { t, tf } from '../../dil/arayuz';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { blogaGit } from '../../store/mod';
import * as M from '../../doc/mutations';
import { YER_IMI_RENKLERI, siraliImler, type YerImiRengi } from '../../model/yerimi';

/**
 * Yer imleri çekmecesi — §13.4.
 *
 * KALICI PANEL DEĞİL: simgeyle açılıp kapanıyor ve varsayılan kapalı. Kenar
 * işareti tek başına yetmiyordu — bir nokta rengi gösterebilir, ETİKETİ
 * gösteremez; on iki imden hangisinin "Arzu'nun itirafı" olduğunu bulmanın
 * tek yolu hepsini tek tek gezmek olurdu, yani etiket ölü veri olurdu.
 *
 * Açık/kapalı durumu BELGEYE yazılmıyor, oturumluk `ui` mağazasında duruyor:
 * Yjs'e konsaydı bir yazar çekmeceyi açtığında ortak yazarın ekranında da
 * açılırdı — kendi ekranını kendi yönetemeyen bir arayüz.
 */
export function YerImleriCekmecesi() {
  const imler = useProjectStore((s) => s.yerImleri);
  const bloklar = useProjectStore((s) => s.project.script?.blocks);
  const duzenlenebilir = useProjectStore((s) => s.allowed('edit'));
  const imleç = useUiStore((s) => s.scriptCursor);

  /* Sıra BELGE KONUMUNA göre ve bayat imler süzülüyor — silinmiş bloğa ait
     im listede görünmez ama veriden de atılmaz (geri-alma yarışı). */
  const sirali = siraliImler(imler, (bloklar ?? []).map((b) => b.id));
  const metin = new Map((bloklar ?? []).map((b) => [b.id, b.text]));

  return (
    <section data-testid="yer-imleri-cekmecesi" className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-kenar-ic px-3.5 py-3">
        <span className="mzn-etiket">{t('Yer imleri')}</span>
        <span className="mzn-sayi text-[11px] text-metin-cok-zayif">{sirali.length}</span>
      </header>

      {/* Boş liste "hiç yok" DEMELİ: boş bir kutu, kullanıcıya bir şeyin
          yüklenmediğini düşündürür. */}
      {sirali.length === 0 && (
        <p className="px-3.5 py-6 text-center text-[11px] leading-relaxed text-metin-cok-zayif">
          {t('Henüz yer imi yok.')}
          <br />
          {t('Bir satırdayken')}{' '}
          <kbd className="mzn-denetim mzn-sayi px-1.5 py-0.5 text-[10px]">B</kbd> {t('ile im koy.')}
        </p>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {sirali.map((i) => (
          <li key={i.blockId} className="border-b border-kenar-ic">
            <div className="flex items-start gap-2 px-3.5 py-2.5">
              <button
                type="button"
                data-testid={`ime-git-${i.blockId}`}
                className="min-w-0 flex-1 text-left"
                onClick={() => blogaGit(i.blockId)}
              >
                {/* Etiket boşsa satırın METNİ gösteriliyor — "isimsiz" gibi
                    bir doldurma metni kullanıcıya hangi satır olduğunu
                    söylemezdi. */}
                <span className="block truncate text-[12px] text-metin-guclu">
                  {i.etiket || metin.get(i.blockId) || t('(boş satır)')}
                </span>
                <span className="mzn-sayi block text-[10px] text-metin-cok-zayif">{tf('satır %d', i.sira + 1)}</span>
              </button>
              <button
                type="button"
                data-testid={`imi-sil-${i.blockId}`}
                aria-label={t('Yer imini kaldır')}
                disabled={!duzenlenebilir}
                className="text-metin-cok-zayif transition-colors hover:text-metin disabled:opacity-40"
                onClick={() => M.yerImiKaldir(useProjectStore.getState().doc, i.blockId)}
              >
                ×
              </button>
            </div>

            <div className="flex gap-1 px-3.5 pb-2">
              {YER_IMI_RENKLERI.map((renk) => (
                <button
                  key={renk}
                  type="button"
                  data-testid={`renk-${i.blockId}-${renk}`}
                  aria-label={`Rengi ${renk} yap`}
                  aria-pressed={i.renk === renk}
                  disabled={!duzenlenebilir}
                  className="h-3 w-3 border disabled:opacity-40"
                  style={{
                    background: RENK_KODU[renk],
                    borderColor: i.renk === renk ? '#e2e8f0' : 'transparent',
                  }}
                  onClick={() =>
                    M.yerImiKoy(useProjectStore.getState().doc, i.blockId, { renk })
                  }
                />
              ))}
            </div>

            <input
              data-testid={`etiket-${i.blockId}`}
              aria-label={t('Yer imi etiketi')}
              value={i.etiket}
              disabled={!duzenlenebilir}
              placeholder={t('Etiket')}
              className="mzn-denetim mx-3.5 mb-2.5 w-[calc(100%-1.75rem)] px-1.5 py-1 text-[11px] disabled:opacity-40"
              onChange={(e) =>
                M.yerImiKoy(useProjectStore.getState().doc, i.blockId, { etiket: e.target.value })
              }
            />
          </li>
        ))}
      </ul>

      <footer className="border-t border-kenar-ic px-3.5 py-2 text-[10px] text-metin-cok-zayif">
        {imleç && imler[imleç] ? t('Bu satır imli') : t('B ile im koy · < > ile gez')}
      </footer>
    </section>
  );
}

/** Kenar işaretiyle AYNI renkler — ikisi ayrışırsa hangi im olduğu anlaşılmaz. */
const RENK_KODU: Record<YerImiRengi, string> = {
  'sarı': '#d8a41a',
  'kırmızı': '#c2453a',
  'mavi': '#3a6fc2',
  'yeşil': '#3f8f52',
  'mor': '#8a4fbf',
};
