/**
 * Pure functions for APDU command and response handling.
 * These functions are easily unit testable and can be used in both
 * main and renderer processes.
 */

/**
 * Status word meaning lookup result
 */
export interface StatusWordInfo {
  meaning: string;
  isSuccess: boolean;
}

/**
 * Get human-readable meaning for ISO 7816 status words.
 * @param sw1 - First status byte
 * @param sw2 - Second status byte
 * @returns Status word info with meaning and success flag
 */
export function getStatusWordInfo(sw1: number, sw2: number): StatusWordInfo {
  const sw = (sw1 << 8) | sw2;

  // Success status
  if (sw === 0x9000) {
    return { meaning: 'Success', isSuccess: true };
  }

  // Normal processing with extra data
  if (sw1 === 0x61) {
    return { meaning: `More data available (${sw2} bytes)`, isSuccess: true };
  }

  // Warning statuses (still considered successful in some contexts)
  if (sw1 === 0x62) {
    return { meaning: 'Warning: state unchanged', isSuccess: true };
  }
  if (sw1 === 0x63) {
    if ((sw2 & 0xf0) === 0xc0) {
      return { meaning: `Warning: counter value ${sw2 & 0x0f}`, isSuccess: true };
    }
    return { meaning: 'Warning: state changed', isSuccess: true };
  }

  // Execution errors
  if (sw1 === 0x64) {
    return { meaning: 'Execution error: state unchanged', isSuccess: false };
  }
  if (sw1 === 0x65) {
    return { meaning: 'Execution error: state changed', isSuccess: false };
  }

  // Checking errors
  if (sw1 === 0x67 && sw2 === 0x00) {
    return { meaning: 'Wrong length', isSuccess: false };
  }

  if (sw1 === 0x68) {
    if (sw2 === 0x00) return { meaning: 'Functions in CLA not supported', isSuccess: false };
    if (sw2 === 0x81) return { meaning: 'Logical channel not supported', isSuccess: false };
    if (sw2 === 0x82) return { meaning: 'Secure messaging not supported', isSuccess: false };
    return { meaning: 'CLA function not supported', isSuccess: false };
  }

  if (sw1 === 0x69) {
    if (sw2 === 0x81)
      return { meaning: 'Command incompatible with file structure', isSuccess: false };
    if (sw2 === 0x82) return { meaning: 'Security status not satisfied', isSuccess: false };
    if (sw2 === 0x83) return { meaning: 'Authentication method blocked', isSuccess: false };
    if (sw2 === 0x84) return { meaning: 'Referenced data invalidated', isSuccess: false };
    if (sw2 === 0x85) return { meaning: 'Conditions of use not satisfied', isSuccess: false };
    if (sw2 === 0x86) return { meaning: 'Command not allowed (no current EF)', isSuccess: false };
    if (sw2 === 0x87) return { meaning: 'Expected SM data objects missing', isSuccess: false };
    if (sw2 === 0x88) return { meaning: 'SM data objects incorrect', isSuccess: false };
    return { meaning: 'Command not allowed', isSuccess: false };
  }

  if (sw1 === 0x6a) {
    if (sw2 === 0x80) return { meaning: 'Incorrect data field parameters', isSuccess: false };
    if (sw2 === 0x81) return { meaning: 'Function not supported', isSuccess: false };
    if (sw2 === 0x82) return { meaning: 'File not found', isSuccess: false };
    if (sw2 === 0x83) return { meaning: 'Record not found', isSuccess: false };
    if (sw2 === 0x84) return { meaning: 'Not enough memory space', isSuccess: false };
    if (sw2 === 0x85) return { meaning: 'Lc inconsistent with TLV structure', isSuccess: false };
    if (sw2 === 0x86) return { meaning: 'Incorrect P1-P2 parameters', isSuccess: false };
    if (sw2 === 0x87) return { meaning: 'Lc inconsistent with P1-P2', isSuccess: false };
    if (sw2 === 0x88) return { meaning: 'Referenced data not found', isSuccess: false };
    return { meaning: 'Wrong parameters', isSuccess: false };
  }

  if (sw1 === 0x6b && sw2 === 0x00) {
    return { meaning: 'Wrong P1-P2 parameters', isSuccess: false };
  }

  if (sw1 === 0x6c) {
    return { meaning: `Wrong Le length (use ${sw2})`, isSuccess: false };
  }

  if (sw1 === 0x6d && sw2 === 0x00) {
    return { meaning: 'Instruction not supported', isSuccess: false };
  }

  if (sw1 === 0x6e && sw2 === 0x00) {
    return { meaning: 'Class not supported', isSuccess: false };
  }

  if (sw1 === 0x6f && sw2 === 0x00) {
    return { meaning: 'Unknown error', isSuccess: false };
  }

  // Default: unknown status
  const swHex =
    `${sw1.toString(16).padStart(2, '0')}${sw2.toString(16).padStart(2, '0')}`.toUpperCase();
  return { meaning: `Unknown status: ${swHex}`, isSuccess: false };
}

/**
 * Check if a status word indicates success (90xx or 61xx).
 * @param sw1 - First status byte
 * @returns true if the command was successful
 */
export function isSuccessStatus(sw1: number): boolean {
  return sw1 === 0x90 || sw1 === 0x61;
}

/**
 * Format status word as hex string.
 * @param sw1 - First status byte
 * @param sw2 - Second status byte
 * @returns Uppercase hex string (e.g., "9000")
 */
export function formatStatusWord(sw1: number, sw2: number): string {
  return `${sw1.toString(16).padStart(2, '0')}${sw2.toString(16).padStart(2, '0')}`.toUpperCase();
}

/**
 * Parse user hex input into byte array with flexible format support.
 * Handles spaces, commas, 0x prefixes, and validates hex characters.
 * @param input - Hex string in various formats
 * @returns Byte array or null if invalid
 */
export function parseHexInput(input: string): number[] | null {
  const cleaned = input.replace(/0x/gi, '').replace(/,/g, '').replace(/\s+/g, '').toUpperCase();

  if (!/^[0-9A-F]*$/.test(cleaned)) {
    return null;
  }

  if (cleaned.length === 0 || cleaned.length % 2 !== 0) {
    return null;
  }

  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(parseInt(cleaned.substring(i, i + 2), 16));
  }

  return bytes;
}

/**
 * Format byte array as uppercase hex string.
 * @param bytes - Array of bytes
 * @returns Uppercase hex string
 */
export function formatHex(bytes: number[]): string {
  return bytes
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Format byte array as spaced hex string for readability.
 * @param bytes - Array of bytes
 * @returns Uppercase hex string with spaces (e.g., "00 A4 04 00")
 */
export function formatHexSpaced(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}
