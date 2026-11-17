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

/** Removes comments: from # or // to the end of the line. */
export function stripComments(text: string): string {
  return text.replace(/(#|\/\/).*$/gm, '');
}

/**
 * Strips comments, separators and 0x prefixes; returns upper-case digits or throws on junk. A 0x
 * has to be followed by a digit, so a dangling one is junk rather than nothing.
 */
export function normalizeHex(input: string): string {
  const withoutPrefixes = stripComments(input).replace(/0x(?=[0-9a-f])/gi, '');
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

/** Accepts bytes or a hex string. Throws a RangeError for a number that isn't a byte. */
export function toBytes(input: string | ArrayLike<number>): Uint8Array {
  if (typeof input === 'string') return fromHex(input);
  if (input instanceof Uint8Array) return input;
  const out = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = checkRange(`Byte ${i}`, input[i]!, 0xff);
  return out;
}

/** Returns `value` if it's a whole number from 0 to `max`, or throws a RangeError naming it. */
export function checkRange(name: string, value: number, max: number): number {
  if (!(Number.isInteger(value) && value >= 0 && value <= max)) {
    // Quote a string, which scripts can pass, so "1" doesn't read as in range
    const shown = typeof value === 'string' ? JSON.stringify(value) : String(value);
    throw new RangeError(`${name} out of range (${shown})`);
  }
  return value;
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

/** Throws a RangeError for a character that isn't ASCII, rather than masking it to another byte. */
export function asciiToBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0x7f) {
      // The whole character, not half of a surrogate pair
      const char = String.fromCodePoint(text.codePointAt(i)!);
      throw new RangeError(`Not ASCII: '${char}' at index ${i}`);
    }
    out[i] = code;
  }
  return out;
}

/** Big-endian unsigned integer from up to 6 bytes. */
export function toUint(bytes: ArrayLike<number>): number {
  let n = 0;
  for (let i = 0; i < bytes.length; i++) n = n * 256 + bytes[i]!;
  return n;
}
