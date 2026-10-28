/** EMV data object lists (PDOL, CDOL1/2, DDOL, TDOL): parse, and build the data a card asks for. */

import { asciiToBytes, concatBytes } from './hex';
import { lookupTag } from './tags/emv';
import { readTag } from './tlv';

export interface DolEntry {
  tag: number;
  tagHex: string;
  length: number;
}

/** Tag/length pairs. Stops at the first malformed entry. */
export function parseDol(bytes: Uint8Array): DolEntry[] {
  const entries: DolEntry[] = [];
  let i = 0;
  while (i < bytes.length) {
    const header = readTag(bytes, i);
    const length = header ? bytes[i + header.size] : undefined;
    if (!header || length === undefined) break;
    entries.push({ tag: header.tag, tagHex: header.tagHex, length });
    i += header.size + 1;
  }
  return entries;
}

/**
 * Concatenates values for each DOL entry using EMV Book 3 §5.4 rules:
 * numeric (n) pads with leading zeros and truncates on the left; compressed numeric (cn)
 * pads with trailing FF; everything else pads with trailing zeros and truncates on the right.
 * Missing values are sent as zeros.
 */
export function buildDolData(dol: DolEntry[], values: Record<string, Uint8Array>): Uint8Array {
  return concatBytes(
    ...dol.map((entry) => {
      const value = values[entry.tagHex] ?? values[entry.tagHex.toLowerCase()];
      const out = new Uint8Array(entry.length);
      if (!value) return out;
      const format = lookupTag(entry.tagHex)?.format;
      if (format === 'n') {
        const src =
          value.length > entry.length ? value.subarray(value.length - entry.length) : value;
        out.set(src, entry.length - src.length);
      } else {
        const src = value.subarray(0, entry.length);
        if (format === 'cn') out.fill(0xff);
        out.set(src, 0);
      }
      return out;
    }),
  );
}

function bcdBytes(digits: string): Uint8Array {
  const even = digits.length % 2 ? '0' + digits : digits;
  const out = new Uint8Array(even.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(even.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const two = (n: number) => String(n).padStart(2, '0');

/** Plausible terminal values for exploring a card: an attended GB merchant charging £1.00. */
export function defaultTerminalData(now: Date = new Date()): Record<string, Uint8Array> {
  const unpredictable = new Uint8Array(4);
  globalThis.crypto.getRandomValues(unpredictable);
  return {
    '9F02': bcdBytes('000000000100'), // Amount, Authorised: 1.00
    '9F03': bcdBytes('000000000000'), // Amount, Other: 0.00
    '9F1A': bcdBytes('0826'), // Terminal Country Code: GB
    '5F2A': bcdBytes('0826'), // Transaction Currency Code: GBP
    '5F36': bcdBytes('02'), // Transaction Currency Exponent
    '95': new Uint8Array(5), // TVR: nothing flagged
    '9A': bcdBytes(two(now.getFullYear() % 100) + two(now.getMonth() + 1) + two(now.getDate())),
    '9F21': bcdBytes(two(now.getHours()) + two(now.getMinutes()) + two(now.getSeconds())),
    '9C': bcdBytes('00'), // Transaction Type: purchase
    '9F37': unpredictable,
    '9F35': bcdBytes('22'), // Terminal Type: attended, offline with online capability, merchant
    '9F33': Uint8Array.of(0xe0, 0xf8, 0xc8), // Terminal Capabilities: manual, mag, IC; all CVMs; SDA, DDA, CDA
    '9F40': Uint8Array.of(0x60, 0x00, 0xf0, 0xa0, 0x01), // Additional Terminal Capabilities: goods, services
    // TTQ: qVSDC, EMV contact chip, online PIN and signature supported; no online cryptogram forced.
    '9F66': Uint8Array.of(0x36, 0x00, 0x00, 0x00),
    '9F15': bcdBytes('5999'), // Merchant Category Code: miscellaneous retail
    '9F1E': asciiToBytes('CARDSPY1'), // IFD Serial Number
    '9F4E': asciiToBytes('Card Spy'), // Merchant Name and Location
    '9F7C': new Uint8Array(20), // Merchant Custom Data: none
  };
}
