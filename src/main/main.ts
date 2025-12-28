import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { SmartcardService } from './smartcard-service';

let mainWindow: BrowserWindow | null = null;
let smartcardService: SmartcardService | null = null;

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({
      mode: 'detach',
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  smartcardService = new SmartcardService(mainWindow);
  smartcardService.start();
}

app.whenReady().then(createWindow);

function cleanup(): void {
  if (smartcardService) {
    smartcardService.stop();
    smartcardService = null;
  }

  // Remove IPC handlers
  ipcMain.removeHandler('get-devices');
  ipcMain.removeHandler('get-cards');
  ipcMain.removeHandler('select-device');
  ipcMain.removeHandler('send-command');
  ipcMain.removeHandler('interrogate');
  ipcMain.removeHandler('repl');
  ipcMain.removeHandler('get-available-commands');
  ipcMain.removeHandler('get-detected-handlers');
  ipcMain.removeHandler('set-active-handler');
  ipcMain.removeHandler('execute-command');
  ipcMain.removeHandler('detect-handlers');
}

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  cleanup();
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

ipcMain.handle('get-cards', () => {
  return smartcardService?.getCards() ?? [];
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

ipcMain.handle('repl', async (_, command: string) => {
  return smartcardService?.repl(command);
});

// Handler IPC handlers
ipcMain.handle('get-available-commands', () => {
  return smartcardService?.getAvailableCommands() ?? [];
});

ipcMain.handle('get-detected-handlers', () => {
  return smartcardService?.getDetectedHandlers() ?? [];
});

ipcMain.handle('set-active-handler', (_, handlerId: string) => {
  return smartcardService?.setActiveHandler(handlerId) ?? false;
});

ipcMain.handle('execute-command', async (_, commandId: string, parameters?: Record<string, unknown>) => {
  return smartcardService?.executeCommand(commandId, parameters as Record<string, string | number | boolean>);
});

ipcMain.handle('detect-handlers', async (_, deviceName: string, atr: string) => {
  await smartcardService?.detectCardHandlers(deviceName, atr);
});
