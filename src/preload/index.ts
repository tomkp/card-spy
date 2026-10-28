import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { Channels } from '@shared/channels';
import type { CardSpyApi } from '@shared/types';

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: CardSpyApi = {
  listReaders: () => ipcRenderer.invoke(Channels.listReaders),
  onReadersChanged: (listener) => subscribe(Channels.readersChanged, listener),
  transmit: (readerId, command, source) =>
    ipcRenderer.invoke(Channels.transmit, readerId, command, source),
  resetCard: (readerId, cold) => ipcRenderer.invoke(Channels.resetCard, readerId, cold),
  getTrace: () => ipcRenderer.invoke(Channels.getTrace),
  clearTrace: () => ipcRenderer.invoke(Channels.clearTrace),
  onTrace: (listener) => subscribe(Channels.traceEntry, listener),
  insertVirtualCard: (definition) => ipcRenderer.invoke(Channels.insertVirtualCard, definition),
  ejectVirtualCard: () => ipcRenderer.invoke(Channels.ejectVirtualCard),
  listWorkspace: () => ipcRenderer.invoke(Channels.listWorkspace),
  saveScript: (name, content) => ipcRenderer.invoke(Channels.saveScript, name, content),
  deleteScript: (name) => ipcRenderer.invoke(Channels.deleteScript, name),
  renameScript: (from, to) => ipcRenderer.invoke(Channels.renameScript, from, to),
  saveVirtualCard: (definition) => ipcRenderer.invoke(Channels.saveVirtualCard, definition),
  deleteVirtualCard: (id) => ipcRenderer.invoke(Channels.deleteVirtualCard, id),
  revealWorkspace: () => ipcRenderer.invoke(Channels.revealWorkspace),
};

contextBridge.exposeInMainWorld('cardspy', api);
