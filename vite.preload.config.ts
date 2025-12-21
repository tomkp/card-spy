import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/preload/preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.cjs'
    },
    outDir: '.vite/build',
    rollupOptions: {
      external: ['electron']
    }
  }
});
