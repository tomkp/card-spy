/**
 * Pure functions for ASCII encoding/decoding.
 */

/**
 * Printable ASCII character range
 */
export const ASCII_PRINTABLE_MIN = 0x20; // Space
export const ASCII_PRINTABLE_MAX = 0x7e; // Tilde

/**
 * Check if a byte is a printable ASCII character.
 * Printable ASCII range is 0x20 (space) to 0x7E (tilde).
 * @param byte - Byte value to check
 * @returns true if byte is printable ASCII
 */
export function isPrintableAscii(byte: number): boolean {
  return byte >= ASCII_PRINTABLE_MIN && byte <= ASCII_PRINTABLE_MAX;
}

/**
 * Check if all bytes in an array are printable ASCII.
 * @param bytes - Array of bytes to check
 * @returns true if all bytes are printable ASCII
 */
export function isAllPrintableAscii(bytes: number[]): boolean {
  if (bytes.length === 0) return false;
  return bytes.every(isPrintableAscii);
}

/**
 * Try to decode a byte array as ASCII string.
 * Returns null if any byte is not printable ASCII.
 * @param bytes - Array of bytes to decode
 * @returns ASCII string or null if not decodable
 */
export function tryDecodeAscii(bytes: number[]): string | null {
  if (!isAllPrintableAscii(bytes)) {
    return null;
  }
  return String.fromCharCode(...bytes);
}

/**
 * Decode bytes as ASCII, replacing non-printable characters with a placeholder.
 * @param bytes - Array of bytes to decode
 * @param placeholder - Character to use for non-printable bytes (default: '.')
 * @returns Decoded string with placeholders
 */
export function decodeAsciiWithPlaceholder(bytes: number[], placeholder = '.'): string {
  return bytes.map((b) => (isPrintableAscii(b) ? String.fromCharCode(b) : placeholder)).join('');
}

/**
 * Encode an ASCII string to bytes.
 * @param str - ASCII string to encode
 * @returns Array of bytes
 */
export function encodeAscii(str: string): number[] {
  return Array.from(str).map((c) => c.charCodeAt(0));
}

/**
 * Check if a string contains only ASCII characters.
 * @param str - String to check
 * @returns true if all characters are ASCII (0x00-0x7F)
 */
export function isAsciiString(str: string): boolean {
  return Array.from(str).every((c) => c.charCodeAt(0) <= 0x7f);
}

/**
 * Check if a string contains only printable ASCII characters.
 * @param str - String to check
 * @returns true if all characters are printable ASCII (0x20-0x7E)
 */
export function isPrintableAsciiString(str: string): boolean {
  return Array.from(str).every((c) => isPrintableAscii(c.charCodeAt(0)));
}

/**
 * Common ASCII control character names
 */
export const ASCII_CONTROL_NAMES: Record<number, string> = {
  0x00: 'NUL',
  0x01: 'SOH',
  0x02: 'STX',
  0x03: 'ETX',
  0x04: 'EOT',
  0x05: 'ENQ',
  0x06: 'ACK',
  0x07: 'BEL',
  0x08: 'BS',
  0x09: 'HT',
  0x0a: 'LF',
  0x0b: 'VT',
  0x0c: 'FF',
  0x0d: 'CR',
  0x0e: 'SO',
  0x0f: 'SI',
  0x10: 'DLE',
  0x11: 'DC1',
  0x12: 'DC2',
  0x13: 'DC3',
  0x14: 'DC4',
  0x15: 'NAK',
  0x16: 'SYN',
  0x17: 'ETB',
  0x18: 'CAN',
  0x19: 'EM',
  0x1a: 'SUB',
  0x1b: 'ESC',
  0x1c: 'FS',
  0x1d: 'GS',
  0x1e: 'RS',
  0x1f: 'US',
  0x7f: 'DEL',
};

/**
 * Get the name of an ASCII control character.
 * @param byte - Byte value
 * @returns Control character name or undefined
 */
export function getControlCharName(byte: number): string | undefined {
  return ASCII_CONTROL_NAMES[byte];
}
