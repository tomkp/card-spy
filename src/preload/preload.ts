import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  // Events (main → renderer)
  onDeviceActivated: (callback: (device: unknown) => void) =>
    ipcRenderer.on('device-activated', (_, data) => callback(data)),
  onDeviceDeactivated: (callback: (device: unknown) => void) =>
    ipcRenderer.on('device-deactivated', (_, data) => callback(data)),
  onCardInserted: (callback: (card: unknown) => void) =>
    ipcRenderer.on('card-inserted', (_, data) => callback(data)),
  onCardRemoved: (callback: (data: unknown) => void) =>
    ipcRenderer.on('card-removed', (_, data) => callback(data)),
  onCommandIssued: (callback: (command: unknown) => void) =>
    ipcRenderer.on('command-issued', (_, data) => callback(data)),
  onResponseReceived: (callback: (response: unknown) => void) =>
    ipcRenderer.on('response-received', (_, data) => callback(data)),
  onEmvApplicationFound: (callback: (data: unknown) => void) =>
    ipcRenderer.on('emv-application-found', (_, data) => callback(data)),
  onApplicationSelected: (callback: (data: unknown) => void) =>
    ipcRenderer.on('application-selected', (_, data) => callback(data)),

  // Handler events
  onHandlersDetected: (callback: (data: unknown) => void) =>
    ipcRenderer.on('handlers-detected', (_, data) => callback(data)),
  onActiveHandlerChanged: (callback: (data: unknown) => void) =>
    ipcRenderer.on('active-handler-changed', (_, data) => callback(data)),
  onApplicationFound: (callback: (data: unknown) => void) =>
    ipcRenderer.on('application-found', (_, data) => callback(data)),
  onInterrogationComplete: (callback: (data: unknown) => void) =>
    ipcRenderer.on('interrogation-complete', (_, data) => callback(data)),

  // Actions (renderer → main)
  getDevices: () => ipcRenderer.invoke('get-devices'),
  getCards: () => ipcRenderer.invoke('get-cards'),
  selectDevice: (name: string) => ipcRenderer.invoke('select-device', name),
  sendCommand: (apdu: number[]) => ipcRenderer.invoke('send-command', apdu),
  interrogate: () => ipcRenderer.invoke('interrogate'),
  repl: (command: string) => ipcRenderer.invoke('repl', command),

  // Handler actions
  getAvailableCommands: () => ipcRenderer.invoke('get-available-commands'),
  getDetectedHandlers: () => ipcRenderer.invoke('get-detected-handlers'),
  setActiveHandler: (handlerId: string) => ipcRenderer.invoke('set-active-handler', handlerId),
  executeCommand: (commandId: string, parameters?: Record<string, unknown>) =>
    ipcRenderer.invoke('execute-command', commandId, parameters),
  detectHandlers: (deviceName: string, atr: string) =>
    ipcRenderer.invoke('detect-handlers', deviceName, atr),

  // Cleanup
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
