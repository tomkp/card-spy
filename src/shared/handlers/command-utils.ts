/**
 * Shared APDU command building utilities for card handlers.
 * Reduces duplication of common command patterns across handlers.
 */

import { hexToBytes } from '../tlv';

/**
 * PIN encoding methods used by different card types.
 */
export enum PinEncoding {
  /** ASCII encoding (0x31 for '1') - used by PIV, OpenPGP */
  ASCII = 'ascii',
  /** BCD encoding (0x21 for '12') - used by SIM/USIM */
  BCD = 'bcd',
}

/**
 * Options for building a VERIFY PIN APDU.
 */
export interface VerifyPinOptions {
  /** PIN encoding method */
  encoding: PinEncoding;
  /** Class byte (default: 0x00) */
  cla?: number;
  /** P1 parameter (default: 0x00) */
  p1?: number;
  /** P2 parameter - PIN reference (required) */
  p2: number;
  /** Byte to use for padding (e.g., 0xFF for PIV) */
  padByte?: number;
  /** Total length to pad to (e.g., 8 for PIV/SIM) */
  padLength?: number;
}

/**
 * Build a VERIFY PIN APDU command.
 *
 * @param pin - The PIN string to verify
 * @param options - Configuration for the APDU
 * @returns APDU byte array
 *
 * @example
 * // PIV style (ASCII, padded to 8 bytes with 0xFF)
 * buildVerifyPinApdu('123456', {
 *   encoding: PinEncoding.ASCII,
 *   padByte: 0xff,
 *   padLength: 8,
 *   p2: 0x80,
 * });
 *
 * @example
 * // OpenPGP style (ASCII, no padding)
 * buildVerifyPinApdu('123456', {
 *   encoding: PinEncoding.ASCII,
 *   p2: 0x81,
 * });
 */
export function buildVerifyPinApdu(pin: string, options: VerifyPinOptions): number[] {
  const { encoding, cla = 0x00, p1 = 0x00, p2, padByte, padLength } = options;

  let pinBytes: number[];

  if (encoding === PinEncoding.ASCII) {
    pinBytes = Array.from(pin).map((c) => c.charCodeAt(0));
  } else {
    // BCD encoding: pack two digits per byte
    pinBytes = [];
    for (let i = 0; i < pin.length; i += 2) {
      const d1 = parseInt(pin[i], 10);
      const d2 = i + 1 < pin.length ? parseInt(pin[i + 1], 10) : 0x0f;
      pinBytes.push((d1 << 4) | d2);
    }
  }

  // Apply padding if specified
  if (padLength !== undefined && padByte !== undefined) {
    while (pinBytes.length < padLength) {
      pinBytes.push(padByte);
    }
  }

  // VERIFY: CLA 20 P1 P2 Lc [PIN data]
  return [cla, 0x20, p1, p2, pinBytes.length, ...pinBytes];
}

/**
 * Style of GET DATA command.
 */
export type GetDataStyle = 'piv' | 'openpgp';

/**
 * Options for building a GET DATA APDU.
 */
export interface GetDataOptions {
  /** Command style - determines how tag is encoded */
  style: GetDataStyle;
  /** Class byte (default: 0x00) */
  cla?: number;
}

/**
 * Build a GET DATA APDU command.
 *
 * Different card types encode the tag differently:
 * - PIV: Tag is wrapped in 5C TLV and placed in data field (INS=CB, P1P2=3FFF)
 * - OpenPGP: Tag is split into P1 and P2 (INS=CA)
 *
 * @param tag - Hex string of the tag to retrieve
 * @param options - Configuration for the APDU
 * @returns APDU byte array
 *
 * @example
 * // PIV style
 * buildGetDataApdu('5FC102', { style: 'piv' });
 * // Returns: [00 CB 3F FF 05 5C 03 5F C1 02 00]
 *
 * @example
 * // OpenPGP style
 * buildGetDataApdu('5F50', { style: 'openpgp' });
 * // Returns: [00 CA 5F 50 00]
 */
export function buildGetDataApdu(tag: string, options: GetDataOptions): number[] {
  const { style, cla = 0x00 } = options;
  const tagBytes = hexToBytes(tag);

  if (style === 'piv') {
    // PIV: GET DATA with tag in 5C TLV wrapper
    // Format: 00 CB 3F FF Lc [5C len tagBytes] Le
    const data = [0x5c, tagBytes.length, ...tagBytes];
    return [cla, 0xcb, 0x3f, 0xff, data.length, ...data, 0x00];
  } else {
    // OpenPGP: GET DATA with tag split into P1 P2
    // Format: 00 CA P1 P2 Le
    const p1 = tagBytes.length > 1 ? tagBytes[0] : 0x00;
    const p2 = tagBytes.length > 1 ? tagBytes[1] : tagBytes[0];
    return [cla, 0xca, p1, p2, 0x00];
  }
}

/**
 * Options for building a SELECT FILE APDU.
 */
export interface SelectFileOptions {
  /** Class byte (default: 0x00) */
  cla?: number;
  /** P1 parameter - selection control (default: 0x00 = select by file ID) */
  p1?: number;
  /** P2 parameter - response type (default: 0x00) */
  p2?: number;
}

/**
 * Build a SELECT FILE APDU command.
 *
 * @param fileId - Hex string of the file ID (e.g., '3F00' for MF, '7F20' for DF)
 * @param options - Configuration for the APDU
 * @returns APDU byte array
 *
 * @example
 * buildSelectFileApdu('3F00'); // Select MF
 * buildSelectFileApdu('7F20'); // Select DF GSM
 */
export function buildSelectFileApdu(fileId: string, options: SelectFileOptions = {}): number[] {
  const { cla = 0x00, p1 = 0x00, p2 = 0x00 } = options;
  const fileIdBytes = hexToBytes(fileId);

  // SELECT: CLA A4 P1 P2 Lc [FileID]
  return [cla, 0xa4, p1, p2, fileIdBytes.length, ...fileIdBytes];
}

/**
 * Build a READ BINARY APDU command.
 *
 * @param offset - Offset in the file (0-65535)
 * @param length - Number of bytes to read (0 = max available)
 * @param cla - Class byte (default: 0x00)
 * @returns APDU byte array
 */
export function buildReadBinaryApdu(offset: number, length: number, cla = 0x00): number[] {
  const p1 = (offset >> 8) & 0xff;
  const p2 = offset & 0xff;
  return [cla, 0xb0, p1, p2, length];
}
