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
  /**
   * Identifies this card's time in the reader. A card removed and inserted again, or held through
   * a PC/SC service outage, comes back with a new one, and commands for the old one then fail.
   */
  session: number;
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
  /** The `CardInfo.session` of the card it was sent to. */
  session: number;
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

/**
 * An error from PC/SC that isn't the answer to a command: the service stopping, a card that
 * couldn't be connected, PC/SC support failing to load.
 */
export interface PcscErrorEntry {
  type: 'pcsc-error';
  id: number;
  message: string;
  at: number;
}

export type TraceEntry = ExchangeEntry | CardEventEntry | PcscErrorEntry;

/** How long a PC/SC error has to stop before the trace records it again. */
export const PCSC_ERROR_REPEAT_MS = 10_000;

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

  /**
   * Sends one APDU (hex) to the card in `session` and resolves with the raw response (hex), status
   * word included. Fails if that card is no longer in the reader.
   */
  transmit(
    readerId: string,
    session: number,
    command: string,
    source: ExchangeSource,
  ): Promise<string>;
  /** Warm reset (or cold when `cold`) of the card in `session`; resolves with the new ATR. */
  resetCard(readerId: string, session: number, cold?: boolean): Promise<string>;

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

/** The error for work on a card that has gone, whether the main process or the renderer ends it. */
export function cardRemoved(readerName: string): Error {
  return new Error(`The card in ${readerName} was removed`);
}
