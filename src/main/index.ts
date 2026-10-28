import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Channels } from '@shared/channels';
import type { ExchangeSource } from '@shared/types';
import { DeviceManager } from './devices';
import { Workspace } from './workspace';

const devices = new DeviceManager();
const workspace = new Workspace(
  process.env.CARDSPY_WORKSPACE ?? join(homedir(), 'Documents', 'Card Spy'),
);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Card Spy',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#16181d',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win.show());

  // Links open in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

function registerIpc(): void {
  ipcMain.handle(Channels.listReaders, () => devices.listReaders());
  ipcMain.handle(
    Channels.transmit,
    (_e, readerId: string, command: string, source: ExchangeSource) =>
      devices.transmit(readerId, command, source),
  );
  ipcMain.handle(Channels.resetCard, (_e, readerId: string, cold?: boolean) =>
    devices.resetCard(readerId, cold),
  );
  ipcMain.handle(Channels.getTrace, () => devices.getTrace());
  ipcMain.handle(Channels.clearTrace, () => devices.clearTrace());
  ipcMain.handle(Channels.insertVirtualCard, (_e, definition: unknown) =>
    devices.insertVirtualCard(definition),
  );
  ipcMain.handle(Channels.ejectVirtualCard, () => devices.ejectVirtualCard());
  ipcMain.handle(Channels.listWorkspace, () => workspace.list());
  ipcMain.handle(Channels.saveScript, (_e, name: string, content: string) =>
    workspace.saveScript(name, content),
  );
  ipcMain.handle(Channels.deleteScript, (_e, name: string) => workspace.deleteScript(name));
  ipcMain.handle(Channels.renameScript, (_e, from: string, to: string) =>
    workspace.renameScript(from, to),
  );
  ipcMain.handle(Channels.saveVirtualCard, (_e, definition) => workspace.saveCard(definition));
  ipcMain.handle(Channels.deleteVirtualCard, (_e, id: string) => workspace.deleteCard(id));
  ipcMain.handle(Channels.revealWorkspace, () => shell.openPath(workspace.root));
}

function broadcast(channel: string, value: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, value);
}

app.whenReady().then(async () => {
  await workspace.init();
  registerIpc();
  devices.on('readers', (readers) => broadcast(Channels.readersChanged, readers));
  devices.on('trace', (entry) => broadcast(Channels.traceEntry, entry));
  createWindow();
  await devices.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => devices.stop());
