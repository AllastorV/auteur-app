import { useEffect, useRef } from 'react';
import { kayitIcinProje } from '../doc/schema';
import { useProjectStore } from '../store/project';
import { useUiStore } from '../store/ui';
import { useCollabStore } from '../store/collab';
import { usePlatform } from '../platform/context';
import { collectAssets } from '../util/assets';
import { tf } from '../dil/arayuz';

export const AUTOSAVE_INTERVAL_MS = 60_000;

/** 60 saniyede bir sessiz otomatik kayıt. */
export function useAutosave(enabled: boolean) {
  const platform = usePlatform();
  const busy = useRef(false);
  const warned = useRef(false);

  useEffect(() => {
    if (!enabled || !platform.canSaveLocally) return;
    const timer = setInterval(async () => {
      const state = useProjectStore.getState();
      if (!state.dirty || busy.current) return;
      busy.current = true;
      try {
        // Kaydedilen anlık görüntü referansı: kayıt sürerken yapılan
        // düzenlemeler bu kayda girmediği için "kaydedildi" sayılmamalı.
        const saved = state.project;
        const userName = useCollabStore.getState().userName;
        /* Kayıt kapsamı: bkz. `Studio.doSave` — `state.project` belgenin
           öteki köklerini taşımıyor. */
        await platform.autosave(
          kayitIcinProje(saved, state.doc),
          collectAssets(state.assetUrls),
          state.filePath,
          userName,
        );
        if (useProjectStore.getState().project === saved) {
          useProjectStore.getState().markSaved();
        }
        warned.current = false;
      } catch (err) {
        // Sessizce yutmak, kullanıcının otomatik kaydın çalıştığını sanmasına
        // yol açar. Uyarı arka arkaya tekrarlanmaz.
        if (!warned.current) {
          warned.current = true;
          useUiStore
            .getState()
            .showToast(tf('Otomatik kayıt başarısız: %s', (err as Error).message), 'error');
        }
      } finally {
        busy.current = false;
      }
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, platform]);
}
