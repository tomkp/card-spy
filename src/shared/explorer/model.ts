import { isPrintable, toAscii, toHex } from '../hex';
import { decodeTagValue, lookupTag } from '../tags/emv';
import { parseTlv, type TlvNode } from '../tlv';

export type ExplorerNodeKind =
  'card' | 'section' | 'application' | 'record' | 'tlv' | 'data' | 'ndef' | 'info' | 'error';

/** One row in the explorer tree. Plain data, so it can be built anywhere and rendered by the UI. */
export interface ExplorerNode {
  id: string;
  kind: ExplorerNodeKind;
  label: string;
  /** Short value shown beside the label. */
  value?: string;
  /** Bytes the inspector shows as a hex dump (and as TLV when they parse). */
  bytes?: Uint8Array;
  /** Tag for TLV nodes, so the inspector can name and decode it. */
  tag?: string;
  children?: ExplorerNode[];
}

export class NodeFactory {
  private next = 1;

  node(
    kind: ExplorerNodeKind,
    label: string,
    extra: Partial<Omit<ExplorerNode, 'id' | 'kind' | 'label'>> = {},
  ): ExplorerNode {
    return { id: `n${this.next++}`, kind, label, ...extra };
  }

  /** Each TLV object becomes a node named from the tag dictionary, with a readable value where possible. */
  tlv(bytes: Uint8Array): ExplorerNode[] {
    const { nodes, error } = parseTlv(bytes);
    const out = nodes.map((n) => this.tlvNode(bytes, n));
    if (error)
      out.push(
        this.node('error', 'Unparsed bytes', {
          value: error.message,
          bytes: bytes.subarray(error.offset),
        }),
      );
    return out;
  }

  private tlvNode(source: Uint8Array, n: TlvNode): ExplorerNode {
    const info = lookupTag(n.tagHex);
    const whole = source.subarray(n.offset, n.offset + n.headerLength + n.value.length);
    const children = n.children?.map((c) => this.tlvNode(source, c));
    return this.node('tlv', info?.name ?? `Tag ${n.tagHex}`, {
      tag: n.tagHex,
      bytes: whole,
      ...(children ? { children } : { value: previewValue(n.tagHex, n.value, info?.format) }),
    });
  }
}

export function previewValue(tag: string, value: Uint8Array, format?: string): string {
  const decoded = decodeTagValue(tag, value);
  if (decoded !== undefined) return decoded;
  if ((format === 'an' || format === 'ans') && isPrintable(value)) return toAscii(value);
  return shortHex(value);
}

export function shortHex(bytes: Uint8Array, max = 24): string {
  return bytes.length > max
    ? `${toHex(bytes.subarray(0, max), ' ')} … (${bytes.length} bytes)`
    : toHex(bytes, ' ');
}
