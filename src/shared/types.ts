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

export interface CommandLogEntry {
  type: 'command';
  id: string;
  command: Command;
  response?: Response;
  tlv?: TlvNode[];
}

export interface CardInsertedLogEntry {
  type: 'card-inserted';
  id: string;
  device: string;
  atr: string;
}

export type LogEntry = CommandLogEntry | CardInsertedLogEntry;

export interface EmvApplicationFoundEvent {
  aid: string;
  tlv: TlvNode;
}

export interface ApplicationSelectedEvent {
  aid: string;
}

// Handler-related types
import type { CardCommand } from './handlers/types';

export interface DetectedHandlerInfo {
  id: string;
  name: string;
  description: string;
  cardType?: string;
  confidence: number;
  commands: CardCommand[];
}

export interface HandlersDetectedEvent {
  deviceName: string;
  handlers: DetectedHandlerInfo[];
}

export interface ActiveHandlerChangedEvent {
  deviceName: string;
  handlerId: string;
  commands: CardCommand[];
}

export interface ApplicationFoundEvent {
  handlerId: string;
  aid: string;
  name?: string;
  label?: string;
}

export interface InterrogationCompleteEvent {
  deviceName: string;
  handlerId: string;
  success: boolean;
  error?: string;
}

export interface ElectronAPI {
  onDeviceActivated: (callback: (device: Device) => void) => void;
  onDeviceDeactivated: (callback: (device: Device) => void) => void;
  onCardInserted: (callback: (card: Card) => void) => void;
  onCardRemoved: (callback: (data: { deviceName: string }) => void) => void;
  onCommandIssued: (callback: (command: Command) => void) => void;
  onResponseReceived: (callback: (response: Response) => void) => void;
  onEmvApplicationFound: (callback: (data: EmvApplicationFoundEvent) => void) => void;
  onApplicationSelected: (callback: (data: ApplicationSelectedEvent) => void) => void;

  // Handler events
  onHandlersDetected: (callback: (data: HandlersDetectedEvent) => void) => void;
  onActiveHandlerChanged: (callback: (data: ActiveHandlerChangedEvent) => void) => void;
  onApplicationFound: (callback: (data: ApplicationFoundEvent) => void) => void;
  onInterrogationComplete: (callback: (data: InterrogationCompleteEvent) => void) => void;

  // Device actions
  getDevices: () => Promise<Device[]>;
  getCards: () => Promise<Array<{ deviceName: string; atr: string; protocol: number }>>;
  selectDevice: (deviceName: string) => Promise<void>;
  sendCommand: (apdu: number[]) => Promise<Response>;
  interrogate: () => Promise<void>;
  repl: (command: string) => Promise<Response>;

  // Handler actions
  getAvailableCommands: () => Promise<CardCommand[]>;
  getDetectedHandlers: () => Promise<Array<{ id: string; name: string; cardType?: string }>>;
  setActiveHandler: (handlerId: string) => Promise<boolean>;
  executeCommand: (commandId: string, parameters?: Record<string, unknown>) => Promise<Response>;
  detectHandlers: (deviceName: string, atr: string) => Promise<void>;

  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
