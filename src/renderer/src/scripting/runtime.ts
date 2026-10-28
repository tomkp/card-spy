import { lookupAid } from '@shared/aids';
import { encodeCommand, splitResponse } from '@shared/apdu';
import * as commands from '@shared/commands';
import { buildDolData, defaultTerminalData, parseDol } from '@shared/dol';
import { parseAfl, parseGpoResponse } from '@shared/emv-flow';
import { sendWithResponses, type Transmit } from '@shared/exchange';
import { concatBytes, normalizeHex, toAscii, toBytes, toHex } from '@shared/hex';
import { parseNdefMessage, parseType2Tlvs } from '@shared/ndef';
import { describeSw } from '@shared/sw';
import { decodeTagValue, lookupTag } from '@shared/tags/emv';
import { encodeTlv, findAllTlv, findTlv, parseTlv, type TlvNode } from '@shared/tlv';
import { format } from './format';

type Bytes = string | ArrayLike<number>;
type ApduInput =
  Bytes | { cla: number; ins: number; p1: number; p2: number; data?: Bytes; le?: number };

export class CardResponse {
  constructor(
    readonly data: Uint8Array,
    readonly sw1: number,
    readonly sw2: number,
  ) {}

  get sw(): number {
    return (this.sw1 << 8) | this.sw2;
  }
  get hex(): string {
    return toHex(this.data);
  }
  get swHex(): string {
    return toHex([this.sw1, this.sw2]);
  }
  get ok(): boolean {
    return this.sw === 0x9000;
  }
  get status(): string {
    return describeSw(this.sw).text;
  }
  tlv(): TlvNode[] {
    return parseTlv(this.data).nodes;
  }
  find(tag: string | number): TlvNode | undefined {
    return findTlv(this.tlv(), tag);
  }
  expectOk(message = 'Command failed'): CardResponse {
    if (!this.ok) throw new Error(`${message}: ${this.swHex} ${this.status}`);
    return this;
  }
}

export interface RuntimeHost {
  reader: string;
  atr: string;
  transmit: Transmit;
  reset(cold: boolean): Promise<string>;
  log(text: string, level: 'info' | 'error'): void;
}

/** The globals a script sees. Kept in step with script-globals.d.ts, which is what the editor shows. */
export function createRuntime(host: RuntimeHost): Record<string, unknown> {
  const { transmit } = host;
  const respond = (r: { data: Uint8Array; sw1: number; sw2: number }) =>
    new CardResponse(r.data, r.sw1, r.sw2);

  const send = async (apdu: ApduInput, options: { autoResponse?: boolean } = {}) => {
    const command = toCommand(apdu);
    return respond(
      options.autoResponse === false
        ? splitResponse(await transmit(command))
        : await sendWithResponses(transmit, command),
    );
  };

  const card = {
    reader: host.reader,
    atr: host.atr,
    send,
    select: (aidOrName: Bytes) => send(commands.selectByName(commands.nameBytes(aidOrName))),
    readRecord: (sfi: number, record: number) => send(commands.readRecord(sfi, record)),
    readBinary: (offset = 0, length = 0) => send(commands.readBinary(offset, length)),
    getData: (tag: string | number) => send(commands.getData(tag)),
    async getUid() {
      return respond(splitResponse(await transmit(commands.GET_UID))).expectOk('GET UID failed')
        .hex;
    },
    async readPages(page: number, count: number) {
      let out: Uint8Array = new Uint8Array();
      for (let p = page; p < page + count; p += 4) {
        const r = respond(splitResponse(await transmit(commands.readPages(p, 16))));
        if (!r.ok && r.data.length === 0) r.expectOk(`READ BINARY page ${p} failed`);
        out = concatBytes(out, r.data);
        if (!r.ok) break;
      }
      return out.subarray(0, count * 4);
    },
    async reset(cold = false) {
      card.atr = await host.reset(cold);
      return card.atr;
    },
  };

  const log = (...values: unknown[]) => host.log(values.map(format).join(' '), 'info');

  return {
    card,
    log,
    // Keep the real console underneath: other code in the worker (Vite's client in dev) uses the rest of it.
    console: Object.assign(Object.create(console) as Console, {
      log,
      error: (...values: unknown[]) => host.log(values.map(format).join(' '), 'error'),
    }),
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    assert(condition: unknown, message = 'Assertion failed') {
      if (!condition) throw new Error(message);
    },
    hex: {
      from: (text: string) => toBytes(text),
      to: (bytes: ArrayLike<number>, separator = '') => toHex(bytes, separator),
      ascii: (bytes: ArrayLike<number>) => toAscii(bytes),
    },
    tlv: {
      parse: (bytes: Bytes) => parseTlv(toBytes(bytes)).nodes,
      find: findTlv,
      findAll: findAllTlv,
      encode: (tag: string | number, value: Bytes) => encodeTlv(tag, toBytes(value)),
    },
    emv: {
      tagName: (tag: string | number) => lookupTag(tag)?.name,
      describe: (tag: string | number, value: Uint8Array) => decodeTagValue(tag, value),
      aidName: (aid: string) => lookupAid(normalizeHex(aid))?.name,
      parseAfl,
      parseGpo: parseGpoResponse,
      buildDol(dol: Uint8Array, overrides: Record<string, Bytes> = {}) {
        const values = defaultTerminalData();
        for (const [tag, value] of Object.entries(overrides))
          values[normalizeHex(tag)] = toBytes(value);
        return buildDolData(parseDol(dol), values);
      },
    },
    ndef: {
      parse: (message: Uint8Array) => parseNdefMessage(message).records,
      fromType2(userMemory: Uint8Array) {
        const block = parseType2Tlvs(userMemory).find((b) => b.type === 0x03);
        return block ? parseNdefMessage(block.value).records : [];
      },
    },
  };
}

function toCommand(apdu: ApduInput): Uint8Array {
  if (typeof apdu === 'string' || isArrayLike(apdu)) return toBytes(apdu);
  return encodeCommand({
    cla: apdu.cla,
    ins: apdu.ins,
    p1: apdu.p1,
    p2: apdu.p2,
    ...(apdu.data !== undefined ? { data: toBytes(apdu.data) } : {}),
    ...(apdu.le !== undefined ? { le: apdu.le === 0 ? 256 : apdu.le } : {}),
  });
}

function isArrayLike(value: unknown): value is ArrayLike<number> {
  return value instanceof Uint8Array || Array.isArray(value);
}
