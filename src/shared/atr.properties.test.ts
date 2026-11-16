/**
 * The specification for the ATR parser (ISO/IEC 7816-3 §8.2), written as properties that
 * fast-check checks against generated ATRs.
 *
 * An ATR is TS (3B direct, 3F inverse convention), T0, then groups of interface bytes, the
 * historical bytes and, unless only T=0 is offered, a check byte TCK. T0's high nibble says which
 * of TA1, TB1, TC1 and TD1 follow, and its low nibble how many historical bytes there are. Each
 * TDi's high nibble says which bytes of the next group follow, and its low nibble names a
 * protocol (15 means global settings, not a protocol). TCK makes the XOR of T0 to TCK zero.
 *
 * The spec:
 *   1. parseAtr accepts any bytes without throwing.
 *   2. Its fields cover the ATR, in order, with no gaps or overlaps, so every byte has exactly
 *      one description.
 *   3. A well-formed ATR parses with no errors and gives back its convention, protocols and
 *      historical bytes. With no TD1 the protocol is T=0.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { parseAtr } from './atr';
import { bytesEqual } from './hex';

// ---- Generators

const byte = fc.integer({ min: 0, max: 255 });

const groupArb = fc.record({
  a: fc.option(byte, { nil: undefined }),
  b: fc.option(byte, { nil: undefined }),
  c: fc.option(byte, { nil: undefined }),
  /** The protocol in this group's TD, when another group follows. */
  protocol: fc.integer({ min: 0, max: 15 }),
});

const atrArb = fc.record({
  ts: fc.constantFrom(0x3b, 0x3f),
  groups: fc.array(groupArb, { maxLength: 4 }),
  historical: fc.uint8Array({ maxLength: 15 }),
});

type Atr = typeof atrArb extends fc.Arbitrary<infer T> ? T : never;

const presence = (g: Atr['groups'][number] | undefined, hasTd: boolean) =>
  g === undefined
    ? 0
    : (g.a !== undefined ? 1 : 0) |
      (g.b !== undefined ? 2 : 0) |
      (g.c !== undefined ? 4 : 0) |
      (hasTd ? 8 : 0);

/** The protocols a TD names, apart from 15. T=0 when there are none. */
const protocolsOf = (atr: Atr) => {
  const named = atr.groups.slice(0, -1).map((g) => g.protocol);
  const set = new Set(named.filter((p) => p !== 15));
  return set.size ? [...set].sort((a, b) => a - b) : [0];
};

const tckRequired = (atr: Atr) => atr.groups.slice(0, -1).some((g) => g.protocol !== 0);

function encodeAtr(atr: Atr): Uint8Array {
  const { groups, historical } = atr;
  const out = [atr.ts, (presence(groups[0], groups.length > 1) << 4) | historical.length];
  groups.forEach((g, i) => {
    const next = i + 1 < groups.length;
    for (const v of [g.a, g.b, g.c]) if (v !== undefined) out.push(v);
    if (next) out.push((presence(groups[i + 1], i + 2 < groups.length) << 4) | g.protocol);
  });
  out.push(...historical);
  if (tckRequired(atr)) out.push(out.slice(1).reduce((x, b) => x ^ b, 0));
  return Uint8Array.from(out);
}

/** Random bytes, well-formed ATRs, and well-formed ATRs with a byte changed or cut short. */
const anyBytes = fc.oneof(
  fc.uint8Array({ maxLength: 40 }),
  atrArb.map(encodeAtr),
  fc
    .record({ bytes: atrArb.map(encodeAtr), at: fc.nat(), value: byte, cut: fc.boolean() })
    .map(({ bytes, at, value, cut }) => {
      const out = bytes.slice();
      out[at % out.length] = value;
      return cut ? out.subarray(0, at % out.length) : out;
    }),
);

// ---- The properties

describe('ATR specification', () => {
  it('1. parseAtr accepts any bytes', () => {
    fc.assert(
      fc.property(anyBytes, (bytes) => {
        parseAtr(bytes);
      }),
    );
  });

  it('2. the fields cover the ATR in order, with no gaps or overlaps', () => {
    fc.assert(
      fc.property(
        anyBytes.filter((b) => b.length >= 2),
        (bytes) => {
          const fields = [...parseAtr(bytes).fields].sort((a, b) => a.offset - b.offset);
          let next = 0;
          for (const f of fields) {
            if (f.offset !== next || f.length < 1) return false;
            next += f.length;
          }
          return next === bytes.length;
        },
      ),
    );
  });

  it('3. a well-formed ATR parses with no errors and gives back what it says', () => {
    fc.assert(
      fc.property(atrArb, (atr) => {
        const parsed = parseAtr(encodeAtr(atr));
        const protocols = protocolsOf(atr);
        return (
          parsed.errors.length === 0 &&
          parsed.convention === (atr.ts === 0x3b ? 'direct' : 'inverse') &&
          parsed.protocols.length === protocols.length &&
          parsed.protocols.every((p, i) => p === protocols[i]) &&
          bytesEqual(parsed.historical, atr.historical) &&
          (parsed.tckValid ?? false) === tckRequired(atr)
        );
      }),
    );
  });
});
