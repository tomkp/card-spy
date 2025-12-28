/**
 * ATR (Answer To Reset) parsing utilities.
 * Parses ISO 7816-3 ATR to extract card information.
 */

export interface ParsedAtr {
  /** Raw ATR bytes */
  bytes: number[];
  /** Initial character (TS) - direct or inverse convention */
  convention: 'direct' | 'inverse';
  /** Protocol(s) supported */
  protocols: string[];
  /** Historical bytes (card-specific data) */
  historicalBytes: number[];
  /** Historical bytes as ASCII if printable */
  historicalBytesAscii?: string;
  /** Check byte if present */
  checkByte?: number;
  /** Card category hints based on ATR patterns */
  hints: string[];
}

/**
 * Known ATR patterns for card identification.
 */
const ATR_PATTERNS: Array<{ pattern: RegExp; name: string; type: string }> = [
  // YubiKey
  { pattern: /^3BF81300008131FE/, name: 'YubiKey', type: 'security-key' },
  { pattern: /^3B8D80018073C021C057597562694B657940/, name: 'YubiKey NEO', type: 'security-key' },

  // Common EMV/Payment patterns
  { pattern: /^3B67/, name: 'EMV Card', type: 'payment' },
  { pattern: /^3B6[89ABC]/, name: 'EMV Card', type: 'payment' },
  { pattern: /^3B7[89ABC]/, name: 'Smart Card', type: 'payment' },

  // JavaCard
  { pattern: /^3B.*4A434F50/, name: 'JCOP Card', type: 'javacard' },
  { pattern: /^3BF[89].*4A617661/, name: 'JavaCard', type: 'javacard' },

  // SIM cards
  { pattern: /^3B3F/, name: 'GSM SIM', type: 'sim' },
  { pattern: /^3B9F/, name: 'USIM', type: 'sim' },
  { pattern: /^3B9[0-9A-F]96/, name: 'USIM', type: 'sim' },
  { pattern: /^3B7[BD]/, name: 'SIM/USIM', type: 'sim' },
  { pattern: /^3B1[EF]/, name: 'Mini SIM', type: 'sim' },
  { pattern: /^3B6[89]00/, name: 'GSM SIM', type: 'sim' },

  // ID cards
  { pattern: /^3B7F.*00006563/, name: 'Belgian eID', type: 'identity' },
  { pattern: /^3B.*44454D4F/, name: 'Demo Card', type: 'demo' },

  // Transport cards
  { pattern: /^3B8F80/, name: 'Calypso Transport', type: 'transport' },
  { pattern: /^3B8180018080/, name: 'MIFARE DESFire', type: 'transport' },
  { pattern: /^3B8[0-9A-F]80.*D276000085/, name: 'MIFARE DESFire EV', type: 'transport' },

  // Generic patterns
  { pattern: /^3B8[0-9A-F]80/, name: 'Contact Smart Card', type: 'generic' },
  { pattern: /^3B8[0-9A-F]00/, name: 'Smart Card', type: 'generic' },
];

/**
 * Parse an ATR string or byte array.
 */
export function parseAtr(atr: string | number[]): ParsedAtr {
  const bytes = typeof atr === 'string' ? hexToBytes(atr) : atr;

  if (bytes.length < 2) {
    return {
      bytes,
      convention: 'direct',
      protocols: [],
      historicalBytes: [],
      hints: ['Invalid ATR (too short)'],
    };
  }

  // TS - Initial character
  const ts = bytes[0];
  const convention = ts === 0x3b ? 'direct' : ts === 0x3f ? 'inverse' : 'direct';

  // T0 - Format byte
  const t0 = bytes[1];
  const numHistoricalBytes = t0 & 0x0f;
  const hasTA1 = (t0 & 0x10) !== 0;
  const hasTB1 = (t0 & 0x20) !== 0;
  const hasTC1 = (t0 & 0x40) !== 0;
  const hasTD1 = (t0 & 0x80) !== 0;

  // Parse interface bytes to find protocols
  const protocols: string[] = [];
  let index = 2;

  if (hasTA1) index++;
  if (hasTB1) index++;
  if (hasTC1) index++;

  if (hasTD1 && index < bytes.length) {
    const td1 = bytes[index];
    const protocol1 = td1 & 0x0f;
    if (protocol1 === 0) protocols.push('T=0');
    else if (protocol1 === 1) protocols.push('T=1');
    else protocols.push(`T=${protocol1}`);

    // Check for TD2
    if ((td1 & 0x80) !== 0) {
      index++;
      if ((td1 & 0x10) !== 0) index++; // TA2
      if ((td1 & 0x20) !== 0) index++; // TB2
      if ((td1 & 0x40) !== 0) index++; // TC2

      if (index < bytes.length) {
        const td2 = bytes[index];
        const protocol2 = td2 & 0x0f;
        if (!protocols.includes(`T=${protocol2}`)) {
          if (protocol2 === 0) protocols.push('T=0');
          else if (protocol2 === 1) protocols.push('T=1');
          else protocols.push(`T=${protocol2}`);
        }
      }
    }
    index++;
  } else {
    // Default to T=0 if no TD1
    protocols.push('T=0');
  }

  // Skip remaining interface bytes to find historical bytes
  // This is simplified - full parsing would track all TDi bytes
  const historicalStart = bytes.length - numHistoricalBytes - (hasCheckByte(bytes) ? 1 : 0);
  const historicalEnd = bytes.length - (hasCheckByte(bytes) ? 1 : 0);
  const historicalBytes = bytes.slice(
    Math.max(2, historicalStart),
    Math.max(2, historicalEnd)
  );

  // Try to decode historical bytes as ASCII
  let historicalBytesAscii: string | undefined;
  if (historicalBytes.length > 0 && historicalBytes.every(b => b >= 0x20 && b <= 0x7e)) {
    historicalBytesAscii = String.fromCharCode(...historicalBytes);
  }

  // Check byte
  const checkByte = hasCheckByte(bytes) ? bytes[bytes.length - 1] : undefined;

  // Match against known patterns
  const atrHex = bytesToHex(bytes).toUpperCase();
  const hints: string[] = [];

  for (const { pattern, name } of ATR_PATTERNS) {
    if (pattern.test(atrHex)) {
      hints.push(name);
      break;
    }
  }

  return {
    bytes,
    convention,
    protocols,
    historicalBytes,
    historicalBytesAscii,
    checkByte,
    hints,
  };
}

/**
 * Format ATR for display with spacing.
 */
export function formatAtr(atr: string | number[]): string {
  const bytes = typeof atr === 'string' ? hexToBytes(atr) : atr;
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

/**
 * Get a short description of the ATR.
 */
export function getAtrSummary(parsed: ParsedAtr): string {
  const parts: string[] = [];

  if (parsed.hints.length > 0) {
    parts.push(parsed.hints[0]);
  }

  if (parsed.protocols.length > 0) {
    parts.push(parsed.protocols.join('/'));
  }

  if (parsed.historicalBytesAscii) {
    parts.push(`"${parsed.historicalBytesAscii}"`);
  }

  return parts.join(' - ') || 'Unknown Card';
}

function hasCheckByte(bytes: number[]): boolean {
  // Check byte is present if any protocol other than T=0 is indicated
  // Simplified check - look at T0 for TD1 presence
  if (bytes.length < 2) return false;
  const t0 = bytes[1];
  return (t0 & 0x80) !== 0;
}

function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/\s/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.substring(i, i + 2), 16));
  }
  return bytes;
}

function bytesToHex(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}
