/**
 * The specification for the APDU console's command line, written as properties that fast-check
 * checks against generated lines.
 *
 * A line is one of these. The command word can be in any case, and a comment (from # or //) can
 * end the line:
 *
 *   select <aid | name>   SELECT by DF name: the rest of the line, read as nameBytes reads it
 *   read <sfi> <record>   READ RECORD: whole numbers, in decimal or in hex with 0x
 *   getdata <tag>         GET DATA: the rest of the line, as hex
 *   uid                   GET UID, the contactless UID
 *   reset [cold]          a warm reset, or a cold one
 *   <hex>                 an APDU of at least 4 bytes, sent as is
 *
 * The spec:
 *   1. Each form gives the command its builder gives for those arguments, whatever the case of
 *      the command word, the spacing, or a comment at the end.
 *   2. Hex that isn't a command is sent as is if it's at least 4 bytes, and is an error if not.
 *   3. Nothing typed is ignored: adding a word to a line gives a different command or an error,
 *      never the same command. A line missing an argument is an error. (Separators , : ; - are
 *      spacing in hex, so they aren't words.)
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { GET_UID, getData, readRecord, selectByName } from '@shared/commands';
import { asciiToBytes, bytesEqual, toUint } from '@shared/hex';
import { parseConsoleCommand, type ConsoleCommand } from './console-command';

// ---- Generators

/** A word with each letter in either case. */
const anyCase = (word: string) =>
  fc
    .array(fc.boolean(), { minLength: word.length, maxLength: word.length })
    .map((upper) => [...word].map((c, i) => (upper[i] ? c.toUpperCase() : c)).join(''));

const space = fc.constantFrom(' ', '  ', '\t', ' \t ');

/** Bytes in hex, in either case, with or without spaces between them. */
const hexOf = (bytes: Uint8Array) =>
  fc.tuple(fc.boolean(), fc.constantFrom('', ' ')).map(([upper, sep]) => {
    const text = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(sep);
    return upper ? text.toUpperCase() : text;
  });

/** A whole number in decimal, sometimes with leading zeros, or in hex with 0x. */
const numberText = (n: number) =>
  fc.constantFrom(String(n), `0${n}`, `0x${n.toString(16)}`, `0X${n.toString(16).toUpperCase()}`);

/** Printable ASCII with no comment in it. */
const plain = fc
  .string({ unit: 'grapheme-ascii', maxLength: 8 })
  .filter((s) => !s.includes('#') && !s.includes('//'));

/** An ASCII name: at least one character that can't be in hex, no comment, no outer spaces. */
const nameArb = fc
  .tuple(plain, fc.constantFrom(...'GHJKLMNPQRSTUVWYZgjkmpqtuvwyz._!'), plain)
  .map(([a, c, b]) => (a + c + b).trim());

const comment = fc.oneof(
  fc.constant(''),
  fc.tuple(fc.constantFrom(' #', ' //', '\t# '), plain).map(([mark, text]) => mark + text),
);

const apdu = (bytes: Uint8Array): ConsoleCommand => ({ kind: 'apdu', apdu: bytes });

/** A line in each form, with no comment, and the command it should give. */
const lineArb: fc.Arbitrary<{ line: string; expected: ConsoleCommand }> = fc.oneof(
  fc
    .uint8Array({ minLength: 1, maxLength: 16 })
    .chain((aid) =>
      fc
        .tuple(anyCase('select'), space, hexOf(aid))
        .map(([w, s, h]) => ({ line: w + s + h, expected: apdu(selectByName(aid)) })),
    ),
  fc.tuple(anyCase('select'), space, nameArb).map(([w, s, name]) => ({
    line: w + s + name,
    expected: apdu(selectByName(asciiToBytes(name))),
  })),
  fc
    .record({ sfi: fc.integer({ min: 0, max: 31 }), record: fc.integer({ min: 0, max: 255 }) })
    .chain(({ sfi, record }) =>
      fc
        .tuple(anyCase('read'), space, numberText(sfi), space, numberText(record))
        .map((parts) => ({ line: parts.join(''), expected: apdu(readRecord(sfi, record)) })),
    ),
  fc
    .uint8Array({ minLength: 1, maxLength: 2 })
    .chain((tag) =>
      fc
        .tuple(anyCase('getdata'), space, hexOf(tag))
        .map(([w, s, h]) => ({ line: w + s + h, expected: apdu(getData(toUint(tag))) })),
    ),
  anyCase('uid').map((w) => ({ line: w, expected: apdu(GET_UID) })),
  fc.tuple(anyCase('reset'), space, anyCase('cold'), fc.boolean()).map(([w, s, c, cold]) => ({
    line: cold ? w + s + c : w,
    expected: { kind: 'reset' as const, cold },
  })),
  fc
    .uint8Array({ minLength: 4, maxLength: 20 })
    .chain((bytes) => hexOf(bytes).map((line) => ({ line, expected: apdu(bytes) }))),
);

/** A word to add: letters, digits and dots. Separators (, : ; -) are spacing in hex, not words. */
const wordArb = fc.oneof(fc.constantFrom('0x', '0X'), fc.stringMatching(/^[0-9A-Za-z.]{1,6}$/));

function same(a: ConsoleCommand, b: ConsoleCommand): boolean {
  return a.kind === 'apdu'
    ? b.kind === 'apdu' && bytesEqual(a.apdu, b.apdu)
    : b.kind === 'reset' && a.cold === b.cold;
}

/** The command a line gives, or undefined if it's an error. */
function tryParse(line: string): ConsoleCommand | undefined {
  try {
    return parseConsoleCommand(line);
  } catch (e) {
    if (!(e instanceof Error)) throw e;
    return undefined;
  }
}

// ---- The properties

describe('Console command specification', () => {
  it('1. each form gives the command its builder gives', () => {
    fc.assert(
      fc.property(lineArb, fc.constantFrom('', ' ', '\t'), comment, (l, lead, end) => {
        const parsed = tryParse(lead + l.line + end);
        return parsed !== undefined && same(parsed, l.expected);
      }),
    );
  });

  it('2. hex that is not a command is an error if it is under 4 bytes', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ maxLength: 3 }).chain(hexOf),
        (line) => tryParse(line) === undefined,
      ),
    );
  });

  describe('3. nothing typed is ignored', () => {
    it('adding a word gives a different command or an error', () => {
      fc.assert(
        fc.property(lineArb, space, wordArb, (l, s, word) => {
          const parsed = tryParse(l.line + s + word);
          return parsed === undefined || !same(parsed, l.expected);
        }),
      );
    });

    it('a line missing an argument is an error', () => {
      const missing = fc.oneof(
        anyCase('select'),
        anyCase('read'),
        fc.tuple(anyCase('read'), space, fc.integer({ min: 0, max: 31 })).map((p) => p.join('')),
        anyCase('getdata'),
      );
      fc.assert(fc.property(missing, (line) => tryParse(line) === undefined));
    });
  });
});

// ---- Examples of each bug the properties found

describe('Console command regressions', () => {
  it('RESET COLD is a cold reset, not a warm one', () => {
    expect(parseConsoleCommand('RESET COLD')).toEqual({ kind: 'reset', cold: true });
  });

  it('select MY APP keeps the space in the name', () => {
    const { apdu } = parseConsoleCommand('select MY APP') as { apdu: Uint8Array };
    expect(bytesEqual(apdu, selectByName(asciiToBytes('MY APP')))).toBe(true);
  });

  it('select A0:00:00:00:03:10:10 # visa selects the AID', () => {
    const { apdu } = parseConsoleCommand('select A0:00:00:00:03:10:10 # visa') as {
      apdu: Uint8Array;
    };
    expect(bytesEqual(apdu, selectByName(Uint8Array.of(0xa0, 0, 0, 0, 3, 0x10, 0x10)))).toBe(true);
  });

  it('extra arguments are an error, not ignored', () => {
    for (const line of ['read 1 2 3', 'uid 00', 'reset now', '00A40400 0x', 'getdata 9F36 0x']) {
      expect(() => parseConsoleCommand(line), line).toThrow();
    }
  });

  it('a missing argument is an error, not a default', () => {
    for (const line of ['select', 'read', 'read 1']) {
      expect(() => parseConsoleCommand(line), line).toThrow();
    }
  });
});
