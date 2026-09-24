import React, { useMemo } from 'react';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { buildTimeline } from '../../model/timeline';
import { panelSize } from '../../data/aspect';
import { PanelThumbnail } from '../grid/PanelThumbnail';

/**
 * Animatik önizleme sırasında geçiş efektini canvas üzerinde gösterir.
 *
 * Oynatma zaten aktif paneli değiştirir; bu katman geçiş penceresinde
 * sonraki paneli (ya da siyah zemini) uygun opaklık/kırpma ile üstüne
 * bindirerek dissolve, fade ve wipe efektlerini görünür kılar.
 */
export function PlaybackOverlay({ width, height }: { width: number; height: number }) {
  const playing = useUiStore((s) => s.playing);
  const playhead = useUiStore((s) => s.playhead);
  const panels = useProjectStore((s) => s.project.panels);

  const segments = useMemo(() => buildTimeline(panels), [panels]);

  if (!playing) return null;

  const seg = segments.find(
    (s) => s.transitionDuration > 0 && playhead >= s.transitionStart && playhead < s.end,
  );
  if (!seg) return null;

  const t = Math.min(1, Math.max(0, (playhead - seg.transitionStart) / seg.transitionDuration));
  const next = panels[seg.index + 1];

  const common: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  };

  if (seg.transition === 'fadeOut') {
    return <div style={{ ...common, background: '#000', opacity: t }} />;
  }
  if (seg.transition === 'fadeIn') {
    return <div style={{ ...common, background: '#000', opacity: 1 - t }} />;
  }
  if (!next) return null;

  const clip = seg.transition === 'wipe' ? `inset(0 ${(1 - t) * 100}% 0 0)` : undefined;
  const opacity = seg.transition === 'dissolve' ? t : 1;

  return (
    <div style={{ ...common, display: 'grid', placeItems: 'center' }}>
      <div style={{ opacity, clipPath: clip, width, height }}>
        <PanelThumbnail panel={next} frame={panelSize(next.guides.aspect)} width={width} />
      </div>
    </div>
  );
}
