import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const coreSrc = path.resolve(__dirname, '../../packages/core/src');

export default defineConfig({
  root: __dirname,
  cacheDir: process.env.STORYBOARD_VITE_CACHE_DIR || undefined,
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@storyboard\/core$/, replacement: path.join(coreSrc, 'index.ts') },
      { find: /^@storyboard\/core\/(.*)$/, replacement: path.join(coreSrc, '$1') },
    ],
    dedupe: ['react', 'react-dom', 'yjs'],
  },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  server: { port: 5174, host: true },
});
