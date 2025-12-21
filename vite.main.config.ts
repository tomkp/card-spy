import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.cjs'
    },
    outDir: '.vite/build',
    rollupOptions: {
      external: ['electron', 'smartcard']
    }
  }
});
