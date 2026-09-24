import React, { useLayoutEffect, useRef, useState } from 'react';
import { t } from '../../dil/arayuz';
import { useProjectStore, projectActions } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { BLEND_MODES, type Panel } from '../../model/types';
import { Ikon } from '../Ikon';

export function LayersPanel({ panel, editable }: { panel: Panel; editable: boolean }) {
  const doc = useProjectStore((s) => s.doc);
  const activeLayerId = useUiStore((s) => s.activeLayerId);
  const set = useUiStore((s) => s.set);
  const layers = [...panel.layers].sort((a, b) => b.order - a.order);
  const [dragLayerId, setDragLayerId] = useState<string | null>(null);
  const [overGap, setOverGap] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const oldRects = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const next = new Map<string, number>();
    listRef.current?.querySelectorAll<HTMLElement>('[data-layer-id]').forEach((element) => {
      const id = element.dataset.layerId;
      if (!id) return;
      const y = element.getBoundingClientRect().top;
      const previous = oldRects.current.get(id);
      if (previous !== undefined && typeof element.animate === 'function' && Math.abs(previous - y) > 1) {
        element.animate(
          [{ transform: `translateY(${previous - y}px)` }, { transform: 'translateY(0)' }],
          { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' },
        );
      }
      next.set(id, y);
    });
    oldRects.current = next;
  }, [panel.layers]);

  const reorderAtGap = (gap: number, movingId: string | null) => {
    const from = layers.findIndex((layer) => layer.id === movingId);
    if (!editable || from < 0 || layers[from].locked) return;
    const visualIndex = Math.max(0, Math.min(gap > from ? gap - 1 : gap, layers.length - 1));
    projectActions.reorderLayer(doc, panel.id, movingId!, layers.length - 1 - visualIndex);
    setDragLayerId(null);
    setOverGap(null);
  };

  const dragGap = (event: React.DragEvent, gap: number) => {
    if (!editable || !dragLayerId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setOverGap(gap);
  };

  const gapNode = (gap: number) => dragLayerId && (
    <li data-testid="layer-gap" data-gap={gap}
      onDragOver={(event) => dragGap(event, gap)}
      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); reorderAtGap(gap, dragLayerId); }}
      className={'mx-1 rounded-sm border-amber transition-[height,opacity] duration-150 ' +
        (overGap === gap ? 'h-3 border-y bg-amber/20 opacity-100' : 'h-0.5 opacity-0')}
      aria-hidden />
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-metin-zayif">{t('Katmanlar')}</h3>
        <div className="flex gap-1">
          <IconBtn title={t('Katman ekle')} disabled={!editable} onClick={() => projectActions.addLayer(doc, panel.id)}>
            +
          </IconBtn>
          <IconBtn
            title={t('Yorum/işaretleme katmanı ekle')}
            disabled={!editable}
            onClick={() => projectActions.addLayer(doc, panel.id, { kind: 'annotation', name: t('İşaretleme') })}
          >
            ✎
          </IconBtn>
        </div>
      </div>

      <ul ref={listRef} className="space-y-1">
        {layers.map((layer, i) => {
          const active = layer.id === activeLayerId;
          return (
            <React.Fragment key={layer.id}>
            {gapNode(i)}
            <li
              data-testid="layer-row"
              data-layer-id={layer.id}
              onDragOver={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                dragGap(event, i + (event.clientY >= bounds.top + bounds.height / 2 ? 1 : 0));
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const bounds = event.currentTarget.getBoundingClientRect();
                reorderAtGap(i + (event.clientY >= bounds.top + bounds.height / 2 ? 1 : 0), dragLayerId);
              }}
              className={
                'border p-1.5 text-xs transition-[opacity,border-color] duration-150 ' +
                (dragLayerId === layer.id ? 'opacity-40 ' : '') +
                (active ? 'border-amber bg-amber-zemin/10' : 'border-kenar-denetim bg-etkin/50 hover:border-[#3a4250]')
              }
            >
              <div className="flex items-center gap-1">
                <button type="button" data-testid="layer-grip" draggable={editable && !layer.locked}
                  disabled={!editable || layer.locked}
                  aria-label={`${t('Katmanı taşı')}: ${t(layer.name)}`}
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                  title={t('Katmanı taşı')}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-auteur-layer', layer.id);
                    event.dataTransfer.effectAllowed = 'move';
                    setDragLayerId(layer.id);
                  }}
                  onDragEnd={() => { setDragLayerId(null); setOverGap(null); }}
                  onKeyDown={(event) => {
                    if (!editable || layer.locked || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
                    event.preventDefault();
                    const visualIndex = Math.max(0, Math.min(i + (event.key === 'ArrowUp' ? -1 : 1), layers.length - 1));
                    projectActions.reorderLayer(doc, panel.id, layer.id, layers.length - 1 - visualIndex);
                  }}
                  className="w-5 shrink-0 cursor-grab text-metin-zayif hover:text-metin disabled:cursor-default disabled:opacity-30">⠿</button>
                <button
                  type="button"
                  title={layer.visible ? t('Gizle') : t('Göster')}
                  disabled={!editable}
                  onClick={() => projectActions.updateLayer(doc, panel.id, layer.id, { visible: !layer.visible })}
                  className="w-5 text-metin-zayif hover:text-metin"
                >
                  {layer.visible ? <Ikon ad="goz" boyut={15} /> : '⃠'}
                </button>
                <button
                  type="button"
                  title={layer.locked ? t('Kilidi aç') : t('Kilitle')}
                  disabled={!editable}
                  onClick={() => projectActions.updateLayer(doc, panel.id, layer.id, { locked: !layer.locked })}
                  className="w-5 text-metin-zayif hover:text-metin"
                >
                  {layer.locked ? <Ikon ad="kilitli" boyut={15} /> : <Ikon ad="kilitsiz" boyut={15} />}
                </button>
                <input
                  value={t(layer.name)}
                  data-testid={active ? 'active-layer-name' : undefined}
                  disabled={!editable}
                  onChange={(e) => projectActions.updateLayer(doc, panel.id, layer.id, { name: e.target.value })}
                  onFocus={() => set('activeLayerId', layer.id)}
                  className="min-w-0 flex-1 bg-transparent text-metin-guclu outline-none"
                />
                {layer.kind === 'annotation' && (
                  <span className="bg-amber-500/20 px-1 text-[9px] text-amber-300">{t('Not')}</span>
                )}
                <button
                  type="button"
                  onClick={() => set('activeLayerId', layer.id)}
                  disabled={!editable}
                  className="text-[10px] text-metin-etiket hover:text-amber"
                  title={t('Bu katmana çiz')}
                >
                  ●
                </button>
              </div>

              {active && (
                <div className="mt-1.5 space-y-1 border-t border-kenar-denetim pt-1.5">
                  <label className="flex items-center gap-2">
                    <span className="w-14 text-[10px] text-metin-etiket">{t('Opaklık')}</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={layer.opacity}
                      disabled={!editable}
                      onChange={(e) =>
                        projectActions.updateLayer(doc, panel.id, layer.id, { opacity: Number(e.target.value) })
                      }
                      className="flex-1"
                    />
                    <span className="w-8 text-right text-[10px] text-metin-zayif">
                      {Math.round(layer.opacity * 100)}%
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="w-14 text-[10px] text-metin-etiket">{t('Karışım')}</span>
                    <select
                      value={layer.blendMode}
                      disabled={!editable}
                      onChange={(e) =>
                        projectActions.updateLayer(doc, panel.id, layer.id, { blendMode: e.target.value as any })
                      }
                      className="flex-1 bg-panel px-1 py-0.5 text-[11px] outline-none"
                    >
                      {BLEND_MODES.map((b) => (
                        <option key={b.value} value={b.value}>
                          {t(b.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-1">
                    <SmallBtn disabled={!editable} onClick={() => projectActions.duplicateLayer(doc, panel.id, layer.id)}>
                      {t('Çoğalt')}
                    </SmallBtn>
                    <SmallBtn
                      disabled={!editable || panel.layers.length <= 1}
                      danger
                      onClick={() => projectActions.removeLayer(doc, panel.id, layer.id)}
                    >
                      {t('Sil')}
                    </SmallBtn>
                  </div>
                </div>
              )}
            </li>
            </React.Fragment>
          );
        })}
        {gapNode(layers.length)}
      </ul>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="bg-denetim px-1.5 py-0.5 text-xs text-metin-govde hover:bg-denetim disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SmallBtn({
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
      onClick={onClick}
      disabled={disabled}
      className={
        'flex-1 px-1 py-0.5 text-[10px] transition disabled:opacity-40 ' +
        (danger ? 'bg-rose-900/60 text-rose-200 hover:bg-rose-800' : 'bg-denetim text-metin-govde hover:bg-denetim')
      }
    >
      {children}
    </button>
  );
}
