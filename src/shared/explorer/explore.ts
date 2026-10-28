import { KNOWN_AIDS, lookupAid } from '../aids';
import { splitResponse, type ResponseApdu } from '../apdu';
import { parseAtr, type ParsedAtr } from '../atr';
import {
  GET_UID,
  getData,
  getProcessingOptions,
  PPSE,
  PSE,
  readPages,
  readRecord,
  selectByName,
} from '../commands';
import { buildDolData, defaultTerminalData, parseDol } from '../dol';
import { parseGpoResponse } from '../emv-flow';
import { sendWithResponses, type Transmit } from '../exchange';
import { concatBytes, fromHex, isPrintable, toAscii, toHex } from '../hex';
import {
  parseCapabilityContainer,
  parseNdefMessage,
  parseType2Tlvs,
  type NdefRecord,
} from '../ndef';
import { describeSw } from '../sw';
import { decodeTagValue, lookupTag } from '../tags/emv';
import { findAllTlv, findTlv, parseTlv } from '../tlv';
import { NodeFactory, shortHex, type ExplorerNode } from './model';

export interface ExploreOptions {
  transmit: Transmit;
  atr: Uint8Array;
  /** Called with a fresh root after each section, so the tree can fill in while the card is read. */
  onUpdate?: (root: ExplorerNode) => void;
  signal?: AbortSignal;
}

interface Context {
  f: NodeFactory;
  send: (command: Uint8Array) => Promise<ResponseApdu>;
  raw: (command: Uint8Array) => Promise<ResponseApdu>;
  /** The card is talking over contactless (its ATR is a PC/SC contactless one). */
  contactless: boolean;
}

const ok = (r: ResponseApdu) => r.sw === 0x9000;

/**
 * Reads everything Card Spy knows how to read from a card: the ATR, the UID of contactless cards,
 * payment applications (EMV), NFC Forum Type 2 tag memory and NDEF, and a scan for well-known AIDs.
 * Each section is independent; one that fails becomes an error node and the rest still run.
 */
export async function exploreCard(options: ExploreOptions): Promise<ExplorerNode> {
  const f = new NodeFactory();
  const raw = async (command: Uint8Array) => {
    options.signal?.throwIfAborted();
    return splitResponse(await options.transmit(command));
  };
  const send = async (command: Uint8Array) => {
    options.signal?.throwIfAborted();
    return sendWithResponses(options.transmit, command);
  };
  const atr = parseAtr(options.atr);
  const ctx: Context = { f, send, raw, contactless: atr.contactless !== undefined };

  const root = f.node('card', atr.contactless ? atr.contactless.cardName : 'Smart card', {
    value: atr.contactless ? atr.contactless.standard : atr.summary,
    children: [atrNode(f, atr)],
  });
  const update = () => options.onUpdate?.({ ...root, children: [...root.children!] });
  update();

  const storageCard = atr.contactless !== undefined && atr.contactless.standard !== 'ISO 14443-4';
  const sections: Array<(ctx: Context) => Promise<ExplorerNode | undefined>> = [];
  if (atr.contactless) sections.push(uidSection);
  if (storageCard) {
    const notType2 = NOT_TYPE_2[atr.contactless!.cardNameCode];
    sections.push(
      notType2
        ? async ({ f }) => f.node('info', 'Memory not read', { value: notType2 })
        : type2Section,
    );
  } else sections.push(emvSection, aidScanSection);

  for (const section of sections) {
    try {
      const node = await section(ctx);
      if (node) root.children!.push(node);
    } catch (e) {
      if (options.signal?.aborted) throw e;
      root.children!.push(f.node('error', 'Error', { value: (e as Error).message }));
    }
    update();
  }

  // Say so when nothing answered, rather than leaving just the ATR (which looks unfinished).
  const recognised = root.children!.some(
    (n) => n.label === 'Payment (EMV)' || n.label === 'Applications',
  );
  const failed = root.children!.some((n) => n.kind === 'error');
  if (!storageCard && !recognised && !failed) {
    root.children!.push(
      f.node('info', 'Nothing recognised', {
        value:
          'No payment directory, and none of the well-known applications answered SELECT. ' +
          'The card may hold applications Card Spy does not know: SELECT their AIDs from the console.',
      }),
    );
    update();
  }
  return root;
}

function atrNode(f: NodeFactory, atr: ParsedAtr): ExplorerNode {
  return f.node('section', 'ATR', {
    value: toHex(atr.bytes, ' '),
    bytes: atr.bytes,
    children: [
      ...atr.fields.map((field) =>
        f.node('info', field.name, {
          value: field.description,
          bytes: atr.bytes.subarray(field.offset, field.offset + field.length),
        }),
      ),
      ...atr.errors.map((message) => f.node('error', 'ATR problem', { value: message })),
    ],
  });
}

async function uidSection({ f, raw }: Context): Promise<ExplorerNode | undefined> {
  const r = await raw(GET_UID);
  if (!ok(r)) return undefined;
  return f.node('data', 'UID', { value: toHex(r.data, ' '), bytes: r.data });
}

// ---- EMV ----

async function emvSection(ctx: Context): Promise<ExplorerNode | undefined> {
  const { f, send } = ctx;
  let directory = await send(selectByName(PPSE));
  let contactless = true;
  if (!ok(directory)) {
    directory = await send(selectByName(PSE));
    contactless = false;
  }

  const section = f.node('section', 'Payment (EMV)', { children: [] });
  const dirNode = f.node(
    'application',
    contactless ? 'Contactless directory (PPSE)' : 'Payment directory (PSE)',
    {
      value: contactless ? '2PAY.SYS.DDF01' : '1PAY.SYS.DDF01',
      bytes: directory.data,
      children: f.tlv(directory.data),
    },
  );

  const aids: Uint8Array[] = [];
  if (ok(directory)) {
    section.children!.push(dirNode);
    if (contactless) {
      aids.push(...findAllTlv(parseTlv(directory.data).nodes, 0x4f).map((n) => n.value));
    } else {
      const sfi = findTlv(parseTlv(directory.data).nodes, 0x88)?.value[0] ?? 1;
      for (let record = 1; record <= 16; record++) {
        const r = await send(readRecord(sfi, record));
        if (!ok(r)) break;
        dirNode.children!.push(recordNode(f, sfi, record, r.data));
        aids.push(...findAllTlv(parseTlv(r.data).nodes, 0x4f).map((n) => n.value));
      }
    }
  } else {
    // No directory: some cards only answer a direct SELECT, so try the payment AIDs we know.
    for (const known of KNOWN_AIDS.filter((a) => a.category === 'payment')) {
      const r = await send(selectByName(fromHex(known.aid)));
      if (ok(r)) aids.push(fromHex(known.aid));
    }
  }
  if (aids.length === 0) return undefined;

  for (const aid of uniqueAids(aids)) {
    section.children!.push(await emvApplication(ctx, aid, ok(directory)));
  }
  return section;
}

async function emvApplication(
  ctx: Context,
  aid: Uint8Array,
  listed: boolean,
): Promise<ExplorerNode> {
  const { f, send } = ctx;
  const aidHex = toHex(aid);
  const select = await send(selectByName(aid));
  const fciTlv = parseTlv(select.data).nodes;
  const label = findTlv(fciTlv, 0x50)?.value;
  const app = f.node(
    'application',
    // Labels are space-padded on many cards ("Link             ").
    label && isPrintable(label) ? toAscii(label).trim() : (lookupAid(aidHex)?.name ?? aidHex),
    {
      value: aidHex,
      children: [],
    },
  );
  if (!ok(select)) {
    app.children!.push(f.node('error', 'SELECT failed', { value: swText(select) }));
    const hint = selectFailureHint(select.sw, ctx.contactless, listed);
    if (hint) app.children!.push(f.node('info', 'Likely cause', { value: hint }));
    return app;
  }
  app.children!.push(
    f.node('data', 'File Control Information', {
      bytes: select.data,
      children: f.tlv(select.data),
    }),
  );

  // GET PROCESSING OPTIONS, answering the PDOL with default terminal data.
  const pdol = findTlv(fciTlv, 0x9f38)?.value ?? new Uint8Array();
  const gpo = await send(getProcessingOptions(buildDolData(parseDol(pdol), defaultTerminalData())));
  if (!ok(gpo)) {
    app.children!.push(f.node('error', 'GET PROCESSING OPTIONS failed', { value: swText(gpo) }));
    return app;
  }
  const { afl } = parseGpoResponse(gpo.data);
  app.children!.push(
    f.node('data', 'Processing options', { bytes: gpo.data, children: f.tlv(gpo.data) }),
  );

  const records = f.node('section', 'Records', {
    value: `${afl.length} AFL entries`,
    children: [],
  });
  for (const entry of afl) {
    for (let record = entry.first; record <= entry.last; record++) {
      const r = await send(readRecord(entry.sfi, record));
      const node = ok(r)
        ? recordNode(f, entry.sfi, record, r.data, record < entry.first + entry.oda)
        : f.node('error', `SFI ${entry.sfi} · record ${record}`, { value: swText(r) });
      records.children!.push(node);
    }
  }
  app.children!.push(records);

  const dataObjects = f.node('section', 'Data objects (GET DATA)', { children: [] });
  let logFormat: Uint8Array | undefined;
  for (const tag of [0x9f36, 0x9f13, 0x9f17, 0x9f4f]) {
    const r = await send(getData(tag));
    if (!ok(r)) continue;
    const value = findTlv(parseTlv(r.data).nodes, tag)?.value ?? r.data;
    if (tag === 0x9f4f) logFormat = value;
    const tagHex = tag.toString(16).toUpperCase();
    dataObjects.children!.push(
      f.node('tlv', lookupTag(tagHex)?.name ?? tagHex, {
        tag: tagHex,
        bytes: r.data,
        value: decodeTagValue(tagHex, value) ?? toHex(value, ' '),
      }),
    );
  }
  if (dataObjects.children!.length) app.children!.push(dataObjects);

  // Transaction log: tag 9F4D in the FCI gives its SFI and size; 9F4F describes each entry.
  const logEntry = findTlv(fciTlv, 0x9f4d)?.value;
  if (logEntry && logEntry.length >= 2 && logFormat) {
    const log = await transactionLog(ctx, logEntry[0]!, logEntry[1]!, logFormat);
    app.children!.push(log);
  }
  return app;
}

async function transactionLog(
  { f, send }: Context,
  sfi: number,
  count: number,
  format: Uint8Array,
): Promise<ExplorerNode> {
  const dol = parseDol(format);
  const log = f.node('section', 'Transaction log', { value: `SFI ${sfi}`, children: [] });
  for (let record = 1; record <= count; record++) {
    const r = await send(readRecord(sfi, record));
    if (!ok(r)) {
      // 6A83 (no such record) just means fewer entries; anything else is the card refusing.
      if (record === 1) {
        log.value =
          r.sw === 0x6a83 ? `SFI ${sfi} · empty` : `SFI ${sfi} · not readable: ${swText(r)}`;
      }
      break;
    }
    let offset = 0;
    const fields = dol.map((entry) => {
      const value = r.data.subarray(offset, offset + entry.length);
      offset += entry.length;
      return f.node('tlv', lookupTag(entry.tagHex)?.name ?? entry.tagHex, {
        tag: entry.tagHex,
        bytes: value,
        value: decodeTagValue(entry.tagHex, value) ?? toHex(value, ' '),
      });
    });
    const summary = ['9A', '9F02', '5F2A']
      .map((t) => fields.find((n) => n.tag === t)?.value)
      .filter(Boolean)
      .join(' · ');
    log.children!.push(
      f.node('record', `Entry ${record}`, { value: summary, bytes: r.data, children: fields }),
    );
  }
  return log;
}

/**
 * EMV answers a SELECT with 6A81 when the card or application is blocked (or SELECT isn't
 * supported), and with 6283 when the application is blocked. A card that lists an application in its
 * contactless directory and then refuses to select it is usually one whose contactless payments
 * haven't been switched on yet: many issuers wait for the card's first chip-and-PIN payment.
 */
function selectFailureHint(sw: number, contactless: boolean, listed: boolean): string | undefined {
  if (sw !== 0x6a81 && sw !== 0x6283) return undefined;
  if (contactless && listed) {
    return (
      "The card lists this application but won't open it over contactless. EMV uses this status for " +
      'a blocked card or application. New cards often keep contactless switched off until their ' +
      'first chip-and-PIN payment; in a contact reader the application should open.'
    );
  }
  return 'EMV uses this status on SELECT for a blocked card or application.';
}

function recordNode(
  f: NodeFactory,
  sfi: number,
  record: number,
  data: Uint8Array,
  oda = false,
): ExplorerNode {
  return f.node('record', `SFI ${sfi} · record ${record}`, {
    ...(oda ? { value: 'signed (ODA)' } : {}),
    bytes: data,
    children: f.tlv(data),
  });
}

// ---- Well-known applications ----

async function aidScanSection({ f, send }: Context): Promise<ExplorerNode | undefined> {
  const found: ExplorerNode[] = [];
  for (const known of KNOWN_AIDS.filter((a) => a.category !== 'payment')) {
    const r = await send(selectByName(fromHex(known.aid)));
    if (!ok(r)) continue;
    found.push(
      f.node('application', known.name, {
        value: known.aid,
        bytes: r.data,
        children: r.data.length ? f.tlv(r.data) : [],
      }),
    );
  }
  if (found.length === 0) return undefined;
  return f.node('section', 'Applications', { value: `${found.length} found`, children: found });
}

// ---- NFC Forum Type 2 (NTAG / Ultralight) ----

const CLASSIC =
  "MIFARE Classic keeps its memory in sectors that can only be read after authenticating with each sector's key. " +
  "Card Spy reads the UID but doesn't authenticate.";

/**
 * Contactless memory cards whose memory isn't NFC Forum Type 2 pages, by PC/SC card name code, with
 * the reason Card Spy doesn't show it. Anything else (Ultralight, NTAG, unknown) is read as Type 2.
 */
const NOT_TYPE_2: Record<number, string> = {
  0x0001: CLASSIC,
  0x0002: CLASSIC,
  0x0026: CLASSIC,
  0x0036: CLASSIC,
  0x0037: CLASSIC,
  0x0014: 'Card Spy does not read ICODE (ISO 15693) memory yet.',
  0x0035: 'Card Spy does not read ICODE (ISO 15693) memory yet.',
  0x003b: 'Card Spy does not read FeliCa memory yet.',
  0xf011: 'Card Spy does not read FeliCa memory yet.',
  0xf012: 'Card Spy does not read FeliCa memory yet.',
  0x002f: 'Card Spy does not read Jewel / Topaz (Type 1) memory yet.',
  0x0030: 'Card Spy does not read Jewel / Topaz (Type 1) memory yet.',
  0xf004: 'Card Spy does not read Jewel / Topaz (Type 1) memory yet.',
};

async function type2Section({ f, raw }: Context): Promise<ExplorerNode | undefined> {
  const header = await raw(readPages(0, 16));
  if (!ok(header) || header.data.length < 16) return undefined;
  const cc = parseCapabilityContainer(header.data.subarray(12, 16));
  const section = f.node('section', 'NFC tag (Type 2)', { value: cc?.tagGuess, children: [] });
  section.children!.push(
    f.node('data', 'Capability container', {
      value: cc ? `NDEF ${cc.version}, ${cc.dataAreaSize} bytes` : 'not NDEF formatted',
      bytes: header.data.subarray(12, 16),
    }),
  );
  if (!cc) return section;

  let memory = header.data;
  for (let page = 4; page * 4 < 16 + cc.dataAreaSize; page += 4) {
    const r = await raw(readPages(page, 16));
    if (r.data.length === 0) break;
    memory = concatBytes(memory, r.data);
    if (!ok(r)) break;
  }
  const user = memory.subarray(16, 16 + cc.dataAreaSize);
  const ndefBlock = parseType2Tlvs(user).find((b) => b.type === 0x03);
  if (ndefBlock) {
    const { records, error } = parseNdefMessage(ndefBlock.value);
    section.children!.push(
      f.node('section', 'NDEF message', {
        value: `${records.length} record${records.length === 1 ? '' : 's'}`,
        bytes: ndefBlock.value,
        children: [
          ...records.map((record) => ndefNode(f, record)),
          ...(error ? [f.node('error', 'NDEF problem', { value: error })] : []),
        ],
      }),
    );
  }
  section.children!.push(
    f.node('data', 'Memory', { value: `${memory.length} bytes read`, bytes: memory }),
  );
  return section;
}

function ndefNode(f: NodeFactory, record: NdefRecord): ExplorerNode {
  const d = record.decoded;
  const [label, value] =
    d.kind === 'uri'
      ? ['URI', d.uri]
      : d.kind === 'text'
        ? [`Text (${d.lang})`, d.text]
        : d.kind === 'mime'
          ? [d.mime, d.text ?? shortHex(record.payload)]
          : d.kind === 'smart-poster'
            ? ['Smart poster', `${d.records.length} records`]
            : [`${record.tnfName} ${record.type}`.trim(), shortHex(record.payload)];
  return f.node('ndef', label, {
    value,
    bytes: record.payload,
    ...(d.kind === 'smart-poster' ? { children: d.records.map((r) => ndefNode(f, r)) } : {}),
  });
}

// ---- helpers ----

function swText(r: ResponseApdu): string {
  return `${toHex([r.sw1, r.sw2])} ${describeSw(r.sw).text}`;
}

function uniqueAids(aids: Uint8Array[]): Uint8Array[] {
  const seen = new Set<string>();
  return aids.filter((aid) => {
    const key = toHex(aid);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
