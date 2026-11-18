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
import { cardRemoved, PCSC_ERROR_REPEAT_MS, VIRTUAL_READER_ID } from '@shared/types';
import { parseVirtualCard, type VirtualCardDefinition } from '@shared/virtual/definition';
import { createVirtualCard } from '@shared/virtual/simulator';

const TRACE_LIMIT = 20_000;

/** How to talk to one card. Each insertion gets its own, so work for a card can't reach the next. */
interface CardHandle {
  transmit(command: Uint8Array): Promise<Uint8Array>;
  reset(cold: boolean): Promise<Uint8Array>;
}

interface Slot {
  info: ReaderInfo;
  /** The card in `info.card`, if any. */
  card?: CardHandle;
  /** Tail of this reader's command queue: APDUs to one card must never interleave. */
  queue: Promise<unknown>;
}

/** The parts of the smartcard package used here. Tests pass a fake. */
export type Smartcard = Pick<
  typeof import('smartcard'),
  | 'Devices'
  | 'SCARD_SHARE_SHARED'
  | 'SCARD_PROTOCOL_T0'
  | 'SCARD_PROTOCOL_T1'
  | 'SCARD_RESET_CARD'
  | 'SCARD_UNPOWER_CARD'
>;

async function loadSmartcard(): Promise<Smartcard> {
  const loaded = await import('smartcard');
  // A CommonJS package imported dynamically may only expose its exports on `default`.
  return ('default' in loaded ? loaded.default : loaded) as typeof import('smartcard');
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
  private nextSession = 1;
  private pcsc?: Devices;
  /** When each PC/SC error message was last seen, on the monotonic clock. */
  private pcscErrors = new Map<string, number>();

  constructor(private readonly loadPcsc: () => Promise<Smartcard> = loadSmartcard) {
    super();
  }

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
    // An error still repeating would otherwise stay out of the cleared trace.
    this.pcscErrors.clear();
  }

  /**
   * Sends an APDU to the card whose `CardInfo.session` is `session`. If that card has gone, even if
   * another has taken its place, it fails instead, including when it was queued before the card went.
   */
  async transmit(
    readerId: string,
    session: number,
    commandHex: string,
    source: ExchangeSource,
  ): Promise<string> {
    const { slot, card } = this.requireCard(readerId, session);
    const command = fromHex(commandHex);
    return this.enqueue(slot, async () => {
      this.requireCurrent(slot, card);
      const startedAt = Date.now();
      const t0 = performance.now();
      const base = {
        type: 'exchange' as const,
        id: this.nextId++,
        readerId,
        readerName: slot.info.name,
        session,
        source,
        command: toHex(command),
        startedAt,
      };
      try {
        const response = toHex(await card.transmit(command));
        this.record({ ...base, response, durationMs: performance.now() - t0 });
        return response;
      } catch (e) {
        const error = (e as Error).message;
        this.record({ ...base, error, durationMs: performance.now() - t0 });
        throw new Error(error);
      }
    });
  }

  /** Resets the card in `session` (see `transmit`); the card stays in the same session. */
  async resetCard(readerId: string, session: number, cold = false): Promise<string> {
    const { slot, card } = this.requireCard(readerId, session);
    return this.enqueue(slot, async () => {
      this.requireCurrent(slot, card);
      const atr = toHex(await card.reset(cold));
      // The card can go while it's being reset. The ATR then belongs to no card in the reader.
      const info = this.requireCurrent(slot, card);
      slot.info = { ...slot.info, card: { ...info, atr } };
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
    this.setCard(slot, {
      handle: {
        transmit: async (command) => card.transmit(command),
        reset: async () => {
          card.reset();
          return card.atr;
        },
      },
      info: { atr: toHex(card.atr), virtualName: definition.name, insertedAt: Date.now() },
    });
  }

  ejectVirtualCard(): void {
    const slot = this.slots.get(VIRTUAL_READER_ID)!;
    if (!slot.info.card) return;
    this.setCard(slot, undefined);
  }

  private async startPcsc(): Promise<void> {
    let smartcard: Smartcard;
    try {
      smartcard = await this.loadPcsc();
    } catch (e) {
      console.error('PC/SC unavailable, continuing with virtual cards only:', e);
      this.pcscError(`PC/SC unavailable, so only virtual cards work: ${errorMessage(e)}`);
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

    // Any reader or card event is news: an error after it is worth recording again, even a repeat
    // (a card that fails to connect again after being put back, say). Registered before the
    // handlers below, so one that throws can't skip it.
    for (const event of [
      'reader-attached',
      'reader-detached',
      'card-inserted',
      'card-removed',
    ] as const)
      devices.on(event, () => this.pcscErrors.clear());

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
        const handle: CardHandle = {
          transmit: async (command) =>
            // Raw exchanges only: GET RESPONSE chaining is done by the caller so every APDU shows in the trace.
            new Uint8Array(
              await card.transmit(Buffer.from(command), {
                maxRecvLength: 65538,
                autoGetResponse: false,
              }),
            ),
          reset: async (cold) => {
            // Keep the protocol in use: offering T=0|T=1 to a T=0-only card makes some readers (an
            // SCM SCR35xx, for one) report it unresponsive. smartcard 3.8 retries with the active
            // protocol by itself, but asking for it directly saves a second reset.
            await card.reconnect(
              SCARD_SHARE_SHARED,
              card.protocol || SCARD_PROTOCOL_T0 | SCARD_PROTOCOL_T1,
              cold ? SCARD_UNPOWER_CARD : SCARD_RESET_CARD,
            );
            return new Uint8Array(card.getStatus().atr);
          },
        };
        this.setCard(slot, {
          handle,
          info: { atr: toHex(card.atr ?? []), protocol: card.protocol, insertedAt: Date.now() },
        });
      },
    );
    // smartcard reports a card held through a short PC/SC outage as removed and inserted again,
    // with a new Card: like a real swap, that ends the card's session.
    devices.on('card-removed', ({ reader }) => {
      const slot = this.slots.get(id(reader.name));
      if (!slot) return;
      this.setCard(slot, undefined);
    });
    // This includes start() failing: with an error listener, smartcard reports that here too.
    devices.on('error', (error) => {
      console.error('PC/SC:', error.message);
      this.pcscError(error.message);
    });

    try {
      devices.start();
      this.pcsc = devices;
    } catch (e) {
      console.error('PC/SC failed to start, continuing with virtual cards only:', e);
    }
  }

  /** The reader and its card, if the card is the one in `session`. */
  private requireCard(readerId: string, session: number): { slot: Slot; card: CardHandle } {
    const slot = this.slots.get(readerId);
    if (!slot) throw new Error(`Unknown reader ${readerId}`);
    if (!slot.card || slot.info.card?.session !== session) throw cardRemoved(slot.info.name);
    return { slot, card: slot.card };
  }

  /** Throws unless `card` is still in the reader: queued work runs only for the card it was for. */
  private requireCurrent(slot: Slot, card: CardHandle): CardInfo {
    const current = this.slots.get(slot.info.id) === slot && slot.card === card;
    if (!current || !slot.info.card) throw cardRemoved(slot.info.name);
    return slot.info.card;
  }

  private enqueue<T>(slot: Slot, task: () => Promise<T>): Promise<T> {
    const run = slot.queue.then(task, task);
    slot.queue = run.catch(() => undefined);
    return run;
  }

  /** Puts a card in a reader, in a new session, or takes it out. */
  private setCard(
    slot: Slot,
    card: { handle: CardHandle; info: Omit<CardInfo, 'session'> } | undefined,
  ): void {
    const removed = slot.info.card;
    slot.card = card?.handle;
    slot.info = {
      ...slot.info,
      card: card ? { ...card.info, session: this.nextSession++ } : undefined,
    };
    if (slot.info.card) this.event(slot, 'card-inserted', slot.info.card.atr);
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

  /**
   * Records a PC/SC error in the trace. While the service is down the same error arrives about
   * once a second, so a message is recorded again only once it has stopped for
   * PCSC_ERROR_REPEAT_MS, or after a reader or card event.
   */
  private pcscError(message: string): void {
    const now = performance.now();
    const seen = this.pcscErrors.get(message);
    this.pcscErrors.set(message, now);
    if (seen !== undefined && now - seen < PCSC_ERROR_REPEAT_MS) return;
    this.record({ type: 'pcsc-error', id: this.nextId++, message, at: Date.now() });
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

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
