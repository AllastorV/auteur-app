import React, { useMemo, useState } from 'react';
import { t } from '../../dil/arayuz';
import { useProjectStore } from '../../store/project';
import { moduDegistir } from '../../store/mod';
import { panelSize } from '../../data/aspect';
import { PanelThumbnail } from '../grid/PanelThumbnail';
import type { ScriptFilter } from '../../store/ui';
import { galeriPanelleriSuz, galeriSahneleri } from './galeriFiltre';
import { Ikon } from '../Ikon';

/* FONKSİYON, SABİT DEĞİL — dil değişiminde donmasın diye.
   Kabuk dili değişince ağacı `key` ile yeniden kuruyor ama modül
   kapsamındaki bir sabit yalnız İÇE AKTARIMDA bir kez değerlendirilir:
   `t()` orada çağrılırsa metin ilk dilde çakılı kalır. Oturum içinde
   tr→en yapan kullanıcı bu tabloyu Türkçe görüyordu (ölçüldü 2026-08-31).
   Render sırasında çağrılan bir fonksiyon her kurulumda yeniden okur. */
const FILTRELER = (): { id: ScriptFilter; label: string }[] => [
  { id: 'all', label: t('Tümü') },
  { id: 'linked', label: t('Bağlı') },
  { id: 'unlinked', label: t('Bağsız') },
];

/**
 * Görsel galerisi (F8 — STARC `imagesgallery`, §13.2).
 *
 * Bütün panellerin büyük önizlemeli ızgarası: hızlı gezinme ve seçim.
 * Küçük resim `PanelThumbnail`DEN geliyor — burada yeniden ÇİZİLMİYOR,
 * yalnız ÇAĞRILIYOR (Karar 2). `PanelThumbnail` kendi `IntersectionObserver`
 * kapısını taşıyor: yüz panellik bir projede Konva sahnesi yalnız
 * GÖRÜNÜR olan kartlar için kurulur — büyük projede takılmama ölçütü
 * burada yeniden yazılmadan, o kapıya bedavaya biniyor (ölçüldü, bkz.
 * `packages/core/tests/galeri.test.tsx`: 500 panelde filtre ızgarası
 * `PanelThumbnail`ın kendisini değil yalnız KABUĞUNU kuruyor).
 *
 * Bir panele tıklamak panoya geçirir — `moduDegistir` ÜZERİNDEN (§7):
 * galeri storyboard modunun adını bilmiyor, yalnız "şu paneli aç" diyor.
 */
export function Gallery() {
  const panels = useProjectStore((s) => s.project.panels);
  const setActivePanel = useProjectStore((s) => s.setActivePanel);
  const activePanelId = useProjectStore((s) => s.activePanelId);

  const [filtre, setFiltre] = useState<ScriptFilter>('all');
  const [sahne, setSahne] = useState<string | null>(null);

  const sahneler = useMemo(() => galeriSahneleri(panels), [panels]);
  const gorunenler = useMemo(
    () => galeriPanelleriSuz(panels, filtre, sahne),
    [panels, filtre, sahne],
  );

  const ac = (panelId: string) => {
    // Sıra ScriptNavigator/PanelGrid'le AYNI: hedef panel önce yazılır,
    // mod değişimi SONRA — ikisi de aynı ekseni (boardId) paylaştığı için
    // `eksenUygula` az önce yazılan hedefi türetir, ezmez.
    setActivePanel(panelId);
    moduDegistir('board');
  };

  return (
    <div className="h-full overflow-y-auto bg-sayfa-alani p-5" data-testid="galeri">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {FILTRELER().map((f) => (
            <button
              key={f.id}
              type="button"
              data-testid={`galeri-filtre-${f.id}`}
              aria-pressed={filtre === f.id}
              onClick={() => setFiltre(f.id)}
              className={
                'px-2 py-0.5 text-[11px] transition-colors '
                + (filtre === f.id ? 'mzn-etkin' : 'mzn-denetim')
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        {sahneler.length > 0 && (
          <select
            data-testid="galeri-sahne-sec"
            aria-label={t('Sahneye göre süz')}
            value={sahne ?? ''}
            onChange={(e) => setSahne(e.target.value || null)}
            className="mzn-denetim px-2 py-1 text-[11px]"
          >
            <option value="">{t('Tüm sahneler')}</option>
            {sahneler.map((s) => (
              <option key={s} value={s}>{t('Sahne')} {s}</option>
            ))}
          </select>
        )}

        <span className="mzn-sayi ml-auto text-[11px] text-metin-cok-zayif">
          {gorunenler.length}/{panels.length} panel
        </span>
      </div>

      {!gorunenler.length ? (
        <p className="p-8 text-center text-[11px] text-metin-cok-zayif">{t('Bu filtreye uyan panel yok.')}</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {gorunenler.map((panel) => {
            const aktif = panel.id === activePanelId;
            return (
              <article
                key={panel.id}
                data-testid="galeri-karti"
                role="button"
                tabIndex={0}
                onClick={() => ac(panel.id)}
                onKeyDown={(e) => e.key === 'Enter' && ac(panel.id)}
                className={
                  'cursor-pointer border bg-panel p-2 transition-colors '
                  + (aktif ? 'border-amber bg-etkin' : 'border-kenar-ic hover:border-kenar-denetim')
                }
              >
                <div className="mb-1 flex items-center justify-between text-[10px] text-metin-zayif">
                  <span className="font-semibold text-metin-guclu">
                    S{panel.meta.scene}·C{panel.meta.shot}
                    {panel.scriptRefs.length > 0 && (
                      <span className="ml-1 text-amber" title={t('Senaryoya bağlı')}><Ikon ad="baglanti" boyut={11} /></span>
                    )}
                  </span>
                  <span>{panel.meta.duration.toFixed(1)}s</span>
                </div>
                <PanelThumbnail panel={panel} frame={panelSize(panel.guides.aspect)} width={220} />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
