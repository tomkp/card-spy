import { encodeCommand } from './apdu';
import { asciiToBytes, fromHex, isHex, normalizeHex, toBytes } from './hex';
import { encodeTlv } from './tlv';

/**
 * Builders for the commands the explorer and scripts send most: short APDUs, unless the data or Le
 * needs extended. Each throws a RangeError for a parameter that doesn't fit its field, rather than
 * sending a different command. A length of 0 asks for as much as the card has.
 */

export const PPSE = asciiToBytes('2PAY.SYS.DDF01');
export const PSE = asciiToBytes('1PAY.SYS.DDF01');

/** SELECT by DF name, first or only occurrence, asking for the FCI. */
export function selectByName(name: Uint8Array): Uint8Array {
  return encodeCommand({ cla: 0x00, ins: 0xa4, p1: 0x04, p2: 0x00, data: name, le: 0 });
}

/** Hex is taken as an AID; anything else (e.g. "2PAY.SYS.DDF01") as an ASCII DF name. */
export function nameBytes(aidOrName: string | ArrayLike<number>): Uint8Array {
  if (typeof aidOrName !== 'string') return toBytes(aidOrName);
  return isHex(aidOrName) && /^[0-9a-f\s]+$/i.test(aidOrName)
    ? fromHex(aidOrName)
    : asciiToBytes(aidOrName);
}

export function readRecord(sfi: number, record: number): Uint8Array {
  check('SFI', sfi, 31);
  check('Record number', record, 0xff);
  return encodeCommand({ cla: 0x00, ins: 0xb2, p1: record, p2: (sfi << 3) | 0x04, le: 0 });
}

export function readBinary(offset = 0, length = 0): Uint8Array {
  check('Offset', offset, 0x7fff);
  return encodeCommand({ cla: 0x00, ins: 0xb0, p1: offset >> 8, p2: offset & 0xff, le: length });
}

/** GET DATA, EMV style (CLA 80). The tag goes in P1-P2, so it can be at most 2 bytes. */
export function getData(tag: string | number): Uint8Array {
  const t = typeof tag === 'number' ? tag : parseInt(normalizeHex(tag), 16);
  check('Tag', t, 0xffff);
  return encodeCommand({ cla: 0x80, ins: 0xca, p1: t >> 8, p2: t & 0xff, le: 0 });
}

export function getResponse(length: number): Uint8Array {
  return encodeCommand({ cla: 0x00, ins: 0xc0, p1: 0x00, p2: 0x00, le: length });
}

/** GET PROCESSING OPTIONS with PDOL data wrapped in tag 83. */
export function getProcessingOptions(pdolData: Uint8Array): Uint8Array {
  const data = encodeTlv(0x83, pdolData);
  return encodeCommand({ cla: 0x80, ins: 0xa8, p1: 0x00, p2: 0x00, data, le: 0 });
}

/** PC/SC pseudo-APDUs a contactless reader answers itself. */
export const GET_UID = Uint8Array.of(0xff, 0xca, 0x00, 0x00, 0x00);

export function readPages(page: number, bytes: number): Uint8Array {
  check('Page', page, 0xffff);
  return encodeCommand({ cla: 0xff, ins: 0xb0, p1: page >> 8, p2: page & 0xff, le: bytes });
}

/** Throws a RangeError unless `value` is a whole number from 0 to `max`. */
function check(name: string, value: number, max: number): void {
  if (!(Number.isInteger(value) && value >= 0 && value <= max)) {
    throw new RangeError(`${name} out of range (${value})`);
  }
}
