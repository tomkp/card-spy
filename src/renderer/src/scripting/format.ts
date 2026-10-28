import { isPrintable, toAscii, toHex } from '@shared/hex';
import { lookupTag } from '@shared/tags/emv';
import { previewValue } from '@shared/explorer/model';
import { looksLikeTlv, parseTlv, type TlvNode } from '@shared/tlv';

/** How `log()` shows a value: bytes as hex, TLV as an indented tree, responses with their status. */
export function format(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return toHex(value, ' ');
  if (value instanceof Error) return value.message;
  if (isResponse(value)) {
    const head = `${toHex([value.sw1, value.sw2])} ${value.status}`;
    if (value.data.length === 0) return head;
    if (looksLikeTlv(value.data)) return `${head}\n${tlvTree(parseTlv(value.data).nodes)}`;
    return `${head}\n${toHex(value.data, ' ')}${isPrintable(value.data) ? `  "${toAscii(value.data)}"` : ''}`;
  }
  if (isTlvNode(value)) return tlvTree([value]);
  if (Array.isArray(value) && value.length > 0 && value.every(isTlvNode)) return tlvTree(value);
  if (typeof value === 'object' && value !== null) {
    const compact = JSON.stringify(value, replacer);
    return compact.length <= 100 ? compact : JSON.stringify(value, replacer, 2);
  }
  return String(value);
}

export function tlvTree(nodes: TlvNode[], depth = 0, parent?: string): string {
  return nodes
    .map((node) => {
      const indent = '  '.repeat(depth);
      const info = lookupTag(node.tagHex, parent);
      const head = `${indent}${node.tagHex} ${info?.name ?? ''}`.trimEnd();
      if (node.children) return `${head}\n${tlvTree(node.children, depth + 1, node.tagHex)}`;
      return `${head}: ${previewValue(node.tagHex, node.value, info?.format, parent)}`;
    })
    .join('\n');
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) return toHex(value, ' ');
  return value;
}

interface ResponseLike {
  data: Uint8Array;
  sw1: number;
  sw2: number;
  status: string;
}

function isResponse(value: unknown): value is ResponseLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sw1' in value &&
    'sw2' in value &&
    'data' in value &&
    (value as ResponseLike).data instanceof Uint8Array
  );
}

function isTlvNode(value: unknown): value is TlvNode {
  return typeof value === 'object' && value !== null && 'tagHex' in value && 'value' in value;
}
