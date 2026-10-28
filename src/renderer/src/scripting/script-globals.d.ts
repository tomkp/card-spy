/**
 * Card Spy script API.
 *
 * Scripts are TypeScript modules run in a sandboxed worker against the selected reader.
 * Top-level `await` works. Every APDU a script sends appears in the trace, tagged "script".
 */

interface TlvNode {
  /** Whole tag as a number, e.g. 0x9F38. */
  readonly tag: number;
  /** e.g. "9F38" */
  readonly tagHex: string;
  readonly constructed: boolean;
  readonly length: number;
  readonly value: Uint8Array;
  readonly children?: TlvNode[];
}

interface CardResponse {
  /** Response data, without the status word. */
  readonly data: Uint8Array;
  /** `data` as hex. */
  readonly hex: string;
  readonly sw: number;
  readonly sw1: number;
  readonly sw2: number;
  /** Status word as hex, e.g. "9000". */
  readonly swHex: string;
  /** True when the status word is 9000. */
  readonly ok: boolean;
  /** What the status word means, e.g. "File or application not found". */
  readonly status: string;
  /** Parses `data` as BER-TLV. */
  tlv(): TlvNode[];
  /** Finds a tag anywhere in the TLV data, e.g. `find('5A')`. */
  find(tag: string | number): TlvNode | undefined;
  /** Throws unless `ok`; returns the response so calls can chain. */
  expectOk(message?: string): CardResponse;
}

type Bytes = string | Uint8Array | number[];

/** A raw APDU as hex or bytes, or its fields. `le: 256` (or 0) asks for as much as the card has. */
type ApduInput =
  Bytes | { cla: number; ins: number; p1: number; p2: number; data?: Bytes; le?: number };

interface SendOptions {
  /** Follow 61xx with GET RESPONSE and resend 6Cxx with the right Le. Default true. */
  autoResponse?: boolean;
}

interface AflEntry {
  sfi: number;
  first: number;
  last: number;
  /** How many of the records, starting at `first`, take part in offline data authentication. */
  oda: number;
}

interface NdefRecord {
  tnf: number;
  tnfName: string;
  type: string;
  payload: Uint8Array;
  decoded: { kind: string; [key: string]: unknown };
}

declare const card: {
  /** Reader name. */
  readonly reader: string;
  /** ATR as hex. */
  readonly atr: string;
  send(apdu: ApduInput, options?: SendOptions): Promise<CardResponse>;
  /** SELECT by DF name: an AID in hex, or a name such as "2PAY.SYS.DDF01". */
  select(aidOrName: Bytes): Promise<CardResponse>;
  readRecord(sfi: number, record: number): Promise<CardResponse>;
  readBinary(offset?: number, length?: number): Promise<CardResponse>;
  /** GET DATA (CLA 80), e.g. `getData('9F36')` for the application transaction counter. */
  getData(tag: string | number): Promise<CardResponse>;
  /** UID of a contactless card, asked of the reader (FF CA 00 00 00). */
  getUid(): Promise<string>;
  /** Reads `count` 4-byte pages of a Type 2 tag (NTAG, Ultralight) from `page` onwards. */
  readPages(page: number, count: number): Promise<Uint8Array>;
  /** Warm reset, or cold when asked; resolves with the new ATR. */
  reset(cold?: boolean): Promise<string>;
};

/** Writes to the Output panel. Responses, bytes and TLV are formatted for reading. */
declare function log(...values: unknown[]): void;
declare function sleep(ms: number): Promise<void>;
declare function assert(condition: unknown, message?: string): asserts condition;

declare const hex: {
  from(text: string): Uint8Array;
  to(bytes: ArrayLike<number>, separator?: string): string;
  /** Printable ASCII, '.' for anything else. */
  ascii(bytes: ArrayLike<number>): string;
};

declare const tlv: {
  parse(bytes: Bytes): TlvNode[];
  find(nodes: TlvNode[], tag: string | number): TlvNode | undefined;
  findAll(nodes: TlvNode[], tag: string | number): TlvNode[];
  encode(tag: string | number, value: Bytes): Uint8Array;
};

declare const emv: {
  /** e.g. `tagName('5F24')` is "Application Expiration Date". */
  tagName(tag: string | number): string | undefined;
  /** A readable value where there is one: dates, currencies, countries, decoded flags. */
  describe(tag: string | number, value: Uint8Array): string | undefined;
  /** Name of a known AID, e.g. "Visa Debit/Credit". */
  aidName(aid: string): string | undefined;
  parseAfl(afl: Uint8Array): AflEntry[];
  /** AIP and AFL from a GET PROCESSING OPTIONS response (format 1 or 2). */
  parseGpo(data: Uint8Array): { aip?: Uint8Array; afl: AflEntry[] };
  /** Fills a DOL (PDOL, CDOL…) with sensible terminal defaults, overridden by tag. */
  buildDol(dol: Uint8Array, overrides?: Record<string, Bytes>): Uint8Array;
};

declare const ndef: {
  parse(message: Uint8Array): NdefRecord[];
  /** Finds and parses the NDEF message in a Type 2 tag's user memory (page 4 onwards). */
  fromType2(userMemory: Uint8Array): NdefRecord[];
};

/** console.log and console.error also write to the Output panel. */
declare const console: {
  log(...values: unknown[]): void;
  error(...values: unknown[]): void;
};
