import { describe, expect, it } from 'vitest';
import { toHex } from '@shared/hex';
import { DEMO_CARDS } from '@shared/virtual/demo-cards';
import { createVirtualCard } from '@shared/virtual/simulator';
import { createRuntime, type CardResponse } from './runtime';

function runtime(index: number) {
  const card = createVirtualCard(DEMO_CARDS[index]!);
  const sent: string[] = [];
  const logs: string[] = [];
  const globals = createRuntime({
    reader: 'Virtual Reader',
    atr: toHex(card.atr),
    transmit: async (command) => {
      sent.push(toHex(command));
      return card.transmit(command);
    },
    reset: async () => toHex(card.atr),
    log: (text) => logs.push(text),
  });
  type Card = {
    send(apdu: unknown, options?: { autoResponse?: boolean }): Promise<CardResponse>;
    select(aid: string): Promise<CardResponse>;
    getUid(): Promise<string>;
    readPages(page: number, count: number): Promise<Uint8Array>;
  };
  return { card: globals.card as Card, globals, sent, logs };
}

describe('script runtime', () => {
  it('follows 61xx with GET RESPONSE unless asked not to', async () => {
    const { card, sent } = runtime(0);
    const fci = await card.select('A0000000031010');
    expect(fci.ok).toBe(true);
    expect(fci.find('50')?.value).toEqual(new TextEncoder().encode('VISA DEBIT'));
    expect(sent.at(-1)?.startsWith('00C00000')).toBe(true);

    const raw = await card.send('00A4040007A000000003101000', { autoResponse: false });
    expect(raw.sw1).toBe(0x61);
    expect(raw.status).toMatch(/available/i);
  });

  it('builds APDUs from fields and reports status words', async () => {
    const { card } = runtime(0);
    const r = await card.send({ cla: 0x80, ins: 0xca, p1: 0x9f, p2: 0x17, le: 0 });
    expect(r.swHex).toBe('9000');
    expect(r.find('9F17')?.value).toEqual(Uint8Array.of(3));
    await expect(card.send('00B2010C00').then((x) => x.expectOk('READ RECORD'))).rejects.toThrow(
      /READ RECORD: 6A83/,
    );
  });

  it('reads Type 2 tag pages and NDEF', async () => {
    const { card, globals } = runtime(1);
    expect(await card.getUid()).toBe('04A23B7A1C5E80');
    const memory = await card.readPages(4, 20);
    expect(memory.length).toBe(80);
    const ndef = globals.ndef as { fromType2(m: Uint8Array): Array<{ decoded: { kind: string } }> };
    expect(ndef.fromType2(memory).map((r) => r.decoded.kind)).toEqual(['uri', 'text']);
  });

  it('formats responses and TLV for log()', async () => {
    const { card, globals, logs } = runtime(0);
    const log = globals.log as (...v: unknown[]) => void;
    log('ATC', await card.send('80CA9F3600'));
    expect(logs[0]).toContain('9000');
    expect(logs[0]).toContain('9F36 Application Transaction Counter');
    log(Uint8Array.of(1, 2), { a: 1 });
    expect(logs[1]).toBe('01 02 {"a":1}');
  });
});
