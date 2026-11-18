import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { fromHex } from '@shared/hex';
import type { CardEventEntry, ReaderInfo, TraceEntry } from '@shared/types';
import { VIRTUAL_READER_ID } from '@shared/types';
import { DEMO_CARDS } from '@shared/virtual/demo-cards';
import { DeviceManager, type Smartcard } from './devices';

/** Stands in for smartcard's Devices: the tests emit its events. */
class FakeDevices extends EventEmitter {
  start(): void {}
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
async function setup() {
  const devices = new FakeDevices();
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
      'No card in R',
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
      'No card in Virtual Reader',
    );
  });
});
