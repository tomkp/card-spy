import { asciiToBytes, concatBytes, fromHex, isHex, normalizeHex } from './hex';

/** Builders for the commands the explorer and scripts send most. All short APDUs. */

export const PPSE = asciiToBytes('2PAY.SYS.DDF01');
export const PSE = asciiToBytes('1PAY.SYS.DDF01');

/** SELECT by DF name, first or only occurrence, asking for the FCI. */
export function selectByName(name: Uint8Array): Uint8Array {
  return Uint8Array.of(0x00, 0xa4, 0x04, 0x00, name.length, ...name, 0x00);
}

/** Hex is taken as an AID; anything else (e.g. "2PAY.SYS.DDF01") as an ASCII DF name. */
export function nameBytes(aidOrName: string | ArrayLike<number>): Uint8Array {
  if (typeof aidOrName !== 'string') return Uint8Array.from(aidOrName);
  return isHex(aidOrName) && /^[0-9a-f\s]+$/i.test(aidOrName)
    ? fromHex(aidOrName)
    : asciiToBytes(aidOrName);
}

export function readRecord(sfi: number, record: number): Uint8Array {
  return Uint8Array.of(0x00, 0xb2, record, (sfi << 3) | 0x04, 0x00);
}

export function readBinary(offset = 0, length = 0): Uint8Array {
  return Uint8Array.of(0x00, 0xb0, (offset >> 8) & 0x7f, offset & 0xff, length & 0xff);
}

/** GET DATA, EMV style (CLA 80). */
export function getData(tag: string | number): Uint8Array {
  const t = typeof tag === 'number' ? tag : parseInt(normalizeHex(tag), 16);
  return Uint8Array.of(0x80, 0xca, (t >> 8) & 0xff, t & 0xff, 0x00);
}

export function getResponse(length: number): Uint8Array {
  return Uint8Array.of(0x00, 0xc0, 0x00, 0x00, length & 0xff);
}

/** GET PROCESSING OPTIONS with PDOL data wrapped in tag 83. */
export function getProcessingOptions(pdolData: Uint8Array): Uint8Array {
  const body = concatBytes([0x83, pdolData.length], pdolData);
  return concatBytes([0x80, 0xa8, 0x00, 0x00, body.length], body, [0x00]);
}

/** PC/SC pseudo-APDUs a contactless reader answers itself. */
export const GET_UID = Uint8Array.of(0xff, 0xca, 0x00, 0x00, 0x00);

export function readPages(page: number, bytes: number): Uint8Array {
  return Uint8Array.of(0xff, 0xb0, (page >> 8) & 0xff, page & 0xff, bytes & 0xff);
}
