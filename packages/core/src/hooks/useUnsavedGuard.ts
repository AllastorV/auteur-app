import { useEffect } from 'react';
import { useProjectStore } from '../store/project';
import { usePlatform } from '../platform/context';

/**
 * Kaydedilmemiş değişiklikle çıkışı engeller.
 *
 * Otomatik kayıt 60 saniyede bir çalışır; uyarı olmadan kapatmak son kayıttan
 * sonraki işi sessizce siler. Web'de `beforeunload`, masaüstünde ana sürecin
 * pencere kapatma onayı kullanılır (Electron `beforeunload` için kendiliğinden
 * onay kutusu göstermez).
 */
export function useUnsavedGuard() {
  const platform = usePlatform();
  const dirty = useProjectStore((s) => s.dirty);

  useEffect(() => {
    platform.setDirty?.(dirty);
  }, [platform, dirty]);

  useEffect(() => {
    if (platform.kind !== 'web' || !dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Eski tarayıcılar için gerekli; metni tarayıcı belirler.
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [platform.kind, dirty]);
}
