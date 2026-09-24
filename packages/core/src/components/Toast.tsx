import React, { useEffect } from 'react';
import { useUiStore } from '../store/ui';

export function Toast() {
  const toast = useUiStore((s) => s.toast);
  const set = useUiStore((s) => s.set);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => set('toast', null), 4500);
    return () => clearTimeout(timer);
  }, [toast, set]);

  if (!toast) return null;

  const tone =
    toast.kind === 'error'
      ? 'border-rose-600 bg-rose-950/90 text-rose-100'
      : toast.kind === 'success'
        ? 'border-emerald-600 bg-emerald-950/90 text-emerald-100'
        : 'border-kenar-denetim bg-panel/95 text-metin';

  return (
    <div
      role="status"
      className={`fixed bottom-4 left-1/2 z-[60] max-w-[80vw] -translate-x-1/2 border px-4 py-2 text-xs shadow-xl ${tone}`}
    >
      {toast.message}
    </div>
  );
}
