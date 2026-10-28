import { describe, expect, it } from 'vitest';
import { NodeFactory } from '../explorer/model';
import { fromHex } from '../hex';
import { encodeTlvTree } from '../tlv';
import { decodeTagValue, lookupTag } from './emv';

describe('ISO 7816-4 file control parameters', () => {
  it('uses the ISO meaning only directly inside a file control template', () => {
    expect(lookupTag('82')?.name).toMatch(/Application Interchange Profile/);
    expect(lookupTag('82', '6F')?.name).toBe('File descriptor');
    expect(lookupTag('82', '62')?.name).toBe('File descriptor');
    expect(lookupTag('82', '77')?.name).toMatch(/Application Interchange Profile/);
    // The two tags EMV itself puts in 6F keep their names.
    expect(lookupTag('84', '6F')?.name).toBe(lookupTag('84')?.name);
    expect(lookupTag('A5', '6F')?.name).toBe(lookupTag('A5')?.name);
  });

  it('decodes descriptor, identifier, size, SFI and life cycle', () => {
    expect(decodeTagValue('82', fromHex('38'), '6F')).toBe('DF (directory)');
    expect(decodeTagValue('82', fromHex('01'), '62')).toBe('working EF, transparent');
    expect(decodeTagValue('82', fromHex('42'), '62')).toBe('working EF, linear fixed, shareable');
    expect(decodeTagValue('83', fromHex('5015'), '6F')).toBe('5015 (PKCS#15 application)');
    expect(decodeTagValue('81', fromHex('2000'), '6F')).toBe('8192 bytes');
    expect(decodeTagValue('88', fromHex('08'), '62')).toBe('SFI 1');
    expect(decodeTagValue('8A', fromHex('05'), '6F')).toBe('operational, activated');
    expect(decodeTagValue('8A', fromHex('04'), '6F')).toBe('operational, deactivated');
    expect(decodeTagValue('8A', fromHex('0C'), '6F')).toBe('terminated');
  });

  it('shows a PKCS#15 FCI by its ISO meanings in the explorer', () => {
    const fci = encodeTlvTree([
      {
        tag: '6F',
        children: [
          { tag: '83', value: fromHex('5015') },
          { tag: '82', value: fromHex('38') },
          { tag: '8A', value: fromHex('05') },
          { tag: '81', value: fromHex('2000') },
        ],
      },
    ]);
    const [template] = new NodeFactory().tlv(fci);
    expect(template!.children!.map((n) => `${n.label}: ${n.value}`)).toEqual([
      'File identifier: 5015 (PKCS#15 application)',
      'File descriptor: DF (directory)',
      'Life cycle status: operational, activated',
      'File size (including structural information): 8192 bytes',
    ]);
  });
});
