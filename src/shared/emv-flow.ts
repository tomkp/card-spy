import { findTlv, parseTlv } from './tlv';

export interface AflEntry {
  sfi: number;
  first: number;
  last: number;
  /** Records from `first` that take part in offline data authentication. */
  oda: number;
}

/** Application File Locator: 4 bytes per entry (SFI << 3, first record, last record, ODA count). */
export function parseAfl(afl: Uint8Array): AflEntry[] {
  const entries: AflEntry[] = [];
  for (let i = 0; i + 4 <= afl.length; i += 4) {
    entries.push({ sfi: afl[i]! >> 3, first: afl[i + 1]!, last: afl[i + 2]!, oda: afl[i + 3]! });
  }
  return entries;
}

/**
 * GET PROCESSING OPTIONS response: format 1 is tag 80 holding AIP (2 bytes) then AFL;
 * format 2 is template 77 with AIP in 82 and AFL in 94.
 */
export function parseGpoResponse(data: Uint8Array): { aip?: Uint8Array; afl: AflEntry[] } {
  const { nodes } = parseTlv(data);
  const format1 = findTlv(nodes, 0x80);
  if (format1 && format1.value.length >= 2) {
    return { aip: format1.value.subarray(0, 2), afl: parseAfl(format1.value.subarray(2)) };
  }
  const aip = findTlv(nodes, 0x82)?.value;
  const afl = findTlv(nodes, 0x94)?.value;
  return { ...(aip ? { aip } : {}), afl: afl ? parseAfl(afl) : [] };
}
