/** NFC Forum NDEF messages and Type 2 Tag memory layout (capability container, TLV blocks). */

import { asciiToBytes, concatBytes } from './hex';

export type NdefDecoded =
  | { kind: 'uri'; uri: string }
  | { kind: 'text'; lang: string; text: string; encoding: 'utf-8' | 'utf-16' }
  | { kind: 'mime'; mime: string; text?: string }
  | { kind: 'smart-poster'; records: NdefRecord[] }
  | { kind: 'external'; type: string }
  | { kind: 'empty' }
  | { kind: 'unknown' };

export interface NdefRecord {
  tnf: number;
  tnfName: string;
  type: string;
  id?: Uint8Array;
  payload: Uint8Array;
  mb: boolean;
  me: boolean;
  decoded: NdefDecoded;
}

export const TNF_NAMES = [
  'Empty',
  'Well-known',
  'Media type',
  'Absolute URI',
  'External',
  'Unknown',
  'Unchanged',
  'Reserved',
];

/** URI identifier codes (NFC Forum URI RTD). */
export const URI_PREFIXES = [
  '',
  'http://www.',
  'https://www.',
  'http://',
  'https://',
  'tel:',
  'mailto:',
  'ftp://anonymous:anonymous@',
  'ftp://ftp.',
  'ftps://',
  'sftp://',
  'smb://',
  'nfs://',
  'ftp://',
  'dav://',
  'news:',
  'telnet://',
  'imap:',
  'rtsp://',
  'urn:',
  'pop:',
  'sip:',
  'sips:',
  'tftp:',
  'btspp://',
  'btl2cap://',
  'btgoep://',
  'tcpobex://',
  'irdaobex://',
  'file://',
  'urn:epc:id:',
  'urn:epc:tag:',
  'urn:epc:pat:',
  'urn:epc:raw:',
  'urn:epc:',
  'urn:nfc:',
];

const MB = 0x80;
const ME = 0x40;
const CF = 0x20;
const SR = 0x10;
const IL = 0x08;

const utf8 = new TextDecoder('utf-8');

function decodeText(bytes: Uint8Array, encoding: 'utf-8' | 'utf-16'): string {
  if (encoding === 'utf-8') return utf8.decode(bytes);
  const le = bytes[0] === 0xff && bytes[1] === 0xfe;
  return new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(bytes);
}

export function parseNdefMessage(bytes: Uint8Array): { records: NdefRecord[]; error?: string } {
  const records: NdefRecord[] = [];
  let error: string | undefined;
  let i = 0;
  while (i < bytes.length) {
    const start = i;
    const header = bytes[i++]!;
    const typeLength = bytes[i++];
    let payloadLength: number | undefined;
    if (header & SR) {
      payloadLength = bytes[i++];
    } else if (i + 4 <= bytes.length) {
      payloadLength =
        ((bytes[i]! << 24) >>> 0) + (bytes[i + 1]! << 16) + (bytes[i + 2]! << 8) + bytes[i + 3]!;
      i += 4;
    }
    const idLength = header & IL ? bytes[i++] : 0;
    if (typeLength === undefined || payloadLength === undefined || idLength === undefined) {
      return { records, error: `Truncated record header at offset ${start}` };
    }
    const end = i + typeLength + idLength + payloadLength;
    if (end > bytes.length) {
      return { records, error: `Record at offset ${start} needs ${end - bytes.length} more bytes` };
    }
    const typeBytes = bytes.subarray(i, i + typeLength);
    i += typeLength;
    const id = idLength ? bytes.subarray(i, i + idLength) : undefined;
    i += idLength;
    const payload = bytes.subarray(i, i + payloadLength);
    i += payloadLength;

    const tnf = header & 0x07;
    const type = utf8.decode(typeBytes);
    if (header & CF && !error) error = `Chunked record at offset ${start} was not reassembled`;
    const record: NdefRecord = {
      tnf,
      tnfName: TNF_NAMES[tnf]!,
      type,
      payload,
      mb: (header & MB) !== 0,
      me: (header & ME) !== 0,
      decoded: decodeRecord(tnf, type, payload),
    };
    if (id) record.id = id;
    records.push(record);
    if (record.me) break;
  }
  return error ? { records, error } : { records };
}

function decodeRecord(tnf: number, type: string, payload: Uint8Array): NdefDecoded {
  switch (tnf) {
    case 0:
      return { kind: 'empty' };
    case 1:
      if (type === 'U' && payload.length >= 1) {
        const prefix = URI_PREFIXES[payload[0]!] ?? '';
        return { kind: 'uri', uri: prefix + utf8.decode(payload.subarray(1)) };
      }
      if (type === 'T' && payload.length >= 1) {
        const status = payload[0]!;
        const langLength = status & 0x3f;
        const encoding = status & 0x80 ? 'utf-16' : 'utf-8';
        const lang = utf8.decode(payload.subarray(1, 1 + langLength));
        const text = decodeText(payload.subarray(1 + langLength), encoding);
        return { kind: 'text', lang, text, encoding };
      }
      if (type === 'Sp')
        return { kind: 'smart-poster', records: parseNdefMessage(payload).records };
      return { kind: 'unknown' };
    case 2: {
      const textual = /^text\/|json|xml|vcard/i.test(type);
      return textual
        ? { kind: 'mime', mime: type, text: utf8.decode(payload) }
        : { kind: 'mime', mime: type };
    }
    case 3:
      return { kind: 'uri', uri: type };
    case 4:
      return { kind: 'external', type };
    default:
      return { kind: 'unknown' };
  }
}

/** Encodes one record. MB/ME both set, so the result is a complete single-record message. */
export function encodeNdefRecord(
  tnf: number,
  type: Uint8Array,
  payload: Uint8Array,
  id?: Uint8Array,
): Uint8Array {
  const short = payload.length < 256;
  let header = MB | ME | (tnf & 0x07);
  if (short) header |= SR;
  if (id) header |= IL;
  const length = short
    ? Uint8Array.of(payload.length)
    : Uint8Array.of(
        payload.length >>> 24,
        (payload.length >> 16) & 0xff,
        (payload.length >> 8) & 0xff,
        payload.length & 0xff,
      );
  return concatBytes([header, type.length], length, id ? [id.length] : [], type, id ?? [], payload);
}

const utf8Encoder = new TextEncoder();

export function encodeNdefUri(uri: string): Uint8Array {
  let code = 0;
  for (let c = 1; c < URI_PREFIXES.length; c++) {
    const prefix = URI_PREFIXES[c]!;
    if (uri.startsWith(prefix) && prefix.length > URI_PREFIXES[code]!.length) code = c;
  }
  const rest = utf8Encoder.encode(uri.slice(URI_PREFIXES[code]!.length));
  return encodeNdefRecord(1, asciiToBytes('U'), concatBytes([code], rest));
}

export function encodeNdefText(text: string, lang = 'en'): Uint8Array {
  const langBytes = asciiToBytes(lang);
  return encodeNdefRecord(
    1,
    asciiToBytes('T'),
    concatBytes([langBytes.length & 0x3f], langBytes, utf8Encoder.encode(text)),
  );
}

/** Joins encoded records into one message, fixing MB on the first and ME on the last. */
export function encodeNdefMessage(records: Uint8Array[]): Uint8Array {
  return concatBytes(
    ...records.map((r, i) => {
      const copy = r.slice();
      let header = copy[0]! & ~(MB | ME);
      if (i === 0) header |= MB;
      if (i === records.length - 1) header |= ME;
      copy[0] = header;
      return copy;
    }),
  );
}

// ---- Type 2 Tag memory

export interface Type2TlvBlock {
  type: number;
  typeName: string;
  offset: number;
  length: number;
  value: Uint8Array;
}

const TYPE2_NAMES: Record<number, string> = {
  0x00: 'NULL',
  0x01: 'Lock Control',
  0x02: 'Memory Control',
  0x03: 'NDEF Message',
  0xfd: 'Proprietary',
  0xfe: 'Terminator',
};

/**
 * TLV blocks in Type 2 Tag user memory (the bytes from page 4). NULL padding is skipped;
 * parsing stops at the terminator or when a block runs past the end.
 */
export function parseType2Tlvs(data: Uint8Array): Type2TlvBlock[] {
  const blocks: Type2TlvBlock[] = [];
  let i = 0;
  while (i < data.length) {
    const type = data[i]!;
    if (type === 0x00) {
      i++;
      continue;
    }
    if (type === 0xfe) {
      blocks.push({ type, typeName: 'Terminator', offset: i, length: 0, value: new Uint8Array() });
      break;
    }
    let length: number;
    let header: number;
    if (data[i + 1] === 0xff) {
      if (i + 3 >= data.length) break;
      length = (data[i + 2]! << 8) | data[i + 3]!;
      header = 4;
    } else {
      if (i + 1 >= data.length) break;
      length = data[i + 1]!;
      header = 2;
    }
    const value = data.subarray(i + header, Math.min(i + header + length, data.length));
    blocks.push({ type, typeName: TYPE2_NAMES[type] ?? 'Unknown', offset: i, length, value });
    if (value.length < length) break;
    i += header + length;
  }
  return blocks;
}

/** NDEF message TLV plus terminator, ready to write from page 4. */
export function wrapNdefForType2(ndefMessage: Uint8Array): Uint8Array {
  const n = ndefMessage.length;
  const length = n < 0xff ? [n] : [0xff, n >> 8, n & 0xff];
  return concatBytes([0x03], length, ndefMessage, [0xfe]);
}

export interface CapabilityContainer {
  magic: number;
  version: string;
  /** Data area size in bytes (CC byte 2 × 8). */
  dataAreaSize: number;
  readAccess: number;
  writeAccess: number;
  tagGuess?: string;
}

const SIZE_GUESSES: Record<number, string> = {
  0x06: 'MIFARE Ultralight / NTAG210',
  0x10: 'NTAG212 / Ultralight EV1 (MF0UL21)',
  0x12: 'NTAG213 (or Ultralight C)',
  0x3e: 'NTAG215',
  0x6d: 'NTAG216',
};

/** Page 3 of a Type 2 Tag. Undefined unless it starts with the NDEF magic number E1. */
export function parseCapabilityContainer(cc4: Uint8Array): CapabilityContainer | undefined {
  if (cc4.length < 4 || cc4[0] !== 0xe1) return undefined;
  const cc: CapabilityContainer = {
    magic: cc4[0],
    version: `${cc4[1]! >> 4}.${cc4[1]! & 0x0f}`,
    dataAreaSize: cc4[2]! * 8,
    readAccess: cc4[3]! >> 4,
    writeAccess: cc4[3]! & 0x0f,
  };
  const guess = SIZE_GUESSES[cc4[2]!];
  if (guess) cc.tagGuess = guess;
  return cc;
}
