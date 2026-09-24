import React from 'react';
import { t } from '../../dil/arayuz';
import { useUiStore } from '../../store/ui';
import type { Tool } from '../../store/ui';

const TRANSPARENT = '#00000000';
const DRAW_TOOLS: Tool[] = ['pen', 'brush', 'eraser', 'rect', 'ellipse', 'line', 'arrow', 'polygon', 'text', 'fill'];

export function rememberColor(color: string, target: 'strokeColor' | 'fillColor' = 'strokeColor') {
  useUiStore.setState((state) => ({
    [target]: color,
    recentColors: color === TRANSPARENT
      ? state.recentColors
      : [color, ...state.recentColors.filter((previous) => previous !== color)].slice(0, 8),
  }));
}

export function PaintPanel({ editable }: { editable: boolean }) {
  const tool = useUiStore((state) => state.tool);
  const strokeColor = useUiStore((state) => state.strokeColor);
  const fillColor = useUiStore((state) => state.fillColor);
  const strokeWidth = useUiStore((state) => state.strokeWidth);
  const brushSmoothing = useUiStore((state) => state.brushSmoothing);
  const opacity = useUiStore((state) => state.opacity);
  const recentColors = useUiStore((state) => state.recentColors);
  const canStroke = tool !== 'fill' && tool !== 'eyedropper';
  const canFill = tool !== 'eraser' && tool !== 'eyedropper';
  const canSize = tool !== 'fill' && tool !== 'eyedropper' && tool !== 'text';

  return (
    <section data-testid="paint-panel" className="flex flex-col gap-3 text-[11px] text-metin-govde">
      <div className="font-semibold text-metin-guclu">{t('Boya')}</div>
      {canStroke && (
        <label className="flex items-center justify-between gap-2">
          <span>{t('Kontur rengi')}</span>
          <span className="flex items-center gap-1 font-mono text-[10px]">
            <input data-testid="paint-stroke-color" aria-label={t('Kontur rengi')} type="color"
              value={strokeColor} disabled={!editable}
              onChange={(event) => rememberColor(event.target.value)}
              className="h-7 w-9 cursor-pointer border border-kenar-denetim bg-transparent" />
            {strokeColor}
          </span>
        </label>
      )}
      {canFill && (
        <>
          <label className="flex items-center justify-between gap-2">
            <span>{t('Dolgu rengi')}</span>
            <span className="flex items-center gap-1 font-mono text-[10px]">
              <input data-testid="paint-fill-color" aria-label={t('Dolgu rengi')} type="color"
                value={fillColor === TRANSPARENT ? '#ffffff' : fillColor} disabled={!editable}
                onChange={(event) => rememberColor(event.target.value, 'fillColor')}
                className="h-7 w-9 cursor-pointer border border-kenar-denetim bg-transparent" />
              {fillColor === TRANSPARENT ? t('Saydam') : fillColor}
            </span>
          </label>
          <button type="button" data-testid="paint-transparent-fill" disabled={!editable}
            aria-pressed={fillColor === TRANSPARENT}
            onClick={() => useUiStore.setState({ fillColor: TRANSPARENT })}
            className="mzn-denetim self-start px-2 py-1 text-[11px]">
            {t('Saydam dolgu')}
          </button>
        </>
      )}
      {canSize && (
        <label className="flex flex-col gap-1">
          <span>{tool === 'eraser' ? t('Silgi boyutu') : t('Kalınlık')} · {strokeWidth}px</span>
          <input data-testid={tool === 'eraser' ? 'paint-eraser-size' : 'paint-stroke-width'}
            type="range" min={1} max={80} value={strokeWidth} disabled={!editable}
            onChange={(event) => useUiStore.setState({ strokeWidth: Number(event.target.value) })}
            className="w-full accent-[var(--mzn-amber)]" />
        </label>
      )}
      {tool !== 'fill' && tool !== 'eyedropper' && (
        <label className="flex flex-col gap-1">
          <span>{t('Opaklık')} · {Math.round(opacity * 100)}%</span>
          <input data-testid="paint-opacity" type="range" min={1} max={100}
            value={Math.round(opacity * 100)} disabled={!editable}
            onChange={(event) => useUiStore.setState({ opacity: Number(event.target.value) / 100 })}
            className="w-full accent-[var(--mzn-amber)]" />
        </label>
      )}
      {tool === 'brush' && (
        <label className="flex flex-col gap-1">
          <span>{t('Yumuşatma')} · {Math.round(brushSmoothing * 100)}%</span>
          <input data-testid="paint-smoothing" type="range" min={0} max={100}
            value={Math.round(brushSmoothing * 100)} disabled={!editable}
            onChange={(event) => useUiStore.setState({ brushSmoothing: Number(event.target.value) / 100 })}
            className="w-full accent-[var(--mzn-amber)]" />
        </label>
      )}
      <button data-testid="paint-eyedropper" type="button" disabled={!editable}
        onClick={() => {
          const state = useUiStore.getState();
          if (state.tool === 'eyedropper') return;
          useUiStore.setState({ tool: 'eyedropper', previousTool: DRAW_TOOLS.includes(state.tool) ? state.tool : 'pen' });
        }}
        className="mzn-denetim self-start px-2 py-1.5 text-[11px]">
        {t('Damlalık')}
      </button>
      {recentColors.length > 0 && (
        <div className="flex flex-col gap-1">
          <span>{t('Son renkler')}</span>
          <div className="flex flex-wrap gap-1">
            {recentColors.map((color, index) => (
              <button key={color} data-testid={`paint-recent-${index}`} type="button"
                aria-label={color} title={color} disabled={!editable}
                onClick={() => rememberColor(color, tool === 'fill' ? 'fillColor' : 'strokeColor')}
                style={{ backgroundColor: color }}
                className="h-6 w-6 rounded-sm border border-kenar-denetim" />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
