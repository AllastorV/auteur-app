import { useEffect, useRef } from 'react';
import { sesAcikMi, sesMotoru, tusSesi, type SesMotoru } from '../ses/daktilo';

/**
 * Daktilo sesini belgeye bağlar.
 *
 * Dinleme noktası `document`, ProseMirror eklentisi DEĞİL: eklenti kaydı
 * editör kurulumuna dokunmayı gerektirir ve ses, editörün iç işleyişiyle
 * ilgili bir şey değil. Kapı `senaryo-yuzey` içinde miyiz sorusunda:
 * arama kutusuna yazarken ya da bir diyalogda ses çıkmaz.
 *
 * Motor TEMBEL kuruluyor — ilk ses gerekene kadar `AudioContext` yok.
 */
export function useDaktilo(): void {
  const motor = useRef<SesMotoru | null>(null);

  useEffect(() => {
    const dinle = (e: KeyboardEvent) => {
      if (!sesAcikMi()) return;
      const hedef = e.target;
      const senaryoAlaninda =
        hedef instanceof Element && hedef.closest('.senaryo-yuzey') !== null;
      const tur = tusSesi({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        senaryoAlaninda,
      });
      if (!tur) return;
      motor.current ??= sesMotoru();
      motor.current.cal(tur);
    };

    document.addEventListener('keydown', dinle);
    return () => {
      document.removeEventListener('keydown', dinle);
      motor.current?.kapat();
      motor.current = null;
    };
  }, []);
}
