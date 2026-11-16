/**
 * The specification for NDEF messages (NFC Forum NDEF 1.0) and Type 2 Tag TLV blocks, written as
 * properties that fast-check checks against generated data.
 *
 * A record is a header byte (MB, ME, CF, SR, IL flags and a 3-bit TNF), the type length, the
 * payload length (1 byte when SR is set, otherwise 4), the ID length when IL is set, then the
 * type, ID and payload. Types are ASCII. A message is records from the one with MB to the one
 * with ME.
 *
 * The spec:
 *   1. parseNdefMessage and parseType2Tlvs accept any bytes without throwing.
 *   2. Encoding records as a message and parsing it gives back every record: TNF, type, ID and
 *      payload, with MB on the first record and ME on the last.
 *   3. URI and text records decode to the URI and text that were encoded.
 *   4. A message wrapped for a Type 2 tag reads back as an NDEF Message block holding exactly
 *      that message, then a terminator.
 *   5. The encoders reject what they can't encode, rather than writing a length that wraps: a
 *      TNF outside 0-7, a type or ID over 255 bytes, a language code over 63 bytes, or a Type 2
 *      message over 65534 bytes.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { asciiToBytes, bytesEqual } from './hex';
import {
  encodeNdefMessage,
  encodeNdefRecord,
  encodeNdefText,
  encodeNdefUri,
  parseNdefMessage,
  parseType2Tlvs,
  URI_PREFIXES,
  wrapNdefForType2,
} from './ndef';

// ---- Generators

const ascii = (maxLength: number) => fc.string({ unit: 'grapheme-ascii', maxLength });

const recordArb = fc.record({
  tnf: fc.integer({ min: 0, max: 7 }),
  type: ascii(20),
  // Up to 300 bytes, so payloads need both the 1-byte and the 4-byte length
  payload: fc.uint8Array({ maxLength: 300 }),
  id: fc.option(fc.uint8Array({ maxLength: 8 }), { nil: undefined }),
});

type Rec = { tnf: number; type: string; payload: Uint8Array; id?: Uint8Array };

const encodeRecord = (r: Rec) => encodeNdefRecord(r.tnf, asciiToBytes(r.type), r.payload, r.id);

const anyBytes = fc.oneof(
  fc.uint8Array({ maxLength: 64 }),
  fc
    .record({
      bytes: fc
        .array(recordArb, { maxLength: 3 })
        .map((rs) => encodeNdefMessage(rs.map(encodeRecord))),
      at: fc.nat(),
      value: fc.integer({ min: 0, max: 255 }),
      cut: fc.boolean(),
    })
    .map(({ bytes, at, value, cut }) => {
      if (!bytes.length) return bytes;
      const out = bytes.slice();
      out[at % out.length] = value;
      return cut ? out.subarray(0, at % out.length) : out;
    }),
);

/** True when `fn` throws a RangeError. */
function throwsRangeError(fn: () => unknown): boolean {
  try {
    fn();
  } catch (e) {
    return e instanceof RangeError;
  }
  return false;
}

// ---- The properties

describe('NDEF specification', () => {
  it('1. the parsers accept any bytes', () => {
    fc.assert(
      fc.property(anyBytes, (bytes) => {
        parseNdefMessage(bytes);
        parseType2Tlvs(bytes);
      }),
    );
  });

  it('2. encoding records as a message and parsing it gives back every record', () => {
    fc.assert(
      fc.property(fc.array(recordArb, { maxLength: 4 }), (records) => {
        const parsed = parseNdefMessage(encodeNdefMessage(records.map(encodeRecord)));
        const empty = new Uint8Array();
        return (
          parsed.error === undefined &&
          parsed.records.length === records.length &&
          parsed.records.every((p, i) => {
            const r = records[i]!;
            return (
              p.tnf === r.tnf &&
              p.type === r.type &&
              bytesEqual(p.id ?? empty, r.id ?? empty) &&
              bytesEqual(p.payload, r.payload) &&
              p.mb === (i === 0) &&
              p.me === (i === records.length - 1)
            );
          })
        );
      }),
    );
  });

  describe('3. URI and text records decode to what was encoded', () => {
    it('URI', () => {
      const uri = fc.oneof(
        fc.string({ unit: 'grapheme' }),
        fc
          .tuple(fc.constantFrom(...URI_PREFIXES), fc.string({ unit: 'grapheme' }))
          .map(([prefix, rest]) => prefix + rest),
      );
      fc.assert(
        fc.property(uri, (u) => {
          const decoded = parseNdefMessage(encodeNdefUri(u)).records[0]?.decoded;
          return decoded?.kind === 'uri' && decoded.uri === u;
        }),
      );
    });

    it('text', () => {
      fc.assert(
        fc.property(fc.string({ unit: 'grapheme' }), ascii(63), (text, lang) => {
          const decoded = parseNdefMessage(encodeNdefText(text, lang)).records[0]?.decoded;
          return decoded?.kind === 'text' && decoded.text === text && decoded.lang === lang;
        }),
      );
    });
  });

  it('4. a message wrapped for a Type 2 tag reads back as an NDEF block and a terminator', () => {
    const length = fc.oneof(
      { withCrossShrink: true },
      fc.integer({ min: 0, max: 300 }),
      fc.integer({ min: 65526, max: 65534 }),
    );
    fc.assert(
      fc.property(length, (n) => {
        const message = Uint8Array.from({ length: n }, (_, i) => i & 0xff);
        const blocks = parseType2Tlvs(wrapNdefForType2(message));
        return (
          blocks.length === 2 &&
          blocks[0]!.type === 0x03 &&
          bytesEqual(blocks[0]!.value, message) &&
          blocks[1]!.type === 0xfe
        );
      }),
    );
  });

  describe('5. the encoders reject what they cannot encode', () => {
    it('a TNF outside 0-7', () => {
      const badTnf = fc.oneof(fc.integer({ min: 8 }), fc.integer({ max: -1 }));
      fc.assert(
        fc.property(recordArb, badTnf, (r, tnf) =>
          throwsRangeError(() => encodeRecord({ ...r, tnf })),
        ),
      );
    });

    it('a type or ID over 255 bytes', () => {
      const long = fc.integer({ min: 256, max: 1000 }).map((n) => new Uint8Array(n));
      fc.assert(
        fc.property(recordArb, long, fc.boolean(), (r, bytes, inType) =>
          throwsRangeError(() =>
            inType
              ? encodeNdefRecord(r.tnf, bytes, r.payload, r.id)
              : encodeNdefRecord(r.tnf, asciiToBytes(r.type), r.payload, bytes),
          ),
        ),
      );
    });

    it('a language code over 63 bytes', () => {
      fc.assert(
        fc.property(fc.string({ unit: 'grapheme-ascii', minLength: 64, maxLength: 200 }), (lang) =>
          throwsRangeError(() => encodeNdefText('hello', lang)),
        ),
      );
    });

    it('a Type 2 message over 65534 bytes', () => {
      expect(() => wrapNdefForType2(new Uint8Array(65535))).toThrow(RangeError);
    });
  });
});

// ---- Examples of each bug the properties found

describe('NDEF regressions', () => {
  it('rejects a 64-byte language code, rather than writing a length of 0', () => {
    expect(() => encodeNdefText('hello', 'x'.repeat(64))).toThrow(RangeError);
  });

  it('rejects a 256-byte type, rather than writing a type length of 0', () => {
    expect(() => encodeNdefRecord(4, new Uint8Array(256), new Uint8Array())).toThrow(RangeError);
  });
});
