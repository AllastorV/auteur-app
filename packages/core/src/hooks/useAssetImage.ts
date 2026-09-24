import { useEffect, useState } from 'react';
import { useProjectStore } from '../store/project';

/** `assets/` içindeki bir görseli yükler ve HTMLImageElement olarak döndürür. */
export function useAssetImage(assetId: string | null): HTMLImageElement | null {
  const url = useProjectStore((s) => (assetId ? s.assetUrls[assetId] : undefined));
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setImage(null);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return image;
}
