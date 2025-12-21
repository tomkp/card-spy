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
