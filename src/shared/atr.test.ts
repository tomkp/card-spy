import { describe, it, expect } from 'vitest';
import { fromHex, toHex } from './hex';
import { parseAtr } from './atr';

const fieldNames = (hex: string) => parseAtr(fromHex(hex)).fields.map((f) => f.name);

describe('parseAtr', () => {
  it('decodes a T=0 contact EMV card', () => {
    const atr = parseAtr(fromHex('3B6800000073C84012009000'));
    expect(atr.errors).toEqual([]);
    expect(atr.convention).toBe('direct');
    expect(atr.protocols).toEqual([0]);
    expect(toHex(atr.historical)).toBe('0073C84012009000');
    expect(atr.tck).toBeUndefined();
    expect(atr.summary).toBe('T=0 · direct convention');
    expect(fieldNames('3B6800000073C84012009000')).toEqual([
      'TS',
      'T0',
      'TB1',
      'TC1',
      'Category',
      'Historical bytes',
    ]);
    expect(atr.fields[1]!.description).toBe('TB1 TC1 present; 8 historical bytes');
    expect(atr.fields[3]!.description).toBe('Extra guard time 0 etu');
    expect(atr.fields[4]!.description).toMatch(/Status indicator/);
  });

  it('decodes a T=1 card with TA1, IFSC and BWI/CWI', () => {
    const atr = parseAtr(fromHex('3BF81300008131FE454A434F5076323431B7'));
    expect(atr.errors).toEqual([]);
    expect(atr.protocols).toEqual([1]);
    expect(atr.tck).toBe(0xb7);
    expect(atr.tckValid).toBe(true);
    const byName = Object.fromEntries(atr.fields.map((f) => [f.name, f.description]));
    expect(byName.TA1).toBe('Fi=372, Di=4 (f max 5 MHz)');
    expect(byName.TD1).toBe('TD2 present; protocol T=1');
    expect(byName.TD2).toBe('TA3 TB3 present; protocol T=1');
    expect(byName.TA3).toBe('IFSC 254 bytes');
    expect(byName.TB3).toBe('BWI=4, CWI=5');
    expect(byName['Historical bytes']).toContain('"COPv241"');
    expect(atr.fields.at(-1)).toMatchObject({
      name: 'TCK',
      offset: 17,
      description: 'Check byte (valid)',
    });
    expect(atr.summary).toBe('T=1 · direct convention');
  });

  it('flags a bad TCK', () => {
    const atr = parseAtr(fromHex('3BF81300008131FE454A434F5076323431B8'));
    expect(atr.tckValid).toBe(false);
    expect(atr.errors).toContain('TCK check failed');
  });

  it('recognises a PC/SC contactless storage card (ACR122U with NTAG)', () => {
    const atr = parseAtr(fromHex('3B8F8001804F0CA0000003060300030000000068'));
    expect(atr.errors).toEqual([]);
    expect(atr.contactless).toEqual({
      standard: 'ISO 14443 A, part 3',
      cardName: 'MIFARE Ultralight / NTAG',
      cardNameCode: 3,
    });
    expect(atr.tckValid).toBe(true);
    expect(atr.summary).toBe('Contactless · MIFARE Ultralight / NTAG');
    expect(fieldNames('3B8F8001804F0CA0000003060300030000000068')).toEqual([
      'TS',
      'T0',
      'TD1',
      'TD2',
      'Category',
      'AID tag',
      'RID',
      'Standard',
      'Card name',
      'RFU',
      'TCK',
    ]);
  });

  it('recognises MIFARE Classic 1K', () => {
    expect(
      parseAtr(fromHex('3B8F8001804F0CA000000306030001000000006A')).contactless?.cardName,
    ).toBe('MIFARE Classic 1K');
  });

  it('treats other PC/SC contactless ATRs as ISO 14443-4', () => {
    // 3B 8n 80 01 + ATS historical bytes + TCK
    const bytes = fromHex('3B8180018080');
    const atr = parseAtr(bytes);
    expect(atr.contactless?.standard).toBe('ISO 14443-4');
    expect(atr.tckValid).toBe(true);
    expect(atr.protocols).toEqual([0, 1]);
  });

  it('never throws on junk', () => {
    expect(parseAtr(new Uint8Array()).errors[0]).toMatch(/too short/);
    expect(parseAtr(fromHex('12')).summary).toBe('Invalid ATR');
    expect(parseAtr(fromHex('3BF0')).errors[0]).toMatch(/Truncated at TA1/);
    expect(parseAtr(fromHex('3B02')).errors[0]).toMatch(/Expected 2 historical bytes/);
    expect(parseAtr(fromHex('3B000102')).errors[0]).toMatch(/2 unexpected trailing bytes/);
    expect(parseAtr(fromHex('3F00')).convention).toBe('inverse');
    expect(parseAtr(fromHex('3C00')).errors[0]).toMatch(/Unknown TS/);
  });
});
