import React, { useState } from 'react';
import { t } from '../../dil/arayuz';
import { Ikon } from '../Ikon';
import { KisayolTablosu } from './ShortcutsDialog';
import { konular, type Parca, type YardimKomutu } from '../../yardim/icerik';

/**
 * YARDIM — kod bilmeyen kullanıcı için, tam ekran panel.
 *
 * Kullanıcı kararı (2026-08-27): "net, kolay anlaşılır ve gerçekten
 * problemi çözmeye yönelik." Yardım menüsünde önceden yalnız iki madde
 * vardı: klavye kısayolları ve bir web bağlantısı. İkisi de bir soruna
 * düşmüş kullanıcıya yardım etmiyordu.
 *
 * ## Yapısı Ayarlar'la AYNI
 *
 * Solda konu listesi, sağda içerik, üstte geri oku. Aynı kabuk iki yerde
 * ayrı ayrı tasarlanmadı: kullanıcı bir kez öğrendiği yeri ikincisinde
 * yeniden öğrenmek zorunda kalmıyor.
 *
 * ## Metin DEĞİL, davranış
 *
 * Konuların çoğu bir DÜĞMEYLE bitiyor: "Geri dönüş noktalarını aç",
 * "Bu ayarları aç". Bir yardım sayfasının en iyi hâli, kendisini
 * okutmadan sorunu çözmesidir — okuyup sonra pencereyi kendi aramak
 * zorunda kalan kullanıcı iki kez çalışır.
 *
 * İçerik `yardim/icerik.ts`te ve SAF: React bilmiyor, metin ile eylem
 * adından ibaret. Hangi pencerenin açılacağına burası karar veriyor.
 */

export interface YardimPaneliProps {
  onClose: () => void;
  /**
   * Yardımdaki bir düğme tıklandığında çağrılır. Kabuk hangi pencerenin
   * açılacağını bilir; yardım metni bilmez.
   */
  onKomut?: (komut: YardimKomutu) => void;
  /** Açılışta gösterilecek konu — bağlama duyarlı yardım için. */
  baslangicKonusu?: string;
}

function ParcaCiz({ parca, onKomut }: { parca: Parca; onKomut?: (k: YardimKomutu) => void }) {
  switch (parca.tip) {
    case 'cevap':
      /* İLK CÜMLE CEVAPTIR: panikleyen kullanıcı ilk satırdan sonrasını
         okumaz, o yüzden görsel olarak da ayrılıyor. */
      return (
        <p className="text-[15px] font-medium leading-relaxed text-metin-guclu">{parca.metin}</p>
      );
    case 'p':
      return <p className="text-[13px] leading-relaxed text-metin-govde">{parca.metin}</p>;
    case 'liste':
      return (
        <ul className="space-y-1.5">
          {parca.maddeler.map((m) => (
            <li key={m} className="flex gap-2 text-[13px] leading-relaxed text-metin-govde">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-amber" />
              <span>{m}</span>
            </li>
          ))}
        </ul>
      );
    case 'adimlar':
      return (
        <ol className="space-y-1.5">
          {parca.maddeler.map((m, i) => (
            <li key={m} className="flex gap-2.5 text-[13px] leading-relaxed text-metin-govde">
              <span className="mzn-sayi mt-[1px] shrink-0 text-[11px] text-amber">{i + 1}.</span>
              <span>{m}</span>
            </li>
          ))}
        </ol>
      );
    case 'uyari':
      /* Amber şerit: veri kaybı ya da sürpriz üreten bir davranış. Metnin
         içinde kaybolmasın diye kendi kutusunda. */
      return (
        <p className="border-l-2 border-amber bg-amber-zemin/10 px-3 py-2 text-[12px] leading-relaxed text-metin-govde">
          {parca.metin}
        </p>
      );
    case 'eylem':
      return (
        <button
          type="button"
          data-testid={`yardim-eylem-${parca.komut}`}
          onClick={() => onKomut?.(parca.komut)}
          className="mzn-denetim inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px]"
        >
          {parca.etiket}
          <span aria-hidden>→</span>
        </button>
      );
  }
}

export function YardimPaneli({ onClose, onKomut, baslangicKonusu }: YardimPaneliProps) {
  const liste = konular();
  const [secili, setSecili] = useState(baslangicKonusu ?? liste[0].id);
  const konu = liste.find((k) => k.id === secili) ?? liste[0];

  return (
    <div
      data-testid="yardim-paneli"
      className="fixed inset-0 z-[80] flex flex-col bg-zemin text-metin-guclu"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      tabIndex={-1}
      role="region"
      aria-label={t('Yardım')}
    >
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-kenar bg-panel px-4">
        <button
          type="button"
          data-testid="yardim-kapat"
          onClick={onClose}
          title={t('Geri')}
          aria-label={t('Geri')}
          className="mzn-denetim flex h-8 w-8 items-center justify-center"
        >
          <Ikon ad="geri" boyut={16} />
        </button>
        <span className="text-[14px] font-medium tracking-wide">{t('Yardım')}</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-[240px] shrink-0 overflow-y-auto border-r border-kenar bg-panel px-3 py-4">
          {liste.map((k) => (
            <button
              key={k.id}
              type="button"
              data-testid={`yardim-konu-${k.id}`}
              onClick={() => setSecili(k.id)}
              aria-current={k.id === secili}
              className={
                'block w-full px-2 py-2 text-left text-[12px] transition-colors '
                + (k.id === secili
                  ? 'bg-etkin text-metin'
                  : 'text-metin-zayif hover:bg-etkin/60 hover:text-metin')
              }
            >
              {k.ad}
            </button>
          ))}
          {/* Kısayollar listenin SONUNDA ve ayrı: bir sorun değil, bir
              başvuru tablosu — konularla aynı kutuda durmamalı. */}
          <button
            type="button"
            data-testid="yardim-konu-kisayollar"
            onClick={() => setSecili('kisayollar')}
            aria-current={secili === 'kisayollar'}
            className={
              'mt-2 block w-full border-t border-kenar-ic px-2 pb-2 pt-3 text-left text-[12px] transition-colors '
              + (secili === 'kisayollar'
                ? 'bg-etkin text-metin'
                : 'text-metin-zayif hover:bg-etkin/60 hover:text-metin')
            }
          >
            {t('Klavye kısayolları')}
          </button>
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="max-w-[680px]">
            {secili === 'kisayollar' ? (
              <>
                <h2 className="mb-5 text-[18px] font-medium">{t('Klavye kısayolları')}</h2>
                <KisayolTablosu />
              </>
            ) : (
              <>
                <h2 data-testid="yardim-baslik" className="mb-5 text-[18px] font-medium">
                  {konu.baslik}
                </h2>
                <div className="space-y-4">
                  {konu.parcalar.map((p, i) => (
                    <ParcaCiz key={i} parca={p} onKomut={onKomut} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
