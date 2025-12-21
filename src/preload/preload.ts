import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  // Events (main → renderer)
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

  // Actions (renderer → main)
  getDevices: () => ipcRenderer.invoke('get-devices'),
  selectDevice: (name: string) => ipcRenderer.invoke('select-device', name),
  sendCommand: (apdu: number[]) => ipcRenderer.invoke('send-command', apdu),
  interrogate: () => ipcRenderer.invoke('interrogate'),

  // Cleanup
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
