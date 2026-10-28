/** EMV (Book 3 Annex A, contactless kernels) and ISO 7816 tag dictionary, plus value decoders. */

import { isPrintable, toAscii, toHex, toUint } from '../hex';
import { lookupAid } from '../aids';
import { readTag, tagToHex } from '../tlv';
import { FCP_TAGS, FILE_CONTROL_TEMPLATES } from './iso7816';

export type TagFormat = 'b' | 'n' | 'cn' | 'an' | 'ans' | 'tlv';

export interface TagInfo {
  tag: string;
  name: string;
  format: TagFormat;
  description?: string;
}

type Entry = [tag: string, name: string, format: TagFormat, description?: string];

const ENTRIES: Entry[] = [
  ['42', 'Issuer Identification Number (IIN)', 'n'],
  ['4F', 'Application Identifier (AID) – card', 'b'],
  ['50', 'Application Label', 'ans'],
  ['56', 'Track 1 Data', 'ans'],
  ['57', 'Track 2 Equivalent Data', 'b'],
  ['5A', 'Application Primary Account Number (PAN)', 'cn'],
  ['5F20', 'Cardholder Name', 'ans'],
  ['5F24', 'Application Expiration Date', 'n', 'YYMMDD'],
  ['5F25', 'Application Effective Date', 'n', 'YYMMDD'],
  ['5F28', 'Issuer Country Code', 'n', 'ISO 3166-1 numeric'],
  ['5F2A', 'Transaction Currency Code', 'n', 'ISO 4217 numeric'],
  ['5F2D', 'Language Preference', 'an', 'ISO 639-1, in order of preference'],
  ['5F30', 'Service Code', 'n'],
  ['5F34', 'Application PAN Sequence Number', 'n'],
  ['5F36', 'Transaction Currency Exponent', 'n'],
  ['5F50', 'Issuer URL', 'ans'],
  ['5F53', 'International Bank Account Number (IBAN)', 'b'],
  ['5F54', 'Bank Identifier Code (BIC)', 'b'],
  ['5F55', 'Issuer Country Code (alpha2)', 'an'],
  ['5F56', 'Issuer Country Code (alpha3)', 'an'],
  ['61', 'Application Template', 'tlv'],
  ['62', 'File Control Parameters (FCP) Template', 'tlv'],
  ['64', 'File Management Data (FMD) Template', 'tlv'],
  ['6F', 'File Control Information (FCI) Template', 'tlv'],
  ['70', 'READ RECORD Response Message Template', 'tlv'],
  ['71', 'Issuer Script Template 1', 'tlv'],
  ['72', 'Issuer Script Template 2', 'tlv'],
  ['73', 'Directory Discretionary Template', 'tlv'],
  ['77', 'Response Message Template Format 2', 'tlv'],
  ['80', 'Response Message Template Format 1', 'b'],
  ['81', 'Amount, Authorised (Binary)', 'b'],
  ['82', 'Application Interchange Profile (AIP)', 'b'],
  ['83', 'Command Template', 'b'],
  ['84', 'Dedicated File (DF) Name', 'b'],
  ['86', 'Issuer Script Command', 'b'],
  ['87', 'Application Priority Indicator', 'b'],
  ['88', 'Short File Identifier (SFI)', 'b'],
  ['89', 'Authorisation Code', 'an'],
  ['8A', 'Authorisation Response Code', 'an'],
  ['8C', 'Card Risk Management Data Object List 1 (CDOL1)', 'b'],
  ['8D', 'Card Risk Management Data Object List 2 (CDOL2)', 'b'],
  ['8E', 'Cardholder Verification Method (CVM) List', 'b'],
  ['8F', 'Certification Authority Public Key Index', 'b'],
  ['90', 'Issuer Public Key Certificate', 'b'],
  ['91', 'Issuer Authentication Data', 'b'],
  ['92', 'Issuer Public Key Remainder', 'b'],
  ['93', 'Signed Static Application Data', 'b'],
  ['94', 'Application File Locator (AFL)', 'b'],
  ['95', 'Terminal Verification Results (TVR)', 'b'],
  ['97', 'Transaction Certificate Data Object List (TDOL)', 'b'],
  ['98', 'Transaction Certificate (TC) Hash Value', 'b'],
  ['99', 'Transaction Personal Identification Number (PIN) Data', 'b'],
  ['9A', 'Transaction Date', 'n', 'YYMMDD'],
  ['9B', 'Transaction Status Information (TSI)', 'b'],
  ['9C', 'Transaction Type', 'n'],
  ['9D', 'Directory Definition File (DDF) Name', 'b'],
  ['9F01', 'Acquirer Identifier', 'n'],
  ['9F02', 'Amount, Authorised (Numeric)', 'n'],
  ['9F03', 'Amount, Other (Numeric)', 'n'],
  ['9F04', 'Amount, Other (Binary)', 'b'],
  ['9F05', 'Application Discretionary Data', 'b'],
  ['9F06', 'Application Identifier (AID) – terminal', 'b'],
  ['9F07', 'Application Usage Control (AUC)', 'b'],
  ['9F08', 'Application Version Number – card', 'b'],
  ['9F09', 'Application Version Number – terminal', 'b'],
  ['9F0A', 'Application Selection Registered Proprietary Data', 'b'],
  ['9F0B', 'Cardholder Name Extended', 'ans'],
  ['9F0D', 'Issuer Action Code – Default', 'b'],
  ['9F0E', 'Issuer Action Code – Denial', 'b'],
  ['9F0F', 'Issuer Action Code – Online', 'b'],
  ['9F10', 'Issuer Application Data (IAD)', 'b'],
  ['9F11', 'Issuer Code Table Index', 'n'],
  ['9F12', 'Application Preferred Name', 'ans'],
  ['9F13', 'Last Online Application Transaction Counter (ATC) Register', 'b'],
  ['9F14', 'Lower Consecutive Offline Limit', 'b'],
  ['9F15', 'Merchant Category Code', 'n'],
  ['9F16', 'Merchant Identifier', 'ans'],
  ['9F17', 'Personal Identification Number (PIN) Try Counter', 'b'],
  ['9F18', 'Issuer Script Identifier', 'b'],
  ['9F19', 'Token Requestor ID', 'n'],
  ['9F1A', 'Terminal Country Code', 'n', 'ISO 3166-1 numeric'],
  ['9F1B', 'Terminal Floor Limit', 'b'],
  ['9F1C', 'Terminal Identification', 'an'],
  ['9F1D', 'Terminal Risk Management Data', 'b'],
  ['9F1E', 'Interface Device (IFD) Serial Number', 'an'],
  ['9F1F', 'Track 1 Discretionary Data', 'ans'],
  ['9F20', 'Track 2 Discretionary Data', 'cn'],
  ['9F21', 'Transaction Time', 'n', 'HHMMSS'],
  ['9F22', 'Certification Authority Public Key Index – terminal', 'b'],
  ['9F23', 'Upper Consecutive Offline Limit', 'b'],
  ['9F24', 'Payment Account Reference (PAR)', 'an'],
  ['9F26', 'Application Cryptogram (AC)', 'b'],
  ['9F27', 'Cryptogram Information Data (CID)', 'b'],
  ['9F29', 'Extended Selection', 'b'],
  ['9F2A', 'Kernel Identifier', 'b'],
  ['9F2D', 'ICC PIN Encipherment Public Key Certificate', 'b'],
  ['9F2E', 'ICC PIN Encipherment Public Key Exponent', 'b'],
  ['9F2F', 'ICC PIN Encipherment Public Key Remainder', 'b'],
  ['9F32', 'Issuer Public Key Exponent', 'b'],
  ['9F33', 'Terminal Capabilities', 'b'],
  ['9F34', 'Cardholder Verification Method (CVM) Results', 'b'],
  ['9F35', 'Terminal Type', 'n'],
  ['9F36', 'Application Transaction Counter (ATC)', 'b'],
  ['9F37', 'Unpredictable Number', 'b'],
  ['9F38', 'Processing Options Data Object List (PDOL)', 'b'],
  ['9F39', 'Point-of-Service (POS) Entry Mode', 'n'],
  ['9F3A', 'Amount, Reference Currency', 'b'],
  ['9F3B', 'Application Reference Currency', 'n'],
  ['9F3C', 'Transaction Reference Currency Code', 'n'],
  ['9F3D', 'Transaction Reference Currency Exponent', 'n'],
  ['9F40', 'Additional Terminal Capabilities', 'b'],
  ['9F41', 'Transaction Sequence Counter', 'n'],
  ['9F42', 'Application Currency Code', 'n', 'ISO 4217 numeric'],
  ['9F43', 'Application Reference Currency Exponent', 'n'],
  ['9F44', 'Application Currency Exponent', 'n'],
  ['9F45', 'Data Authentication Code', 'b'],
  ['9F46', 'ICC Public Key Certificate', 'b'],
  ['9F47', 'ICC Public Key Exponent', 'b'],
  ['9F48', 'ICC Public Key Remainder', 'b'],
  ['9F49', 'Dynamic Data Authentication Data Object List (DDOL)', 'b'],
  ['9F4A', 'Static Data Authentication Tag List', 'b'],
  ['9F4B', 'Signed Dynamic Application Data', 'b'],
  ['9F4C', 'ICC Dynamic Number', 'b'],
  ['9F4D', 'Log Entry', 'b', 'SFI and number of records of the transaction log'],
  ['9F4E', 'Merchant Name and Location', 'ans'],
  ['9F4F', 'Log Format', 'b'],
  ['9F51', 'Application Currency Code (proprietary)', 'n', 'ISO 4217 numeric'],
  ['9F52', 'Application Default Action (ADA)', 'b'],
  ['9F53', 'Consecutive Transaction Limit (International) / Transaction Category Code', 'b'],
  ['9F54', 'Cumulative Total Transaction Amount Limit', 'b'],
  ['9F55', 'Geographic Indicator', 'b'],
  ['9F56', 'Issuer Authentication Indicator', 'b'],
  ['9F57', 'Issuer Country Code (proprietary)', 'n', 'ISO 3166-1 numeric'],
  ['9F58', 'Lower Consecutive Offline Limit (Card Check)', 'b'],
  ['9F59', 'Upper Consecutive Offline Limit (Card Check)', 'b'],
  ['9F5A', 'Application Program Identifier', 'b'],
  ['9F5B', 'Issuer Script Results', 'b'],
  ['9F5C', 'Cumulative Total Transaction Amount Upper Limit', 'b'],
  ['9F5D', 'Available Offline Spending Amount', 'b'],
  ['9F66', 'Terminal Transaction Qualifiers (TTQ)', 'b'],
  ['9F68', 'Card Additional Processes', 'b'],
  ['9F69', 'Card Authentication Related Data / UDOL', 'b'],
  ['9F6A', 'Unpredictable Number (Numeric)', 'n'],
  ['9F6B', 'Track 2 Data / Card CVM Limit', 'b'],
  ['9F6C', 'Card Transaction Qualifiers (CTQ)', 'b'],
  ['9F6D', 'Mag-stripe Application Version Number (Reader)', 'b'],
  ['9F6E', 'Form Factor Indicator / Third Party Data', 'b'],
  ['9F7C', 'Customer Exclusive Data / Merchant Custom Data', 'b'],
  ['9F7E', 'Mobile Support Indicator', 'b'],
  ['A5', 'File Control Information (FCI) Proprietary Template', 'tlv'],
  ['BF0C', 'File Control Information (FCI) Issuer Discretionary Data', 'tlv'],

  // ISO 7816-6 interindustry and OpenPGP data objects that don't clash with EMV.
  ['43', 'Card Service Data', 'b'],
  ['46', 'Pre-issuing Data', 'b'],
  ['47', 'Card Capabilities', 'b'],
  ['48', 'Status Information', 'b'],
  ['53', 'Discretionary Data', 'b'],
  ['5B', 'Name', 'ans'],
  ['5C', 'Tag List', 'b'],
  ['5E', 'Login Data', 'ans'],
  ['5F35', 'Sex (ISO 5218)', 'an'],
  ['65', 'Cardholder Related Data (OpenPGP)', 'tlv'],
  ['6E', 'Application Related Data (OpenPGP)', 'tlv'],
  ['7A', 'Security Support Template', 'tlv'],
  ['7F21', 'Cardholder Certificate', 'tlv'],
  ['7F49', 'Public Key', 'tlv'],
];

const TAGS = new Map<string, TagInfo>(
  ENTRIES.map(([tag, name, format, description]) => [
    tag,
    description ? { tag, name, format, description } : { tag, name, format },
  ]),
);

/**
 * `parent` is the tag of the enclosing template, when known: directly inside a file control
 * template (62, 64, 6F) tags have their ISO 7816-4 meanings rather than their EMV ones.
 */
export function lookupTag(tag: number | string, parent?: string): TagInfo | undefined {
  const hex = tagToHex(tag);
  const fcp = fileControlTag(hex, parent);
  if (fcp) return { tag: hex, name: fcp.name, format: 'b' };
  return TAGS.get(hex);
}

function fileControlTag(hex: string, parent: string | undefined) {
  return parent && FILE_CONTROL_TEMPLATES.has(parent) ? FCP_TAGS[hex] : undefined;
}

/** Human-readable value, or undefined when hex is as good as it gets. */
export function decodeTagValue(
  tag: number | string,
  value: Uint8Array,
  parent?: string,
): string | undefined {
  const hex = tagToHex(tag);
  const fcp = fileControlTag(hex, parent);
  if (fcp) return fcp.decode?.(value);
  const special = DECODERS[hex];
  if (special) {
    try {
      const decoded = special(value);
      if (decoded !== undefined) return decoded;
    } catch {
      // fall through to the format decoder
    }
  }
  const info = TAGS.get(hex);
  if (!info || value.length === 0) return undefined;
  switch (info.format) {
    case 'an':
    case 'ans':
      return isPrintable(value) ? toAscii(value) : undefined;
    case 'n':
      return bcd(value);
    case 'cn':
      return compressedNumeric(value);
    default:
      return undefined;
  }
}

// ---- helpers

/** BCD digits, or undefined if any nibble isn't 0-9. */
export function bcd(value: Uint8Array): string | undefined {
  const digits = toHex(value);
  return /^[0-9]*$/.test(digits) ? digits : undefined;
}

function compressedNumeric(value: Uint8Array): string | undefined {
  const digits = toHex(value).replace(/F+$/, '');
  return /^[0-9]+$/.test(digits) ? digits : undefined;
}

/** Labels for set bits, one map per byte, keyed by bit mask. */
type BitTable = Array<Partial<Record<number, string>>>;

function flags(value: Uint8Array, table: BitTable): string {
  const set: string[] = [];
  table.forEach((bits, i) => {
    const byte = value[i] ?? 0;
    // Most significant bit first; Object.entries would order integer keys ascending.
    for (let mask = 0x80; mask; mask >>= 1) {
      const label = bits[mask];
      if (label && byte & mask) set.push(label);
    }
  });
  return set.length ? set.join(', ') : 'none';
}

function date(value: Uint8Array): string | undefined {
  const d = bcd(value);
  if (!d || d.length !== 6) return undefined;
  const yy = Number(d.slice(0, 2));
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  return `${year}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
}

function amount(value: Uint8Array): string | undefined {
  const d = bcd(value);
  if (!d) return undefined;
  const n = d.replace(/^0+/, '').padStart(3, '0');
  return `${n.slice(0, -2)}.${n.slice(-2)}`;
}

const CURRENCIES: Record<string, string> = {
  '036': 'AUD',
  '124': 'CAD',
  '152': 'CLP',
  '156': 'CNY',
  '170': 'COP',
  '203': 'CZK',
  '208': 'DKK',
  '344': 'HKD',
  '348': 'HUF',
  '356': 'INR',
  '360': 'IDR',
  '376': 'ILS',
  '392': 'JPY',
  '404': 'KES',
  '410': 'KRW',
  '458': 'MYR',
  '484': 'MXN',
  '554': 'NZD',
  '566': 'NGN',
  '578': 'NOK',
  '604': 'PEN',
  '608': 'PHP',
  '643': 'RUB',
  '682': 'SAR',
  '702': 'SGD',
  '704': 'VND',
  '710': 'ZAR',
  '752': 'SEK',
  '756': 'CHF',
  '764': 'THB',
  '784': 'AED',
  '818': 'EGP',
  '826': 'GBP',
  '840': 'USD',
  '901': 'TWD',
  '946': 'RON',
  '949': 'TRY',
  '975': 'BGN',
  '978': 'EUR',
  '985': 'PLN',
  '986': 'BRL',
  '032': 'ARS',
};

const COUNTRIES: Record<string, string> = {
  '036': 'AU',
  '040': 'AT',
  '056': 'BE',
  '076': 'BR',
  '100': 'BG',
  '124': 'CA',
  '156': 'CN',
  '191': 'HR',
  '196': 'CY',
  '203': 'CZ',
  '208': 'DK',
  '233': 'EE',
  '246': 'FI',
  '250': 'FR',
  '276': 'DE',
  '300': 'GR',
  '344': 'HK',
  '348': 'HU',
  '352': 'IS',
  '356': 'IN',
  '372': 'IE',
  '376': 'IL',
  '380': 'IT',
  '392': 'JP',
  '410': 'KR',
  '428': 'LV',
  '440': 'LT',
  '442': 'LU',
  '470': 'MT',
  '484': 'MX',
  '528': 'NL',
  '554': 'NZ',
  '578': 'NO',
  '616': 'PL',
  '620': 'PT',
  '642': 'RO',
  '643': 'RU',
  '682': 'SA',
  '702': 'SG',
  '703': 'SK',
  '705': 'SI',
  '710': 'ZA',
  '724': 'ES',
  '752': 'SE',
  '756': 'CH',
  '784': 'AE',
  '792': 'TR',
  '826': 'GB',
  '840': 'US',
};

function codeLookup(table: Record<string, string>) {
  return (value: Uint8Array): string | undefined => {
    const d = bcd(value);
    if (!d) return undefined;
    const code = d.slice(-3);
    const name = table[code];
    return name ? `${name} (${d.padStart(4, '0')})` : d;
  };
}

const CVM_METHODS: Record<number, string> = {
  0x00: 'Fail CVM processing',
  0x01: 'Plaintext PIN by ICC',
  0x02: 'Enciphered PIN online',
  0x03: 'Plaintext PIN by ICC and signature',
  0x04: 'Enciphered PIN by ICC',
  0x05: 'Enciphered PIN by ICC and signature',
  0x1e: 'Signature',
  0x1f: 'No CVM required',
  0x3f: 'No CVM performed',
};

const CVM_CONDITIONS: Record<number, string> = {
  0x00: 'always',
  0x01: 'if unattended cash',
  0x02: 'if not unattended cash, manual cash or cashback',
  0x03: 'if terminal supports CVM',
  0x04: 'if manual cash',
  0x05: 'if purchase with cashback',
  0x06: 'if in application currency and under X',
  0x07: 'if in application currency and over X',
  0x08: 'if in application currency and under Y',
  0x09: 'if in application currency and over Y',
};

function cvmMethod(code: number): string {
  return CVM_METHODS[code & 0x3f] ?? `CVM ${(code & 0x3f).toString(16).toUpperCase()}`;
}

function cvmCondition(code: number): string {
  return CVM_CONDITIONS[code] ?? `condition ${code.toString(16).toUpperCase()}`;
}

function cvmList(value: Uint8Array): string | undefined {
  if (value.length < 8 || (value.length - 8) % 2 !== 0) return undefined;
  const x = toUint(value.subarray(0, 4));
  const y = toUint(value.subarray(4, 8));
  const rules: string[] = [];
  for (let i = 8; i < value.length; i += 2) {
    const method = value[i]!;
    const next = method & 0x40 ? ', else next rule' : '';
    rules.push(`${cvmMethod(method)}, ${cvmCondition(value[i + 1]!)}${next}`);
  }
  const amounts = x || y ? `X=${x}, Y=${y}; ` : '';
  return amounts + (rules.length ? rules.join('; ') : 'no rules');
}

function afl(value: Uint8Array): string | undefined {
  if (value.length === 0 || value.length % 4 !== 0) return undefined;
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += 4) {
    const sfi = value[i]! >> 3;
    const first = value[i + 1]!;
    const last = value[i + 2]!;
    const oda = value[i + 3]!;
    const records = first === last ? `record ${first}` : `records ${first}–${last}`;
    parts.push(`SFI ${sfi} ${records}${oda ? ` (${oda} for ODA)` : ''}`);
  }
  return parts.join('; ');
}

function track2(value: Uint8Array): string | undefined {
  const digits = toHex(value).replace(/F+$/, '');
  const sep = digits.indexOf('D');
  if (sep < 0) return undefined;
  const pan = digits.slice(0, sep);
  const rest = digits.slice(sep + 1);
  return `PAN ${pan}, exp ${rest.slice(0, 4)}, svc ${rest.slice(4, 7)}`;
}

/** Data object lists (PDOL, CDOL, DDOL, TDOL, log format): tag and length pairs. */
function dol(value: Uint8Array): string | undefined {
  const parts: string[] = [];
  let i = 0;
  while (i < value.length) {
    const header = readTag(value, i);
    const len = header ? value[i + header.size] : undefined;
    if (!header || len === undefined) return undefined;
    const name = TAGS.get(header.tagHex)?.name;
    parts.push(`${header.tagHex}${name ? ` ${name}` : ''} (${len})`);
    i += header.size + 1;
  }
  return parts.length ? parts.join(', ') : undefined;
}

const AIP_BITS: BitTable = [
  {
    0x40: 'SDA supported',
    0x20: 'DDA supported',
    0x10: 'Cardholder verification supported',
    0x08: 'Terminal risk management to be performed',
    0x04: 'Issuer authentication supported',
    0x02: 'On-device cardholder verification supported',
    0x01: 'CDA supported',
  },
  { 0x80: 'EMV mode supported (contactless)', 0x01: 'Relay resistance protocol supported' },
];

const TVR_BITS: BitTable = [
  {
    0x80: 'Offline data authentication not performed',
    0x40: 'SDA failed',
    0x20: 'ICC data missing',
    0x10: 'Card on terminal exception file',
    0x08: 'DDA failed',
    0x04: 'CDA failed',
    0x02: 'SDA selected',
  },
  {
    0x80: 'ICC and terminal application versions differ',
    0x40: 'Expired application',
    0x20: 'Application not yet effective',
    0x10: 'Requested service not allowed for card product',
    0x08: 'New card',
  },
  {
    0x80: 'Cardholder verification not successful',
    0x40: 'Unrecognised CVM',
    0x20: 'PIN try limit exceeded',
    0x10: 'PIN required but PIN pad missing or not working',
    0x08: 'PIN required, PIN pad present, PIN not entered',
    0x04: 'Online PIN entered',
  },
  {
    0x80: 'Transaction exceeds floor limit',
    0x40: 'Lower consecutive offline limit exceeded',
    0x20: 'Upper consecutive offline limit exceeded',
    0x10: 'Transaction selected randomly for online processing',
    0x08: 'Merchant forced transaction online',
  },
  {
    0x80: 'Default TDOL used',
    0x40: 'Issuer authentication failed',
    0x20: 'Script processing failed before final GENERATE AC',
    0x10: 'Script processing failed after final GENERATE AC',
  },
];

const AUC_BITS: BitTable = [
  {
    0x80: 'Domestic cash',
    0x40: 'International cash',
    0x20: 'Domestic goods',
    0x10: 'International goods',
    0x08: 'Domestic services',
    0x04: 'International services',
    0x02: 'ATMs',
    0x01: 'Non-ATM terminals',
  },
  { 0x80: 'Domestic cashback', 0x40: 'International cashback' },
];

const CTQ_BITS: BitTable = [
  {
    0x80: 'Online PIN required',
    0x40: 'Signature required',
    0x20: 'Go online if ODA fails and reader is online capable',
    0x10: 'Switch interface if ODA fails and reader supports contact',
    0x08: 'Go online if application expired',
    0x04: 'Switch interface for cash',
    0x02: 'Switch interface for cashback',
  },
  { 0x80: 'Consumer device CVM performed', 0x40: 'Issuer update processing at POS supported' },
];

const TTQ_BITS: BitTable = [
  {
    0x80: 'MSD supported',
    0x20: 'qVSDC supported',
    0x10: 'EMV contact chip supported',
    0x08: 'Offline-only reader',
    0x04: 'Online PIN supported',
    0x02: 'Signature supported',
    0x01: 'ODA for online authorisations supported',
  },
  {
    0x80: 'Online cryptogram required',
    0x40: 'CVM required',
    0x20: 'Contact chip offline PIN supported',
  },
  { 0x80: 'Issuer update processing supported', 0x40: 'Consumer device CVM supported' },
];

const TERMINAL_CAPABILITY_BITS: BitTable = [
  { 0x80: 'Manual key entry', 0x40: 'Magnetic stripe', 0x20: 'IC with contacts' },
  {
    0x80: 'Plaintext PIN for ICC verification',
    0x40: 'Enciphered PIN for online verification',
    0x20: 'Signature',
    0x10: 'Enciphered PIN for offline verification',
    0x08: 'No CVM required',
  },
  { 0x80: 'SDA', 0x40: 'DDA', 0x20: 'Card capture', 0x08: 'CDA' },
];

function cid(value: Uint8Array): string | undefined {
  const b = value[0];
  if (b === undefined) return undefined;
  const type = ['AAC', 'TC', 'ARQC', 'RFU'][b >> 6]!;
  const parts = [type];
  if (b & 0x08) parts.push('advice required');
  const reason = [
    '',
    'service not allowed',
    'PIN try limit exceeded',
    'issuer authentication failed',
  ][b & 0x07];
  if (reason) parts.push(reason);
  return parts.join(', ');
}

function cvmResults(value: Uint8Array): string | undefined {
  if (value.length !== 3) return undefined;
  const method = value[0]!;
  const condition = value[1]!;
  const result = value[2]!;
  if ((method & 0x3f) === 0x3f) return 'No CVM performed';
  const outcome = ['unknown', 'failed', 'successful'][result] ?? `result ${result}`;
  return `${cvmMethod(method)}, ${cvmCondition(condition)}: ${outcome}`;
}

function aidName(value: Uint8Array): string | undefined {
  if (isPrintable(value)) return toAscii(value);
  return lookupAid(toHex(value))?.name;
}

const DECODERS: Record<string, (value: Uint8Array) => string | undefined> = {
  '4F': aidName,
  '84': aidName,
  '9F06': aidName,
  '57': track2,
  '5A': compressedNumeric,
  '5F24': date,
  '5F25': date,
  '9A': date,
  '5F28': codeLookup(COUNTRIES),
  '9F1A': codeLookup(COUNTRIES),
  '9F57': codeLookup(COUNTRIES),
  '5F2A': codeLookup(CURRENCIES),
  '9F42': codeLookup(CURRENCIES),
  '9F51': codeLookup(CURRENCIES),
  '9F3B': codeLookup(CURRENCIES),
  '9F3C': codeLookup(CURRENCIES),
  '5F2D': (v) => (isPrintable(v) ? (toAscii(v).match(/.{1,2}/g) ?? []).join(', ') : undefined),
  '5F30': (v) => bcd(v)?.slice(-3),
  '82': (v) => flags(v, AIP_BITS),
  '87': (v) => {
    const b = v[0];
    if (b === undefined) return undefined;
    const priority = b & 0x0f ? `priority ${b & 0x0f}` : 'no priority';
    return b & 0x80 ? `${priority}, cardholder confirmation required` : priority;
  },
  '88': (v) => (v.length === 1 ? `SFI ${v[0]}` : undefined),
  '8C': dol,
  '8D': dol,
  '97': dol,
  '9F38': dol,
  '9F49': dol,
  '9F4F': dol,
  '8E': cvmList,
  '94': afl,
  '95': (v) => flags(v, TVR_BITS),
  '9F02': amount,
  '9F03': amount,
  '9F07': (v) => flags(v, AUC_BITS),
  '9F13': (v) => (v.length ? String(toUint(v)) : undefined),
  '9F17': (v) => (v.length === 1 ? `${v[0]} ${v[0] === 1 ? 'try' : 'tries'} left` : undefined),
  '9F21': (v) => {
    const d = bcd(v);
    return d && d.length === 6 ? `${d.slice(0, 2)}:${d.slice(2, 4)}:${d.slice(4, 6)}` : undefined;
  },
  '9F27': cid,
  '9F33': (v) => flags(v, TERMINAL_CAPABILITY_BITS),
  '9F34': cvmResults,
  '9F36': (v) => (v.length ? String(toUint(v)) : undefined),
  '9F4D': (v) => (v.length === 2 ? `SFI ${v[0]}, ${v[1]} records` : undefined),
  '9F66': (v) => flags(v, TTQ_BITS),
  '9F6C': (v) => flags(v, CTQ_BITS),
};
