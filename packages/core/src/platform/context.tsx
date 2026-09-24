import React, { createContext, useContext } from 'react';
import type { PlatformAdapter } from './types';

const PlatformContext = createContext<PlatformAdapter | null>(null);

export function PlatformProvider({
  platform,
  children,
}: {
  platform: PlatformAdapter;
  children: React.ReactNode;
}) {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformAdapter {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('PlatformProvider bulunamadı.');
  return ctx;
}
