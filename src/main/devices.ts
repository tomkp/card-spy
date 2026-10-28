import { EventEmitter } from 'node:events';
import type { CardInterface as PcscCard, Devices } from 'smartcard';
import { fromHex, toHex } from '@shared/hex';
import type {
  CardEventKind,
  CardInfo,
  ExchangeSource,
  ReaderInfo,
  TraceEntry,
} from '@shared/types';
import { VIRTUAL_READER_ID } from '@shared/types';
import { parseVirtualCard, type VirtualCardDefinition } from '@shared/virtual/definition';
import { createVirtualCard } from '@shared/virtual/simulator';

const TRACE_LIMIT = 20_000;

interface Slot {
  info: ReaderInfo;
  transmit?: (command: Uint8Array) => Promise<Uint8Array>;
  reset?: (cold: boolean) => Promise<Uint8Array>;
  /** Tail of this reader's command queue: APDUs to one card must never interleave. */
  queue: Promise<unknown>;
}

interface DeviceEvents {
  readers: [ReaderInfo[]];
  trace: [TraceEntry];
}

/**
 * Every reader the app can talk to (PC/SC hardware and the built-in virtual reader) behind one
 * interface, plus the trace of everything that happened to them.
 */
export class DeviceManager extends EventEmitter<DeviceEvents> {
  private slots = new Map<string, Slot>();
  private trace: TraceEntry[] = [];
  private nextId = 1;
  private pcsc?: Devices;

  async start(): Promise<void> {
    this.slots.set(VIRTUAL_READER_ID, {
      info: { id: VIRTUAL_READER_ID, name: 'Virtual Reader', kind: 'virtual' },
      queue: Promise.resolve(),
    });
    this.emitReaders();
    // CARDSPY_PCSC=off leaves out hardware readers, for screenshots and automated runs.
    if (process.env.CARDSPY_PCSC !== 'off') await this.startPcsc();
  }

  stop(): void {
    this.pcsc?.stop();
  }

  listReaders(): ReaderInfo[] {
    return [...this.slots.values()].map((s) => s.info);
  }

  getTrace(): TraceEntry[] {
    return this.trace;
  }

  clearTrace(): void {
    this.trace = [];
  }

  async transmit(readerId: string, commandHex: string, source: ExchangeSource): Promise<string> {
    const slot = this.requireCard(readerId);
    const command = fromHex(commandHex);
    return this.enqueue(slot, async () => {
      const startedAt = Date.now();
      const t0 = performance.now();
      const base = {
        type: 'exchange' as const,
        id: this.nextId++,
        readerId,
        readerName: slot.info.name,
        source,
        command: toHex(command),
        startedAt,
      };
      try {
        const response = toHex(await slot.transmit!(command));
        this.record({ ...base, response, durationMs: performance.now() - t0 });
        return response;
      } catch (e) {
        const error = (e as Error).message;
        this.record({ ...base, error, durationMs: performance.now() - t0 });
        throw new Error(error);
      }
    });
  }

  async resetCard(readerId: string, cold = false): Promise<string> {
    const slot = this.requireCard(readerId);
    return this.enqueue(slot, async () => {
      const atr = toHex(await slot.reset!(cold));
      slot.info = { ...slot.info, card: { ...slot.info.card!, atr } };
      this.event(slot, 'card-reset', atr);
      this.emitReaders();
      return atr;
    });
  }

  insertVirtualCard(json: unknown): void {
    const definition: VirtualCardDefinition = parseVirtualCard(json);
    const slot = this.slots.get(VIRTUAL_READER_ID)!;
    if (slot.info.card) this.ejectVirtualCard();
    const card = createVirtualCard(definition);
    slot.transmit = async (command) => card.transmit(command);
    slot.reset = async () => {
      card.reset();
      return card.atr;
    };
    this.setCard(slot, {
      atr: toHex(card.atr),
      virtualName: definition.name,
      insertedAt: Date.now(),
    });
  }

  ejectVirtualCard(): void {
    const slot = this.slots.get(VIRTUAL_READER_ID)!;
    if (!slot.info.card) return;
    slot.transmit = undefined;
    slot.reset = undefined;
    this.setCard(slot, undefined);
  }

  private async startPcsc(): Promise<void> {
    let smartcard: typeof import('smartcard');
    try {
      const loaded = await import('smartcard');
      // A CommonJS package imported dynamically may only expose its exports on `default`.
      smartcard = ('default' in loaded ? loaded.default : loaded) as typeof import('smartcard');
    } catch (e) {
      console.error('PC/SC unavailable, continuing with virtual cards only:', e);
      return;
    }
    const devices = new smartcard.Devices();
    const {
      SCARD_SHARE_SHARED,
      SCARD_PROTOCOL_T0,
      SCARD_PROTOCOL_T1,
      SCARD_RESET_CARD,
      SCARD_UNPOWER_CARD,
    } = smartcard;
    const id = (name: string) => `pcsc:${name}`;

    devices.on('reader-attached', (reader) => {
      const slot: Slot = {
        info: { id: id(reader.name), name: reader.name, kind: 'pcsc' },
        queue: Promise.resolve(),
      };
      this.slots.set(slot.info.id, slot);
      this.event(slot, 'reader-attached');
      this.emitReaders();
    });
    devices.on('reader-detached', (reader) => {
      const slot = this.slots.get(id(reader.name));
      if (!slot) return;
      this.slots.delete(slot.info.id);
      this.event(slot, 'reader-detached');
      this.emitReaders();
    });
    devices.on(
      'card-inserted',
      ({ reader, card }: { reader: { name: string }; card: PcscCard }) => {
        const slot = this.slots.get(id(reader.name));
        if (!slot) return;
        slot.transmit = async (command) =>
          // Raw exchanges only: GET RESPONSE chaining is done by the caller so every APDU shows in the trace.
          new Uint8Array(
            await card.transmit(Buffer.from(command), {
              maxRecvLength: 65538,
              autoGetResponse: false,
            }),
          );
        slot.reset = async (cold) => {
          // Keep the protocol in use: offering T=0|T=1 to a T=0-only card makes some readers (an
          // SCM SCR35xx, for one) report it unresponsive. smartcard 3.8 retries with the active
          // protocol by itself, but asking for it directly saves a second reset.
          await card.reconnect(
            SCARD_SHARE_SHARED,
            card.protocol || SCARD_PROTOCOL_T0 | SCARD_PROTOCOL_T1,
            cold ? SCARD_UNPOWER_CARD : SCARD_RESET_CARD,
          );
          return new Uint8Array(card.getStatus().atr);
        };
        this.setCard(slot, {
          atr: toHex(card.atr ?? []),
          protocol: card.protocol,
          insertedAt: Date.now(),
        });
      },
    );
    devices.on('card-removed', ({ reader }) => {
      const slot = this.slots.get(id(reader.name));
      if (!slot) return;
      slot.transmit = undefined;
      slot.reset = undefined;
      this.setCard(slot, undefined);
    });
    devices.on('error', (error) => console.error('PC/SC:', error.message));

    try {
      devices.start();
      this.pcsc = devices;
    } catch (e) {
      console.error('PC/SC failed to start, continuing with virtual cards only:', e);
    }
  }

  private requireCard(readerId: string): Slot {
    const slot = this.slots.get(readerId);
    if (!slot) throw new Error(`Unknown reader ${readerId}`);
    if (!slot.info.card || !slot.transmit) throw new Error(`No card in ${slot.info.name}`);
    return slot;
  }

  private enqueue<T>(slot: Slot, task: () => Promise<T>): Promise<T> {
    const run = slot.queue.then(task, task);
    slot.queue = run.catch(() => undefined);
    return run;
  }

  private setCard(slot: Slot, card: CardInfo | undefined): void {
    const removed = slot.info.card;
    slot.info = { ...slot.info, card };
    if (card) this.event(slot, 'card-inserted', card.atr);
    else if (removed) this.event(slot, 'card-removed');
    this.emitReaders();
  }

  private event(slot: Slot, event: CardEventKind, atr?: string): void {
    this.record({
      type: 'event',
      id: this.nextId++,
      readerId: slot.info.id,
      readerName: slot.info.name,
      event,
      ...(atr !== undefined ? { atr } : {}),
      at: Date.now(),
    });
  }

  private record(entry: TraceEntry): void {
    this.trace.push(entry);
    if (this.trace.length > TRACE_LIMIT) this.trace.splice(0, this.trace.length - TRACE_LIMIT);
    this.emit('trace', entry);
  }

  private emitReaders(): void {
    this.emit('readers', this.listReaders());
  }
}
