import { describe, expect, it } from 'vitest';
import { fromHex, toHex } from '../hex';
import {
  compilePattern,
  matchesPattern,
  parseVirtualCard,
  type VirtualCardDefinition,
} from './definition';
import { recordVirtualCard } from './recorder';
import { createVirtualCard } from './simulator';

const send = (card: ReturnType<typeof createVirtualCard>, hex: string) =>
  toHex(card.transmit(fromHex(hex)));

function apduCard(rules: VirtualCardDefinition['model'] & { kind: 'apdu' }): VirtualCardDefinition {
  return { format: 'card-spy/virtual-card', version: 1, name: 'test', atr: '3B00', model: rules };
}

describe('patterns', () => {
  it('matches exact, wildcard and open patterns', () => {
    expect(matchesPattern(compilePattern('00A40400'), fromHex('00A40400'))).toBe(true);
    expect(matchesPattern(compilePattern('00A40400'), fromHex('00A4040000'))).toBe(false);
    expect(matchesPattern(compilePattern('00 B2 ?? 0C 00'), fromHex('00B2030C00'))).toBe(true);
    expect(matchesPattern(compilePattern('80A80000*'), fromHex('80A80000'))).toBe(true);
    expect(matchesPattern(compilePattern('80A80000*'), fromHex('80A8000002830000'))).toBe(true);
    expect(matchesPattern(compilePattern('80A80000*'), fromHex('80A800'))).toBe(false);
  });

  it('rejects malformed patterns', () => {
    expect(() => compilePattern('00A*4')).toThrow(/only allowed at the end/);
    expect(() => compilePattern('0')).toThrow(/odd/);
    expect(() => compilePattern('0G')).toThrow(/not a hex byte/);
  });
});

describe('parseVirtualCard', () => {
  it('accepts a valid card', () => {
    const def = apduCard({ kind: 'apdu', rules: [{ command: '00A4*', response: '9000' }] });
    expect(parseVirtualCard(JSON.parse(JSON.stringify(def)))).toEqual(def);
  });

  it('explains what is wrong', () => {
    expect(() => parseVirtualCard({})).toThrow(/format/);
    expect(() =>
      parseVirtualCard({
        ...apduCard({ kind: 'apdu', rules: [{ command: '00', response: '90' }] }),
      }),
    ).toThrow(/rule 1 response needs at least a status word/);
    expect(() =>
      parseVirtualCard({ ...apduCard({ kind: 'apdu', rules: [] }), atr: 'XYZ' }),
    ).toThrow(/atr/);
  });
});

describe('apdu simulator', () => {
  const card = () =>
    createVirtualCard(
      apduCard({
        kind: 'apdu',
        rules: [
          { command: '00A4040002AAAA00', response: '6F009000', next: 'a' },
          { command: '00A4040002BBBB00', response: '6F019000', next: 'b' },
          { command: '00B2010C00', response: '7001AA9000', state: 'a' },
          { command: '00B2010C00', response: '7001BB9000', state: 'b' },
          { command: '00B2010C00', response: '6A83' },
          { command: '00A40400*', response: '6A82' },
        ],
      }),
    );

  it('answers by state, falling back to state-less rules', () => {
    const c = card();
    expect(send(c, '00B2010C00')).toBe('6A83');
    expect(send(c, '00A4040002AAAA00')).toBe('6F009000');
    expect(send(c, '00B2010C00')).toBe('7001AA9000');
    expect(send(c, '00A4040002BBBB00')).toBe('6F019000');
    expect(send(c, '00B2010C00')).toBe('7001BB9000');
    expect(send(c, '00A4040003CCCCCC00')).toBe('6A82');
    expect(send(c, '00B2010C00')).toBe('7001BB9000');
  });

  it('returns the fallback, and reset returns to the initial state', () => {
    const c = card();
    expect(send(c, '00CA9F3600')).toBe('6D00');
    send(c, '00A4040002AAAA00');
    c.reset();
    expect(send(c, '00B2010C00')).toBe('6A83');
  });
});

describe('memory simulator', () => {
  const memory = '04A23B' + '00'.repeat(9) + 'E1103E00' + '0303D00000FE' + '00'.repeat(42);
  const tag = () =>
    createVirtualCard({
      format: 'card-spy/virtual-card',
      version: 1,
      name: 'tag',
      atr: '3B8F8001804F0CA0000003060300030000000068',
      model: { kind: 'memory', uid: '04A23B7A1C5E80', pageSize: 4, memory },
    });

  it('answers GET UID and READ BINARY', () => {
    const t = tag();
    expect(send(t, 'FFCA000000')).toBe('04A23B7A1C5E809000');
    expect(send(t, 'FFB0000310')).toBe('E1103E000303D00000FE000000000000' + '9000');
    expect(send(t, 'FFB0000004')).toBe('04A23B00' + '9000');
  });

  it('reports a short read past the end and out of range reads', () => {
    const t = tag();
    expect(send(t, 'FFB0000F10')).toBe('00'.repeat(4) + '6282');
    expect(send(t, 'FFB0001010')).toBe('6B00');
  });

  it('writes user pages but protects pages 0-3', () => {
    const t = tag();
    expect(send(t, 'FFD6000504DEADBEEF')).toBe('9000');
    expect(send(t, 'FFB0000504')).toBe('DEADBEEF9000');
    expect(send(t, 'FFD6000204DEADBEEF')).toBe('6982');
  });

  it('rejects non-reader commands', () => {
    expect(send(tag(), '00A4040000')).toBe('6E00');
  });
});

describe('recorder', () => {
  it('records a session that replays identically, including states and GET RESPONSE', () => {
    const exchanges = [
      { command: '00A404000E315041592E5359532E444446303100', response: '6F009000' },
      { command: '00B2010C00', response: '7001009000' },
      { command: '00A4040007A000000003101000', response: '6115' },
      { command: '00C0000015', response: '6F13' + '00'.repeat(19) + '9000' },
      { command: '80A8000002830000', response: '77009000' },
      { command: '00B2010C00', response: '7002AABB9000' },
      { command: '00A4040007A000000004101000', response: '6A82' },
      { command: 'FFCA000000', response: '6A81' },
    ];
    const def = recordVirtualCard({ name: 'rec', atr: '3B00', exchanges });
    const card = createVirtualCard(def);
    for (const { command, response } of exchanges) {
      expect(send(card, command)).toBe(response);
    }
    // A GPO with different terminal data still gets an answer.
    card.reset();
    send(card, '00A4040007A000000003101000');
    send(card, '00C0000015');
    expect(send(card, '80A800000A8308000000000100000000')).toBe('77009000');
  });

  it('keeps the first answer for a repeated command', () => {
    const def = recordVirtualCard({
      name: 'rec',
      atr: '3B00',
      exchanges: [
        { command: '0084000008', response: '11111111111111119000' },
        { command: '0084000008', response: '22222222222222229000' },
      ],
    });
    expect(def.model.kind === 'apdu' && def.model.rules).toHaveLength(1);
  });
});
