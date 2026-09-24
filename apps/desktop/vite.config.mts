import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

const coreSrc = path.resolve(__dirname, '../../packages/core/src');

export default defineConfig({
  root: __dirname,
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'fluent-ffmpeg', 'ffmpeg-static'],
              output: { format: 'cjs', entryFileNames: 'main.cjs' },
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
              output: { format: 'cjs', entryFileNames: 'preload.cjs' },
            },
          },
        },
      },
    }),
  ],
  resolve: {
    alias: [
      { find: /^@storyboard\/core$/, replacement: path.join(coreSrc, 'index.ts') },
      { find: /^@storyboard\/core\/(.*)$/, replacement: path.join(coreSrc, '$1') },
    ],
    dedupe: ['react', 'react-dom', 'three', 'yjs'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome124',
  },
  server: { port: 5173 },
});
