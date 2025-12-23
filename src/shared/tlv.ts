import type { TlvNode } from './types';
import { getTagDescription, isConstructedTag, isMultiByteTag } from './emv-tags';

/**
 * Parse a hex string into a byte array
 */
export function hexToBytes(hex: string): number[] {
  const cleanHex = hex.replace(/\s/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
  }
  return bytes;
}

/**
 * Format a byte array as hex string
 */
export function bytesToHex(bytes: number[]): string {
  return bytes
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Parse TLV data from a byte array
 * @param data - Byte array containing TLV encoded data
 * @returns Array of parsed TLV nodes
 */
export function parseTlv(data: number[]): TlvNode[] {
  const nodes: TlvNode[] = [];
  let offset = 0;

  while (offset < data.length) {
    // Skip null padding bytes
    if (data[offset] === 0x00 || data[offset] === 0xff) {
      offset++;
      continue;
    }

    try {
      const result = parseTlvNode(data, offset);
      if (result) {
        nodes.push(result.node);
        offset = result.nextOffset;
      } else {
        break;
      }
    } catch {
      // Stop parsing on error
      break;
    }
  }

  return nodes;
}

/**
 * Parse a single TLV node starting at the given offset
 */
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
    // Multi-byte tag - read subsequent bytes until bit 8 is 0
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
    // One byte length follows
    if (offset + 1 >= data.length) return null;
    length = data[offset + 1];
    lengthBytes = 2;
  } else if (length === 0x82) {
    // Two byte length follows
    if (offset + 2 >= data.length) return null;
    length = (data[offset + 1] << 8) | data[offset + 2];
    lengthBytes = 3;
  } else if (length === 0x83) {
    // Three byte length follows
    if (offset + 3 >= data.length) return null;
    length = (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    lengthBytes = 4;
  } else if (length > 0x83) {
    // Invalid length encoding
    return null;
  }

  offset += lengthBytes;

  if (offset + length > data.length) {
    // Not enough data - adjust length to available data
    length = data.length - offset;
  }

  // Parse value
  const valueBytes = data.slice(offset, offset + length);
  const isConstructed = isConstructedTag(firstByte);

  const node: TlvNode = {
    tag,
    tagHex,
    length,
    value: isConstructed ? parseTlv(valueBytes) : valueBytes,
    isConstructed,
    description: getTagDescription(tagHex),
  };

  return {
    node,
    nextOffset: offset + length,
  };
}

/**
 * Try to decode bytes as ASCII if all characters are printable
 */
export function tryDecodeAscii(bytes: number[]): string | null {
  if (bytes.length === 0) return null;

  // Check if all bytes are printable ASCII (0x20-0x7E)
  const allPrintable = bytes.every((b) => b >= 0x20 && b <= 0x7e);
  if (allPrintable) {
    return String.fromCharCode(...bytes);
  }
  return null;
}

/**
 * Parse TLV from hex string
 */
export function parseTlvFromHex(hex: string): TlvNode[] {
  const bytes = hexToBytes(hex);
  return parseTlv(bytes);
}

/**
 * Find all TLV nodes with the specified tag (recursive)
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
 * Find first TLV node with the specified tag (recursive)
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
