/**
 * The specification for the command builders, written as properties that fast-check checks
 * against generated parameters.
 *
 * Each builder puts its parameters in fixed fields (ISO/IEC 7816-4, EMV Book 3, PC/SC Part 3):
 *
 *   selectByName(name)          00 A4 04 00  data: the name                 Le: max
 *   readRecord(sfi, record)     00 B2 record (sfi << 3 | 4)                 Le: max
 *   readBinary(offset, length)  00 B0 offset (15 bits)                      Le: length
 *   getData(tag)                80 CA tag (2 bytes)                         Le: max
 *   getResponse(length)         00 C0 00 00                                 Le: length
 *   getProcessingOptions(pdol)  80 A8 00 00  data: tag 83 holding the PDOL data   Le: max
 *   readPages(page, bytes)      FF B0 page (2 bytes)                        Le: bytes
 *
 * "Le: max" asks for as much as the card has, and so does a length of 0.
 *
 * The spec:
 *   1. Each builder gives a well-formed command whose fields hold exactly its parameters, as
 *      above, in short form unless the data or Le needs extended.
 *   2. Each builder rejects a parameter that doesn't fit its field with a RangeError, rather than
 *      sending a different command: an SFI outside 0 to 31, a record number that isn't a byte,
 *      an offset outside 0 to 7FFF, a tag or page outside 0 to FFFF (a tag in hex is 1 or 2
 *      whole bytes), or a length that isn't a whole number from 0 to 65536.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { tryParseCommand } from './apdu';
import {
  getData,
  getProcessingOptions,
  getResponse,
  nameBytes,
  readBinary,
  readPages,
  readRecord,
  selectByName,
} from './commands';
import { bytesEqual, toHex } from './hex';
import { parseTlv } from './tlv';

// ---- Generators

/** 0 to max, weighted towards both ends. */
const upTo = (max: number) =>
  fc.oneof(
    { withCrossShrink: true },
    fc.integer({ min: 0, max }),
    fc.integer({ min: 0, max: 2 }),
    fc.integer({ min: max - 2, max }),
  );

/** Every valid Le, weighted towards the short/extended boundary and the maximum. */
const lengthArb = fc.oneof(
  { withCrossShrink: true },
  fc.integer({ min: 0, max: 65536 }),
  fc.integer({ min: 0, max: 2 }),
  fc.integer({ min: 254, max: 258 }),
  fc.integer({ min: 65534, max: 65536 }),
);

/** Numbers that aren't whole numbers from 0 to max: too big, negative, fractional, NaN or infinite. */
const outside = (max: number) =>
  fc.oneof(fc.integer({ min: max + 1 }), fc.integer({ max: -1 }), fc.double({ noInteger: true }));

/** Data either side of a long-form TLV length (128) and the short APDU limit (255). */
const dataArb = fc.oneof(
  { withCrossShrink: true },
  fc.uint8Array({ maxLength: 8 }),
  fc
    .record({
      length: fc.oneof(
        fc.integer({ min: 0, max: 300 }),
        fc.integer({ min: 126, max: 130 }),
        fc.integer({ min: 250, max: 258 }),
      ),
      seed: fc.integer({ min: 0, max: 255 }),
    })
    .map(({ length, seed }) => Uint8Array.from({ length }, (_, i) => (seed + i * 7) & 0xff)),
);

// ---- What a command should parse back to

interface Fields {
  cla: number;
  ins: number;
  p1: number;
  p2: number;
  data?: Uint8Array;
  /** 0 for as much as the card has. */
  le: number;
}

/** True when the bytes are one well-formed command with exactly these fields. */
function holds(bytes: Uint8Array, f: Fields): boolean {
  const c = tryParseCommand(bytes);
  const extended = (f.data?.length ?? 0) > 255 || f.le > 256;
  return (
    c !== undefined &&
    c.cla === f.cla &&
    c.ins === f.ins &&
    c.p1 === f.p1 &&
    c.p2 === f.p2 &&
    bytesEqual(c.data ?? [], f.data ?? []) &&
    c.le === (f.le || (extended ? 65536 : 256)) &&
    c.extended === extended
  );
}

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

describe('Command builder specification', () => {
  describe('1. each builder puts its parameters in their fields', () => {
    it('selectByName', () => {
      fc.assert(
        fc.property(dataArb, (name) =>
          holds(selectByName(name), { cla: 0, ins: 0xa4, p1: 4, p2: 0, data: name, le: 0 }),
        ),
      );
    });

    it('readRecord', () => {
      fc.assert(
        fc.property(upTo(31), upTo(0xff), (sfi, record) =>
          holds(readRecord(sfi, record), {
            cla: 0,
            ins: 0xb2,
            p1: record,
            p2: (sfi << 3) | 4,
            le: 0,
          }),
        ),
      );
    });

    it('readBinary', () => {
      fc.assert(
        fc.property(upTo(0x7fff), lengthArb, (offset, length) =>
          holds(readBinary(offset, length), {
            cla: 0,
            ins: 0xb0,
            p1: offset >> 8,
            p2: offset & 0xff,
            le: length,
          }),
        ),
      );
    });

    it('getData, with the tag as a number or as hex', () => {
      fc.assert(
        fc.property(upTo(0xffff), fc.boolean(), (tag, asHex) => {
          const arg = asHex ? toHex(tag > 0xff ? [tag >> 8, tag & 0xff] : [tag]) : tag;
          return holds(getData(arg), { cla: 0x80, ins: 0xca, p1: tag >> 8, p2: tag & 0xff, le: 0 });
        }),
      );
    });

    it('getResponse', () => {
      fc.assert(
        fc.property(lengthArb, (length) =>
          holds(getResponse(length), { cla: 0, ins: 0xc0, p1: 0, p2: 0, le: length }),
        ),
      );
    });

    it('getProcessingOptions, with the PDOL data as the value of one tag 83', () => {
      fc.assert(
        fc.property(dataArb, (pdol) => {
          const bytes = getProcessingOptions(pdol);
          const data = tryParseCommand(bytes)?.data ?? new Uint8Array();
          const { nodes, error } = parseTlv(data, { skipPadding: false });
          return (
            holds(bytes, { cla: 0x80, ins: 0xa8, p1: 0, p2: 0, data, le: 0 }) &&
            error === undefined &&
            nodes.length === 1 &&
            nodes[0]!.tag === 0x83 &&
            nodes[0]!.error === undefined &&
            bytesEqual(nodes[0]!.value, pdol)
          );
        }),
      );
    });

    it('readPages', () => {
      fc.assert(
        fc.property(upTo(0xffff), lengthArb, (page, bytes) =>
          holds(readPages(page, bytes), {
            cla: 0xff,
            ins: 0xb0,
            p1: page >> 8,
            p2: page & 0xff,
            le: bytes,
          }),
        ),
      );
    });
  });

  describe('2. each builder rejects a parameter that does not fit its field', () => {
    it('an SFI outside 0 to 31, or a record number that is not a byte', () => {
      fc.assert(
        fc.property(outside(31), upTo(0xff), (sfi, record) =>
          throwsRangeError(() => readRecord(sfi, record)),
        ),
      );
      fc.assert(
        fc.property(upTo(31), outside(0xff), (sfi, record) =>
          throwsRangeError(() => readRecord(sfi, record)),
        ),
      );
    });

    it('an offset outside 0 to 7FFF', () => {
      fc.assert(
        fc.property(outside(0x7fff), lengthArb, (offset, length) =>
          throwsRangeError(() => readBinary(offset, length)),
        ),
      );
    });

    it('a tag or page outside 0 to FFFF', () => {
      fc.assert(fc.property(outside(0xffff), (tag) => throwsRangeError(() => getData(tag))));
      fc.assert(
        fc.property(outside(0xffff), lengthArb, (page, bytes) =>
          throwsRangeError(() => readPages(page, bytes)),
        ),
      );
    });

    it('a length that is not a whole number from 0 to 65536', () => {
      fc.assert(
        fc.property(upTo(0x7fff), outside(65536), (offset, length) =>
          throwsRangeError(() => readBinary(offset, length)),
        ),
      );
      fc.assert(
        fc.property(outside(65536), (length) => throwsRangeError(() => getResponse(length))),
      );
      fc.assert(
        fc.property(upTo(0xffff), outside(65536), (page, bytes) =>
          throwsRangeError(() => readPages(page, bytes)),
        ),
      );
    });
  });
});

// ---- Examples of each bug the properties found

describe('Command builder regressions', () => {
  it('readRecord rejects SFI 32, rather than reading the current file (P2 04)', () => {
    expect(() => readRecord(32, 1)).toThrow(RangeError);
  });

  it('readBinary rejects offset 8000, rather than reading from offset 0', () => {
    expect(() => readBinary(0x8000)).toThrow(RangeError);
  });

  it('getData rejects a 3-byte tag, rather than asking for its last two bytes', () => {
    expect(() => getData('DF8101')).toThrow(RangeError);
    expect(() => getData('0000DF')).toThrow(RangeError);
    expect(() => getData('')).toThrow(RangeError);
  });

  it('getData rejects an odd number of hex digits, rather than reading 9F3 as 09F3', () => {
    expect(() => getData('9F3')).toThrow(/Odd number of hex digits/);
  });

  it('quotes a string where a number belongs, so the message does not look in range', () => {
    expect(() => readRecord('1' as unknown as number, 1)).toThrow('SFI out of range ("1")');
  });

  it('getProcessingOptions gives 128 bytes of PDOL data a long-form length', () => {
    const gpo = getProcessingOptions(new Uint8Array(128));
    expect(toHex(gpo.subarray(0, 8))).toBe('80A8000083838180');
  });

  it('nameBytes rejects a name that is not ASCII, rather than sending € as AC', () => {
    expect(() => nameBytes('PAY€')).toThrow(RangeError);
  });

  it('nameBytes rejects a number that is not a byte, rather than wrapping it', () => {
    expect(() => nameBytes([0xa0, 0x100])).toThrow(RangeError);
  });
});
