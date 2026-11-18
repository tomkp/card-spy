import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromHex } from '@shared/hex';
import type { CardEventEntry, ReaderInfo, TraceEntry } from '@shared/types';
import { VIRTUAL_READER_ID } from '@shared/types';
import { DEMO_CARDS } from '@shared/virtual/demo-cards';
import { DeviceManager, type Smartcard } from './devices';

// CARDSPY_PCSC=off would leave the fake Devices out.
vi.stubEnv('CARDSPY_PCSC', 'on');

/** Stands in for smartcard's Devices: the tests emit its events. */
class FakeDevices extends EventEmitter {
  /** smartcard reports a failure to start as an error event when something listens for one. */
  startError?: Error;
  start(): void {
    if (this.startError) this.emit('error', this.startError);
  }
  stop(): void {}
}

const SCARD_SHARE_SHARED = 2;
const SCARD_PROTOCOL_T1 = 2;
const SCARD_RESET_CARD = 1;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A smartcard Card: answers 9000 to everything unless a test says otherwise. */
function fakeCard(atr: string) {
  return {
    atr: Buffer.from(fromHex(atr)),
    protocol: SCARD_PROTOCOL_T1,
    transmit: vi.fn(async (_command: Buffer, _options?: object): Promise<Buffer> =>
      Buffer.from([0x90, 0x00]),
    ),
    reconnect: vi.fn(async (_share: number, _protocol: number, _disposition: number) => {}),
    getStatus: vi.fn(() => ({ atr: Buffer.from(fromHex(atr)) })),
  };
}

/** Lets queued work run as far as it can. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** A DeviceManager on a fake Devices, with one PC/SC reader, "R", attached. */
async function setup(startError?: Error) {
  const devices = new FakeDevices();
  devices.startError = startError;
  const smartcard = {
    Devices: class {
      constructor() {
        return devices;
      }
    },
    SCARD_SHARE_SHARED,
    SCARD_PROTOCOL_T0: 1,
    SCARD_PROTOCOL_T1,
    SCARD_RESET_CARD,
    SCARD_UNPOWER_CARD: 2,
  } as unknown as Smartcard;
  const manager = new DeviceManager(async () => smartcard);
  const trace: TraceEntry[] = [];
  manager.on('trace', (entry) => trace.push(entry));
  await manager.start();
  devices.emit('reader-attached', { name: 'R' });

  const reader = (): ReaderInfo => manager.listReaders().find((r) => r.id === 'pcsc:R')!;
  const insert = (card: ReturnType<typeof fakeCard>) => {
    devices.emit('card-inserted', { reader: { name: 'R' }, card });
    return reader().card!.session;
  };
  const remove = (card: ReturnType<typeof fakeCard> | null) =>
    devices.emit('card-removed', { reader: { name: 'R' }, card });
  const events = () =>
    trace.filter((e): e is CardEventEntry => e.type === 'event').map((e) => e.event);
  return { manager, devices, trace, reader, insert, remove, events };
}

describe('DeviceManager', () => {
  it('gives every card a new session, even one that comes back after an outage', async () => {
    const { reader, insert, remove, events } = await setup();
    const first = insert(fakeCard('3B00'));
    // A card held through a short outage comes back as removed and inserted again.
    remove(null);
    expect(reader().card).toBeUndefined();
    const second = insert(fakeCard('3B00'));
    expect(second).not.toBe(first);
    expect(events()).toEqual(['reader-attached', 'card-inserted', 'card-removed', 'card-inserted']);
  });

  it('sends a command to the card in its session, and records the session in the trace', async () => {
    const { manager, trace, insert } = await setup();
    const card = fakeCard('3B00');
    const session = insert(card);
    await expect(manager.transmit('pcsc:R', session, '00A4040000', 'console')).resolves.toBe(
      '9000',
    );
    expect(card.transmit).toHaveBeenCalledWith(Buffer.from(fromHex('00A4040000')), {
      maxRecvLength: 65538,
      autoGetResponse: false,
    });
    expect(trace.at(-1)).toMatchObject({ type: 'exchange', session, response: '9000' });
  });

  it('refuses a command for a card that has been replaced', async () => {
    const { manager, insert, remove } = await setup();
    const old = insert(fakeCard('3B00'));
    remove(null);
    const replacement = fakeCard('3B00');
    insert(replacement);
    await expect(manager.transmit('pcsc:R', old, '00B0000000', 'script')).rejects.toThrow(
      'The card in R was removed',
    );
    await expect(manager.resetCard('pcsc:R', old)).rejects.toThrow('The card in R was removed');
    expect(replacement.transmit).not.toHaveBeenCalled();
    expect(replacement.reconnect).not.toHaveBeenCalled();
  });

  it('fails a queued command whose card is replaced, rather than sending it to the new card', async () => {
    const { manager, trace, insert, remove } = await setup();
    const card = fakeCard('3B00');
    const answer = deferred<Buffer>();
    card.transmit.mockReturnValueOnce(answer.promise);
    const session = insert(card);

    const first = manager.transmit('pcsc:R', session, '00A4040000', 'explorer');
    const queued = manager.transmit('pcsc:R', session, '00B2010C00', 'explorer');
    const queuedReset = manager.resetCard('pcsc:R', session);
    await settle();
    expect(card.transmit).toHaveBeenCalledTimes(1);

    remove(card);
    const replacement = fakeCard('3B00');
    insert(replacement);
    answer.resolve(Buffer.from([0x90, 0x00]));

    await expect(first).resolves.toBe('9000');
    await expect(queued).rejects.toThrow('The card in R was removed');
    await expect(queuedReset).rejects.toThrow('The card in R was removed');
    expect(card.transmit).toHaveBeenCalledTimes(1);
    expect(replacement.transmit).not.toHaveBeenCalled();
    expect(replacement.reconnect).not.toHaveBeenCalled();
    // Only the command that was sent is in the trace.
    expect(trace.filter((e) => e.type === 'exchange')).toHaveLength(1);
  });

  it('fails a queued command whose card is removed with an error, not a TypeError', async () => {
    const { manager, insert, remove } = await setup();
    const card = fakeCard('3B00');
    const answer = deferred<Buffer>();
    card.transmit.mockReturnValueOnce(answer.promise);
    const session = insert(card);

    const first = manager.transmit('pcsc:R', session, '00A4040000', 'console');
    const queued = manager.transmit('pcsc:R', session, '00B2010C00', 'console');
    await settle();
    remove(card);
    answer.resolve(Buffer.from([0x90, 0x00]));

    await first;
    const error = await queued.catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(TypeError);
    expect(error).toEqual(new Error('The card in R was removed'));
  });

  it('fails a queued command whose reader is detached', async () => {
    const { manager, devices, insert, remove } = await setup();
    const card = fakeCard('3B00');
    const answer = deferred<Buffer>();
    card.transmit.mockReturnValueOnce(answer.promise);
    const session = insert(card);

    const first = manager.transmit('pcsc:R', session, '00A4040000', 'script');
    const queued = manager.transmit('pcsc:R', session, '00B2010C00', 'script');
    await settle();
    // An outage of more than a second: the card is removed, then the reader detached and attached.
    remove(card);
    devices.emit('reader-detached', { name: 'R' });
    devices.emit('reader-attached', { name: 'R' });
    answer.resolve(Buffer.from([0x90, 0x00]));

    await first;
    await expect(queued).rejects.toThrow('The card in R was removed');
    expect(card.transmit).toHaveBeenCalledTimes(1);
  });

  it('resets a card in its session and records its new ATR', async () => {
    const { manager, reader, insert, events } = await setup();
    const card = fakeCard('3B00');
    const session = insert(card);
    card.getStatus.mockReturnValue({ atr: Buffer.from(fromHex('3B01')) });

    await expect(manager.resetCard('pcsc:R', session)).resolves.toBe('3B01');
    expect(card.reconnect).toHaveBeenCalledWith(
      SCARD_SHARE_SHARED,
      SCARD_PROTOCOL_T1,
      SCARD_RESET_CARD,
    );
    expect(reader().card).toMatchObject({ atr: '3B01', session });
    expect(events().at(-1)).toBe('card-reset');
  });

  it('leaves no card behind when the card is removed during a reset', async () => {
    const { manager, reader, insert, remove, events } = await setup();
    const card = fakeCard('3B00');
    const reconnected = deferred<void>();
    card.reconnect.mockReturnValueOnce(reconnected.promise);
    const session = insert(card);

    const reset = manager.resetCard('pcsc:R', session);
    await settle();
    remove(card);
    reconnected.resolve();

    await expect(reset).rejects.toThrow('The card in R was removed');
    expect(reader().card).toBeUndefined();
    expect(events()).not.toContain('card-reset');
    await expect(manager.transmit('pcsc:R', session, '00A4040000', 'console')).rejects.toThrow(
      'The card in R was removed',
    );
  });

  it("keeps the new card's ATR when the card is replaced during a reset", async () => {
    const { manager, reader, insert, remove, events } = await setup();
    const card = fakeCard('3B00');
    const reconnected = deferred<void>();
    card.reconnect.mockReturnValueOnce(reconnected.promise);
    card.getStatus.mockReturnValue({ atr: Buffer.from(fromHex('3B01')) });
    const session = insert(card);

    const reset = manager.resetCard('pcsc:R', session);
    await settle();
    remove(card);
    const replaced = insert(fakeCard('3B02'));
    reconnected.resolve();

    await expect(reset).rejects.toThrow('The card in R was removed');
    expect(reader().card).toMatchObject({ atr: '3B02', session: replaced });
    expect(events()).not.toContain('card-reset');
  });

  it('ends a virtual card session when another virtual card goes in', async () => {
    const { manager } = await setup();
    const virtual = () => manager.listReaders().find((r) => r.id === VIRTUAL_READER_ID)!;
    manager.insertVirtualCard(DEMO_CARDS[0]);
    const first = virtual().card!.session;
    manager.insertVirtualCard(DEMO_CARDS[0]);
    const second = virtual().card!.session;
    expect(second).not.toBe(first);

    const select = '00A4040007A000000003101000';
    await expect(manager.transmit(VIRTUAL_READER_ID, first, select, 'console')).rejects.toThrow(
      'The card in Virtual Reader was removed',
    );
    // The demo card answers 61xx: its FCI waits for GET RESPONSE.
    await expect(manager.transmit(VIRTUAL_READER_ID, second, select, 'console')).resolves.toMatch(
      /^61/,
    );

    manager.ejectVirtualCard();
    await expect(manager.resetCard(VIRTUAL_READER_ID, second)).rejects.toThrow(
      'The card in Virtual Reader was removed',
    );
  });
});

describe('PC/SC errors', () => {
  afterEach(() => vi.restoreAllMocks());
  afterEach(() => vi.useRealTimers());

  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});
  const fakeClock = () => vi.useFakeTimers({ toFake: ['Date', 'performance'] });
  const later = (ms: number) => vi.advanceTimersByTime(ms);
  const errors = (trace: readonly TraceEntry[]) =>
    trace.flatMap((e) => (e.type === 'pcsc-error' ? [e.message] : []));

  it('records an error in the trace once while it keeps repeating', async () => {
    quiet();
    fakeClock();
    const { devices, trace } = await setup();
    // While the service is down, smartcard reports it about once a second.
    const down = new Error('The Smart Card Resource Manager is not running. (0x8010001D)');
    for (let i = 0; i < 30; i++) {
      devices.emit('error', down);
      later(1_000);
    }
    devices.emit('error', new Error('Unknown error. (0x80100014)'));
    expect(errors(trace)).toEqual([down.message, 'Unknown error. (0x80100014)']);
  });

  it('records an error again once it has stopped for 10 s', async () => {
    quiet();
    fakeClock();
    const { devices, trace } = await setup();
    const fail = () => devices.emit('error', new Error('down'));
    fail();
    later(9_000);
    fail();
    later(9_000);
    fail();
    expect(errors(trace)).toHaveLength(1);
    later(10_000);
    fail();
    expect(errors(trace)).toHaveLength(2);
  });

  it('records an error again after any reader or card event', async () => {
    quiet();
    const { devices, trace, insert, remove } = await setup();
    // A card that fails to connect, is put back, and fails again.
    const fail = () => devices.emit('error', new Error('The smart card is not responding.'));
    fail();
    fail();
    remove(null);
    fail();
    insert(fakeCard('3B00'));
    fail();
    devices.emit('reader-detached', { name: 'R' });
    fail();
    devices.emit('reader-attached', { name: 'R' });
    fail();
    expect(errors(trace)).toHaveLength(5);
  });

  it('records a repeating error again after the trace is cleared', async () => {
    quiet();
    const { manager, devices } = await setup();
    devices.emit('error', new Error('down'));
    manager.clearTrace();
    devices.emit('error', new Error('down'));
    expect(errors(manager.getTrace())).toEqual(['down']);
  });

  it('records PC/SC failing to start', async () => {
    quiet();
    const { manager } = await setup(new Error('The Smart Card Resource Manager is not running.'));
    expect(errors(manager.getTrace())).toEqual(['The Smart Card Resource Manager is not running.']);
  });

  it('records PC/SC support failing to load', async () => {
    quiet();
    const manager = new DeviceManager(async () => {
      throw new Error('libpcsclite.so.1: cannot open shared object file');
    });
    await manager.start();
    expect(errors(manager.getTrace())).toEqual([
      'PC/SC unavailable, so only virtual cards work: libpcsclite.so.1: cannot open shared object file',
    ]);
    expect(manager.listReaders().map((r) => r.id)).toEqual([VIRTUAL_READER_ID]);

    const odd = new DeviceManager(() => Promise.reject('no addon'));
    await odd.start();
    expect(errors(odd.getTrace())).toEqual([
      'PC/SC unavailable, so only virtual cards work: no addon',
    ]);
  });
});
