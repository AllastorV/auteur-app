import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../dil/arayuz';
import { useProjectStore, projectActions } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { panelSize } from '../../data/aspect';
import { DND_MIME, readDragPayload } from '../dnd';
import { linkBlocksToPanel } from '../../store/script';
import type { Panel } from '../../model/types';
import { PanelThumbnail } from './PanelThumbnail';
import { moduDegistir } from '../../store/mod';
import { Ikon } from '../Ikon';
import { galeriPanelleriSuz, galeriSahneleri } from '../gallery/galeriFiltre';
import type { ScriptFilter } from '../../store/ui';
import { insertionIndex } from '../../model/panel-order';

const COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  4: 'grid-cols-2',
  6: 'grid-cols-3',
  9: 'grid-cols-3',
};

const FILTRELER = (): { id: ScriptFilter; label: string }[] => [
  { id: 'all', label: t('Tümü') },
  { id: 'linked', label: t('Bağlı') },
  { id: 'unlinked', label: t('Bağsız') },
];

/** Grid görünümü — sayfa başına 1/2/4/6/9 panel, sürükleyerek sıralama. */
export function PanelGrid({ editable }: { editable: boolean }) {
  const project = useProjectStore((s) => s.project);
  const doc = useProjectStore((s) => s.doc);
  const activePanelId = useProjectStore((s) => s.activePanelId);
  const setActivePanel = useProjectStore((s) => s.setActivePanel);
  const setUi = useUiStore((s) => s.set);
  const [dragPanelId, setDragPanelId] = useState<string | null>(null);
  const [overGap, setOverGap] = useState<number | null>(null);
  const cardsRoot = useRef<HTMLDivElement>(null);
  const oldRects = useRef(new Map<string, { x: number; y: number }>());
  const [filtre, setFiltre] = useState<ScriptFilter>('all');
  const [sahne, setSahne] = useState<string | null>(null);
  const sahneler = useMemo(() => galeriSahneleri(project.panels), [project.panels]);
  const gorunenler = useMemo(
    () => galeriPanelleriSuz(project.panels, filtre, sahne),
    [project.panels, filtre, sahne],
  );

  const perPage = project.settings.panelsPerPage;
  // Her panelin kendi en-boy oranı olabilir; proje ayarına sabitlemek
  // küçük resmi canvas'ta görünenden farklı gösterir.

  const pages = useMemo(() => {
    const out: Panel[][] = [];
    for (let i = 0; i < gorunenler.length; i += perPage) {
      out.push(gorunenler.slice(i, i + perPage));
    }
    return out.length ? out : [[]];
  }, [gorunenler, perPage]);

  /* FLIP: sıralama kaydedildiğinde kartlar yeni konumlarına kayar.
     DOM sırası doğru kalır; animasyon yalnız görseldir. */
  useLayoutEffect(() => {
    const next = new Map<string, { x: number; y: number }>();
    cardsRoot.current?.querySelectorAll<HTMLElement>('[data-panel-id]').forEach((el) => {
      const id = el.dataset.panelId;
      if (!id) return;
      const rect = el.getBoundingClientRect();
      const previous = oldRects.current.get(id);
      if (previous && typeof el.animate === 'function') {
        const dx = previous.x - rect.x;
        const dy = previous.y - rect.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          el.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
            { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' },
          );
        }
      }
      next.set(id, { x: rect.x, y: rect.y });
    });
    oldRects.current = next;
  }, [gorunenler, perPage]);

  const onDrop = useCallback(
    (gap: number, movingId: string | null) => {
      if (!movingId || !editable) return;
      const index = insertionIndex(
        project.panels.map((panel) => panel.id),
        gorunenler.map((panel) => panel.id),
        movingId,
        gap,
      );
      projectActions.movePanel(doc, movingId, index);
      setDragPanelId(null);
      setOverGap(null);
    },
    [project.panels, gorunenler, doc, editable],
  );

  return (
    <div ref={cardsRoot} className="h-full overflow-y-auto bg-sayfa-alani p-5" data-testid="cards">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mzn-etiket">{t('Sayfa başına')}</span>
        <div className="flex">
          {[1, 2, 4, 6, 9].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={perPage === n}
              onClick={() => projectActions.updateSettings(doc, { panelsPerPage: n as 1 | 2 | 4 | 6 | 9 })}
              className={
                'mzn-sayi w-7 py-0.5 text-center text-[11px] ' +
                (perPage === n ? 'mzn-etkin' : 'mzn-denetim')
              }
            >
              {n}
            </button>
          ))}
        </div>
        <button
          type="button"
          data-testid="cards-add"
          disabled={!editable}
          onClick={() => projectActions.addPanel()}
          className="mzn-denetim ml-auto px-3 py-1 text-xs disabled:opacity-40"
        >
          {t('Panel ekle')}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2" aria-label={t('Kart filtreleri')}>
        <div className="flex gap-1">
          {FILTRELER().map((f) => (
            <button key={f.id} type="button" data-testid={`cards-filter-${f.id}`}
              aria-pressed={filtre === f.id} onClick={() => setFiltre(f.id)}
              className={'px-2 py-0.5 text-[11px] transition-colors ' +
                (filtre === f.id ? 'mzn-etkin' : 'mzn-denetim')}>
              {f.label}
            </button>
          ))}
        </div>
        {sahneler.length > 0 && (
          <select data-testid="cards-scene-select" aria-label={t('Sahneye göre süz')}
            value={sahne ?? ''} onChange={(e) => setSahne(e.target.value || null)}
            className="mzn-denetim px-2 py-1 text-[11px]">
            <option value="">{t('Tüm sahneler')}</option>
            {sahneler.map((s) => <option key={s} value={s}>{t('Sahne')} {s}</option>)}
          </select>
        )}
        <span className="mzn-sayi ml-auto text-[11px] text-metin-cok-zayif">
          {gorunenler.length}/{project.panels.length} {t('panel')}
        </span>
      </div>

      {gorunenler.length === 0 && (
        <p className="p-8 text-center text-[11px] text-metin-cok-zayif">
          {t('Bu filtreye uyan panel yok.')}
        </p>
      )}

      {gorunenler.length > 0 && pages.map((page, pageIndex) => (
        <section key={pageIndex} className="mb-6">
          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-metin-cok-zayif">
            {t('Sayfa')} {pageIndex + 1}
          </p>
          <div className={`grid gap-3 ${COLUMNS[perPage] ?? 'grid-cols-3'}`}>
            {page.map((panel, slot) => {
              const index = project.panels.findIndex((p) => p.id === panel.id);
              const visibleIndex = pageIndex * perPage + slot;
              const active = panel.id === activePanelId;
              const gapBefore = dragPanelId !== null && overGap === visibleIndex;
              const gapAfter = dragPanelId !== null && overGap === gorunenler.length
                && visibleIndex === gorunenler.length - 1;
              const gapOffset = dragPanelId && panel.id !== dragPanelId
                ? (gapBefore ? 7 : overGap === visibleIndex + 1 ? -7 : 0) : 0;
              return (
                <article
                  key={panel.id}
                  data-testid="cards-card"
                  data-panel-id={panel.id}
                  draggable={editable}
                  tabIndex={0}
                  aria-label={`${t('Kartlar')} #${index + 1}`}
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                  onKeyDown={(e) => {
                    if (!editable || e.target !== e.currentTarget || !e.altKey) return;
                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                    e.preventDefault();
                    projectActions.movePanel(doc, panel.id, index + (e.key === 'ArrowUp' ? -1 : 1));
                  }}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-auteur-panel', panel.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragPanelId(panel.id);
                  }}
                  onDragOver={(e) => {
                    // Senaryo satırı sürükleniyorsa bu bir bağlama, sıralama değil.
                    if (e.dataTransfer.types.includes(DND_MIME)) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'link';
                      return;
                    }
                    if (!dragPanelId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const rect = e.currentTarget.getBoundingClientRect();
                    setOverGap(visibleIndex + (e.clientX > rect.left + rect.width / 2 ? 1 : 0));
                  }}
                  onDrop={(e) => {
                    const payload = readDragPayload(e);
                    if (payload?.type === 'script') {
                      e.preventDefault();
                      linkBlocksToPanel(payload.blockIds, panel.id);
                      setUi('scriptSelection', []);
                      return;
                    }
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const gap = visibleIndex + (e.clientX > rect.left + rect.width / 2 ? 1 : 0);
                    onDrop(gap, dragPanelId ?? e.dataTransfer.getData('application/x-auteur-panel'));
                  }}
                  onDragEnd={() => {
                    setDragPanelId(null);
                    setOverGap(null);
                  }}
                  onClick={() => setActivePanel(panel.id)}
                  onDoubleClick={() => {
                    setActivePanel(panel.id);
                    moduDegistir('board');
                  }}
                  className={
                    'group relative cursor-pointer border bg-panel p-2 transition-[transform,border-color] duration-200 ease-out ' +
                    /* Seçili kartın işareti gezgin ve zaman çizelgesiyle
                       AYNI dil: amber kenar + etkin zemin. `ring` başka bir
                       kenar dili getiriyordu — tasarımın kuralı tek 1px. */
                    (active ? 'border-amber bg-etkin' : 'border-kenar-ic hover:border-kenar-denetim')
                  }
                  style={{ transform: gapOffset ? `translateX(${gapOffset}px)` : undefined }}
                >
                  {(gapBefore || gapAfter) && (
                    <span data-testid="cards-gap" aria-hidden
                      className={'pointer-events-none absolute -top-1 -bottom-1 z-10 w-1 rounded-full bg-amber shadow-[0_0_12px_var(--mzn-amber)] ' +
                        (gapAfter ? '-right-2' : '-left-2')} />
                  )}
                  <div className="mb-1 flex items-center justify-between text-[10px] text-metin-zayif">
                    <span className="font-semibold text-metin-guclu">
                      #{index + 1} · S{panel.meta.scene}/C{panel.meta.shot}
                      {panel.scriptRefs.length > 0 && (
                        <span className="ml-1 text-amber" title={t('Senaryoya bağlı')}><Ikon ad="baglanti" boyut={11} /></span>
                      )}
                    </span>
                    <span>{panel.meta.duration.toFixed(1)}s</span>
                  </div>

                  <PanelThumbnail panel={panel} frame={panelSize(panel.guides.aspect)} />

                  <div className="mt-1.5 space-y-0.5 text-[10px]">
                    {panel.meta.cameraLabel && (
                      <p className="truncate text-amber">{panel.meta.cameraLabel}</p>
                    )}
                    {panel.meta.action && <p className="line-clamp-2 text-metin-zayif">{panel.meta.action}</p>}
                    {panel.meta.dialogue && (
                      <p className="line-clamp-2 italic text-metin-govde">“{panel.meta.dialogue}”</p>
                    )}
                    {panel.meta.sound && (
                      <p className="flex items-center gap-1 truncate text-amber-300/80">
                        <Ikon ad="nota" boyut={11} />
                        {panel.meta.sound}
                      </p>
                    )}
                  </div>

                  {/* Eylemler ÜZERİNE GELİNCE. Her kartta hep görünürken
                      yüz panellik bir projede ekranda üç yüz düğme
                      oluyordu ve hiçbiri bakılacak yer değildi; bakılacak
                      yer ÇİZİMDİ. Klavyeyle gezene de görünüyor
                      (`focus-within`), yoksa erişilemez olurdu. */}
                  <div className="mt-1.5 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                    <GridBtn disabled={!editable} onClick={() => projectActions.duplicatePanel(panel.id)}>{t('Çoğalt')}</GridBtn>
                    <GridBtn disabled={!editable} onClick={() => projectActions.addPanel(index + 1)}>{t('Araya ekle')}</GridBtn>
                    <GridBtn
                      disabled={!editable || project.panels.length <= 1}
                      danger
                      onClick={() => projectActions.removePanel(panel.id)}
                    >
                      {t('Sil')}
                    </GridBtn>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function GridBtn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={
        'flex-1 px-1 py-0.5 text-[10px] transition disabled:opacity-40 ' +
        (danger ? 'bg-rose-900/50 text-rose-200 hover:bg-rose-800' : 'bg-denetim text-metin-govde hover:bg-denetim')
      }
    >
      {children}
    </button>
  );
}
