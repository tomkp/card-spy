/**
 * The specification for BER-TLV (ISO/IEC 7816-4 §5.2, EMV Book 3 Annex B), written as properties
 * that fast-check checks against generated data.
 *
 * A data object is a tag, a length and a value.
 *
 *   tag     1 to 4 bytes. When the low five bits of the first byte are all ones, more bytes
 *           follow: each has b8 set except the last. Bit 6 (0x20) of the first byte marks a
 *           constructed object, whose value is itself a sequence of data objects. 00 and FF are
 *           not valid first bytes; they appear as padding between objects.
 *   length  one byte below 80, or 81 to 84 followed by that many bytes of length.
 *
 * The spec:
 *   1. parseTlv accepts any bytes without throwing, and every node it returns describes the
 *      bytes it came from: its tag and length at its offset, and its value straight after.
 *   2. Every tag the parser reports is well formed. Bytes it can't read as a tag are an error,
 *      never a different tag.
 *   3. Encoding a tree and parsing the result gives back the same tree, with no errors.
 *   4. Lengths encode in as few bytes as possible and read back unchanged.
 *   5. The encoders reject what they can't encode, rather than producing bytes that read back
 *      as something else: a tag that isn't well formed, children under a primitive tag, or a
 *      node with both a value and children.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { bytesEqual, fromHex, toHex } from './hex';
import {
  encodeLength,
  encodeTlv,
  encodeTlvTree,
  looksLikeTlv,
  parseTlv,
  readLength,
  readTag,
  type TlvBuildNode,
  type TlvNode,
} from './tlv';

// ---- What a well-formed tag is, written separately from readTag

function isWellFormedTag(tag: ArrayLike<number>): boolean {
  const n = tag.length;
  if (n < 1 || n > 4) return false;
  if ((tag[0]! & 0x1f) !== 0x1f) return n === 1;
  if (n < 2) return false;
  for (let i = 1; i < n - 1; i++) if ((tag[i]! & 0x80) === 0) return false;
  return (tag[n - 1]! & 0x80) === 0;
}

const isEncodableTag = (tag: ArrayLike<number>) =>
  isWellFormedTag(tag) && tag[0] !== 0x00 && tag[0] !== 0xff;

// ---- Generators

const byte = fc.integer({ min: 0, max: 255 });

/** A well-formed tag of 1 to 4 bytes, primitive or constructed. */
const tagArb = (constructed: boolean): fc.Arbitrary<number[]> => {
  const first = (cls: number, low: number) => (cls << 6) | (constructed ? 0x20 : 0) | low;
  const cls = fc.integer({ min: 0, max: 3 });
  return fc
    .oneof(
      fc
        .record({ cls, low: fc.integer({ min: 0, max: 30 }) })
        .map(({ cls, low }) => [first(cls, low)]),
      fc
        .record({
          cls,
          middle: fc.array(fc.integer({ min: 0x80, max: 0xff }), { maxLength: 2 }),
          last: fc.integer({ min: 0, max: 0x7f }),
        })
        .map(({ cls, middle, last }) => [first(cls, 0x1f), ...middle, last]),
    )
    .filter(isEncodableTag);
};

type Tree = { tag: number[]; value: Uint8Array } | { tag: number[]; children: Tree[] };

const { tree } = fc.letrec<{ tree: Tree; primitive: Tree; constructed: Tree }>((tie) => ({
  tree: fc.oneof({ depthSize: 'small', maxDepth: 4 }, tie('primitive'), tie('constructed')),
  // Up to 300 bytes, so values need one-, two- and three-byte lengths
  primitive: fc.record({ tag: tagArb(false), value: fc.uint8Array({ maxLength: 300 }) }),
  constructed: fc.record({
    tag: tagArb(true),
    children: fc.array(tie('tree'), { maxLength: 4 }),
  }),
}));

const trees = fc.array(tree, { maxLength: 4 });

/** Tags go in as numbers or as hex strings; the encoder takes both. */
const toBuild = (t: Tree, asString: boolean): TlvBuildNode => {
  const tag = asString ? toHex(t.tag) : t.tag.reduce((n, b) => n * 256 + b, 0);
  return 'children' in t
    ? { tag, children: t.children.map((c) => toBuild(c, asString)) }
    : { tag, value: t.value };
};

/** Bytes that mean something in a tag or length: padding, "more tag bytes follow", long lengths. */
const structuralByte = fc.constantFrom(0x00, 0x1f, 0x3f, 0x7f, 0x80, 0x81, 0x82, 0x84, 0x9f, 0xff);

/**
 * Random bytes, bytes weighted towards structural values, and encoded trees with a few bytes
 * changed and possibly cut short.
 */
const anyBytes = fc.oneof(
  fc.uint8Array({ maxLength: 64 }),
  fc.array(fc.oneof(byte, structuralByte), { maxLength: 32 }).map((b) => Uint8Array.from(b)),
  fc
    .record({
      encoded: trees.map((ts) => encodeTlvTree(ts.map((t) => toBuild(t, false)))),
      edits: fc.array(fc.record({ at: fc.nat(), value: byte }), { maxLength: 3 }),
      cut: fc.option(fc.nat(), { nil: undefined }),
    })
    .map(({ encoded, edits, cut }) => {
      const out = encoded.slice();
      for (const { at, value } of edits) if (out.length) out[at % out.length] = value;
      return cut === undefined || !out.length ? out : out.subarray(0, cut % out.length);
    }),
);

/** Tag bytes that can't be encoded. */
const badTag = fc.oneof(
  fc.constant<number[]>([]),
  fc.constantFrom<number[]>([0x00], [0xff]), // padding bytes
  fc.integer({ min: 0, max: 3 }).map((cls) => [(cls << 6) | 0x1f]), // says more bytes follow
  fc
    .tuple(tagArb(false), fc.uint8Array({ minLength: 1, maxLength: 3 }))
    .map(([tag, extra]) => [...tag, ...extra]), // bytes after the tag has ended
  fc
    .tuple(tagArb(false), fc.integer({ min: 0x80, max: 0xff }))
    .filter(([tag]) => tag.length > 1)
    .map(([tag, b]) => [...tag.slice(0, -1), b]), // last byte says more follow
  fc
    .array(fc.integer({ min: 0x80, max: 0xff }), { minLength: 3, maxLength: 5 })
    .map((middle) => [0x9f, ...middle, 0x01]), // longer than 4 bytes
);

// ---- Checks

/** Node offsets are absolute: `base` plus the index into `bytes`. */
function describesItsBytes(
  bytes: Uint8Array,
  base: number,
  nodes: TlvNode[],
  start: number,
  end: number,
): boolean {
  let next = start;
  for (const node of nodes) {
    const at = node.offset - base;
    const tagSize = node.tagHex.length / 2;
    const tagBytes = bytes.subarray(at, at + tagSize);
    const length = readLength(bytes, at + tagSize);
    const valueStart = at + node.headerLength;
    const valueEnd = valueStart + node.value.length;
    const ok =
      at >= next &&
      toHex(tagBytes) === node.tagHex &&
      node.tag === tagBytes.reduce((n, b) => n * 256 + b, 0) &&
      node.constructed === ((tagBytes[0]! & 0x20) !== 0) &&
      !('error' in length) &&
      length.length === node.length &&
      tagSize + length.size === node.headerLength &&
      valueEnd <= end &&
      bytesEqual(node.value, bytes.subarray(valueStart, valueEnd)) &&
      (node.value.length === node.length || (node.value.length < node.length && !!node.error)) &&
      (!node.children || describesItsBytes(bytes, base, node.children, valueStart, valueEnd));
    if (!ok) return false;
    next = valueEnd;
  }
  return true;
}

const allNodes = (nodes: TlvNode[]): TlvNode[] =>
  nodes.flatMap((n) => [n, ...allNodes(n.children ?? [])]);

function matches(node: TlvNode, t: Tree): boolean {
  if (node.error || node.tagHex !== toHex(t.tag)) return false;
  if ('children' in t) {
    const children = node.children ?? [];
    return (
      node.constructed &&
      children.length === t.children.length &&
      children.every((c, i) => matches(c, t.children[i]!))
    );
  }
  return !node.constructed && bytesEqual(node.value, t.value);
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

describe('TLV specification', () => {
  it('1. parseTlv accepts any bytes, and every node describes the bytes it came from', () => {
    fc.assert(
      fc.property(anyBytes, fc.nat({ max: 1000 }), fc.boolean(), (bytes, base, skipPadding) => {
        const { nodes } = parseTlv(bytes, { baseOffset: base, skipPadding });
        return describesItsBytes(bytes, base, nodes, 0, bytes.length);
      }),
    );
  });

  it('2. every tag the parser reports is well formed', () => {
    fc.assert(
      fc.property(anyBytes, (bytes) => {
        const tags = allNodes(parseTlv(bytes).nodes).map((n) => n.tagHex);
        const read = readTag(bytes, 0);
        return (
          tags.every((hex) => isWellFormedTag(fromHex(hex))) &&
          (read === undefined || isWellFormedTag(bytes.subarray(0, read.size)))
        );
      }),
    );
  });

  it('3. encoding a tree and parsing the result gives back the same tree', () => {
    fc.assert(
      fc.property(trees, fc.boolean(), (ts, asString) => {
        const bytes = encodeTlvTree(ts.map((t) => toBuild(t, asString)));
        const { nodes, error } = parseTlv(bytes);
        return (
          error === undefined &&
          nodes.length === ts.length &&
          nodes.every((n, i) => matches(n, ts[i]!)) &&
          looksLikeTlv(bytes) === ts.length > 0
        );
      }),
    );
  });

  it('4. lengths encode in as few bytes as possible and read back unchanged', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (n) => {
        const encoded = encodeLength(n);
        const read = readLength(encoded, 0);
        const fewest = n < 0x80 ? 1 : n < 0x100 ? 2 : n < 0x10000 ? 3 : n < 0x1000000 ? 4 : 5;
        return (
          !('error' in read) &&
          read.length === n &&
          read.size === encoded.length &&
          encoded.length === fewest
        );
      }),
    );
  });

  describe('5. the encoders reject what they cannot encode', () => {
    it('a tag that is not well formed', () => {
      fc.assert(
        fc.property(badTag, fc.uint8Array({ maxLength: 4 }), (tag, value) =>
          throwsRangeError(() => encodeTlv(toHex(tag), value)),
        ),
      );
    });

    it('a tag number that is not a whole number of at most 4 bytes', () => {
      for (const tag of [0, -1, 1.5, NaN, Infinity, 0x1f8181818101]) {
        expect(() => encodeTlv(tag, new Uint8Array()), String(tag)).toThrow(RangeError);
      }
    });

    it('children under a primitive tag', () => {
      fc.assert(
        fc.property(tagArb(false), trees, (tag, children) =>
          throwsRangeError(() =>
            encodeTlvTree([{ tag: toHex(tag), children: children.map((c) => toBuild(c, false)) }]),
          ),
        ),
      );
    });

    it('a node with both a value and children', () => {
      fc.assert(
        fc.property(tagArb(true), fc.uint8Array(), trees, (tag, value, children) =>
          throwsRangeError(() =>
            encodeTlvTree([
              { tag: toHex(tag), value, children: children.map((c) => toBuild(c, false)) },
            ]),
          ),
        ),
      );
    });
  });
});

// ---- Examples of each bug the properties found

describe('TLV regressions', () => {
  it('a tag whose fourth byte says more follow is an error, not a 4-byte tag', () => {
    const bytes = Uint8Array.of(0x9f, 0x81, 0x81, 0x81, 0x01, 0x01, 0xaa);
    expect(readTag(bytes, 0)).toBeUndefined();
    expect(parseTlv(bytes).error?.message).toMatch(/longer than 4 bytes/);
  });

  it('encodeTlv rejects 9F, which would swallow the length byte into the tag', () => {
    expect(() => encodeTlv(0x9f, Uint8Array.of(1))).toThrow(RangeError);
  });

  it('encodeTlvTree rejects children under a primitive tag', () => {
    expect(() => encodeTlvTree([{ tag: '5A', children: [{ tag: '84' }] }])).toThrow(RangeError);
  });

  it('encodeTlvTree rejects a node with both a value and children, rather than dropping the value', () => {
    const node = { tag: '70', value: Uint8Array.of(1), children: [{ tag: '84' }] };
    expect(() => encodeTlvTree([node])).toThrow(RangeError);
  });
});
