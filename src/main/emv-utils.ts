import type { TlvNode } from '../shared/types';

/**
 * EMV Tag Dictionary for the main process
 */
export const EMV_TAGS: Record<string, string> = {
  '4F': 'AID',
  '50': 'APP LABEL',
  '57': 'TRACK 2',
  '5A': 'PAN',
  '5F20': 'CARDHOLDER NAME',
  '5F24': 'APP EXPIRY',
  '5F25': 'APP EFFECTIVE',
  '5F28': 'ISSUER COUNTRY CODE',
  '5F2A': 'TRANSACTION CURRENCY CODE',
  '5F2D': 'LANGUAGE PREFERENCE',
  '5F30': 'SERVICE CODE',
  '5F34': 'PAN SEQUENCE NUMBER',
  '5F36': 'TRANSACTION CURRENCY EXPONENT',
  '5F50': 'ISSUER URL',
  '61': 'APPLICATION TEMPLATE',
  '6F': 'FCI TEMPLATE',
  '70': 'EMV PROPRIETARY TEMPLATE',
  '71': 'ISSUER SCRIPT TEMPLATE 1',
  '72': 'ISSUER SCRIPT TEMPLATE 2',
  '73': 'DIRECTORY DISCRETIONARY TEMPLATE',
  '77': 'RESPONSE TEMPLATE 2',
  '80': 'RESPONSE TEMPLATE 1',
  '81': 'AUTH AMOUNT BIN',
  '82': 'AIP',
  '83': 'COMMAND TEMPLATE',
  '84': 'DF NAME',
  '86': 'ISSUER SCRIPT CMD',
  '87': 'APP PRIORITY',
  '88': 'SFI',
  '89': 'AUTH IDENTIFICATION RESPONSE',
  '8A': 'AUTH RESPONSE CODE',
  '8C': 'CDOL 1',
  '8D': 'CDOL 2',
  '8E': 'CVM LIST',
  '8F': 'CA PK INDEX',
  '90': 'ISSUER PK CERTIFICATE',
  '91': 'ISSUER AUTH DATA',
  '92': 'ISSUER PK REMAINDER',
  '93': 'SIGNED STATIC APP DATA',
  '94': 'AFL',
  '95': 'TVR',
  '98': 'TC HASH VALUE',
  '99': 'TRANSACTION PIN DATA',
  '9A': 'TRANSACTION DATE',
  '9B': 'TSI',
  '9C': 'TRANSACTION TYPE',
  '9D': 'DDF NAME',
  '9F01': 'ACQUIRER ID',
  '9F02': 'AUTH AMOUNT NUM',
  '9F03': 'OTHER AMOUNT NUM',
  '9F04': 'OTHER AMOUNT BIN',
  '9F05': 'APP DISCRETIONARY DATA',
  '9F06': 'AID TERMINAL',
  '9F07': 'AUC',
  '9F08': 'APP VERSION NUMBER',
  '9F09': 'APP VERSION NUMBER TERMINAL',
  '9F0D': 'IAC DEFAULT',
  '9F0E': 'IAC DENIAL',
  '9F0F': 'IAC ONLINE',
  '9F10': 'IAD',
  '9F11': 'ISSUER CODE TABLE IDX',
  '9F12': 'APP PREFERRED NAME',
  '9F13': 'LAST ONLINE ATC',
  '9F14': 'LOWER OFFLINE LIMIT',
  '9F15': 'MERCHANT CATEGORY CODE',
  '9F16': 'MERCHANT ID',
  '9F17': 'PIN TRY COUNT',
  '9F18': 'ISSUER SCRIPT ID',
  '9F1A': 'TERMINAL COUNTRY CODE',
  '9F1B': 'TERMINAL FLOOR LIMIT',
  '9F1C': 'TERMINAL ID',
  '9F1D': 'TRM DATA',
  '9F1E': 'IFD SERIAL NUM',
  '9F1F': 'TRACK 1 DD',
  '9F21': 'TRANSACTION TIME',
  '9F22': 'CA PK INDEX TERM',
  '9F23': 'UPPER OFFLINE LIMIT',
  '9F26': 'AC',
  '9F27': 'CID',
  '9F2D': 'ICC PIN ENCIPHERMENT PK CERT',
  '9F32': 'ISSUER PK EXPONENT',
  '9F33': 'TERMINAL CAPABILITIES',
  '9F34': 'CVM RESULTS',
  '9F35': 'TERMINAL TYPE',
  '9F36': 'ATC',
  '9F37': 'UNPREDICTABLE NUMBER',
  '9F38': 'PDOL',
  '9F39': 'POS ENTRY MODE',
  '9F3A': 'AMOUNT REF CURRENCY',
  '9F3B': 'APP REF CURRENCY',
  '9F3C': 'TRANSACTION REF CURRENCY CODE',
  '9F3D': 'TRANSACTION REF CURRENCY EXPONENT',
  '9F40': 'ADDITIONAL TERMINAL CAPABILITIES',
  '9F41': 'TRANSACTION SEQUENCE COUNTER',
  '9F42': 'APP CURRENCY CODE',
  '9F43': 'APP REF CURRENCY EXPONENT',
  '9F44': 'APP CURRENCY EXPONENT',
  '9F45': 'DATA AUTH CODE',
  '9F46': 'ICC PK CERTIFICATE',
  '9F47': 'ICC PK EXPONENT',
  '9F48': 'ICC PK REMAINDER',
  '9F49': 'DDOL',
  '9F4A': 'SDA TAG LIST',
  '9F4C': 'ICC DYNAMIC NUMBER',
  A5: 'FCI PROPRIETARY TEMPLATE',
  BF0C: 'FCI ISSUER DD',
};

/**
 * Format bytes as hex string
 */
export function bytesToHex(bytes: number[] | Buffer): string {
  if (Buffer.isBuffer(bytes)) {
    return bytes.toString('hex').toUpperCase();
  }
  return bytes
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Check if a tag is a constructed tag (contains other TLV objects)
 */
function isConstructedTag(tagByte: number): boolean {
  return (tagByte & 0x20) !== 0;
}

/**
 * Check if tag has multiple bytes
 */
function isMultiByteTag(tagByte: number): boolean {
  return (tagByte & 0x1f) === 0x1f;
}

/**
 * Parse TLV data from a buffer or byte array
 */
export function parseTlv(data: Buffer | number[]): TlvNode[] {
  const bytes = Buffer.isBuffer(data) ? Array.from(data) : data;
  const nodes: TlvNode[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    // Skip null padding bytes
    if (bytes[offset] === 0x00 || bytes[offset] === 0xff) {
      offset++;
      continue;
    }

    try {
      const result = parseTlvNode(bytes, offset);
      if (result) {
        nodes.push(result.node);
        offset = result.nextOffset;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  return nodes;
}

function parseTlvNode(
  data: number[],
  offset: number
): { node: TlvNode; nextOffset: number } | null {
  if (offset >= data.length) {
    return null;
  }

  // Parse tag
  let tag = data[offset];
  let tagLength = 1;
  const firstByte = tag;

  // Check for multi-byte tag
  if (isMultiByteTag(firstByte)) {
    do {
      tagLength++;
      if (offset + tagLength > data.length) {
        return null;
      }
      tag = (tag << 8) | data[offset + tagLength - 1];
    } while ((data[offset + tagLength - 1] & 0x80) !== 0 && tagLength < 4);
  }

  const tagHex = bytesToHex(data.slice(offset, offset + tagLength));
  offset += tagLength;

  if (offset >= data.length) {
    return null;
  }

  // Parse length
  let length = data[offset];
  let lengthBytes = 1;

  if (length === 0x81) {
    if (offset + 1 >= data.length) return null;
    length = data[offset + 1];
    lengthBytes = 2;
  } else if (length === 0x82) {
    if (offset + 2 >= data.length) return null;
    length = (data[offset + 1] << 8) | data[offset + 2];
    lengthBytes = 3;
  } else if (length === 0x83) {
    if (offset + 3 >= data.length) return null;
    length = (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    lengthBytes = 4;
  } else if (length > 0x83) {
    return null;
  }

  offset += lengthBytes;

  if (offset + length > data.length) {
    length = data.length - offset;
  }

  const valueBytes = data.slice(offset, offset + length);
  const isConstructed = isConstructedTag(firstByte);

  const node: TlvNode = {
    tag,
    tagHex,
    length,
    value: isConstructed ? parseTlv(valueBytes) : valueBytes,
    isConstructed,
    description: EMV_TAGS[tagHex],
  };

  return {
    node,
    nextOffset: offset + length,
  };
}

/**
 * Find all TLV nodes with the specified tag
 */
export function findTags(nodes: TlvNode[], tag: number): TlvNode[] {
  const found: TlvNode[] = [];

  for (const node of nodes) {
    if (node.tag === tag) {
      found.push(node);
    }
    if (node.isConstructed && Array.isArray(node.value)) {
      found.push(...findTags(node.value as TlvNode[], tag));
    }
  }

  return found;
}

/**
 * Find first TLV node with the specified tag
 */
export function findTag(nodes: TlvNode[], tag: number): TlvNode | undefined {
  for (const node of nodes) {
    if (node.tag === tag) {
      return node;
    }
    if (node.isConstructed && Array.isArray(node.value)) {
      const found = findTag(node.value as TlvNode[], tag);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Get the value bytes from a TLV node
 */
export function getValueBytes(node: TlvNode): number[] {
  if (node.isConstructed) {
    return [];
  }
  return node.value as number[];
}

/**
 * Get the value as hex string from a TLV node
 */
export function getValueHex(node: TlvNode): string {
  return bytesToHex(getValueBytes(node));
}
