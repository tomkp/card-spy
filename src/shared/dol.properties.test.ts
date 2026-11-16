/**
 * The specification for EMV data object lists (EMV Book 3 §5.4), written as properties that
 * fast-check checks against generated lists.
 *
 * A DOL (PDOL, CDOL1, ...) is a list of tags, each followed by a one-byte length: the number of
 * bytes the card wants for that data object. The terminal answers with the values concatenated,
 * each fitted to its length.
 *
 * The spec:
 *   1. parseDol reads back the tags and lengths of a DOL.
 *   2. buildDolData gives exactly what the DOL asks for: each entry's bytes, in order, at its
 *      length.
 *   3. Each value is fitted to its entry by format: numeric (n) is right-aligned with leading
 *      zeros and cut on the left, compressed numeric (cn) is left-aligned with trailing FF, and
 *      anything else is left-aligned with trailing zeros and cut on the right. A missing value is
 *      all zeros.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { buildDolData, parseDol } from './dol';
import { bytesEqual, fromHex, toHex } from './hex';
import { lookupTag } from './tags/emv';

// ---- Generators

/** A well-formed tag of 1 to 3 bytes. */
const randomTag = fc.oneof(
  fc
    .integer({ min: 0, max: 255 })
    .filter((b) => (b & 0x1f) !== 0x1f)
    .map((b) => [b]),
  fc
    .record({
      first: fc.integer({ min: 0, max: 7 }).map((hi) => (hi << 5) | 0x1f),
      middle: fc.array(fc.integer({ min: 0x80, max: 0xff }), { maxLength: 1 }),
      last: fc.integer({ min: 0, max: 0x7f }),
    })
    .map(({ first, middle, last }) => [first, ...middle, last]),
);

/** Tags terminals are asked for, in each format, plus random ones. */
const knownTag = fc.constantFrom('9F02', '9F1A', '5F2A', '9A', '9C', '5A', '9F37', '95');
const tagArb = fc.oneof(
  knownTag,
  randomTag.map((t) => toHex(t)),
);

const dolArb = fc.uniqueArray(
  fc.record({ tagHex: tagArb, length: fc.integer({ min: 0, max: 255 }) }),
  { selector: (e) => e.tagHex, maxLength: 6 },
);

const encodeDol = (dol: { tagHex: string; length: number }[]) =>
  Uint8Array.from(dol.flatMap((e) => [...fromHex(e.tagHex), e.length]));

/** The value for an entry as EMV Book 3 §5.4 describes it, written without buildDolData. */
function fitted(tagHex: string, length: number, value: Uint8Array | undefined): number[] {
  if (!value) return new Array<number>(length).fill(0);
  const format = lookupTag(tagHex)?.format;
  const v = [...value];
  if (format === 'n') {
    const kept = v.slice(Math.max(0, v.length - length));
    return [...new Array<number>(length - kept.length).fill(0), ...kept];
  }
  const kept = v.slice(0, length);
  return [...kept, ...new Array<number>(length - kept.length).fill(format === 'cn' ? 0xff : 0)];
}

// ---- The properties

describe('DOL specification', () => {
  it('1. parseDol reads back the tags and lengths', () => {
    fc.assert(
      fc.property(dolArb, (dol) => {
        const parsed = parseDol(encodeDol(dol));
        return (
          parsed.length === dol.length &&
          parsed.every((e, i) => e.tagHex === dol[i]!.tagHex && e.length === dol[i]!.length)
        );
      }),
    );
  });

  it('2 and 3. buildDolData gives each value fitted to its entry, in order', () => {
    fc.assert(
      fc.property(
        dolArb,
        fc.array(fc.option(fc.uint8Array({ maxLength: 260 }), { nil: undefined }), {
          minLength: 6,
          maxLength: 6,
        }),
        (dol, given) => {
          const values: Record<string, Uint8Array> = {};
          dol.forEach((e, i) => {
            const v = given[i];
            if (v) values[e.tagHex] = v;
          });
          const expected = dol.flatMap((e) => fitted(e.tagHex, e.length, values[e.tagHex]));
          return bytesEqual(buildDolData(parseDol(encodeDol(dol)), values), expected);
        },
      ),
    );
  });
});
