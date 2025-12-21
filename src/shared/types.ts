export interface Device {
  name: string;
  isActivated: boolean;
}

export interface Card {
  atr: string;
  protocol: number;
  deviceName?: string;
}

export interface ReaderSession {
  device: Device;
  card: Card | null;
  log: LogEntry[];
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
