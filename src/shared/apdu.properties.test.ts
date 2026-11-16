/**
 * The specification for command APDUs (ISO/IEC 7816-4 §5.1), written as properties that fast-check
 * checks against generated commands.
 *
 * A command is a 4-byte header, then optionally Lc and the data, then optionally Le:
 *
 *   short     data 1-255 bytes, Ne 1-256         CLA INS P1 P2 [Lc data] [Le]
 *   extended  data up to 65535, Ne up to 65536   CLA INS P1 P2 00 Le1 Le2             (no data)
 *                                                CLA INS P1 P2 00 Lc1 Lc2 data [Le1 Le2]
 *
 * An all-zero Le means the maximum: Ne = 256 in short form, 65536 in extended form.
 *
 * The spec:
 *   1. Encoding a command and parsing the bytes gives back the same command, in short form
 *      unless the data, Le or the caller needs extended.
 *   2. parseCommand returns a command only when it encodes back to exactly the bytes it was
 *      given. Otherwise it throws.
 *   3. encodeCommand rejects what it can't encode, rather than sending something else: a header
 *      value that isn't a byte, Le that isn't a whole number from 0 to 65536, or more than 65535
 *      bytes of data.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { encodeCommand, parseCommand, tryParseCommand, type CommandApdu } from './apdu';
import { bytesEqual } from './hex';

// ---- Generators

const byte = fc.integer({ min: 0, max: 255 });

/** The whole range, weighted towards the short/extended boundary and the maximum. */
const nearBoundaries = (max: number) =>
  fc.oneof(
    { withCrossShrink: true },
    fc.integer({ min: 0, max }),
    fc.integer({ min: 250, max: 262 }),
    fc.integer({ min: max - 8, max }),
  );

const dataArb = fc.oneof(
  { withCrossShrink: true },
  fc.uint8Array({ maxLength: 300 }),
  fc
    .record({ length: nearBoundaries(65535), seed: byte })
    .map(({ length, seed }) => Uint8Array.from({ length }, (_, i) => (seed + i * 7) & 0xff)),
);

type Command = CommandApdu & { extended?: boolean };

const commandArb: fc.Arbitrary<Command> = fc.record(
  {
    cla: byte,
    ins: byte,
    p1: byte,
    p2: byte,
    data: dataArb,
    le: nearBoundaries(65536),
    extended: fc.boolean(),
  },
  { requiredKeys: ['cla', 'ins', 'p1', 'p2'] },
);

/** Numbers that aren't bytes: too big, negative, fractional, NaN or infinite. */
const notAByte = fc.oneof(
  fc.integer({ min: 256 }),
  fc.integer({ max: -1 }),
  fc.double({ noInteger: true }),
);

const badLe = fc.oneof(
  fc.integer({ min: 65537 }),
  fc.integer({ max: -1 }),
  fc.double({ noInteger: true }),
);

/** Random bytes, valid commands, and valid commands with a byte changed or cut short. */
const anyBytes = fc.oneof(
  fc.uint8Array({ maxLength: 12 }),
  commandArb.map(encodeCommand),
  fc
    .record({ bytes: commandArb.map(encodeCommand), at: fc.nat(), value: byte, cut: fc.boolean() })
    .map(({ bytes, at, value, cut }) => {
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

describe('Command APDU specification', () => {
  it('1. encoding a command and parsing the bytes gives back the same command', () => {
    fc.assert(
      fc.property(commandArb, (cmd) => {
        const nc = cmd.data?.length ?? 0;
        const extended =
          (!!cmd.extended || nc > 255 || (cmd.le ?? 0) > 256) && (nc > 0 || cmd.le !== undefined);
        const ne = cmd.le === undefined ? undefined : cmd.le || (extended ? 65536 : 256);
        const caseNumber = 1 + (cmd.le !== undefined ? 1 : 0) + (nc > 0 ? 2 : 0);

        const parsed = parseCommand(encodeCommand(cmd));
        return (
          parsed.cla === cmd.cla &&
          parsed.ins === cmd.ins &&
          parsed.p1 === cmd.p1 &&
          parsed.p2 === cmd.p2 &&
          bytesEqual(parsed.data ?? [], cmd.data ?? []) &&
          parsed.le === ne &&
          parsed.extended === extended &&
          parsed.case === caseNumber
        );
      }),
    );
  });

  it('2. parseCommand returns a command only when it encodes back to the same bytes', () => {
    fc.assert(
      fc.property(anyBytes, (bytes) => {
        const parsed = tryParseCommand(bytes);
        return parsed === undefined || bytesEqual(encodeCommand(parsed), bytes);
      }),
    );
  });

  describe('3. encodeCommand rejects what it cannot encode', () => {
    it('a header value that is not a byte', () => {
      const field = fc.constantFrom('cla', 'ins', 'p1', 'p2');
      fc.assert(
        fc.property(commandArb, field, notAByte, (cmd, f, bad) =>
          throwsRangeError(() => encodeCommand({ ...cmd, [f]: bad })),
        ),
      );
    });

    it('Le that is not a whole number from 0 to 65536', () => {
      fc.assert(
        fc.property(commandArb, badLe, (cmd, le) =>
          throwsRangeError(() => encodeCommand({ ...cmd, le })),
        ),
      );
    });

    it('more than 65535 bytes of data', () => {
      const data = new Uint8Array(65536);
      expect(() => encodeCommand({ cla: 0, ins: 0xd6, p1: 0, p2: 0, data })).toThrow(RangeError);
    });
  });
});

// ---- Examples of each bug the properties found

describe('Command APDU regressions', () => {
  it('rejects P2 260, rather than sending 04', () => {
    // READ RECORD with SFI 32: (32 << 3) | 4
    expect(() => encodeCommand({ cla: 0, ins: 0xb2, p1: 1, p2: 260 })).toThrow(RangeError);
  });

  it('rejects Le 1.5, rather than sending 01', () => {
    expect(() => encodeCommand({ cla: 0, ins: 0xb0, p1: 0, p2: 0, le: 1.5 })).toThrow(RangeError);
  });
});
