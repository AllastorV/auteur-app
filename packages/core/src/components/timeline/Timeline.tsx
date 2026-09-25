import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t, tf } from '../../dil/arayuz';
import { useProjectStore, projectActions } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { linkBlocksToPanel } from '../../store/script';
import { DND_MIME, readDragPayload } from '../dnd';
import { buildTimeline, formatDuration, segmentAt, timelineGapAt, timelineRulerTicks, timelineSecondsAt, totalDuration } from '../../model/timeline';
import { insertionIndex } from '../../model/panel-order';
import { panelSize } from '../../data/aspect';
import { PanelThumbnail } from '../grid/PanelThumbnail';
import { TRANSITIONS, type Panel } from '../../model/types';
import { Ikon } from '../Ikon';

const PX_PER_SECOND = 56;
const MIN_DURATION = 0.1;

export function Timeline({ editable }: { editable: boolean }) {
  const project = useProjectStore((s) => s.project);
  const doc = useProjectStore((s) => s.doc);
  const activePanelId = useProjectStore((s) => s.activePanelId);
  const setActivePanel = useProjectStore((s) => s.setActivePanel);
  const playing = useUiStore((s) => s.playing);
  const playhead = useUiStore((s) => s.playhead);
  const set = useUiStore((s) => s.set);

  const segments = useMemo(() => buildTimeline(project.panels), [project.panels]);
  const total = segments.length ? segments[segments.length - 1].end : 0;
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const [dragPanelId, setDragPanelId] = useState<string | null>(null);
  const [overGap, setOverGap] = useState<number | null>(null);
  const ruler = useMemo(() => timelineRulerTicks(total), [total]);

  const pointerTime = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    return timelineSecondsAt(clientX, track.getBoundingClientRect().left, track.scrollLeft, total, PX_PER_SECOND);
  }, [total]);

  const seek = useCallback((clientX: number) => {
    const time = pointerTime(clientX);
    set('playhead', time);
    const current = segmentAt(segments, time);
    if (current) setActivePanel(current.panelId);
  }, [pointerTime, segments, set, setActivePanel]);

  const finishScrub = useCallback((e: React.PointerEvent) => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const finishDrop = useCallback((gap: number, movingId: string | null) => {
    if (editable && movingId) {
      const ids = project.panels.map((panel) => panel.id);
      projectActions.movePanel(doc, movingId, insertionIndex(ids, ids, movingId, gap));
    }
    setDragPanelId(null);
    setOverGap(null);
  }, [doc, editable, project.panels]);

  /* --------------------------- oynatma --------------------------- */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = useUiStore.getState().playhead + dt;
      if (next >= total) {
        useUiStore.setState({ playhead: 0, playing: false });
        return;
      }
      useUiStore.setState({ playhead: next });
      const seg = segmentAt(segments, next);
      if (seg && seg.panelId !== useProjectStore.getState().activePanelId) {
        useProjectStore.getState().setActivePanel(seg.panelId);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total, segments]);

  const startResize = useCallback(
    (panel: Panel, e: React.PointerEvent) => {
      if (!editable) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startDuration = panel.meta.duration;
      const move = (ev: PointerEvent) => {
        const delta = (ev.clientX - startX) / PX_PER_SECOND;
        const next = Math.max(MIN_DURATION, Math.round((startDuration + delta) * 10) / 10);
        projectActions.updatePanelMeta(doc, panel.id, { duration: next });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [doc, editable],
  );

  return (
    <div className="flex h-full flex-col bg-panel text-metin-guclu">
      <div className="flex items-center gap-2 border-b border-kenar-ic px-3 py-1.5">
        <button
          type="button"
          onClick={() => set('playing', !playing)}
          className="mzn-denetim px-3 py-1 text-xs"
          title={t('Animatik önizleme')}
        >
          {playing ? (
            <span className="inline-flex items-center gap-1">
              <Ikon ad="duraklat" boyut={13} /> {t('Duraklat')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Ikon ad="oynat" boyut={13} /> {t('Oynat')}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => set('playhead', 0)}
          className="mzn-denetim px-2 py-1 text-xs"
          title={t('Başa sar')}
          aria-label={t('Başa sar')}
        >
          <Ikon ad="basa-sar" boyut={15} />
        </button>
        <span className="font-mono text-xs tabular-nums text-metin-zayif">
          {formatDuration(playhead)} / {formatDuration(total)}
        </span>
        <span className="ml-auto text-xs text-metin-etiket">
          {project.panels.length} {t('panel')} · {t('toplam')} {totalDuration(project.panels).toFixed(2)} {t('sn')}
        </span>
        <button
          type="button"
          disabled={!editable}
          onClick={() => projectActions.addPanel()}
          className="mzn-denetim px-2 py-1 text-xs disabled:opacity-40"
        >
          + Panel
        </button>
      </div>

      <div ref={trackRef} data-testid="timeline-track"
        className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden select-none"
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest('[data-timeline-no-scrub]')) return;
          scrubbing.current = true;
          set('playing', false);
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(e.clientX);
        }}
        onPointerMove={(e) => { if (scrubbing.current) seek(e.clientX); }}
        onPointerUp={finishScrub}
        onPointerCancel={finishScrub}
      >
        <div className="relative flex h-full flex-col" style={{ width: total * PX_PER_SECOND + 200 }}>
          <div data-testid="timeline-ruler" className="relative h-5 shrink-0 border-b border-kenar-ic bg-denetim/60">
            {ruler.map((time) => (
              <span key={time} className="absolute top-0 flex h-full flex-col border-l border-kenar-denetim pl-1 font-mono text-[9px] text-metin-zayif"
                style={{ left: time * PX_PER_SECOND }} data-time={time}>
                {formatDuration(time).slice(0, 5)}
              </span>
            ))}
          </div>
          <div className="relative flex min-h-0 flex-1 items-stretch">
          {segments.map((seg) => {
            const panel = project.panels[seg.index];
            const active = panel.id === activePanelId;
            const shotWidth = seg.hold * PX_PER_SECOND;
            const shifted = dragPanelId && overGap !== null && seg.index >= overGap;
            return (
              <React.Fragment key={seg.panelId}>
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setActivePanel(panel.id)}
                  data-testid="timeline-shot"
                  data-panel-id={panel.id}
                  onDragOver={(e) => {
                    if (!editable) return;
                    if (e.dataTransfer.types.includes(DND_MIME)) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'link';
                      return;
                    }
                    if (!dragPanelId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setOverGap(timelineGapAt(segments, pointerTime(e.clientX)));
                  }}
                  onDrop={(e) => {
                    if (!editable) return;
                    const payload = readDragPayload(e);
                    if (payload?.type === 'script') {
                      e.preventDefault();
                      e.stopPropagation();
                      linkBlocksToPanel(payload.blockIds, panel.id);
                      useUiStore.getState().showToast(tf('%d satır bağlandı.', payload.blockIds.length), 'success');
                      return;
                    }
                    if (!dragPanelId) return;
                    e.preventDefault();
                    finishDrop(timelineGapAt(segments, pointerTime(e.clientX)), dragPanelId);
                  }}
                  className={
                    'group relative my-1 flex shrink-0 flex-col justify-between overflow-hidden border px-1 py-0.5 text-left transition-[transform,border-color] duration-200 ' +
                    /* Seçili planın işareti gezgindekiyle AYNI dil: sol
                       şerit + zemin. Panonun kendine ait bir "seçili"
                       görünümü olsaydı kullanıcı iki yerde iki şey
                       öğrenirdi. */
                    (active
                      ? 'border-kenar-denetim border-l-2 border-l-amber bg-etkin'
                      : 'border-kenar-denetim bg-denetim/70 hover:border-metin-cok-zayif')
                  }
                  style={{ width: shotWidth, transform: shifted ? 'translateX(12px)' : undefined }}
                  title={`${panel.meta.scene}/${panel.meta.shot} — ${seg.hold}${t('sn')}`}
                >
                  <span className="flex items-center gap-1 truncate text-[10px] font-semibold text-metin-guclu">
                    {editable && (
                      <span data-timeline-no-scrub draggable tabIndex={0} role="button"
                        aria-label={`${t('Panel')} ${seg.index + 1} — ${t('Sırala')}`}
                        data-testid="timeline-drag-grip"
                        className="cursor-grab rounded px-0.5 text-metin-zayif hover:text-amber focus:text-amber"
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                            e.preventDefault();
                            projectActions.movePanel(doc, panel.id, seg.index + (e.key === 'ArrowLeft' ? -1 : 1));
                          }
                        }}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/x-auteur-panel', panel.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragPanelId(panel.id);
                        }}
                        onDragEnd={() => { setDragPanelId(null); setOverGap(null); }}
                      >⋮⋮</span>
                    )}
                    S{panel.meta.scene}·C{panel.meta.shot}
                    {panel.scriptRefs.length > 0 && (
                      <span
                        data-timeline-no-scrub
                        className="text-amber"
                        title={tf('%d senaryo satırına bağlı', panel.scriptRefs.length)}
                      >
                        <Ikon ad="baglanti" boyut={11} />
                      </span>
                    )}
                  </span>
                  <div data-testid="timeline-thumbnail" className="pointer-events-none min-h-0 flex-1 overflow-hidden py-0.5">
                    <PanelThumbnail panel={panel} frame={panelSize(panel.guides.aspect)} width={Math.min(120, Math.max(24, shotWidth - 12))} />
                  </div>
                  <span className="truncate text-[9px] text-metin-zayif">{panel.meta.cameraLabel}</span>
                  <span className="text-[9px] tabular-nums text-metin-etiket">{seg.hold.toFixed(1)}s</span>
                  <div
                    data-timeline-no-scrub
                    data-testid="timeline-resize"
                    onPointerDown={(e) => startResize(panel, e)}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-amber-zemin/0 transition group-hover:bg-amber-zemin/60"
                    title={t('Süreyi sürükleyerek ayarla')}
                  />
                </div>

                {seg.transitionDuration > 0 && (
                  <div
                    className="my-1 flex shrink-0 items-center justify-center bg-gradient-to-r from-[#2f3540] to-[#3c434f] text-[9px] text-metin-guclu transition-transform duration-200"
                    style={{ width: seg.transitionDuration * PX_PER_SECOND, transform: shifted ? 'translateX(12px)' : undefined }}
                    title={`${t(TRANSITIONS.find((x) => x.value === seg.transition)?.label ?? '')} — ${seg.transitionDuration}${t('sn')}`}
                  >
                    {seg.transition === 'dissolve' ? '◑' : seg.transition === 'wipe' ? '▨' : '◐'}
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {dragPanelId && overGap !== null && (
            <span data-testid="timeline-gap" aria-hidden className="pointer-events-none absolute inset-y-0 z-20 w-1 rounded bg-amber shadow-[0_0_12px_var(--mzn-amber)]"
              style={{ left: (segments[overGap]?.start ?? total) * PX_PER_SECOND }} />
          )}

          <div
            className="pointer-events-none absolute top-0 z-10 h-full w-0.5 bg-amber"
            style={{ left: playhead * PX_PER_SECOND }}
          />
          </div>
        </div>
      </div>
    </div>
  );
}
