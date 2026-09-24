import React, { useState } from 'react';
import { PlatformProvider, Studio, t, useCollabStore, useUiStore } from '@storyboard/core';
import { webPlatform } from './platform';
import { JoinScreen } from './JoinScreen';

export function App() {
  const [joined, setJoined] = useState(false);
  const status = useCollabStore((s) => s.status);
  /* Arayüz dili değişince ağaç `key` ile yeniden kurulur — `t()` React'e
     abone değil, tazelik buradan geliyor (bkz. dil/arayuz.ts). */
  const arayuzDili = useUiStore((s) => s.arayuzDili);

  if (!joined) {
    return <JoinScreen onJoined={() => setJoined(true)} />;
  }

  return (
    <PlatformProvider platform={webPlatform}>
      <div className="h-full">
        {status !== 'connected' && (
          <div className="absolute left-1/2 top-2 z-[70] -translate-x-1/2 rounded bg-amber-500 px-3 py-1 text-xs font-medium text-slate-900">
            {status === 'connecting' ? t('Bağlanılıyor…') : t('Bağlantı koptu — çevrimdışı düzenlemeler bağlanınca birleşecek')}
          </div>
        )}
        <Studio key={arayuzDili} />
      </div>
    </PlatformProvider>
  );
}
