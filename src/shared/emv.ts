/**
 * Pure functions for EMV (Europay, Mastercard, Visa) protocol handling.
 * These functions are easily unit testable and can be used in both
 * main and renderer processes.
 */

import { hexToBytes } from './tlv';

/**
 * AFL (Application File Locator) entry structure
 */
export interface AflEntry {
  sfi: number;
  firstRecord: number;
  lastRecord: number;
  offlineDataAuthRecords: number;
}

/**
 * Parse AFL (Application File Locator) bytes into structured entries.
 * AFL contains 4-byte entries: [SFI byte, First Record, Last Record, ODA Records]
 * @param aflBytes - Raw AFL byte array
 * @returns Array of parsed AFL entries
 */
export function parseAfl(aflBytes: number[]): AflEntry[] {
  const entries: AflEntry[] = [];

  if (aflBytes.length % 4 !== 0) {
    return entries;
  }

  for (let i = 0; i < aflBytes.length; i += 4) {
    entries.push({
      sfi: extractSfiFromAflByte(aflBytes[i]),
      firstRecord: aflBytes[i + 1],
      lastRecord: aflBytes[i + 2],
      offlineDataAuthRecords: aflBytes[i + 3],
    });
  }

  return entries;
}

/**
 * Extract SFI (Short File Identifier) from AFL first byte.
 * SFI is stored in bits 3-7 (upper 5 bits after right-shifting by 3).
 * @param aflByte - First byte of an AFL entry
 * @returns SFI value (1-30)
 */
export function extractSfiFromAflByte(aflByte: number): number {
  return (aflByte >> 3) & 0x1f;
}

/**
 * Calculate P2 parameter for READ RECORD command.
 * P2 format: [SFI (5 bits) << 3] | [Control (3 bits)]
 * Control = 0x04 means "read record P1"
 * @param sfi - Short File Identifier
 * @returns P2 byte value
 */
export function calculateReadRecordP2(sfi: number): number {
  return (sfi << 3) | 0x04;
}

/**
 * Build SELECT APDU command for an AID.
 * Format: 00 A4 04 00 [len] [AID bytes] 00
 * @param aid - Application Identifier as hex string or byte array
 * @returns APDU command bytes
 */
export function buildSelectCommand(aid: string | number[]): number[] {
  const aidBytes = typeof aid === 'string' ? hexToBytes(aid) : aid;
  return [0x00, 0xa4, 0x04, 0x00, aidBytes.length, ...aidBytes, 0x00];
}

/**
 * Build READ RECORD APDU command.
 * Format: 00 B2 [record] [P2] 00
 * @param record - Record number
 * @param sfi - Short File Identifier
 * @returns APDU command bytes
 */
export function buildReadRecordCommand(record: number, sfi: number): number[] {
  const p2 = calculateReadRecordP2(sfi);
  return [0x00, 0xb2, record, p2, 0x00];
}

/**
 * Build GET RESPONSE APDU command.
 * Format: 00 C0 00 00 [length]
 * @param length - Number of bytes to retrieve
 * @returns APDU command bytes
 */
export function buildGetResponseCommand(length: number): number[] {
  return [0x00, 0xc0, 0x00, 0x00, length];
}

/**
 * Build GPO (GET PROCESSING OPTIONS) APDU command with empty PDOL.
 * Format: 80 A8 00 00 02 83 00 00
 * @returns APDU command bytes
 */
export function buildGpoCommand(): number[] {
  return [0x80, 0xa8, 0x00, 0x00, 0x02, 0x83, 0x00, 0x00];
}

/**
 * Get PSE (Payment System Environment) name for contact cards.
 * "1PAY.SYS.DDF01" in ASCII
 */
export const PSE_NAME = '1PAY.SYS.DDF01';

/**
 * Get PPSE (Proximity Payment System Environment) name for contactless cards.
 * "2PAY.SYS.DDF01" in ASCII
 */
export const PPSE_NAME = '2PAY.SYS.DDF01';

/**
 * Build SELECT PSE command for contact cards.
 * @returns APDU command bytes
 */
export function buildSelectPseCommand(): number[] {
  return buildSelectCommand(stringToBytes(PSE_NAME));
}

/**
 * Build SELECT PPSE command for contactless cards.
 * @returns APDU command bytes
 */
export function buildSelectPpseCommand(): number[] {
  return buildSelectCommand(stringToBytes(PPSE_NAME));
}

/**
 * Convert ASCII string to byte array.
 * @param str - ASCII string
 * @returns Byte array
 */
function stringToBytes(str: string): number[] {
  return Array.from(str).map((c) => c.charCodeAt(0));
}

/**
 * Common EMV tag constants
 */
export const EMV_TAGS = {
  AID: 0x4f,
  APP_LABEL: 0x50,
  TRACK_2: 0x57,
  PAN: 0x5a,
  CARDHOLDER_NAME: 0x5f20,
  APP_EXPIRY: 0x5f24,
  APPLICATION_TEMPLATE: 0x61,
  FCI_TEMPLATE: 0x6f,
  EMV_PROPRIETARY_TEMPLATE: 0x70,
  RESPONSE_TEMPLATE_2: 0x77,
  RESPONSE_TEMPLATE_1: 0x80,
  AIP: 0x82,
  DF_NAME: 0x84,
  APP_PRIORITY: 0x87,
  SFI: 0x88,
  AFL: 0x94,
  FCI_PROPRIETARY_TEMPLATE: 0xa5,
  FCI_ISSUER_DD: 0xbf0c,
} as const;
