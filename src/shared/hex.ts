/** Hex string <-> byte helpers. Pure and environment-neutral (no Buffer), so they run in main, renderer and workers. */

const HEX = '0123456789ABCDEF';

/** Bytes to upper-case hex. `separator` goes between bytes, e.g. ' ' for "00 A4 04 00". */
export function toHex(bytes: ArrayLike<number>, separator = ''): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]! & 0xff;
    if (i > 0 && separator) out += separator;
    out += HEX[b >> 4]! + HEX[b & 0x0f]!;
  }
  return out;
}

export function byteToHex(b: number): string {
  return HEX[(b >> 4) & 0x0f]! + HEX[b & 0x0f]!;
}

/**
 * Lenient hex parser for anything a person might paste: "00A4", "00 a4", "0x00, 0xA4",
 * "00:A4", with newlines and `#` or `//` comments to end of line.
 * Throws on non-hex characters or an odd number of digits.
 */
export function fromHex(input: string): Uint8Array {
  const digits = normalizeHex(input);
  if (digits.length % 2 !== 0) {
    throw new Error(`Odd number of hex digits (${digits.length})`);
  }
  const out = new Uint8Array(digits.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(digits.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Strips comments, separators and 0x prefixes; returns upper-case digits or throws on junk. */
export function normalizeHex(input: string): string {
  const withoutComments = input.replace(/(#|\/\/).*$/gm, '');
  const withoutPrefixes = withoutComments.replace(/0x/gi, '');
  const digits = withoutPrefixes.replace(/[\s,:;-]/g, '');
  const bad = digits.match(/[^0-9a-fA-F]/);
  if (bad) {
    throw new Error(`Invalid hex character '${bad[0]}'`);
  }
  return digits.toUpperCase();
}

export function isHex(input: string): boolean {
  try {
    return normalizeHex(input).length % 2 === 0;
  } catch {
    return false;
  }
}

/** Accepts bytes or a hex string. */
export function toBytes(input: string | ArrayLike<number>): Uint8Array {
  if (typeof input === 'string') return fromHex(input);
  return input instanceof Uint8Array ? input : Uint8Array.from(input);
}

export function concatBytes(...parts: ArrayLike<number>[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function bytesEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Printable ASCII, with '.' for anything else. Used beside hex dumps. */
export function toAscii(bytes: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    out += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.';
  }
  return out;
}

/** True when every byte is printable ASCII (space through tilde). */
export function isPrintable(bytes: ArrayLike<number>): boolean {
  if (bytes.length === 0) return false;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b < 0x20 || b >= 0x7f) return false;
  }
  return true;
}

export function asciiToBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/** Big-endian unsigned integer from up to 6 bytes. */
export function toUint(bytes: ArrayLike<number>): number {
  let n = 0;
  for (let i = 0; i < bytes.length; i++) n = n * 256 + bytes[i]!;
  return n;
}
