import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const shared = { '@shared': resolve(__dirname, 'src/shared') };

export default defineConfig({
  main: {
    resolve: { alias: shared },
  },
  preload: {
    resolve: { alias: shared },
  },
  renderer: {
    resolve: { alias: shared },
    plugins: [react()],
    worker: { format: 'es' },
    // Monaco is most of the bundle; unminified it is ~8 MB to parse on every launch.
    build: { minify: true },
  },
});
