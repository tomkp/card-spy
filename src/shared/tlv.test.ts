import { describe, it, expect } from 'vitest';
import { fromHex, toHex } from './hex';
import {
  encodeTlv,
  encodeTlvTree,
  findAllTlv,
  findTlv,
  looksLikeTlv,
  parseTlv,
  readTag,
} from './tlv';

// PPSE response FCI: 6F > 84 (2PAY.SYS.DDF01), A5 > BF0C > 61 > 4F (Visa AID), 87 (priority 1)
const PPSE_FCI = fromHex(
  '6F23 840E325041592E5359532E4444463031 A511 BF0C0E 610C 4F07A0000000031010 870101',
);

describe('parseTlv', () => {
  it('parses a nested FCI with absolute offsets', () => {
    const { nodes, error } = parseTlv(PPSE_FCI);
    expect(error).toBeUndefined();
    expect(nodes).toHaveLength(1);
    const fci = nodes[0]!;
    expect(fci).toMatchObject({
      tag: 0x6f,
      tagHex: '6F',
      cls: 'application',
      constructed: true,
      length: 0x23,
      offset: 0,
      headerLength: 2,
    });
    const dfName = fci.children![0]!;
    expect(dfName).toMatchObject({ tagHex: '84', offset: 2, length: 14 });
    const aid = findTlv(nodes, '4F')!;
    expect(toHex(aid.value)).toBe('A0000000031010');
    expect(aid.offset).toBe(PPSE_FCI.indexOf(0x4f));
    expect(findTlv(nodes, 0xbf0c)?.cls).toBe('context');
    expect(findTlv(nodes, 0x87)?.value[0]).toBe(1);
  });

  it('reads multi-byte tags and long lengths', () => {
    expect(readTag(fromHex('9F27'), 0)).toMatchObject({ tag: 0x9f27, tagHex: '9F27', size: 2 });
    expect(readTag(fromHex('5F'), 0)).toBeUndefined();
    const long = new Uint8Array(200).fill(0xaa);
    const encoded = encodeTlv('9F46', long);
    expect(toHex(encoded.subarray(0, 4))).toBe('9F4681C8');
    const { nodes } = parseTlv(encoded);
    expect(nodes[0]).toMatchObject({ tag: 0x9f46, length: 200, headerLength: 4 });
    expect(toHex(encodeTlv('70', new Uint8Array(300)).subarray(0, 4))).toBe('7082012C');
  });

  it('skips padding by default', () => {
    expect(parseTlv(fromHex('00 5A0247 61 FF 00')).nodes.map((n) => n.tagHex)).toEqual(['5A']);
    expect(
      parseTlv(fromHex('5A0147 0000'), { skipPadding: false }).nodes.map((n) => n.tagHex),
    ).toEqual(['5A', '00']);
  });

  it('honours baseOffset', () => {
    const { nodes } = parseTlv(fromHex('700357 0112'), { baseOffset: 10 });
    expect(nodes[0]!.offset).toBe(10);
    expect(nodes[0]!.children![0]!.offset).toBe(12);
  });

  it('reports truncation without throwing', () => {
    const result = parseTlv(fromHex('5A0847617390'));
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.value).toHaveLength(4);
    expect(result.nodes[0]!.error).toMatch(/expected 8 bytes, got 4/);
    expect(result.error?.offset).toBe(0);
    expect(parseTlv(fromHex('5A')).error?.message).toMatch(/Missing length/);
    expect(parseTlv(fromHex('5A80')).error?.message).toMatch(/Indefinite/);
  });

  it('keeps children parsed before a bad child', () => {
    const { nodes, error } = parseTlv(fromHex('7006 5A0147 9F2705'));
    expect(error).toBeUndefined();
    expect(nodes[0]!.children!.map((n) => n.tagHex)).toEqual(['5A', '9F27']);
    expect(nodes[0]!.error).toMatch(/truncated/);
  });

  it('finds every match', () => {
    const { nodes } = parseTlv(fromHex('70 0A 61 03 4F 01 01 61 03 4F 01 02'));
    expect(findAllTlv(nodes, '4F').map((n) => n.value[0])).toEqual([1, 2]);
    expect(findTlv(nodes, 0x99)).toBeUndefined();
  });
});

describe('looksLikeTlv', () => {
  it('accepts clean TLV and rejects the rest', () => {
    expect(looksLikeTlv(PPSE_FCI)).toBe(true);
    expect(looksLikeTlv(fromHex('414243'))).toBe(false);
    expect(looksLikeTlv(fromHex('0000'))).toBe(false);
    expect(looksLikeTlv(fromHex('7006 5A0147 9F2705'))).toBe(false);
    expect(looksLikeTlv(new Uint8Array())).toBe(false);
  });
});

describe('encodeTlvTree', () => {
  it('round-trips the PPSE FCI', () => {
    const built = encodeTlvTree([
      {
        tag: '6F',
        children: [
          { tag: '84', value: fromHex('325041592E5359532E4444463031') },
          {
            tag: 'A5',
            children: [
              {
                tag: 'BF0C',
                children: [
                  {
                    tag: '61',
                    children: [
                      { tag: '4F', value: fromHex('A0000000031010') },
                      { tag: 0x87, value: fromHex('01') },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    expect(toHex(built)).toBe(toHex(PPSE_FCI));
  });
});
