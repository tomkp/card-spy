# Card Spy - Migration Tasks

Step-by-step tasks to migrate from the legacy stack to the modern stack. Each task is atomic and verifiable.

---

## Pre-Migration

### Task 0.1: Create upgrade branch
```bash
git checkout -b upgrade/vite-typescript
```
**Verify:** `git branch` shows you're on `upgrade/vite-typescript`

### Task 0.2: Verify current app works
```bash
npm install
npm run compile
npm start
```
**Verify:** App launches, no errors in console

---

## Phase 1: Remove Old Dependencies

### Task 1.1: Remove Webpack and related packages
```bash
npm uninstall webpack webpack-dev-middleware webpack-dev-server webpack-hot-middleware webpack-target-electron-renderer
```
**Verify:** `npm ls webpack` shows "empty"

### Task 1.2: Remove Babel packages
```bash
npm uninstall babel-cli babel-core babel-loader babel-plugin-transform-object-rest-spread babel-preset-es2015 babel-preset-react babel-preset-react-hmre
```
**Verify:** `npm ls babel-core` shows "empty"

### Task 1.3: Remove CSS/PostCSS packages
```bash
npm uninstall postcss postcss-loader postcss-color-function precss autoprefixer css-loader style-loader
```
**Verify:** `npm ls postcss` shows "empty"

### Task 1.4: Remove old Electron packaging tools
```bash
npm uninstall electron-packager electron-builder electron
```
**Verify:** `npm ls electron` shows "empty"

### Task 1.5: Remove unused app dependencies
```bash
cd app
npm uninstall redux react-redux react-layout-pane es6-promise babel-polyfill history react-addons-test-utils
cd ..
```
**Verify:** Check `app/package.json` - these packages are gone

### Task 1.6: Delete old config files
```bash
rm webpack.config.js .babelrc
```
**Verify:** Files no longer exist

### Task 1.7: Commit removal
```bash
git add -A
git commit -m "chore: remove legacy build dependencies"
```
**Verify:** `git status` shows clean working tree

---

## Phase 2: Install New Dependencies

### Task 2.1: Install Vite and plugins
```bash
npm install --save-dev vite @vitejs/plugin-react
```
**Verify:** `npm ls vite` shows vite installed

### Task 2.2: Install TypeScript
```bash
npm install --save-dev typescript @types/node
```
**Verify:** `npx tsc --version` shows TypeScript version

### Task 2.3: Install Electron and Forge
```bash
npm install --save-dev electron@34 @electron-forge/cli @electron-forge/plugin-vite @electron-forge/maker-zip @electron-forge/maker-dmg
```
**Verify:** `npx electron --version` shows v34.x

### Task 2.4: Install React 18 and types
```bash
npm install react@18 react-dom@18 @types/react @types/react-dom --save-dev
```
**Verify:** `npm ls react` shows 18.x

### Task 2.5: Install other dependencies
```bash
npm install react-router-dom@6 react-resizable-panels smartcard@2 sass --save-dev
```
**Verify:** `npm ls smartcard` shows 2.x

### Task 2.6: Commit new dependencies
```bash
git add -A
git commit -m "chore: add modern build dependencies"
```
**Verify:** `git status` shows clean working tree

---

## Phase 3: Create Project Structure

### Task 3.1: Create directory structure
```bash
mkdir -p src/main src/preload src/renderer/components src/renderer/styles src/renderer/hooks src/shared assets
```
**Verify:** `ls src` shows main, preload, renderer, shared

### Task 3.2: Move icon assets
```bash
mv tomkp.icns assets/icon.icns
mv tomkp.ico assets/icon.ico
mv tomkp.png assets/icon.png
```
**Verify:** `ls assets` shows icon files

### Task 3.3: Create index.html for renderer
Create `src/renderer/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'">
    <title>Card Spy</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```
**Verify:** File exists at `src/renderer/index.html`

### Task 3.4: Commit structure
```bash
git add -A
git commit -m "chore: create new project structure"
```
**Verify:** `git status` shows clean working tree

---

## Phase 4: TypeScript Configuration

### Task 4.1: Create tsconfig.json
Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```
**Verify:** `npx tsc --noEmit` runs (may have errors, that's ok for now)

### Task 4.2: Commit TypeScript config
```bash
git add -A
git commit -m "chore: add TypeScript configuration"
```
**Verify:** `git status` shows clean working tree

---

## Phase 5: Vite Configuration

### Task 5.1: Create vite.main.config.ts
Create `vite.main.config.ts`:
```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js'
    },
    outDir: '.vite/build',
    rollupOptions: {
      external: ['electron', 'smartcard']
    }
  }
});
```
**Verify:** File exists

### Task 5.2: Create vite.preload.config.ts
Create `vite.preload.config.ts`:
```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/preload/preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.js'
    },
    outDir: '.vite/build',
    rollupOptions: {
      external: ['electron']
    }
  }
});
```
**Verify:** File exists

### Task 5.3: Create vite.renderer.config.ts
Create `vite.renderer.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  build: {
    outDir: '../../.vite/renderer'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
});
```
**Verify:** File exists

### Task 5.4: Create forge.config.ts
Create `forge.config.ts`:
```typescript
import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Card Spy',
    icon: './assets/icon'
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
```
**Verify:** File exists

### Task 5.5: Commit Vite config
```bash
git add -A
git commit -m "chore: add Vite and Electron Forge configuration"
```
**Verify:** `git status` shows clean working tree

---

## Phase 6: Shared Types

### Task 6.1: Create shared types
Create `src/shared/types.ts`:
```typescript
export interface Device {
  name: string;
  isActivated: boolean;
}

export interface Card {
  atr: string;
  protocol: number;
}

export interface Command {
  id: string;
  timestamp: number;
  apdu: number[];
  hex: string;
}

export interface Response {
  id: string;
  timestamp: number;
  data: number[];
  sw1: number;
  sw2: number;
  hex: string;
  meaning?: string;
}

export interface TlvNode {
  tag: number;
  tagHex: string;
  length: number;
  value: number[] | TlvNode[];
  isConstructed: boolean;
  description?: string;
}

export interface LogEntry {
  id: string;
  command: Command;
  response?: Response;
  tlv?: TlvNode[];
}

export interface ElectronAPI {
  onDeviceActivated: (callback: (device: Device) => void) => void;
  onDeviceDeactivated: (callback: (device: Device) => void) => void;
  onCardInserted: (callback: (card: Card) => void) => void;
  onCardRemoved: (callback: () => void) => void;
  onCommandIssued: (callback: (command: Command) => void) => void;
  onResponseReceived: (callback: (response: Response) => void) => void;
  getDevices: () => Promise<Device[]>;
  selectDevice: (deviceName: string) => Promise<void>;
  sendCommand: (apdu: number[]) => Promise<Response>;
  interrogate: () => Promise<void>;
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
```
**Verify:** `npx tsc --noEmit src/shared/types.ts` - no errors

### Task 6.2: Migrate EMV tags
Create `src/shared/emv-tags.ts` (copy from `app/src/EmvTags.js` and convert to TypeScript):
```typescript
export const EMV_TAGS: Record<number, string> = {
  0x4F: 'Application Identifier (AID)',
  0x50: 'Application Label',
  0x57: 'Track 2 Equivalent Data',
  0x5A: 'Application PAN',
  0x5F20: 'Cardholder Name',
  0x5F24: 'Application Expiration Date',
  0x5F25: 'Application Effective Date',
  0x5F28: 'Issuer Country Code',
  0x5F2D: 'Language Preference',
  0x5F34: 'PAN Sequence Number',
  0x61: 'Application Template',
  0x6F: 'FCI Template',
  0x70: 'EMV Record Template',
  0x77: 'Response Message Template Format 2',
  0x80: 'Response Message Template Format 1',
  0x82: 'Application Interchange Profile',
  0x84: 'DF Name',
  0x87: 'Application Priority Indicator',
  0x88: 'SFI',
  0x8C: 'CDOL1',
  0x8D: 'CDOL2',
  0x8E: 'CVM List',
  0x8F: 'CA Public Key Index',
  0x90: 'Issuer Public Key Certificate',
  0x92: 'Issuer Public Key Remainder',
  0x93: 'Signed Static Application Data',
  0x94: 'Application File Locator',
  0x95: 'Terminal Verification Results',
  0x9A: 'Transaction Date',
  0x9C: 'Transaction Type',
  0x9F02: 'Amount Authorised',
  0x9F03: 'Amount Other',
  0x9F06: 'AID',
  0x9F07: 'Application Usage Control',
  0x9F08: 'Application Version Number',
  0x9F09: 'Application Version Number (Terminal)',
  0x9F0D: 'IAC Default',
  0x9F0E: 'IAC Denial',
  0x9F0F: 'IAC Online',
  0x9F10: 'Issuer Application Data',
  0x9F11: 'Issuer Code Table Index',
  0x9F12: 'Application Preferred Name',
  0x9F1F: 'Track 1 Discretionary Data',
  0x9F26: 'Application Cryptogram',
  0x9F27: 'Cryptogram Information Data',
  0x9F32: 'Issuer Public Key Exponent',
  0x9F36: 'Application Transaction Counter',
  0x9F37: 'Unpredictable Number',
  0x9F38: 'PDOL',
  0x9F42: 'Application Currency Code',
  0x9F44: 'Application Currency Exponent',
  0x9F46: 'ICC Public Key Certificate',
  0x9F47: 'ICC Public Key Exponent',
  0x9F48: 'ICC Public Key Remainder',
  0x9F49: 'DDOL',
  0x9F4A: 'SDA Tag List',
  0xA5: 'FCI Proprietary Template',
  0xBF0C: 'FCI Issuer Discretionary Data'
};

export function getTagName(tag: number): string {
  return EMV_TAGS[tag] ?? `Unknown (${tag.toString(16).toUpperCase()})`;
}
```
**Verify:** `npx tsc --noEmit src/shared/emv-tags.ts` - no errors

### Task 6.3: Commit shared code
```bash
git add -A
git commit -m "feat: add shared TypeScript types and EMV tags"
```
**Verify:** `git status` shows clean working tree

---

## Phase 7: Preload Script

### Task 7.1: Create preload script
Create `src/preload/preload.ts`:
```typescript
import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  onDeviceActivated: (callback: (device: unknown) => void) =>
    ipcRenderer.on('device-activated', (_, data) => callback(data)),
  onDeviceDeactivated: (callback: (device: unknown) => void) =>
    ipcRenderer.on('device-deactivated', (_, data) => callback(data)),
  onCardInserted: (callback: (card: unknown) => void) =>
    ipcRenderer.on('card-inserted', (_, data) => callback(data)),
  onCardRemoved: (callback: () => void) =>
    ipcRenderer.on('card-removed', () => callback()),
  onCommandIssued: (callback: (command: unknown) => void) =>
    ipcRenderer.on('command-issued', (_, data) => callback(data)),
  onResponseReceived: (callback: (response: unknown) => void) =>
    ipcRenderer.on('response-received', (_, data) => callback(data)),

  getDevices: () => ipcRenderer.invoke('get-devices'),
  selectDevice: (name: string) => ipcRenderer.invoke('select-device', name),
  sendCommand: (apdu: number[]) => ipcRenderer.invoke('send-command', apdu),
  interrogate: () => ipcRenderer.invoke('interrogate'),

  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
```
**Verify:** `npx tsc --noEmit src/preload/preload.ts` - no errors

### Task 7.2: Commit preload
```bash
git add -A
git commit -m "feat: add preload script with context bridge"
```
**Verify:** `git status` shows clean working tree

---

## Phase 8: Main Process

### Task 8.1: Create main entry point
Create `src/main/main.ts`:
```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { SmartcardService } from './smartcard-service';

let mainWindow: BrowserWindow | null = null;
let smartcardService: SmartcardService | null = null;

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  smartcardService = new SmartcardService(mainWindow);
  smartcardService.start();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  smartcardService?.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('get-devices', () => {
  return smartcardService?.getDevices() ?? [];
});

ipcMain.handle('select-device', async (_, deviceName: string) => {
  await smartcardService?.selectDevice(deviceName);
});

ipcMain.handle('send-command', async (_, apdu: number[]) => {
  return smartcardService?.sendCommand(apdu);
});

ipcMain.handle('interrogate', async () => {
  await smartcardService?.interrogate();
});
```
**Verify:** File exists (will have import error until next task)

### Task 8.2: Create SmartcardService
Create `src/main/smartcard-service.ts`:
```typescript
import { BrowserWindow } from 'electron';
import { Devices } from 'smartcard';
import type { Device, Command, Response } from '../shared/types';

export class SmartcardService {
  private devices: Devices;
  private window: BrowserWindow;
  private readers: Map<string, unknown> = new Map();
  private activeCard: unknown = null;
  private commandId = 0;

  constructor(window: BrowserWindow) {
    this.window = window;
    this.devices = new Devices();
  }

  start(): void {
    this.devices.on('reader-attached', (reader: { name: string; on: Function }) => {
      this.readers.set(reader.name, reader);
      this.send('device-activated', { name: reader.name, isActivated: true });

      reader.on('card-inserted', (card: unknown) => {
        this.activeCard = card;
        const c = card as { atr: Buffer; protocol: number };
        this.send('card-inserted', {
          atr: c.atr.toString('hex'),
          protocol: c.protocol
        });
      });

      reader.on('card-removed', () => {
        this.activeCard = null;
        this.send('card-removed', null);
      });
    });

    this.devices.on('reader-detached', (reader: { name: string }) => {
      this.readers.delete(reader.name);
      this.send('device-deactivated', { name: reader.name, isActivated: false });
    });

    this.devices.start();
  }

  stop(): void {
    this.devices.stop();
  }

  getDevices(): Device[] {
    return Array.from(this.readers.keys()).map(name => ({
      name,
      isActivated: true
    }));
  }

  async selectDevice(name: string): Promise<void> {
    // Device selection handled by reader events
    console.log('Selected device:', name);
  }

  async sendCommand(apdu: number[]): Promise<Response> {
    if (!this.activeCard) {
      throw new Error('No card inserted');
    }

    const id = String(++this.commandId);
    const command: Command = {
      id,
      timestamp: Date.now(),
      apdu,
      hex: Buffer.from(apdu).toString('hex').toUpperCase()
    };

    this.send('command-issued', command);

    const card = this.activeCard as { transmit: (data: Buffer) => Promise<Buffer> };
    const result = await card.transmit(Buffer.from(apdu));
    const data = Array.from(result.slice(0, -2));
    const sw1 = result[result.length - 2];
    const sw2 = result[result.length - 1];

    const response: Response = {
      id,
      timestamp: Date.now(),
      data,
      sw1,
      sw2,
      hex: result.toString('hex').toUpperCase(),
      meaning: this.getStatusMeaning(sw1, sw2)
    };

    this.send('response-received', response);
    return response;
  }

  async interrogate(): Promise<void> {
    // Select PSE (1PAY.SYS.DDF01)
    const pse = [0x00, 0xA4, 0x04, 0x00, 0x0E,
      0x31, 0x50, 0x41, 0x59, 0x2E, 0x53, 0x59, 0x53,
      0x2E, 0x44, 0x44, 0x46, 0x30, 0x31, 0x00];

    try {
      await this.sendCommand(pse);
    } catch (e) {
      console.error('PSE selection failed:', e);
    }

    // Read first few records
    for (let sfi = 1; sfi <= 3; sfi++) {
      for (let record = 1; record <= 5; record++) {
        try {
          const p2 = (sfi << 3) | 0x04;
          await this.sendCommand([0x00, 0xB2, record, p2, 0x00]);
        } catch {
          break;
        }
      }
    }
  }

  private send(channel: string, data: unknown): void {
    this.window.webContents.send(channel, data);
  }

  private getStatusMeaning(sw1: number, sw2: number): string {
    if (sw1 === 0x90 && sw2 === 0x00) return 'Success';
    if (sw1 === 0x61) return `More data: ${sw2} bytes`;
    if (sw1 === 0x6A && sw2 === 0x82) return 'File not found';
    if (sw1 === 0x6A && sw2 === 0x83) return 'Record not found';
    if (sw1 === 0x69 && sw2 === 0x85) return 'Conditions not satisfied';
    if (sw1 === 0x6C) return `Wrong Le: use ${sw2}`;
    return `Status: ${sw1.toString(16).padStart(2, '0')}${sw2.toString(16).padStart(2, '0')}`;
  }
}
```
**Verify:** `npx tsc --noEmit src/main/*.ts` - no errors (or only minor ones)

### Task 8.3: Commit main process
```bash
git add -A
git commit -m "feat: add main process with smartcard v2 service"
```
**Verify:** `git status` shows clean working tree

---

## Phase 9: React Components

### Task 9.1: Create main React entry
Create `src/renderer/main.tsx`:
```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.scss';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
```
**Verify:** File exists

### Task 9.2: Create base styles
Create `src/renderer/styles/index.scss`:
```scss
@import 'normalize.css';

:root {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-tertiary: #2d2d30;
  --text-primary: #cccccc;
  --text-secondary: #808080;
  --accent: #0078d4;
  --success: #4ec9b0;
  --error: #f14c4c;
  --border: #3c3c3c;
}

* {
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

button {
  background: var(--accent);
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 2px;
  cursor: pointer;
  font-size: 12px;

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

textarea {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  padding: 8px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  resize: none;

  &:focus {
    outline: 1px solid var(--accent);
  }
}
```
**Verify:** File exists

### Task 9.3: Create App component
Create `src/renderer/App.tsx`:
```typescript
import { useState, useEffect, useCallback } from 'react';
import type { Device, Card, LogEntry } from '../shared/types';
import { Console } from './components/Console';
import { StatusBar } from './components/StatusBar';

export function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [repl, setRepl] = useState('');

  useEffect(() => {
    window.electronAPI.getDevices().then(setDevices);

    window.electronAPI.onDeviceActivated((device) => {
      setDevices(prev => [...prev, device as Device]);
    });

    window.electronAPI.onDeviceDeactivated((device) => {
      const d = device as Device;
      setDevices(prev => prev.filter(dev => dev.name !== d.name));
    });

    window.electronAPI.onCardInserted((c) => setCard(c as Card));
    window.electronAPI.onCardRemoved(() => setCard(null));

    window.electronAPI.onCommandIssued((command) => {
      const cmd = command as LogEntry['command'];
      setLog(prev => [...prev, { id: cmd.id, command: cmd }]);
    });

    window.electronAPI.onResponseReceived((response) => {
      const res = response as LogEntry['response'];
      if (res) {
        setLog(prev => prev.map(entry =>
          entry.id === res.id ? { ...entry, response: res } : entry
        ));
      }
    });

    return () => {
      window.electronAPI.removeAllListeners('device-activated');
      window.electronAPI.removeAllListeners('device-deactivated');
      window.electronAPI.removeAllListeners('card-inserted');
      window.electronAPI.removeAllListeners('card-removed');
      window.electronAPI.removeAllListeners('command-issued');
      window.electronAPI.removeAllListeners('response-received');
    };
  }, []);

  const handleSelectDevice = useCallback(async (device: Device) => {
    await window.electronAPI.selectDevice(device.name);
    setActiveDevice(device);
  }, []);

  const handleInterrogate = useCallback(() => {
    window.electronAPI.interrogate();
  }, []);

  const handleRunCommand = useCallback(() => {
    const bytes = repl.trim().split(/\s+/).map(b => parseInt(b, 16));
    if (bytes.length > 0 && bytes.every(b => !isNaN(b))) {
      window.electronAPI.sendCommand(bytes);
      setRepl('');
    }
  }, [repl]);

  const handleClearLog = useCallback(() => {
    setLog([]);
  }, []);

  return (
    <div className="app">
      <Console
        log={log}
        repl={repl}
        onReplChange={setRepl}
        onRunCommand={handleRunCommand}
        onInterrogate={handleInterrogate}
        onClearLog={handleClearLog}
        hasCard={!!card}
      />
      <StatusBar
        devices={devices}
        activeDevice={activeDevice}
        card={card}
        onSelectDevice={handleSelectDevice}
      />
    </div>
  );
}
```
**Verify:** File exists

### Task 9.4: Create Console component
Create `src/renderer/components/Console.tsx`:
```typescript
import { useRef, useEffect } from 'react';
import type { LogEntry } from '../../shared/types';
import { LogItem } from './LogItem';
import './Console.scss';

interface ConsoleProps {
  log: LogEntry[];
  repl: string;
  onReplChange: (value: string) => void;
  onRunCommand: () => void;
  onInterrogate: () => void;
  onClearLog: () => void;
  hasCard: boolean;
}

export function Console({
  log,
  repl,
  onReplChange,
  onRunCommand,
  onInterrogate,
  onClearLog,
  hasCard
}: ConsoleProps) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onRunCommand();
    }
  };

  return (
    <div className="console">
      <div className="console__toolbar">
        <button onClick={onInterrogate} disabled={!hasCard}>
          Interrogate Card
        </button>
        <button onClick={onClearLog}>
          Clear Log
        </button>
      </div>

      <div className="console__log" ref={logRef}>
        {log.length === 0 ? (
          <div className="console__empty">
            {hasCard ? 'Enter APDU command below or click Interrogate' : 'Insert a card to begin'}
          </div>
        ) : (
          log.map(entry => <LogItem key={entry.id} entry={entry} />)
        )}
      </div>

      <div className="console__repl">
        <textarea
          value={repl}
          onChange={e => onReplChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter APDU (hex): 00 A4 04 00 07 A0 00 00 00 04 10 10"
          disabled={!hasCard}
        />
        <button onClick={onRunCommand} disabled={!hasCard || !repl.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
```
**Verify:** File exists

### Task 9.5: Create Console styles
Create `src/renderer/components/Console.scss`:
```scss
.console {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &__toolbar {
    display: flex;
    gap: 8px;
    padding: 8px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
  }

  &__log {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 12px;
  }

  &__empty {
    color: var(--text-secondary);
    text-align: center;
    padding: 40px;
  }

  &__repl {
    display: flex;
    gap: 8px;
    padding: 8px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);

    textarea {
      flex: 1;
      height: 60px;
    }

    button {
      align-self: flex-end;
    }
  }
}
```
**Verify:** File exists

### Task 9.6: Create LogItem component
Create `src/renderer/components/LogItem.tsx`:
```typescript
import type { LogEntry } from '../../shared/types';
import './LogItem.scss';

interface LogItemProps {
  entry: LogEntry;
}

export function LogItem({ entry }: LogItemProps) {
  const isSuccess = entry.response?.sw1 === 0x90 && entry.response?.sw2 === 0x00;
  const isPending = !entry.response;

  return (
    <div className={`log-item ${isSuccess ? 'log-item--success' : ''} ${isPending ? 'log-item--pending' : ''}`}>
      <div className="log-item__command">
        <span className="log-item__label">→</span>
        <span className="log-item__hex">{entry.command.hex}</span>
      </div>
      {entry.response && (
        <div className="log-item__response">
          <span className="log-item__label">←</span>
          <span className="log-item__hex">{entry.response.hex}</span>
          <span className="log-item__meaning">{entry.response.meaning}</span>
        </div>
      )}
    </div>
  );
}
```
**Verify:** File exists

### Task 9.7: Create LogItem styles
Create `src/renderer/components/LogItem.scss`:
```scss
.log-item {
  margin-bottom: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);

  &--success {
    .log-item__response {
      color: var(--success);
    }
  }

  &--pending {
    opacity: 0.6;
  }

  &__command,
  &__response {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  &__response {
    margin-top: 4px;
  }

  &__label {
    color: var(--text-secondary);
    width: 16px;
  }

  &__hex {
    font-family: 'Monaco', 'Menlo', monospace;
    word-break: break-all;
  }

  &__meaning {
    color: var(--text-secondary);
    font-size: 11px;
    margin-left: auto;
  }
}
```
**Verify:** File exists

### Task 9.8: Create StatusBar component
Create `src/renderer/components/StatusBar.tsx`:
```typescript
import type { Device, Card } from '../../shared/types';
import './StatusBar.scss';

interface StatusBarProps {
  devices: Device[];
  activeDevice: Device | null;
  card: Card | null;
  onSelectDevice: (device: Device) => void;
}

export function StatusBar({ devices, activeDevice, card, onSelectDevice }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-bar__item">
        <span className={`status-bar__indicator ${devices.length > 0 ? 'status-bar__indicator--active' : ''}`} />
        <span>{devices.length} reader{devices.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="status-bar__item">
        <span className={`status-bar__indicator ${card ? 'status-bar__indicator--active' : ''}`} />
        <span>{card ? `Card: ${card.atr.substring(0, 16)}...` : 'No card'}</span>
      </div>

      {devices.length > 0 && (
        <select
          className="status-bar__select"
          value={activeDevice?.name ?? ''}
          onChange={e => {
            const device = devices.find(d => d.name === e.target.value);
            if (device) onSelectDevice(device);
          }}
        >
          <option value="">Select reader...</option>
          {devices.map(device => (
            <option key={device.name} value={device.name}>
              {device.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
```
**Verify:** File exists

### Task 9.9: Create StatusBar styles
Create `src/renderer/components/StatusBar.scss`:
```scss
.status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 8px;
  background: var(--bg-tertiary);
  border-top: 1px solid var(--border);
  font-size: 11px;

  &__item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-secondary);

    &--active {
      background: var(--success);
    }
  }

  &__select {
    margin-left: auto;
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    padding: 2px 4px;
    font-size: 11px;
  }
}
```
**Verify:** File exists

### Task 9.10: Commit React components
```bash
git add -A
git commit -m "feat: add React 18 components with TypeScript"
```
**Verify:** `git status` shows clean working tree

---

## Phase 10: Package.json Updates

### Task 10.1: Update root package.json
Update `package.json`:
```json
{
  "name": "card-spy",
  "productName": "Card Spy",
  "version": "2.0.0",
  "description": "ISO7816/EMV Smartcard Diagnostic Tool",
  "main": ".vite/build/main.js",
  "author": "tomkp <tom@tomkp.com>",
  "license": "MIT",
  "scripts": {
    "start": "electron-forge start",
    "build": "electron-forge make",
    "package": "electron-forge package",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  }
}
```
**Verify:** Scripts updated in package.json

### Task 10.2: Remove app directory (backup first)
```bash
mv app app.backup
```
**Verify:** `ls app.backup` shows old app contents

### Task 10.3: Commit package.json update
```bash
git add -A
git commit -m "chore: update package.json for new build system"
```
**Verify:** `git status` shows clean working tree

---

## Phase 11: Testing

### Task 11.1: Run TypeScript check
```bash
npm run typecheck
```
**Verify:** No errors (or only minor ones to fix)

### Task 11.2: Start development server
```bash
npm start
```
**Verify:**
- App window opens
- No console errors
- Dev tools shows React components

### Task 11.3: Test with smartcard reader
1. Connect a smartcard reader
2. Check status bar shows reader
3. Insert a card
4. Status bar shows card ATR
5. Click "Interrogate Card"
6. Commands appear in log

**Verify:** All steps work

### Task 11.4: Test REPL
1. Type `00 A4 04 00 07 A0 00 00 00 04 10 10`
2. Press Send or Enter
3. Response appears in log

**Verify:** Command executes and response shown

### Task 11.5: Production build
```bash
npm run build
```
**Verify:** Build completes without errors, output in `out/` directory

---

## Phase 12: Cleanup

### Task 12.1: Remove backup directory
```bash
rm -rf app.backup
```
**Verify:** Directory gone

### Task 12.2: Update .gitignore
Add to `.gitignore`:
```
.vite/
out/
*.log
```
**Verify:** File updated

### Task 12.3: Final commit
```bash
git add -A
git commit -m "chore: complete migration to Vite + TypeScript + React 18"
```
**Verify:** `git status` shows clean working tree

### Task 12.4: Merge to master (optional)
```bash
git checkout master
git merge upgrade/vite-typescript
```
**Verify:** Master has all changes

---

## Summary

Total tasks: ~45
Estimated time: 15-22 hours

Each task should:
1. Be completable in 5-30 minutes
2. Have a clear verification step
3. Be committable on its own (for most tasks)

If any task fails verification, stop and debug before continuing.
