import React, { useCallback } from 'react';

/** Paneller arası sürüklenebilir ayırıcı. */
export function Resizer({
  orientation,
  onResize,
  onDoubleClick,
}: {
  orientation: 'vertical' | 'horizontal';
  onResize: (delta: number) => void;
  onDoubleClick?: () => void;
}) {
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const start = orientation === 'vertical' ? e.clientX : e.clientY;
      let last = start;
      const move = (ev: PointerEvent) => {
        const cur = orientation === 'vertical' ? ev.clientX : ev.clientY;
        onResize(cur - last);
        last = cur;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        document.body.style.userSelect = '';
      };
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [orientation, onResize],
  );

  return (
    <div
      role="separator"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className={
        'shrink-0 bg-denetim transition hover:bg-amber-zemin ' +
        (orientation === 'vertical' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize')
      }
    />
  );
}

/** Daraltılabilir panel başlığı. */
export function CollapseHandle({
  collapsed,
  onToggle,
  side,
  title,
}: {
  collapsed: boolean;
  onToggle: () => void;
  side: 'left' | 'right' | 'bottom';
  title: string;
}) {
  const arrow =
    side === 'left' ? (collapsed ? '›' : '‹') : side === 'right' ? (collapsed ? '‹' : '›') : collapsed ? '⌃' : '⌄';
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      aria-label={title}
      className="flex items-center justify-center bg-panel text-[11px] text-metin-etiket hover:bg-denetim hover:text-metin-guclu"
      style={side === 'bottom' ? { height: 14 } : { width: 14 }}
    >
      {arrow}
    </button>
  );
}
