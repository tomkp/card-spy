# Card Spy - Tech Stack Upgrade Plan

This document outlines the steps required to modernize the Card Spy application from its 2018-era stack to current (2024/2025) versions.

---

## Current vs Target Versions

| Package | Current | Target | Change |
|---------|---------|--------|--------|
| Electron | 3.0.6 | 34.x | Major upgrade |
| React | 16.6.0 | 18.x | Moderate |
| Webpack | 4.23.1 | - | Remove (use Vite) |
| Babel | 6.x | - | Remove (use Vite) |
| Vite | - | 6.x | New |
| TypeScript | - | 5.x | New |
| smartcard | 1.0.28 | 2.x | Major upgrade |
| Node.js | n/a | 20+ | Required |

## Why This Stack?

### Vite Instead of Webpack + Babel

| Aspect | Webpack + Babel | Vite |
|--------|-----------------|------|
| Cold start | ~7 seconds | ~1.2 seconds |
| HMR | 500ms - 1.6s | 10-20ms |
| Config files | 2+ files | 1 file |
| Dependencies | 15+ packages | 2-3 packages |
| TypeScript | Needs setup | Built-in |

### smartcard v2

| Aspect | v1.x | v2.x |
|--------|------|------|
| Node binding | NAN (breaks between versions) | N-API (stable ABI) |
| TypeScript | No types | Full type definitions |
| API | Callbacks/events | Promise-based async |
| Node.js | Needs rebuild each version | Works 12-24+ |

---

## Phase 1: Project Setup with Vite + TypeScript

**Estimated Effort:** 4-6 hours
**Risk:** Medium

### Step 1: Remove Old Build Dependencies

```bash
npm uninstall \
  webpack webpack-dev-middleware webpack-dev-server webpack-hot-middleware \
  webpack-target-electron-renderer \
  babel-cli babel-core babel-loader \
  babel-plugin-transform-object-rest-spread \
  babel-preset-es2015 babel-preset-react babel-preset-react-hmre \
  postcss postcss-loader postcss-color-function precss autoprefixer \
  css-loader style-loader \
  electron-packager electron-builder
```

### Step 2: Install New Dependencies

```bash
npm install --save-dev \
  vite \
  @vitejs/plugin-react \
  @electron-forge/cli \
  @electron-forge/plugin-vite \
  @electron-forge/maker-zip \
  @electron-forge/maker-dmg \
  electron@34 \
  typescript \
  @types/node \
  @types/react \
  @types/react-dom \
  sass

npm install \
  react@18 \
  react-dom@18 \
  react-router-dom@6 \
  smartcard@2 \
  react-resizable-panels
```

### Step 3: Create TypeScript Config

**tsconfig.json:**
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
    "allowImportingTsExtensions": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**tsconfig.node.json** (for Electron main process):
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "noEmit": false,
    "outDir": "dist"
  },
  "include": ["src/main/**/*", "src/preload/**/*"]
}
```

### Step 4: Create Vite Configs

**vite.main.config.ts:**
```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/main.ts',
      formats: ['cjs']
    },
    rollupOptions: {
      external: ['electron', 'smartcard']
    }
  }
});
```

**vite.preload.config.ts:**
```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/preload/preload.ts',
      formats: ['cjs']
    },
    rollupOptions: {
      external: ['electron']
    }
  }
});
```

**vite.renderer.config.ts:**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer')
    }
  }
});
```

### Step 5: Create Forge Config

**forge.config.ts:**
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

### Step 6: New Project Structure

```
card-spy/
├── src/
│   ├── main/
│   │   ├── main.ts              # Electron main process
│   │   └── smartcard-service.ts # Smartcard handling
│   ├── preload/
│   │   └── preload.ts           # Context bridge
│   ├── renderer/
│   │   ├── index.html
│   │   ├── main.tsx             # React entry
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Console.tsx
│   │   │   ├── CommandLog.tsx
│   │   │   ├── TlvViewer.tsx
│   │   │   ├── DeviceSelector.tsx
│   │   │   └── StatusBar.tsx
│   │   ├── hooks/
│   │   │   └── useElectronAPI.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   └── styles/
│   │       └── index.scss
│   └── shared/
│       ├── types.ts             # Shared types
│       └── emv-tags.ts          # EMV tag definitions
├── assets/
│   └── icon.{icns,ico,png}
├── tsconfig.json
├── tsconfig.node.json
├── vite.main.config.ts
├── vite.preload.config.ts
├── vite.renderer.config.ts
├── forge.config.ts
└── package.json
```

---

## Phase 2: Shared Types

**src/shared/types.ts:**
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

// IPC API exposed via preload
export interface ElectronAPI {
  // Events (main → renderer)
  onDeviceActivated: (callback: (device: Device) => void) => void;
  onDeviceDeactivated: (callback: (device: Device) => void) => void;
  onCardInserted: (callback: (card: Card) => void) => void;
  onCardRemoved: (callback: () => void) => void;
  onCommandIssued: (callback: (command: Command) => void) => void;
  onResponseReceived: (callback: (response: Response) => void) => void;

  // Actions (renderer → main)
  getDevices: () => Promise<Device[]>;
  selectDevice: (deviceName: string) => Promise<void>;
  sendCommand: (apdu: number[]) => Promise<Response>;
  interrogate: () => Promise<void>;

  // Cleanup
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

---

## Phase 3: Main Process with smartcard v2

**src/main/main.ts:**
```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { SmartcardService } from './smartcard-service';

let mainWindow: BrowserWindow | null = null;
let smartcardService: SmartcardService | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Initialize smartcard service
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

**src/main/smartcard-service.ts:**
```typescript
import { BrowserWindow } from 'electron';
import { Devices, Reader, Card } from 'smartcard';
import type { Device, Command, Response } from '../shared/types';

export class SmartcardService {
  private devices: Devices;
  private window: BrowserWindow;
  private readers: Map<string, Reader> = new Map();
  private activeReader: Reader | null = null;
  private activeCard: Card | null = null;
  private commandId = 0;

  constructor(window: BrowserWindow) {
    this.window = window;
    this.devices = new Devices();
  }

  start(): void {
    this.devices.on('reader-attached', (reader: Reader) => {
      this.readers.set(reader.name, reader);
      this.send('device-activated', { name: reader.name, isActivated: true });

      reader.on('card-inserted', (card: Card) => {
        this.activeCard = card;
        this.send('card-inserted', {
          atr: card.atr.toString('hex'),
          protocol: card.protocol
        });
      });

      reader.on('card-removed', () => {
        this.activeCard = null;
        this.send('card-removed', null);
      });
    });

    this.devices.on('reader-detached', (reader: Reader) => {
      this.readers.delete(reader.name);
      this.send('device-deactivated', { name: reader.name, isActivated: false });
    });

    this.devices.start();
  }

  stop(): void {
    this.devices.stop();
  }

  getDevices(): Device[] {
    return Array.from(this.readers.values()).map(r => ({
      name: r.name,
      isActivated: true
    }));
  }

  async selectDevice(name: string): Promise<void> {
    this.activeReader = this.readers.get(name) ?? null;
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

    const result = await this.activeCard.transmit(Buffer.from(apdu));
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
    // Select PSE
    await this.sendCommand([0x00, 0xA4, 0x04, 0x00, 0x0E,
      0x31, 0x50, 0x41, 0x59, 0x2E, 0x53, 0x59, 0x53,
      0x2E, 0x44, 0x44, 0x46, 0x30, 0x31, 0x00]);

    // Read records...
    for (let sfi = 1; sfi <= 10; sfi++) {
      for (let record = 1; record <= 10; record++) {
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
    if (sw1 === 0x6A && sw2 === 0x82) return 'File not found';
    if (sw1 === 0x6A && sw2 === 0x83) return 'Record not found';
    if (sw1 === 0x69 && sw2 === 0x85) return 'Conditions not satisfied';
    return `Unknown: ${sw1.toString(16)}${sw2.toString(16)}`;
  }
}
```

---

## Phase 4: Preload Script

**src/preload/preload.ts:**
```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../shared/types';

const electronAPI: ElectronAPI = {
  // Events
  onDeviceActivated: (callback) =>
    ipcRenderer.on('device-activated', (_, data) => callback(data)),
  onDeviceDeactivated: (callback) =>
    ipcRenderer.on('device-deactivated', (_, data) => callback(data)),
  onCardInserted: (callback) =>
    ipcRenderer.on('card-inserted', (_, data) => callback(data)),
  onCardRemoved: (callback) =>
    ipcRenderer.on('card-removed', () => callback()),
  onCommandIssued: (callback) =>
    ipcRenderer.on('command-issued', (_, data) => callback(data)),
  onResponseReceived: (callback) =>
    ipcRenderer.on('response-received', (_, data) => callback(data)),

  // Actions (using invoke for async)
  getDevices: () => ipcRenderer.invoke('get-devices'),
  selectDevice: (name) => ipcRenderer.invoke('select-device', name),
  sendCommand: (apdu) => ipcRenderer.invoke('send-command', apdu),
  interrogate: () => ipcRenderer.invoke('interrogate'),

  // Cleanup
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
```

---

## Phase 5: React Components (TypeScript)

**src/renderer/main.tsx:**
```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.scss';

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

**src/renderer/App.tsx:**
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
    // Load initial devices
    window.electronAPI.getDevices().then(setDevices);

    // Subscribe to events
    window.electronAPI.onDeviceActivated((device) => {
      setDevices(prev => [...prev, device]);
    });

    window.electronAPI.onDeviceDeactivated((device) => {
      setDevices(prev => prev.filter(d => d.name !== device.name));
    });

    window.electronAPI.onCardInserted(setCard);
    window.electronAPI.onCardRemoved(() => setCard(null));

    window.electronAPI.onCommandIssued((command) => {
      setLog(prev => [...prev, { id: command.id, command }]);
    });

    window.electronAPI.onResponseReceived((response) => {
      setLog(prev => prev.map(entry =>
        entry.id === response.id
          ? { ...entry, response }
          : entry
      ));
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

**src/renderer/components/Console.tsx:**
```typescript
import { useRef, useEffect } from 'react';
import type { LogEntry } from '../../shared/types';
import { CommandLog } from './CommandLog';

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

  return (
    <div className="console">
      <div className="console__toolbar">
        <button onClick={onInterrogate} disabled={!hasCard}>
          Interrogate
        </button>
        <button onClick={onClearLog}>Clear</button>
      </div>

      <div className="console__log" ref={logRef}>
        {log.map(entry => (
          <CommandLog key={entry.id} entry={entry} />
        ))}
      </div>

      <div className="console__repl">
        <textarea
          value={repl}
          onChange={e => onReplChange(e.target.value)}
          placeholder="Enter APDU (hex): 00 A4 04 00 ..."
        />
        <button onClick={onRunCommand} disabled={!hasCard || !repl.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
```

**src/renderer/components/TlvViewer.tsx:**
```typescript
import type { TlvNode } from '../../shared/types';
import { EMV_TAGS } from '../../shared/emv-tags';

interface TlvViewerProps {
  nodes: TlvNode[];
  depth?: number;
}

export function TlvViewer({ nodes, depth = 0 }: TlvViewerProps) {
  return (
    <ul className="tlv-viewer" style={{ marginLeft: depth * 16 }}>
      {nodes.map((node, index) => (
        <li key={index} className="tlv-node">
          <span className="tlv-tag">{node.tagHex}</span>
          <span className="tlv-name">
            {EMV_TAGS[node.tag] ?? 'Unknown'}
          </span>
          <span className="tlv-length">({node.length})</span>

          {node.isConstructed ? (
            <TlvViewer nodes={node.value as TlvNode[]} depth={depth + 1} />
          ) : (
            <span className="tlv-value">
              {Buffer.from(node.value as number[]).toString('hex')}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
```

---

## Phase 6: Final Package.json

```json
{
  "name": "card-spy",
  "version": "2.0.0",
  "description": "ISO7816/EMV Smartcard Diagnostic Tool",
  "main": ".vite/build/main.js",
  "scripts": {
    "start": "electron-forge start",
    "build": "electron-forge make",
    "package": "electron-forge package",
    "lint": "eslint src/ --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@electron-forge/cli": "^7.0.0",
    "@electron-forge/maker-dmg": "^7.0.0",
    "@electron-forge/maker-zip": "^7.0.0",
    "@electron-forge/plugin-vite": "^7.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "electron": "^34.0.0",
    "eslint": "^9.0.0",
    "sass": "^1.70.0",
    "typescript": "^5.0.0",
    "vite": "^6.0.0"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "react-resizable-panels": "^2.0.0",
    "react-router-dom": "^6.0.0",
    "smartcard": "^2.0.0"
  }
}
```

---

## Implementation Order

```
┌─────────────────────────────────────────────────────────────┐
│  1. PROJECT SETUP                                           │
│     ├── Remove old dependencies                             │
│     ├── Install Vite, TypeScript, Electron Forge            │
│     ├── Create tsconfig.json files                          │
│     ├── Create Vite config files                            │
│     └── Create new directory structure                      │
├─────────────────────────────────────────────────────────────┤
│  2. SHARED TYPES                                            │
│     ├── Define Device, Card, Command, Response types        │
│     ├── Define ElectronAPI interface                        │
│     └── Migrate EMV tags to TypeScript                      │
├─────────────────────────────────────────────────────────────┤
│  3. MAIN PROCESS                                            │
│     ├── Rewrite main.ts with smartcard v2                   │
│     ├── Create SmartcardService class                       │
│     └── Set up IPC handlers                                 │
├─────────────────────────────────────────────────────────────┤
│  4. PRELOAD SCRIPT                                          │
│     ├── Create typed preload.ts                             │
│     └── Expose ElectronAPI via contextBridge                │
├─────────────────────────────────────────────────────────────┤
│  5. REACT COMPONENTS                                        │
│     ├── Convert all components to TypeScript                │
│     ├── Use React 18 patterns (hooks, createRoot)           │
│     └── Update styles                                       │
├─────────────────────────────────────────────────────────────┤
│  6. TESTING & POLISH                                        │
│     ├── Test smartcard functionality                        │
│     ├── Add ESLint rules                                    │
│     └── Production build                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Estimated Effort Summary

| Phase | Effort | Risk | Key Work |
|-------|--------|------|----------|
| 1. Project Setup | 3-4 hours | Medium | Config files, structure |
| 2. Shared Types | 1-2 hours | Low | Type definitions |
| 3. Main Process | 4-6 hours | High | smartcard v2 integration |
| 4. Preload Script | 1 hour | Low | Context bridge |
| 5. React Components | 4-6 hours | Medium | TypeScript conversion |
| 6. Testing & Polish | 2-3 hours | Low | Verification |

**Total: 15-22 hours**

---

## Migration Checklist

### Files to Delete
- [ ] `webpack.config.js`
- [ ] `.babelrc`
- [ ] `app/` directory (after migration)
- [ ] Old `package-lock.json`

### Files to Create
- [ ] `tsconfig.json`
- [ ] `tsconfig.node.json`
- [ ] `vite.main.config.ts`
- [ ] `vite.preload.config.ts`
- [ ] `vite.renderer.config.ts`
- [ ] `forge.config.ts`
- [ ] `src/main/main.ts`
- [ ] `src/main/smartcard-service.ts`
- [ ] `src/preload/preload.ts`
- [ ] `src/shared/types.ts`
- [ ] `src/shared/emv-tags.ts`
- [ ] `src/renderer/main.tsx`
- [ ] `src/renderer/App.tsx`
- [ ] `src/renderer/components/*.tsx`

### Testing Checklist
- [ ] App launches without errors
- [ ] TypeScript compiles without errors
- [ ] Smartcard reader detection works
- [ ] Card insertion detected (ATR displayed)
- [ ] APDU commands execute correctly
- [ ] TLV responses parse and display
- [ ] Hot reload works in development
- [ ] Production build works

---

## Resources

### Documentation
- [Electron Forge + Vite](https://www.electronforge.io/config/plugins/vite)
- [Vite TypeScript](https://vitejs.dev/guide/features.html#typescript)
- [React 18](https://react.dev/)
- [smartcard v2](https://github.com/tomkp/smartcard)

### Templates
- [electron-vite-react](https://github.com/electron-vite/electron-vite-react)
- [Electron Forge Vite + TypeScript](https://www.electronforge.io/templates/vite-typescript)

---

*Plan updated: December 2024*
*Stack: Vite + TypeScript + React 18 + Electron 34 + smartcard v2*
