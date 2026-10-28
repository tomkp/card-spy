/** Answer To Reset (ISO 7816-3), including PC/SC Part 3 ATRs synthesised for contactless cards. */

import { byteToHex, isPrintable, toAscii, toHex } from './hex';

export interface AtrField {
  offset: number;
  length: number;
  name: string;
  description: string;
}

export interface ParsedAtr {
  bytes: Uint8Array;
  convention: 'direct' | 'inverse' | 'unknown';
  protocols: number[];
  historical: Uint8Array;
  tck?: number;
  tckValid?: boolean;
  fields: AtrField[];
  contactless?: { standard: string; cardName: string; cardNameCode: number };
  summary: string;
  errors: string[];
}

const FI: Array<[number, number] | undefined> = [
  [372, 4],
  [372, 5],
  [558, 6],
  [744, 8],
  [1116, 12],
  [1488, 16],
  [1860, 20],
  undefined,
  undefined,
  [512, 5],
  [768, 7.5],
  [1024, 10],
  [1536, 15],
  [2048, 20],
  undefined,
  undefined,
];
const DI: Array<number | undefined> = [
  undefined,
  1,
  2,
  4,
  8,
  16,
  32,
  64,
  12,
  20,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
];

/** PC/SC Part 3 Supplemental: standard byte of a storage-card ATR. */
const STANDARDS: Record<number, string> = {
  0x00: 'No information',
  0x01: 'ISO 14443 A, part 1',
  0x02: 'ISO 14443 A, part 2',
  0x03: 'ISO 14443 A, part 3',
  0x05: 'ISO 14443 B, part 1',
  0x06: 'ISO 14443 B, part 2',
  0x07: 'ISO 14443 B, part 3',
  0x09: 'ISO 15693, part 1',
  0x0a: 'ISO 15693, part 2',
  0x0b: 'ISO 15693, part 3',
  0x0c: 'ISO 15693, part 4',
  0x11: 'FeliCa',
  0x40: 'Low frequency contactless',
};

/** PC/SC Part 3 Supplemental: card name bytes. F0xx values are ACS reader extensions. */
const CARD_NAMES: Record<number, string> = {
  0x0001: 'MIFARE Classic 1K',
  0x0002: 'MIFARE Classic 4K',
  0x0003: 'MIFARE Ultralight / NTAG',
  0x0014: 'ICODE SLI',
  0x0026: 'MIFARE Mini',
  0x002f: 'Jewel',
  0x0030: 'Topaz',
  0x0035: 'ICODE SLI-X2',
  0x0036: 'MIFARE Plus SL1 2K',
  0x0037: 'MIFARE Plus SL1 4K',
  0x0038: 'MIFARE Plus SL2 2K',
  0x0039: 'MIFARE Plus SL2 4K',
  0x003a: 'MIFARE Ultralight C',
  0x003b: 'FeliCa',
  0x003d: 'MIFARE Ultralight EV1',
  0xf004: 'Topaz / Jewel',
  0xf011: 'FeliCa 212K',
  0xf012: 'FeliCa 424K',
};

const PCSC_RID = [0xa0, 0x00, 0x00, 0x03, 0x06];

export function parseAtr(bytes: Uint8Array): ParsedAtr {
  const fields: AtrField[] = [];
  const errors: string[] = [];
  const field = (offset: number, length: number, name: string, description: string) =>
    fields.push({ offset, length, name, description });

  const result: ParsedAtr = {
    bytes,
    convention: 'unknown',
    protocols: [],
    historical: new Uint8Array(),
    fields,
    summary: 'Invalid ATR',
    errors,
  };
  if (bytes.length < 2) {
    errors.push(`ATR too short (${bytes.length} bytes)`);
    return result;
  }

  const ts = bytes[0]!;
  if (ts === 0x3b) result.convention = 'direct';
  else if (ts === 0x3f) result.convention = 'inverse';
  else errors.push(`Unknown TS ${byteToHex(ts)}`);
  field(
    0,
    1,
    'TS',
    result.convention === 'unknown' ? 'Unknown convention' : `${cap(result.convention)} convention`,
  );

  const t0 = bytes[1]!;
  const k = t0 & 0x0f;
  field(1, 1, 'T0', `${present(t0, 1)}; ${k} historical byte${k === 1 ? '' : 's'}`);

  const protocols = new Set<number>();
  let tckRequired = false;
  let y = t0 >> 4;
  let i = 2;
  let group = 1;
  let groupProtocol = 0; // protocol announced by the TD that introduced this group
  while (y) {
    for (const [mask, letter] of [
      [0x1, 'A'],
      [0x2, 'B'],
      [0x4, 'C'],
      [0x8, 'D'],
    ] as const) {
      if (!(y & mask)) continue;
      const b = bytes[i];
      if (b === undefined) {
        errors.push(`Truncated at T${letter}${group}`);
        return finish(result, protocols, tckRequired, i, k);
      }
      const name = `T${letter}${group}`;
      field(i, 1, name, interfaceByte(letter, group, groupProtocol, b));
      if (letter === 'D') {
        const t = b & 0x0f;
        if (t !== 15) protocols.add(t);
        if (t !== 0) tckRequired = true;
      }
      i++;
    }
    if (!(y & 0x8)) break;
    const td = bytes[i - 1]!;
    y = td >> 4;
    groupProtocol = td & 0x0f;
    group++;
  }
  return finish(result, protocols, tckRequired, i, k);
}

function finish(
  result: ParsedAtr,
  protocols: Set<number>,
  tckRequired: boolean,
  start: number,
  k: number,
): ParsedAtr {
  const { bytes, fields, errors } = result;
  if (protocols.size === 0) protocols.add(0); // no TD1 means T=0
  result.protocols = [...protocols].sort((a, b) => a - b);

  const historical = bytes.subarray(start, Math.min(start + k, bytes.length));
  result.historical = historical;
  if (historical.length < k)
    errors.push(`Expected ${k} historical bytes, found ${historical.length}`);
  if (historical.length) describeHistorical(result, start, historical);

  const tckOffset = start + k;
  if (tckRequired) {
    const tck = bytes[tckOffset];
    if (tck === undefined) {
      errors.push('Missing TCK');
    } else {
      let x = 0;
      for (let j = 1; j <= tckOffset; j++) x ^= bytes[j]!;
      result.tck = tck;
      result.tckValid = x === 0;
      fields.push({
        offset: tckOffset,
        length: 1,
        name: 'TCK',
        description: result.tckValid ? 'Check byte (valid)' : 'Check byte (invalid)',
      });
      if (!result.tckValid) errors.push('TCK check failed');
    }
  }
  const end = tckRequired ? tckOffset + 1 : tckOffset;
  if (bytes.length > end) {
    const extra = bytes.length - end;
    errors.push(`${extra} unexpected trailing byte${extra === 1 ? '' : 's'}`);
    fields.push({
      offset: end,
      length: extra,
      name: 'Extra',
      description: 'Unexpected trailing bytes',
    });
  }

  result.summary = result.contactless
    ? `Contactless · ${result.contactless.cardName}`
    : `${result.protocols.map((p) => `T=${p}`).join(', ')} · ${result.convention} convention`;
  return result;
}

function describeHistorical(result: ParsedAtr, start: number, h: Uint8Array): void {
  const { bytes, fields } = result;
  const isPcscContactless =
    bytes[0] === 0x3b &&
    (bytes[1]! & 0xf0) === 0x80 &&
    bytes[2] === 0x80 &&
    bytes[3] === 0x01 &&
    start === 4;

  if (
    isPcscContactless &&
    h.length === 15 &&
    h[0] === 0x80 &&
    h[1] === 0x4f &&
    h[2] === 0x0c &&
    PCSC_RID.every((b, j) => h[3 + j] === b)
  ) {
    const standard = h[8]!;
    const code = (h[9]! << 8) | h[10]!;
    const standardName = STANDARDS[standard] ?? `Standard ${byteToHex(standard)}`;
    const cardName = CARD_NAMES[code] ?? `Card ${toHex(h.subarray(9, 11))}`;
    result.contactless = { standard: standardName, cardName, cardNameCode: code };
    fields.push(
      {
        offset: start,
        length: 1,
        name: 'Category',
        description: 'Compact-TLV data objects follow',
      },
      {
        offset: start + 1,
        length: 2,
        name: 'AID tag',
        description: 'Application identifier, 12 bytes',
      },
      { offset: start + 3, length: 5, name: 'RID', description: 'PC/SC Workgroup' },
      { offset: start + 8, length: 1, name: 'Standard', description: standardName },
      { offset: start + 9, length: 2, name: 'Card name', description: cardName },
      { offset: start + 11, length: 4, name: 'RFU', description: 'Reserved' },
    );
    return;
  }

  if (isPcscContactless) {
    result.contactless = {
      standard: 'ISO 14443-4',
      cardName: 'Contactless smart card',
      cardNameCode: 0,
    };
    fields.push({
      offset: start,
      length: h.length,
      name: 'Historical bytes',
      description: `ATS historical bytes or ATQB data${printable(h)}`,
    });
    return;
  }

  const category = h[0]!;
  const categories: Record<number, string> = {
    0x00: 'Status indicator in the last 3 bytes',
    0x10: 'DIR data reference follows',
    0x80: 'Compact-TLV data objects follow',
  };
  fields.push({
    offset: start,
    length: 1,
    name: 'Category',
    description: categories[category] ?? 'Proprietary historical bytes',
  });
  if (h.length > 1) {
    fields.push({
      offset: start + 1,
      length: h.length - 1,
      name: 'Historical bytes',
      description: `${h.length - 1} bytes${printable(h.subarray(1))}`,
    });
  }
}

function interfaceByte(letter: string, group: number, protocol: number, b: number): string {
  const v = byteToHex(b);
  if (letter === 'D') return `${present(b, group + 1)}; protocol T=${b & 0x0f}`;
  if (group === 1) {
    if (letter === 'A') {
      const fi = FI[b >> 4];
      const di = DI[b & 0x0f];
      return fi && di ? `Fi=${fi[0]}, Di=${di} (f max ${fi[1]} MHz)` : `Fi/Di ${v} (RFU)`;
    }
    if (letter === 'B') return b === 0 ? 'No VPP (deprecated)' : `VPP ${v} (deprecated)`;
    return b === 0xff ? 'Minimum guard time' : `Extra guard time ${b} etu`;
  }
  if (group === 2) {
    if (letter === 'A') {
      const changeable = b & 0x80 ? 'unable to change mode' : 'can change mode';
      const implicit = b & 0x10 ? ', implicit parameters' : '';
      return `Specific mode T=${b & 0x0f}, ${changeable}${implicit}`;
    }
    if (letter === 'B') return `PI2 ${v} (deprecated)`;
    return `Work waiting integer WI=${b}`;
  }
  if (protocol === 1) {
    if (letter === 'A') return `IFSC ${b} bytes`;
    if (letter === 'B') return `BWI=${b >> 4}, CWI=${b & 0x0f}`;
    if (letter === 'C') return `Error detection: ${b & 0x01 ? 'CRC' : 'LRC'}`;
  }
  if (protocol === 15) {
    if (letter === 'A') {
      const stop = ['not supported', 'state L', 'state H', 'no preference'][b >> 6]!;
      const classes = [b & 1 && 'A (5V)', b & 2 && 'B (3V)', b & 4 && 'C (1.8V)']
        .filter(Boolean)
        .join(', ');
      return `Clock stop ${stop}; class ${classes || 'none'}`;
    }
    if (letter === 'B') return `SPU ${v}`;
  }
  return `T=${protocol} specific ${v}`;
}

function present(y: number, group: number): string {
  const list = (['A', 'B', 'C', 'D'] as const)
    .filter((_, j) => y & (0x10 << j))
    .map((l) => `T${l}${group}`);
  return list.length ? `${list.join(' ')} present` : 'No interface bytes';
}

function printable(h: Uint8Array): string {
  return isPrintable(h) ? ` "${toAscii(h)}"` : '';
}

function cap(s: string): string {
  return s[0]!.toUpperCase() + s.slice(1);
}
