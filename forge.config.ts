import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';

// Modules left external by vite.main.config.ts must be shipped in the packaged
// app's node_modules, otherwise the app fails at startup with
// "Cannot find module 'smartcard'". node-addon-api is needed so Forge can
// rebuild the smartcard native addon for the target Electron platform/arch.
const runtimeModules = ['smartcard', 'node-addon-api'];

const keepInPackage = (file: string): boolean => {
  // Paths are relative to the project root, start with '/' and use '/' on all platforms.
  if (!file) return true;
  if (file.startsWith('/.vite')) return true;
  if (file === '/node_modules') return true;
  return runtimeModules.some(
    (name) => file === `/node_modules/${name}` || file.startsWith(`/node_modules/${name}/`)
  );
};

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Card Spy',
    icon: './assets/icon',
    // Replaces the Vite plugin's default, which only keeps the .vite folder.
    ignore: (file: string) => !keepInPackage(file),
    // The ignore filter already selects exactly which modules ship; pruning would
    // bypass it for package roots and leave empty folders for every other dependency.
    prune: false
  },
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/main.ts', config: 'vite.main.config.ts' },
        { entry: 'src/preload/preload.ts', config: 'vite.preload.config.ts' }
      ],
      renderer: [
        { name: 'main_window', config: 'vite.renderer.config.ts' }
      ]
    })
  ],
  makers: [
    { name: '@electron-forge/maker-zip' },
    { name: '@electron-forge/maker-dmg' }
  ]
};

export default config;
