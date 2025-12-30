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
 * DOL (Data Object List) entry - used for PDOL and CDOL
 */
export interface DolEntry {
  tag: number;
  length: number;
}

/**
 * Options for building default PDOL/CDOL data
 */
export interface DolBuildOptions {
  /** Amount in minor units (e.g., cents) */
  amount: number;
  /** ISO 4217 currency code (e.g., 0x0840 for USD) */
  currencyCode: number;
  /** Transaction type (default 0x00 = purchase) */
  transactionType?: number;
  /** Terminal Verification Results (default all zeros) */
  tvr?: number[];
  /** Custom tag value overrides */
  overrides?: Map<number, number[]>;
}

/**
 * CVM (Cardholder Verification Method) method types
 */
export type CvmMethod =
  | 'fail'
  | 'plaintext_pin_icc'
  | 'enciphered_pin_online'
  | 'plaintext_pin_icc_signature'
  | 'enciphered_pin_icc'
  | 'enciphered_pin_icc_signature'
  | 'signature'
  | 'no_cvm'
  | 'unknown';

/**
 * CVM condition types
 */
export type CvmCondition =
  | 'always'
  | 'unattended_cash'
  | 'not_unattended_cash_manual_pin'
  | 'terminal_supports_cvm'
  | 'manual_cash'
  | 'purchase_with_cashback'
  | 'amount_under_x'
  | 'amount_over_x'
  | 'amount_under_y'
  | 'amount_over_y'
  | 'unknown';

/**
 * A single CVM rule
 */
export interface CvmRule {
  /** The verification method */
  method: CvmMethod;
  /** The condition for this rule to apply */
  condition: CvmCondition;
  /** If true, transaction fails if this CVM fails. If false, try next rule. */
  failIfUnsuccessful: boolean;
  /** Raw CVM byte */
  cvmByte: number;
  /** Raw condition byte */
  conditionByte: number;
}

/**
 * Parsed CVM list
 */
export interface CvmList {
  /** Amount X threshold (in currency minor units) */
  amountX: number;
  /** Amount Y threshold (in currency minor units) */
  amountY: number;
  /** CVM rules in priority order */
  rules: CvmRule[];
}

/**
 * Context for CVM evaluation
 */
export interface CvmContext {
  /** Transaction amount in minor units */
  amount?: number;
  /** Whether terminal supports CVM */
  terminalSupportsCvm?: boolean;
  /** Whether this is unattended cash */
  unattendedCash?: boolean;
  /** Whether this is manual cash */
  manualCash?: boolean;
  /** Whether this is purchase with cashback */
  purchaseWithCashback?: boolean;
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
  CURRENCY_CODE: 0x5f2a,
  APPLICATION_TEMPLATE: 0x61,
  FCI_TEMPLATE: 0x6f,
  EMV_PROPRIETARY_TEMPLATE: 0x70,
  RESPONSE_TEMPLATE_2: 0x77,
  RESPONSE_TEMPLATE_1: 0x80,
  AIP: 0x82,
  DF_NAME: 0x84,
  APP_PRIORITY: 0x87,
  SFI: 0x88,
  TVR: 0x95,
  TRANSACTION_DATE: 0x9a,
  TRANSACTION_TYPE: 0x9c,
  AFL: 0x94,
  AMOUNT_AUTHORIZED: 0x9f02,
  AMOUNT_OTHER: 0x9f03,
  TERMINAL_COUNTRY_CODE: 0x9f1a,
  UNPREDICTABLE_NUMBER: 0x9f37,
  PDOL: 0x9f38,
  TTQ: 0x9f66,
  FCI_PROPRIETARY_TEMPLATE: 0xa5,
  FCI_ISSUER_DD: 0xbf0c,
} as const;

/**
 * Check if a tag byte indicates a multi-byte tag.
 * Multi-byte tags have bits 1-5 of first byte all set (0x1F).
 */
function isMultiByteTag(tagByte: number): boolean {
  return (tagByte & 0x1f) === 0x1f;
}

/**
 * Parse DOL (Data Object List) bytes into structured entries.
 * DOL format: [tag (1-2 bytes)] [length (1 byte)], repeated
 * Used for both PDOL and CDOL parsing.
 * @param dolBytes - Raw DOL byte array
 * @returns Array of parsed DOL entries
 */
export function parseDol(dolBytes: number[]): DolEntry[] {
  const entries: DolEntry[] = [];
  let i = 0;

  while (i < dolBytes.length) {
    const firstByte = dolBytes[i];
    if (firstByte === undefined) break;

    let tag: number;
    if (isMultiByteTag(firstByte)) {
      // Two-byte tag
      const secondByte = dolBytes[i + 1];
      if (secondByte === undefined) break;
      tag = (firstByte << 8) | secondByte;
      i += 2;
    } else {
      // Single-byte tag
      tag = firstByte;
      i += 1;
    }

    const length = dolBytes[i];
    if (length === undefined) break;
    i += 1;

    entries.push({ tag, length });
  }

  return entries;
}

/**
 * Build DOL data buffer from entries and tag values.
 * Missing values are padded with zeros, values too long are truncated,
 * values too short are left-padded with zeros.
 * @param entries - DOL entries (from parseDol)
 * @param values - Map of tag -> value bytes
 * @returns Concatenated DOL data
 */
export function buildDolData(entries: DolEntry[], values: Map<number, number[]>): number[] {
  const result: number[] = [];

  for (const entry of entries) {
    const value = values.get(entry.tag);

    if (value === undefined) {
      // No value provided, use zeros
      for (let i = 0; i < entry.length; i++) {
        result.push(0x00);
      }
    } else if (value.length >= entry.length) {
      // Value is long enough, take first 'length' bytes
      for (let i = 0; i < entry.length; i++) {
        result.push(value[i]);
      }
    } else {
      // Value is shorter, left-pad with zeros
      const padding = entry.length - value.length;
      for (let i = 0; i < padding; i++) {
        result.push(0x00);
      }
      for (const byte of value) {
        result.push(byte);
      }
    }
  }

  return result;
}

/**
 * Convert amount (in minor units) to 6-byte BCD format.
 * EMV amounts are stored as 12-digit BCD (6 bytes).
 * @param amount - Amount in minor units (e.g., cents)
 * @returns 6-byte BCD array
 */
export function amountToBcd(amount: number): number[] {
  const str = amount.toString().padStart(12, '0');
  const result: number[] = [];

  for (let i = 0; i < 6; i++) {
    const d1 = parseInt(str[i * 2] ?? '0', 10);
    const d2 = parseInt(str[i * 2 + 1] ?? '0', 10);
    result.push((d1 << 4) | d2);
  }

  return result;
}

/**
 * Convert date to BCD YYMMDD format (3 bytes).
 * @param date - Date to convert (defaults to current date)
 * @returns 3-byte BCD array [YY, MM, DD]
 */
export function dateToBcd(date: Date = new Date()): number[] {
  const year = date.getFullYear() % 100;
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return [
    ((Math.floor(year / 10) << 4) | (year % 10)),
    ((Math.floor(month / 10) << 4) | (month % 10)),
    ((Math.floor(day / 10) << 4) | (day % 10)),
  ];
}

/**
 * Generate a random unpredictable number (4 bytes).
 */
function generateUnpredictableNumber(): number[] {
  return [
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
  ];
}

/**
 * Build PDOL data with sensible default values for common EMV tags.
 * @param entries - PDOL entries from parseDol()
 * @param options - Transaction options (amount, currency, etc.)
 * @returns PDOL data ready for GPO
 */
export function buildDefaultPdolData(entries: DolEntry[], options: DolBuildOptions): number[] {
  const {
    amount,
    currencyCode,
    transactionType = 0x00,
    overrides = new Map<number, number[]>(),
  } = options;

  // Build default values for common PDOL tags
  const defaults = new Map<number, number[]>([
    [EMV_TAGS.AMOUNT_AUTHORIZED, amountToBcd(amount)],
    [EMV_TAGS.AMOUNT_OTHER, [0x00, 0x00, 0x00, 0x00, 0x00, 0x00]],
    [EMV_TAGS.TERMINAL_COUNTRY_CODE, [(currencyCode >> 8) & 0xff, currencyCode & 0xff]],
    [EMV_TAGS.CURRENCY_CODE, [(currencyCode >> 8) & 0xff, currencyCode & 0xff]],
    [EMV_TAGS.TRANSACTION_DATE, dateToBcd()],
    [EMV_TAGS.TRANSACTION_TYPE, [transactionType]],
    [EMV_TAGS.UNPREDICTABLE_NUMBER, generateUnpredictableNumber()],
    [EMV_TAGS.TVR, [0x00, 0x00, 0x00, 0x00, 0x00]],
    [EMV_TAGS.TTQ, [0x86, 0x00, 0x00, 0x00]], // Terminal Transaction Qualifiers
  ]);

  // Merge user overrides
  overrides.forEach((value, tag) => {
    defaults.set(tag, value);
  });

  return buildDolData(entries, defaults);
}

/**
 * Build standard CDOL1 data for Generate AC command.
 * This constructs the commonly required CDOL1 data in the standard order.
 * @param options - Transaction options (amount, currency, etc.)
 * @returns CDOL data ready for Generate AC (29 bytes)
 */
export function buildDefaultCdolData(options: DolBuildOptions): number[] {
  const {
    amount,
    currencyCode,
    transactionType = 0x00,
    tvr = [0x00, 0x00, 0x00, 0x00, 0x00],
  } = options;

  // Standard CDOL1 fields in typical order:
  // Amount (6) + Other Amount (6) + Country (2) + TVR (5) + Currency (2) + Date (3) + Type (1) + UN (4)
  return [
    ...amountToBcd(amount),                           // Amount, Authorized (6 bytes)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,               // Amount, Other (6 bytes)
    (currencyCode >> 8) & 0xff, currencyCode & 0xff, // Terminal Country Code (2 bytes)
    ...tvr,                                           // TVR (5 bytes)
    (currencyCode >> 8) & 0xff, currencyCode & 0xff, // Transaction Currency Code (2 bytes)
    ...dateToBcd(),                                   // Transaction Date (3 bytes)
    transactionType,                                  // Transaction Type (1 byte)
    ...generateUnpredictableNumber(),                 // Unpredictable Number (4 bytes)
  ];
}

/**
 * Build GPO (GET PROCESSING OPTIONS) APDU command with PDOL data.
 * Format: 80 A8 00 00 [Lc] 83 [len] [PDOL data] 00
 * @param pdolData - PDOL data (built from buildDolData or buildDefaultPdolData)
 * @returns APDU command bytes
 */
export function buildGpoCommandWithPdol(pdolData: number[]): number[] {
  const lc = 2 + pdolData.length; // tag 83 + length byte + data
  return [
    0x80, 0xa8, 0x00, 0x00, // CLA INS P1 P2
    lc,                     // Lc
    0x83, pdolData.length,  // Command Template (tag 83) + length
    ...pdolData,            // PDOL data
    0x00,                   // Le
  ];
}

/**
 * Convert CVM method code to CvmMethod type
 */
function cvmCodeToMethod(code: number): CvmMethod {
  switch (code) {
    case 0x00:
      return 'fail';
    case 0x01:
      return 'plaintext_pin_icc';
    case 0x02:
      return 'enciphered_pin_online';
    case 0x03:
      return 'plaintext_pin_icc_signature';
    case 0x04:
      return 'enciphered_pin_icc';
    case 0x05:
      return 'enciphered_pin_icc_signature';
    case 0x1e:
      return 'signature';
    case 0x1f:
      return 'no_cvm';
    default:
      return 'unknown';
  }
}

/**
 * Convert condition byte to CvmCondition type
 */
function conditionByteToCondition(code: number): CvmCondition {
  switch (code) {
    case 0x00:
      return 'always';
    case 0x01:
      return 'unattended_cash';
    case 0x02:
      return 'not_unattended_cash_manual_pin';
    case 0x03:
      return 'terminal_supports_cvm';
    case 0x04:
      return 'manual_cash';
    case 0x05:
      return 'purchase_with_cashback';
    case 0x06:
      return 'amount_under_x';
    case 0x07:
      return 'amount_over_x';
    case 0x08:
      return 'amount_under_y';
    case 0x09:
      return 'amount_over_y';
    default:
      return 'unknown';
  }
}

/**
 * Read a 4-byte big-endian unsigned integer from an array
 */
function readUint32BE(bytes: number[], offset: number): number {
  const b0 = bytes[offset] ?? 0;
  const b1 = bytes[offset + 1] ?? 0;
  const b2 = bytes[offset + 2] ?? 0;
  const b3 = bytes[offset + 3] ?? 0;
  return (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
}

/**
 * Parse CVM (Cardholder Verification Method) List from EMV tag 8E.
 * The CVM List contains amount thresholds and a list of verification rules.
 * @param bytes - The CVM List data (tag 8E)
 * @returns Parsed CVM list with amount thresholds and rules
 */
export function parseCvmList(bytes: number[]): CvmList {
  if (bytes.length < 8) {
    return { amountX: 0, amountY: 0, rules: [] };
  }

  const amountX = readUint32BE(bytes, 0);
  const amountY = readUint32BE(bytes, 4);
  const rules: CvmRule[] = [];

  // Parse CVM rules (2 bytes each)
  for (let i = 8; i + 1 < bytes.length; i += 2) {
    const cvmByte = bytes[i] as number;
    const conditionByte = bytes[i + 1] as number;

    // Bit 6 of CVM byte indicates fail behavior (0 = fail, 1 = continue)
    const failIfUnsuccessful = (cvmByte & 0x40) === 0;

    // Bits 0-5 of CVM byte indicate the method
    const methodCode = cvmByte & 0x3f;
    const method = cvmCodeToMethod(methodCode);
    const condition = conditionByteToCondition(conditionByte);

    rules.push({
      method,
      condition,
      failIfUnsuccessful,
      cvmByte,
      conditionByte,
    });
  }

  return { amountX, amountY, rules };
}

/**
 * Evaluate a CVM condition against the transaction context
 */
function evaluateCondition(
  condition: CvmCondition,
  cvmList: CvmList,
  context: CvmContext
): boolean {
  switch (condition) {
    case 'always':
      return true;
    case 'unattended_cash':
      return context.unattendedCash === true;
    case 'not_unattended_cash_manual_pin':
      return (
        context.unattendedCash !== true &&
        context.manualCash !== true &&
        context.purchaseWithCashback !== true
      );
    case 'terminal_supports_cvm':
      return context.terminalSupportsCvm === true;
    case 'manual_cash':
      return context.manualCash === true;
    case 'purchase_with_cashback':
      return context.purchaseWithCashback === true;
    case 'amount_under_x':
      return context.amount !== undefined && context.amount < cvmList.amountX;
    case 'amount_over_x':
      return context.amount !== undefined && context.amount > cvmList.amountX;
    case 'amount_under_y':
      return context.amount !== undefined && context.amount < cvmList.amountY;
    case 'amount_over_y':
      return context.amount !== undefined && context.amount > cvmList.amountY;
    case 'unknown':
    default:
      return false;
  }
}

/**
 * Evaluate CVM rules against a transaction context and return the first matching rule.
 * This simulates the terminal's CVM selection process.
 * @param cvmList - Parsed CVM list
 * @param context - Transaction context with relevant conditions
 * @returns The first matching CVM rule, or undefined if none match
 */
export function evaluateCvm(cvmList: CvmList, context: CvmContext): CvmRule | undefined {
  for (const rule of cvmList.rules) {
    if (evaluateCondition(rule.condition, cvmList, context)) {
      return rule;
    }
  }
  return undefined;
}
