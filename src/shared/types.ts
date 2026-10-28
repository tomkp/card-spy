import type { VirtualCardDefinition } from './virtual/definition';

/** Who sent an APDU. Shown in the trace so you can tell your own commands from automated ones. */
export type ExchangeSource = 'console' | 'explorer' | 'script' | 'system';

export type ReaderKind = 'pcsc' | 'virtual';

export interface CardInfo {
  atr: string;
  /** PC/SC protocol constant (T=0 / T=1); absent for virtual cards. */
  protocol?: number;
  /** Name of the virtual card definition, for virtual readers. */
  virtualName?: string;
  insertedAt: number;
}

export interface ReaderInfo {
  id: string;
  name: string;
  kind: ReaderKind;
  card?: CardInfo;
}

export interface ExchangeEntry {
  type: 'exchange';
  id: number;
  readerId: string;
  readerName: string;
  source: ExchangeSource;
  /** Hex, no separators. */
  command: string;
  response?: string;
  error?: string;
  startedAt: number;
  durationMs: number;
}

export type CardEventKind =
  'reader-attached' | 'reader-detached' | 'card-inserted' | 'card-removed' | 'card-reset';

export interface CardEventEntry {
  type: 'event';
  id: number;
  readerId: string;
  readerName: string;
  event: CardEventKind;
  atr?: string;
  at: number;
}

export type TraceEntry = ExchangeEntry | CardEventEntry;

export interface ScriptFile {
  name: string;
  /** Whole file contents; included in listings because scripts are small. */
  content: string;
}

export interface VirtualCardFile {
  /** File name in the workspace cards folder, or `builtin:<id>` for bundled cards. */
  id: string;
  builtin: boolean;
  definition: VirtualCardDefinition;
}

export interface WorkspaceListing {
  root: string;
  scripts: ScriptFile[];
  cards: VirtualCardFile[];
}

/** Everything the renderer can ask of the main process. Exposed as `window.cardspy` by the preload. */
export interface CardSpyApi {
  listReaders(): Promise<ReaderInfo[]>;
  onReadersChanged(listener: (readers: ReaderInfo[]) => void): () => void;

  /** Sends one APDU (hex) and resolves with the raw response (hex), status word included. */
  transmit(readerId: string, command: string, source: ExchangeSource): Promise<string>;
  /** Warm reset (or cold when `cold`); resolves with the new ATR. */
  resetCard(readerId: string, cold?: boolean): Promise<string>;

  getTrace(): Promise<TraceEntry[]>;
  clearTrace(): Promise<void>;
  onTrace(listener: (entry: TraceEntry) => void): () => void;

  insertVirtualCard(definition: VirtualCardDefinition): Promise<void>;
  ejectVirtualCard(): Promise<void>;

  listWorkspace(): Promise<WorkspaceListing>;
  saveScript(name: string, content: string): Promise<void>;
  deleteScript(name: string): Promise<void>;
  renameScript(from: string, to: string): Promise<void>;
  saveVirtualCard(definition: VirtualCardDefinition): Promise<string>;
  deleteVirtualCard(id: string): Promise<void>;
  revealWorkspace(): Promise<void>;
}

export const VIRTUAL_READER_ID = 'virtual:0';
