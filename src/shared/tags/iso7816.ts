/**
 * ISO 7816-4 file control parameters: what tags mean directly inside a file control template.
 * The same numbers mean something else in EMV (82 is the AIP there), so these only apply when the
 * parent is one of these templates. EMV puts only 84 and A5 directly in 6F, and both keep their names.
 */

import { toHex, toUint } from '../hex';

export const FILE_CONTROL_TEMPLATES = new Set(['62', '64', '6F']);

interface FcpTag {
  name: string;
  decode?: (value: Uint8Array) => string | undefined;
}

export const FCP_TAGS: Record<string, FcpTag> = {
  '80': { name: 'File size (data bytes)', decode: byteCount },
  '81': { name: 'File size (including structural information)', decode: byteCount },
  '82': { name: 'File descriptor', decode: fileDescriptor },
  '83': { name: 'File identifier', decode: fileIdentifier },
  '85': { name: 'Proprietary information' },
  '86': { name: 'Security attributes (proprietary)' },
  '87': { name: 'FCI extension file identifier', decode: fileIdentifier },
  '88': { name: 'Short EF identifier', decode: shortEfIdentifier },
  '8A': { name: 'Life cycle status', decode: lifeCycleStatus },
  '8B': { name: 'Security attributes (expanded, by reference)' },
  '8C': { name: 'Security attributes (compact)' },
  A1: { name: 'Security attributes (proprietary template)' },
  AB: { name: 'Security attributes (expanded)' },
};

function byteCount(value: Uint8Array): string | undefined {
  return value.length ? `${toUint(value)} bytes` : undefined;
}

const KNOWN_FILES: Record<string, string> = {
  '3F00': 'master file',
  '2F00': 'EF.DIR',
  '2F01': 'EF.ATR',
  '5015': 'PKCS#15 application',
  '5031': 'PKCS#15 ODF',
  '5032': 'PKCS#15 TokenInfo',
};

function fileIdentifier(value: Uint8Array): string | undefined {
  if (value.length !== 2) return undefined;
  const id = toHex(value);
  return KNOWN_FILES[id] ? `${id} (${KNOWN_FILES[id]})` : id;
}

const EF_STRUCTURES = [
  'no structure given',
  'transparent',
  'linear fixed',
  'linear fixed, TLV',
  'linear variable',
  'linear variable, TLV',
  'cyclic',
  'cyclic, TLV',
];

/** First byte of tag 82 (ISO 7816-4 table 12). */
function fileDescriptor(value: Uint8Array): string | undefined {
  const b = value[0];
  if (b === undefined || b & 0x80) return undefined;
  const shareable = b & 0x40 ? ', shareable' : '';
  if ((b & 0x38) === 0x38) return `DF (directory)${shareable}`;
  const category =
    (b & 0x38) === 0 ? 'working EF' : (b & 0x38) === 0x08 ? 'internal EF' : 'proprietary EF';
  return `${category}, ${EF_STRUCTURES[b & 0x07]}${shareable}`;
}

function shortEfIdentifier(value: Uint8Array): string | undefined {
  if (value.length === 0) return 'none';
  return `SFI ${value[0]! >> 3}`;
}

/** ISO 7816-4 table 13. */
function lifeCycleStatus(value: Uint8Array): string | undefined {
  const b = value[0];
  if (b === undefined) return undefined;
  if (b === 0x00) return 'no information';
  if (b === 0x01) return 'creation';
  if (b === 0x03) return 'initialisation';
  if ((b & 0xfd) === 0x05) return 'operational, activated';
  if ((b & 0xfd) === 0x04) return 'operational, deactivated';
  if ((b & 0xfc) === 0x0c) return 'terminated';
  return 'proprietary';
}
