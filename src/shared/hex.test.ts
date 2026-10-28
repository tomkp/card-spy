import { describe, it, expect } from 'vitest';
import {
  asciiToBytes,
  bytesEqual,
  concatBytes,
  fromHex,
  isHex,
  isPrintable,
  normalizeHex,
  toAscii,
  toBytes,
  toHex,
  toUint,
} from './hex';

describe('hex', () => {
  it('formats bytes as upper-case hex with an optional separator', () => {
    expect(toHex([0x00, 0xa4, 0x04])).toBe('00A404');
    expect(toHex(Uint8Array.of(0x00, 0xa4), ' ')).toBe('00 A4');
    expect(toHex([])).toBe('');
  });

  it('parses the formats people paste', () => {
    const expected = [0x00, 0xa4, 0x04, 0x00];
    for (const input of [
      '00A40400',
      '00 a4 04 00',
      '0x00, 0xA4, 0x04, 0x00',
      '00:A4:04:00',
      '00a4\n0400',
    ]) {
      expect([...fromHex(input)]).toEqual(expected);
    }
  });

  it('strips comments', () => {
    expect(toHex(fromHex('00 A4 # select\n04 00 // by name'))).toBe('00A40400');
  });

  it('rejects bad input', () => {
    expect(() => fromHex('00A')).toThrow(/Odd/);
    expect(() => fromHex('00G0')).toThrow(/Invalid hex character 'G'/);
    expect(isHex('0x0A')).toBe(true);
    expect(isHex('zz')).toBe(false);
    expect(normalizeHex('0xab cd')).toBe('ABCD');
  });

  it('converts between forms', () => {
    expect([...toBytes('0102')]).toEqual([1, 2]);
    expect([...toBytes([3, 4])]).toEqual([3, 4]);
    expect([...concatBytes([1], Uint8Array.of(2, 3), [])]).toEqual([1, 2, 3]);
    expect(bytesEqual([1, 2], Uint8Array.of(1, 2))).toBe(true);
    expect(bytesEqual([1, 2], [1, 3])).toBe(false);
    expect(bytesEqual([1], [1, 2])).toBe(false);
    expect(toUint([0x01, 0x00])).toBe(256);
    expect(toUint([])).toBe(0);
  });

  it('handles ASCII', () => {
    expect(toAscii(asciiToBytes('VISA\x00'))).toBe('VISA.');
    expect(isPrintable(asciiToBytes('2PAY.SYS.DDF01'))).toBe(true);
    expect(isPrintable([0x41, 0x00])).toBe(false);
    expect(isPrintable([])).toBe(false);
  });
});
