/** BER-TLV parsing with absolute offsets, tolerant of malformed data. */

import { concatBytes, fromHex } from './hex';

export type TagClass = 'universal' | 'application' | 'context' | 'private';

export interface TlvNode {
  /** Tag bytes as a big-endian integer, e.g. 0x9F27. */
  tag: number;
  tagHex: string;
  cls: TagClass;
  constructed: boolean;
  /** Declared length; `value` may be shorter when the data is truncated. */
  length: number;
  /** Absolute offset of the first tag byte. */
  offset: number;
  /** Tag plus length bytes. */
  headerLength: number;
  value: Uint8Array;
  children?: TlvNode[];
  error?: string;
}

export interface TlvParseResult {
  nodes: TlvNode[];
  error?: { offset: number; message: string };
}

export interface TlvParseOptions {
  /** Added to every offset, for parsing a slice of a larger buffer. */
  baseOffset?: number;
  /** Skip 00 and FF bytes between objects (EMV padding). Default true. */
  skipPadding?: boolean;
}

export interface TlvBuildNode {
  tag: number | string;
  value?: Uint8Array;
  children?: TlvBuildNode[];
}

const CLASSES: TagClass[] = ['universal', 'application', 'context', 'private'];
const MAX_DEPTH = 32;

export function tagToNumber(tag: number | string): number {
  return typeof tag === 'number' ? tag : parseInt(tag.replace(/\s/g, ''), 16);
}

/** Minimal-length upper-case hex for a tag number, e.g. 0x9F27 -> "9F27". */
export function tagToHex(tag: number | string): string {
  if (typeof tag === 'string') return tag.replace(/\s/g, '').toUpperCase();
  let hex = tag.toString(16).toUpperCase();
  if (hex.length % 2) hex = '0' + hex;
  return hex;
}

export function tagToBytes(tag: number | string): Uint8Array {
  return fromHex(tagToHex(tag));
}

export interface TagHeader {
  tag: number;
  tagHex: string;
  cls: TagClass;
  constructed: boolean;
  /** Number of tag bytes. */
  size: number;
}

/** Reads a BER tag at `offset`; returns undefined if the data ends mid-tag. */
export function readTag(bytes: Uint8Array, offset: number): TagHeader | undefined {
  const first = bytes[offset];
  if (first === undefined) return undefined;
  let size = 1;
  if ((first & 0x1f) === 0x1f) {
    for (;;) {
      const b = bytes[offset + size];
      if (b === undefined) return undefined;
      size++;
      if ((b & 0x80) === 0 || size >= 4) break;
    }
  }
  let tag = 0;
  let tagHex = '';
  for (let i = 0; i < size; i++) {
    const b = bytes[offset + i]!;
    tag = tag * 256 + b;
    tagHex += b.toString(16).toUpperCase().padStart(2, '0');
  }
  return {
    tag,
    tagHex,
    cls: CLASSES[first >> 6]!,
    constructed: (first & 0x20) !== 0,
    size,
  };
}

/** Reads a BER length at `offset`. */
export function readLength(
  bytes: Uint8Array,
  offset: number,
): { length: number; size: number } | { error: string } {
  const first = bytes[offset];
  if (first === undefined) return { error: 'Missing length' };
  if (first < 0x80) return { length: first, size: 1 };
  if (first === 0x80) return { error: 'Indefinite length is not supported' };
  const count = first & 0x7f;
  if (count > 4) return { error: `Length of ${count} bytes is not supported` };
  let length = 0;
  for (let i = 1; i <= count; i++) {
    const b = bytes[offset + i];
    if (b === undefined) return { error: 'Truncated length' };
    length = length * 256 + b;
  }
  return { length, size: 1 + count };
}

export function parseTlv(bytes: Uint8Array, options: TlvParseOptions = {}): TlvParseResult {
  return parseLevel(bytes, options.baseOffset ?? 0, options.skipPadding ?? true, 0);
}

function parseLevel(
  bytes: Uint8Array,
  base: number,
  skipPadding: boolean,
  depth: number,
): TlvParseResult {
  const nodes: TlvNode[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    if (skipPadding && (b === 0x00 || b === 0xff)) {
      i++;
      continue;
    }
    const header = readTag(bytes, i);
    if (!header) {
      return { nodes, error: { offset: base + i, message: 'Truncated tag' } };
    }
    const len = readLength(bytes, i + header.size);
    if ('error' in len) {
      return { nodes, error: { offset: base + i, message: `${header.tagHex}: ${len.error}` } };
    }
    const headerLength = header.size + len.size;
    const valueStart = i + headerLength;
    const value = bytes.subarray(valueStart, Math.min(valueStart + len.length, bytes.length));
    const node: TlvNode = {
      tag: header.tag,
      tagHex: header.tagHex,
      cls: header.cls,
      constructed: header.constructed,
      length: len.length,
      offset: base + i,
      headerLength,
      value,
    };
    nodes.push(node);
    if (value.length < len.length) {
      node.error = `Value truncated: expected ${len.length} bytes, got ${value.length}`;
      return { nodes, error: { offset: base + i, message: `${header.tagHex}: ${node.error}` } };
    }
    if (header.constructed) {
      if (depth >= MAX_DEPTH) {
        node.error = 'Nesting too deep';
      } else {
        const inner = parseLevel(value, base + valueStart, skipPadding, depth + 1);
        node.children = inner.nodes;
        if (inner.error) node.error = inner.error.message;
      }
    }
    i = valueStart + len.length;
  }
  return { nodes };
}

/** Depth-first search for the first node with this tag. */
export function findTlv(nodes: TlvNode[], tag: number | string): TlvNode | undefined {
  const wanted = tagToNumber(tag);
  for (const node of nodes) {
    if (node.tag === wanted) return node;
    if (node.children) {
      const found = findTlv(node.children, wanted);
      if (found) return found;
    }
  }
  return undefined;
}

export function findAllTlv(nodes: TlvNode[], tag: number | string): TlvNode[] {
  const wanted = tagToNumber(tag);
  const out: TlvNode[] = [];
  const walk = (list: TlvNode[]) => {
    for (const node of list) {
      if (node.tag === wanted) out.push(node);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** True when the bytes parse cleanly as one or more TLV objects with nothing left over. */
export function looksLikeTlv(bytes: Uint8Array): boolean {
  const result = parseTlv(bytes);
  if (result.error || result.nodes.length === 0) return false;
  const clean = (list: TlvNode[]): boolean =>
    list.every((n) => !n.error && (!n.children || clean(n.children)));
  return clean(result.nodes);
}

export function encodeLength(length: number): Uint8Array {
  if (length < 0x80) return Uint8Array.of(length);
  const out: number[] = [];
  let n = length;
  while (n > 0) {
    out.unshift(n & 0xff);
    n = Math.floor(n / 256);
  }
  return Uint8Array.from([0x80 | out.length, ...out]);
}

export function encodeTlv(tag: number | string, value: Uint8Array): Uint8Array {
  return concatBytes(tagToBytes(tag), encodeLength(value.length), value);
}

/** Encodes a tree of nodes; a node with children encodes them as its value. */
export function encodeTlvTree(nodes: TlvBuildNode[]): Uint8Array {
  return concatBytes(
    ...nodes.map((n) =>
      encodeTlv(n.tag, n.children ? encodeTlvTree(n.children) : (n.value ?? new Uint8Array())),
    ),
  );
}
