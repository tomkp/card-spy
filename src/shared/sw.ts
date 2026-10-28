/** ISO 7816-4 status words. */

import { byteToHex } from './hex';

export type SwSeverity = 'ok' | 'warning' | 'error';

export interface SwDescription {
  text: string;
  severity: SwSeverity;
}

const EXACT: Record<number, [string, SwSeverity]> = {
  0x9000: ['Success', 'ok'],

  0x6200: ['No information given (state unchanged)', 'warning'],
  0x6281: ['Part of returned data may be corrupted', 'warning'],
  0x6282: ['End of file or record reached before reading Le bytes', 'warning'],
  0x6283: ['Selected file deactivated', 'warning'],
  0x6284: ['File control information not formatted correctly', 'warning'],
  0x6285: ['Selected file in termination state', 'warning'],
  0x6286: ['No input data available from a sensor', 'warning'],
  0x6287: ['At least one referenced record is deactivated', 'warning'],

  0x6300: ['No information given (state changed), e.g. verification failed', 'warning'],
  0x6381: ['File filled up by the last write', 'warning'],

  0x6400: ['Execution error (state unchanged)', 'error'],
  0x6401: ['Immediate response required by the card', 'error'],

  0x6500: ['Execution error (state changed)', 'error'],
  0x6581: ['Memory failure', 'error'],

  0x6700: ['Wrong length', 'error'],

  0x6800: ['Function in CLA not supported', 'error'],
  0x6881: ['Logical channel not supported', 'error'],
  0x6882: ['Secure messaging not supported', 'error'],
  0x6883: ['Last command of the chain expected', 'error'],
  0x6884: ['Command chaining not supported', 'error'],

  0x6900: ['Command not allowed', 'error'],
  0x6981: ['Command incompatible with file structure', 'error'],
  0x6982: ['Security status not satisfied', 'error'],
  0x6983: ['Authentication method blocked', 'error'],
  0x6984: ['Reference data not usable', 'error'],
  0x6985: ['Conditions of use not satisfied', 'error'],
  0x6986: ['Command not allowed (no current EF)', 'error'],
  0x6987: ['Expected secure messaging data objects missing', 'error'],
  0x6988: ['Incorrect secure messaging data objects', 'error'],

  0x6a00: ['Wrong parameters P1-P2', 'error'],
  0x6a80: ['Incorrect parameters in the command data field', 'error'],
  0x6a81: ['Function not supported', 'error'],
  0x6a82: ['File or application not found', 'error'],
  0x6a83: ['Record not found', 'error'],
  0x6a84: ['Not enough memory space in the file', 'error'],
  0x6a85: ['Nc inconsistent with TLV structure', 'error'],
  0x6a86: ['Incorrect parameters P1-P2', 'error'],
  0x6a87: ['Nc inconsistent with parameters P1-P2', 'error'],
  0x6a88: ['Referenced data or reference data not found', 'error'],
  0x6a89: ['File already exists', 'error'],
  0x6a8a: ['DF name already exists', 'error'],

  0x6b00: ['Wrong parameters P1-P2 (offset outside the EF)', 'error'],
  0x6d00: ['Instruction code not supported or invalid', 'error'],
  0x6e00: ['Class not supported', 'error'],
  0x6f00: ['No precise diagnosis', 'error'],
};

/** Fallbacks by SW1 when SW2 isn't in the table. */
const BY_SW1: Record<number, [string, SwSeverity]> = {
  0x62: ['Warning (state unchanged)', 'warning'],
  0x63: ['Warning (state changed)', 'warning'],
  0x64: ['Execution error (state unchanged)', 'error'],
  0x65: ['Execution error (state changed)', 'error'],
  0x66: ['Security-related issue', 'error'],
  0x67: ['Wrong length', 'error'],
  0x68: ['Function in CLA not supported', 'error'],
  0x69: ['Command not allowed', 'error'],
  0x6a: ['Wrong parameters P1-P2', 'error'],
  0x6b: ['Wrong parameters P1-P2', 'error'],
  0x6d: ['Instruction code not supported or invalid', 'error'],
  0x6e: ['Class not supported', 'error'],
  0x6f: ['No precise diagnosis', 'error'],
};

export function describeSw(sw: number): SwDescription {
  const sw1 = (sw >> 8) & 0xff;
  const sw2 = sw & 0xff;

  const exact = EXACT[sw];
  if (exact) return { text: exact[0], severity: exact[1] };

  if (sw1 === 0x61) {
    return { text: `${sw2 === 0 ? 256 : sw2} bytes available (GET RESPONSE)`, severity: 'ok' };
  }
  if (sw1 === 0x6c) {
    return {
      text: `Wrong Le, use ${byteToHex(sw2)} (${sw2 === 0 ? 256 : sw2} bytes)`,
      severity: 'error',
    };
  }
  if (sw1 === 0x63 && (sw2 & 0xf0) === 0xc0) {
    const n = sw2 & 0x0f;
    return { text: `${n} ${n === 1 ? 'try' : 'tries'} left`, severity: 'warning' };
  }
  if ((sw1 === 0x62 || sw1 === 0x64) && sw2 >= 0x02 && sw2 <= 0x80) {
    return {
      text: `Triggering by the card (${byteToHex(sw2)})`,
      severity: sw1 === 0x62 ? 'warning' : 'error',
    };
  }

  const fallback = BY_SW1[sw1];
  if (fallback) return { text: fallback[0], severity: fallback[1] };
  if (sw1 >= 0x90 && sw1 <= 0x9f) return { text: 'Proprietary status', severity: 'warning' };
  return { text: 'Unknown status', severity: 'error' };
}
