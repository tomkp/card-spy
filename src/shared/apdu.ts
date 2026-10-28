/** Command and response APDUs (ISO 7816-4), plus naming for trace views. */

import { byteToHex, concatBytes, isPrintable, toAscii, toHex } from './hex';
import { lookupAid } from './aids';
import { lookupTag } from './tags/emv';
import { findTlv, parseTlv } from './tlv';

export interface CommandApdu {
  cla: number;
  ins: number;
  p1: number;
  p2: number;
  data?: Uint8Array;
  /** Expected response length, 1..65536. 256 encodes as short '00', 65536 as extended '0000'. */
  le?: number;
}

export type ApduCase = 1 | 2 | 3 | 4;

export interface ParsedCommand extends CommandApdu {
  case: ApduCase;
  extended: boolean;
}

export interface ResponseApdu {
  data: Uint8Array;
  sw1: number;
  sw2: number;
  sw: number;
}

/** Parses a command APDU, short or extended. Throws when the bytes are inconsistent. */
export function parseCommand(bytes: Uint8Array): ParsedCommand {
  if (bytes.length < 4) throw new Error(`Command APDU too short (${bytes.length} bytes)`);
  const [cla, ins, p1, p2] = [bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!];
  const header = { cla, ins, p1, p2 };
  const n = bytes.length;
  if (n === 4) return { ...header, case: 1, extended: false };

  const b4 = bytes[4]!;
  if (n === 5) return { ...header, le: b4 || 256, case: 2, extended: false };

  if (b4 !== 0) {
    const lc = b4;
    const data = bytes.slice(5, 5 + lc);
    if (n === 5 + lc) return { ...header, data, case: 3, extended: false };
    if (n === 6 + lc)
      return { ...header, data, le: bytes[n - 1]! || 256, case: 4, extended: false };
    throw new Error(`Lc is ${lc} but ${n - 5} bytes follow it`);
  }

  if (n === 7)
    return { ...header, le: (bytes[5]! << 8) | bytes[6]! || 65536, case: 2, extended: true };
  if (n < 7) throw new Error('Inconsistent length bytes');
  const lc = (bytes[5]! << 8) | bytes[6]!;
  if (lc === 0) throw new Error('Extended Lc of zero');
  const data = bytes.slice(7, 7 + lc);
  if (n === 7 + lc) return { ...header, data, case: 3, extended: true };
  if (n === 9 + lc) {
    const le = (bytes[n - 2]! << 8) | bytes[n - 1]! || 65536;
    return { ...header, data, le, case: 4, extended: true };
  }
  throw new Error(`Extended Lc is ${lc} but ${n - 7} bytes follow it`);
}

export function tryParseCommand(bytes: Uint8Array): ParsedCommand | undefined {
  try {
    return parseCommand(bytes);
  } catch {
    return undefined;
  }
}

/**
 * Encodes a command. Switches to extended length when data exceeds 255 bytes or Le exceeds 256.
 * `le: 0` is accepted as the maximum (256 short, 65536 extended).
 */
export function encodeCommand(cmd: CommandApdu & { extended?: boolean }): Uint8Array {
  const data = cmd.data ?? new Uint8Array();
  const nc = data.length;
  const le = cmd.le;
  if (nc > 65535) throw new RangeError(`Command data too long (${nc} bytes)`);
  if (le !== undefined && (le < 0 || le > 65536)) throw new RangeError(`Le out of range (${le})`);
  const header = Uint8Array.of(cmd.cla, cmd.ins, cmd.p1, cmd.p2);
  const extended = cmd.extended || nc > 255 || (le !== undefined && le > 256);

  if (!extended) {
    const lc = nc > 0 ? concatBytes([nc], data) : new Uint8Array();
    const leByte = le === undefined ? new Uint8Array() : Uint8Array.of(le === 256 ? 0 : le);
    return concatBytes(header, lc, leByte);
  }

  const lc = nc > 0 ? concatBytes([0, nc >> 8, nc & 0xff], data) : new Uint8Array();
  let leBytes = new Uint8Array();
  if (le !== undefined) {
    const v = le === 65536 ? 0 : le;
    leBytes = nc > 0 ? Uint8Array.of(v >> 8, v & 0xff) : Uint8Array.of(0, v >> 8, v & 0xff);
  }
  return concatBytes(header, lc, leBytes);
}

export function splitResponse(bytes: Uint8Array): ResponseApdu {
  if (bytes.length < 2) throw new Error(`Response APDU too short (${bytes.length} bytes)`);
  const sw1 = bytes[bytes.length - 2]!;
  const sw2 = bytes[bytes.length - 1]!;
  return { data: bytes.slice(0, -2), sw1, sw2, sw: (sw1 << 8) | sw2 };
}

// ---- naming

export interface CommandDescription {
  name: string;
  detail?: string;
}

type Describer = (c: ParsedCommand) => string | undefined;
type Named = [name: string, detail?: Describer];

const hex = byteToHex;
const p1p2 = (c: ParsedCommand) => (c.p1 << 8) | c.p2;
const dataLength = (c: ParsedCommand) => (c.data ? `${c.data.length} bytes` : undefined);
const leDetail = (c: ParsedCommand) => (c.le !== undefined ? `Le ${c.le}` : undefined);

function dfName(data: Uint8Array): string {
  if (isPrintable(data)) return toAscii(data);
  const aid = toHex(data);
  const known = lookupAid(aid);
  return known ? `${aid} · ${known.name}` : aid;
}

function select(c: ParsedCommand): string | undefined {
  const data = c.data ?? new Uint8Array();
  const next = (c.p2 & 0x03) === 0x02 ? ' (next occurrence)' : '';
  switch (c.p1) {
    case 0x00:
      return data.length ? `by FID ${toHex(data)}${next}` : 'MF';
    case 0x01:
      return `child DF ${toHex(data)}`;
    case 0x02:
      return `EF ${toHex(data)}`;
    case 0x03:
      return 'parent DF';
    case 0x04:
      return data.length ? `by DF name ${dfName(data)}${next}` : `by DF name (empty)${next}`;
    case 0x08:
      return `path from MF ${toHex(data)}`;
    case 0x09:
      return `path from current DF ${toHex(data)}`;
    default:
      return `P1 ${hex(c.p1)}`;
  }
}

function readRecord(c: ParsedCommand): string | undefined {
  const sfi = c.p2 >> 3;
  const where = sfi ? `SFI ${sfi}` : 'current EF';
  switch (c.p2 & 0x07) {
    case 0x04:
      return `${where}, record ${c.p1}`;
    case 0x05:
      return `${where}, records ${c.p1} to last`;
    case 0x06:
      return `${where}, records last to ${c.p1}`;
    default:
      return `${where}, record id ${c.p1}`;
  }
}

function binaryOffset(c: ParsedCommand): string {
  if (c.p1 & 0x80) return `SFI ${c.p1 & 0x1f}, offset ${c.p2}`;
  return `offset ${((c.p1 & 0x7f) << 8) | c.p2}`;
}

function readBinary(c: ParsedCommand): string {
  return c.le !== undefined ? `${binaryOffset(c)}, ${c.le} bytes` : binaryOffset(c);
}

function updateBinary(c: ParsedCommand): string {
  return `${binaryOffset(c)}, ${c.data?.length ?? 0} bytes`;
}

function getData(c: ParsedCommand): string | undefined {
  if (c.ins === 0xcb && c.data) {
    const list = findTlv(parseTlv(c.data).nodes, 0x5c);
    if (list) return `object ${toHex(list.value)}`;
  }
  const tag = c.p1 === 0 ? hex(c.p2) : hex(c.p1) + hex(c.p2);
  const name = lookupTag(tag)?.name;
  return name ? `${tag} · ${name}` : tag;
}

function verify(c: ParsedCommand): string {
  const ref = `reference ${hex(c.p2)}`;
  return c.data?.length ? ref : `${ref}, query retries`;
}

function gpo(c: ParsedCommand): string | undefined {
  const template = c.data ? parseTlv(c.data).nodes[0] : undefined;
  return template?.tag === 0x83 ? `PDOL data ${template.value.length} bytes` : undefined;
}

function generateAc(c: ParsedCommand): string {
  const type = ['AAC', 'TC', 'ARQC', 'RFU'][c.p1 >> 6]!;
  return c.p1 & 0x10 ? `${type}, CDA requested` : type;
}

function mse(c: ParsedCommand): string {
  const op = { 0x41: 'SET (computation)', 0x81: 'SET (verification)', 0xf3: 'RESTORE' }[c.p1];
  const tpl = { 0xa4: 'AT', 0xa6: 'KAT', 0xaa: 'HT', 0xb4: 'CCT', 0xb6: 'DST', 0xb8: 'CT' }[c.p2];
  return [op ?? `P1 ${hex(c.p1)}`, tpl ?? (c.p1 === 0xf3 ? `SE ${c.p2}` : `P2 ${hex(c.p2)}`)].join(
    ' ',
  );
}

function pso(c: ParsedCommand): string {
  const ops: Record<number, string> = {
    0x9e9a: 'COMPUTE DIGITAL SIGNATURE',
    0x8086: 'DECIPHER',
    0x8680: 'ENCIPHER',
    0x8e80: 'COMPUTE CRYPTOGRAPHIC CHECKSUM',
    0x00a2: 'VERIFY CRYPTOGRAPHIC CHECKSUM',
    0x00a8: 'VERIFY DIGITAL SIGNATURE',
    0x00ae: 'VERIFY CERTIFICATE',
    0x00be: 'VERIFY CERTIFICATE',
    0x9080: 'HASH',
  };
  return ops[p1p2(c)] ?? `P1-P2 ${hex(c.p1)}${hex(c.p2)}`;
}

function getStatus(c: ParsedCommand): string {
  const scope: Record<number, string> = {
    0x80: 'issuer security domain',
    0x40: 'applications and security domains',
    0x20: 'executable load files',
    0x10: 'load files and modules',
  };
  return scope[c.p1] ?? `P1 ${hex(c.p1)}`;
}

function install(c: ParsedCommand): string {
  const parts: string[] = [];
  if (c.p1 & 0x02) parts.push('for load');
  if (c.p1 & 0x04) parts.push('for install');
  if (c.p1 & 0x08) parts.push('make selectable');
  if (c.p1 & 0x10) parts.push('for extradition');
  if (c.p1 & 0x20) parts.push('for personalization');
  if (c.p1 & 0x40) parts.push('for registry update');
  return parts.length ? parts.join(', ') : `P1 ${hex(c.p1)}`;
}

/** Interindustry commands (CLA 0x to 7x). */
const ISO: Record<number, Named> = {
  0x04: ['DEACTIVATE FILE'],
  0x0c: ['ERASE RECORD'],
  0x0e: ['ERASE BINARY'],
  0x10: ['PERFORM SCQL OPERATION'],
  0x12: ['PERFORM TRANSACTION OPERATION'],
  0x14: ['PERFORM USER OPERATION'],
  0x20: ['VERIFY', verify],
  0x21: ['VERIFY', verify],
  0x22: ['MANAGE SECURITY ENVIRONMENT', mse],
  0x24: ['CHANGE REFERENCE DATA', (c) => `reference ${hex(c.p2)}`],
  0x26: ['DISABLE VERIFICATION REQUIREMENT'],
  0x28: ['ENABLE VERIFICATION REQUIREMENT'],
  0x2a: ['PERFORM SECURITY OPERATION', pso],
  0x2c: ['RESET RETRY COUNTER', (c) => `reference ${hex(c.p2)}`],
  0x44: ['ACTIVATE FILE'],
  0x46: ['GENERATE ASYMMETRIC KEY PAIR'],
  0x70: ['MANAGE CHANNEL', (c) => (c.p1 === 0x80 ? `close channel ${c.p2}` : 'open channel')],
  0x82: ['EXTERNAL AUTHENTICATE', dataLength],
  0x84: ['GET CHALLENGE', leDetail],
  0x86: ['GENERAL AUTHENTICATE', (c) => `algorithm ${hex(c.p1)}, key ${hex(c.p2)}`],
  0x87: ['GENERAL AUTHENTICATE', (c) => `algorithm ${hex(c.p1)}, key ${hex(c.p2)}`],
  0x88: ['INTERNAL AUTHENTICATE', dataLength],
  0xa0: ['SEARCH BINARY'],
  0xa1: ['SEARCH BINARY'],
  0xa2: ['SEARCH RECORD'],
  0xa4: ['SELECT', select],
  0xb0: ['READ BINARY', readBinary],
  0xb1: ['READ BINARY'],
  0xb2: ['READ RECORD', readRecord],
  0xb3: ['READ RECORD'],
  0xc0: ['GET RESPONSE', leDetail],
  0xc2: ['ENVELOPE'],
  0xc3: ['ENVELOPE'],
  0xca: ['GET DATA', getData],
  0xcb: ['GET DATA', getData],
  0xd0: ['WRITE BINARY', updateBinary],
  0xd1: ['WRITE BINARY'],
  0xd2: ['WRITE RECORD'],
  0xd6: ['UPDATE BINARY', updateBinary],
  0xd7: ['UPDATE BINARY'],
  0xda: ['PUT DATA'],
  0xdb: ['PUT DATA'],
  0xdc: ['UPDATE RECORD', readRecord],
  0xdd: ['UPDATE RECORD'],
  0xe0: ['CREATE FILE'],
  0xe2: ['APPEND RECORD'],
  0xe4: ['DELETE FILE'],
  0xe6: ['TERMINATE DF'],
  0xe8: ['TERMINATE EF'],
  0xfe: ['TERMINATE CARD USAGE'],
};

/** EMV and GlobalPlatform commands with a proprietary CLA (8x, 9x, Ax...). */
const PROPRIETARY: Record<number, Named> = {
  0x16: ['CARD BLOCK'],
  0x18: ['APPLICATION UNBLOCK'],
  0x1e: ['APPLICATION BLOCK'],
  0x24: ['PIN CHANGE/UNBLOCK'],
  0x50: ['INITIALIZE UPDATE', (c) => `key version ${c.p1}`],
  0x82: ['EXTERNAL AUTHENTICATE', (c) => `security level ${hex(c.p1)}`],
  0xa8: ['GET PROCESSING OPTIONS', gpo],
  0xae: ['GENERATE AC', generateAc],
  0xca: ['GET DATA', getData],
  0xd8: ['PUT KEY', (c) => `key version ${c.p1}, key ${c.p2 & 0x7f}`],
  0xe2: ['STORE DATA', (c) => `block ${c.p2}`],
  0xe4: ['DELETE'],
  0xe6: ['INSTALL', install],
  0xe8: ['LOAD', (c) => `block ${c.p2}${c.p1 & 0x80 ? ', last' : ''}`],
  0xf0: ['SET STATUS'],
  0xf2: ['GET STATUS', getStatus],
};

/** GSM 11.11 (CLA A0) commands that differ from interindustry naming. */
const GSM: Record<number, Named> = {
  0x20: ['VERIFY CHV', (c) => `CHV${c.p2}`],
  0x88: ['RUN GSM ALGORITHM'],
  0xf2: ['STATUS'],
  0x10: ['TERMINAL PROFILE'],
  0x12: ['FETCH'],
  0x14: ['TERMINAL RESPONSE'],
};

/** MIFARE DESFire native commands wrapped in ISO 7816 (CLA 90). */
const DESFIRE: Record<number, string> = {
  0x0a: 'AUTHENTICATE',
  0x1a: 'AUTHENTICATE ISO',
  0xaa: 'AUTHENTICATE AES',
  0x45: 'GET KEY SETTINGS',
  0x51: 'GET CARD UID',
  0x5a: 'SELECT APPLICATION',
  0x60: 'GET VERSION',
  0x6a: 'GET APPLICATION IDS',
  0x6c: 'GET VALUE',
  0x6e: 'FREE MEMORY',
  0x6f: 'GET FILE IDS',
  0xaf: 'ADDITIONAL FRAME',
  0xbb: 'READ RECORDS',
  0xbd: 'READ DATA',
  0x3d: 'WRITE DATA',
  0xca: 'CREATE APPLICATION',
  0xda: 'DELETE APPLICATION',
  0xf5: 'GET FILE SETTINGS',
  0xfc: 'FORMAT PICC',
};

function pcsc(c: ParsedCommand): CommandDescription | undefined {
  const block = (c.p1 << 8) | c.p2;
  switch (c.ins) {
    case 0xca:
      if (c.p1 === 0x00) return { name: 'GET UID' };
      if (c.p1 === 0x01) return { name: 'GET ATS' };
      return undefined;
    case 0x82:
      return { name: 'LOAD KEY', detail: `key slot ${c.p2}${c.p1 & 0x20 ? ', non-volatile' : ''}` };
    case 0x86: {
      const d = c.data;
      if (d && d.length >= 5) {
        const keyType =
          d[3] === 0x60 ? 'key A' : d[3] === 0x61 ? 'key B' : `key type ${hex(d[3]!)}`;
        return {
          name: 'GENERAL AUTHENTICATE',
          detail: `block ${(d[1]! << 8) | d[2]!}, ${keyType}, slot ${d[4]}`,
        };
      }
      return { name: 'GENERAL AUTHENTICATE' };
    }
    case 0x88:
      return { name: 'AUTHENTICATE', detail: `block ${c.p2}` };
    case 0xb0:
      return {
        name: 'READ BINARY',
        detail: `page/block ${block}${c.le !== undefined ? `, ${c.le} bytes` : ''}`,
      };
    case 0xb1:
      return { name: 'READ VALUE BLOCK', detail: `block ${c.p2}` };
    case 0xd6:
      return { name: 'UPDATE BINARY', detail: `page/block ${block}, ${c.data?.length ?? 0} bytes` };
    case 0xd7:
      return { name: 'VALUE BLOCK OPERATION', detail: `block ${c.p2}` };
    case 0xc2: {
      const op = ['MANAGE SESSION', 'TRANSPARENT EXCHANGE', 'SWITCH PROTOCOL'][c.p2];
      return op ? { name: op } : undefined;
    }
    case 0x00:
      if (c.p1 === 0x00 && c.p2 === 0x00) return { name: 'DIRECT TRANSMIT', detail: dataLength(c) };
      if (c.p1 === 0x40) return { name: 'LED/BUZZER CONTROL' };
      if (c.p1 === 0x48) return { name: 'GET FIRMWARE VERSION' };
      return undefined;
    default:
      return undefined;
  }
}

function fromTable(table: Record<number, Named>, c: ParsedCommand): CommandDescription | undefined {
  const entry = table[c.ins];
  if (!entry) return undefined;
  const detail = entry[1]?.(c);
  return detail ? { name: entry[0], detail } : { name: entry[0] };
}

/** Names a command for display, e.g. { name: 'SELECT', detail: 'by DF name 2PAY.SYS.DDF01' }. */
export function describeCommand(bytes: Uint8Array): CommandDescription {
  if (bytes.length < 4) return { name: 'Malformed APDU', detail: `${bytes.length} bytes` };
  // Fall back to the header alone so a bad Lc still gets named.
  const c: ParsedCommand = tryParseCommand(bytes) ?? {
    cla: bytes[0]!,
    ins: bytes[1]!,
    p1: bytes[2]!,
    p2: bytes[3]!,
    case: 1,
    extended: false,
  };
  const unknown = { name: `INS ${hex(c.ins)}` };

  if (c.cla === 0xff) return pcsc(c) ?? unknown;
  if (c.cla === 0x90 && DESFIRE[c.ins]) return { name: DESFIRE[c.ins]!, detail: 'DESFire' };
  if (c.cla === 0xa0) return fromTable(GSM, c) ?? fromTable(ISO, c) ?? unknown;
  if (c.cla & 0x80) return fromTable(PROPRIETARY, c) ?? fromTable(ISO, c) ?? unknown;
  return fromTable(ISO, c) ?? unknown;
}
