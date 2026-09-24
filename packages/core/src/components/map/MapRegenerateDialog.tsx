import React from 'react';
import { t } from '../../dil/arayuz';

/** Destructive choice stays left; the initially focused safe choice stays right. */
export function MapRegenerateDialog({ onConfirm, onClose }: {
  onConfirm: () => void;
  onClose: () => void;
}) {
  const safe = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => { safe.current?.focus(); }, []);
  return <div data-testid="map-regenerate-dialog" role="dialog" aria-modal="true"
    aria-labelledby="map-regenerate-title" tabIndex={-1}
    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5"
    onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}>
    <div className="w-full max-w-sm space-y-4 rounded-md border border-kenar bg-panel p-5 shadow-2xl">
      <h2 id="map-regenerate-title" className="text-base font-semibold text-metin-guclu">
        {t('Kilitli haritayı değiştirmek istiyor musunuz?')}
      </h2>
      <p className="text-sm leading-relaxed text-metin-zayif">
        {t('Yeni coğrafya yalnızca önizleme olarak açılır. Beğenmezseniz mevcut harita korunur.')}
      </p>
      <div className="flex gap-2">
        <button type="button" data-testid="map-confirm-regenerate" onClick={onConfirm}
          className="mzn-denetim flex-1 border-red-500 px-3 py-2 text-sm text-red-300">
          {t('Yeniden oluştur')}
        </button>
        <button ref={safe} type="button" data-testid="map-keep-map" onClick={onClose}
          className="mzn-birincil flex-1 px-3 py-2 text-sm">
          {t('Haritayı koru')}
        </button>
      </div>
    </div>
  </div>;
}
