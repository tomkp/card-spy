import { describe, it, expect } from 'vitest';
import {
  hexToBytes,
  bytesToHex,
  parseTlv,
  parseTlvFromHex,
  tryDecodeAscii,
} from './tlv-parser';

describe('hexToBytes', () => {
  it('should convert hex string to byte array', () => {
    expect(hexToBytes('00')).toEqual([0]);
    expect(hexToBytes('FF')).toEqual([255]);
    expect(hexToBytes('0102030405')).toEqual([1, 2, 3, 4, 5]);
  });

  it('should handle lowercase hex', () => {
    expect(hexToBytes('ff')).toEqual([255]);
    expect(hexToBytes('abcd')).toEqual([0xab, 0xcd]);
  });

  it('should ignore whitespace', () => {
    expect(hexToBytes('01 02 03')).toEqual([1, 2, 3]);
    expect(hexToBytes('AB CD EF')).toEqual([0xab, 0xcd, 0xef]);
  });

  it('should handle empty string', () => {
    expect(hexToBytes('')).toEqual([]);
  });
});

describe('bytesToHex', () => {
  it('should convert byte array to uppercase hex string', () => {
    expect(bytesToHex([0])).toBe('00');
    expect(bytesToHex([255])).toBe('FF');
    expect(bytesToHex([1, 2, 3, 4, 5])).toBe('0102030405');
  });

  it('should handle empty array', () => {
    expect(bytesToHex([])).toBe('');
  });

  it('should pad single digit hex values', () => {
    expect(bytesToHex([0x0f])).toBe('0F');
    expect(bytesToHex([0x01, 0x0a])).toBe('010A');
  });
});

describe('tryDecodeAscii', () => {
  it('should decode printable ASCII', () => {
    expect(tryDecodeAscii([0x48, 0x65, 0x6c, 0x6c, 0x6f])).toBe('Hello');
    expect(tryDecodeAscii([0x41, 0x42, 0x43])).toBe('ABC');
  });

  it('should return null for non-printable characters', () => {
    expect(tryDecodeAscii([0x00, 0x01, 0x02])).toBeNull();
    expect(tryDecodeAscii([0x48, 0x00, 0x6c])).toBeNull();
  });

  it('should return null for empty array', () => {
    expect(tryDecodeAscii([])).toBeNull();
  });

  it('should handle space character (0x20)', () => {
    expect(tryDecodeAscii([0x48, 0x20, 0x49])).toBe('H I');
  });

  it('should reject characters above 0x7E', () => {
    expect(tryDecodeAscii([0x7f])).toBeNull();
    expect(tryDecodeAscii([0x80])).toBeNull();
  });
});

describe('parseTlv', () => {
  it('should parse simple single-byte tag TLV', () => {
    // Tag 50 (APP LABEL), Length 04, Value "VISA"
    const data = [0x50, 0x04, 0x56, 0x49, 0x53, 0x41];
    const result = parseTlv(data);

    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe(0x50);
    expect(result[0].tagHex).toBe('50');
    expect(result[0].length).toBe(4);
    expect(result[0].value).toEqual([0x56, 0x49, 0x53, 0x41]);
    expect(result[0].isConstructed).toBe(false);
    expect(result[0].description).toBe('APP LABEL');
  });

  it('should parse two-byte tag TLV', () => {
    // Tag 9F26 (AC), Length 08, Value (8 bytes)
    const data = [0x9f, 0x26, 0x08, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08];
    const result = parseTlv(data);

    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe(0x9f26);
    expect(result[0].tagHex).toBe('9F26');
    expect(result[0].length).toBe(8);
    expect(result[0].description).toBe('AC');
  });

  it('should parse multiple TLV entries', () => {
    // Tag 50 (APP LABEL) + Tag 5A (PAN)
    const data = [
      0x50, 0x04, 0x56, 0x49, 0x53, 0x41, // 50 04 VISA
      0x5a, 0x08, 0x12, 0x34, 0x56, 0x78, 0x90, 0x12, 0x34, 0x56, // 5A 08 (PAN)
    ];
    const result = parseTlv(data);

    expect(result).toHaveLength(2);
    expect(result[0].tagHex).toBe('50');
    expect(result[1].tagHex).toBe('5A');
    expect(result[1].description).toBe('PAN');
  });

  it('should parse constructed tags with nested TLV', () => {
    // Tag 6F (FCI TEMPLATE) containing Tag 84 (DF NAME) and Tag A5 (FCI PROPRIETARY)
    const data = [
      0x6f, 0x0e, // FCI Template, length 14
      0x84, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10, // DF Name (AID)
      0xa5, 0x03, 0x50, 0x01, 0x41, // FCI Proprietary containing APP LABEL
    ];
    const result = parseTlv(data);

    expect(result).toHaveLength(1);
    expect(result[0].tagHex).toBe('6F');
    expect(result[0].isConstructed).toBe(true);
    expect(Array.isArray(result[0].value)).toBe(true);

    const children = result[0].value as typeof result;
    expect(children).toHaveLength(2);
    expect(children[0].tagHex).toBe('84');
    expect(children[1].tagHex).toBe('A5');
  });

  it('should skip null padding bytes (0x00)', () => {
    const data = [0x00, 0x00, 0x50, 0x01, 0x41, 0x00];
    const result = parseTlv(data);

    expect(result).toHaveLength(1);
    expect(result[0].tagHex).toBe('50');
  });

  it('should skip 0xFF padding bytes', () => {
    const data = [0xff, 0xff, 0x50, 0x01, 0x41];
    const result = parseTlv(data);

    expect(result).toHaveLength(1);
    expect(result[0].tagHex).toBe('50');
  });

  it('should handle extended length encoding (0x81)', () => {
    // Tag 70, Length 0x81 0x80 (128 bytes)
    const value = new Array(128).fill(0xaa);
    const data = [0x70, 0x81, 0x80, ...value];
    const result = parseTlv(data);

    expect(result).toHaveLength(1);
    expect(result[0].length).toBe(128);
  });

  it('should handle two-byte extended length encoding (0x82)', () => {
    // Tag 70, Length 0x82 0x01 0x00 (256 bytes)
    const value = new Array(256).fill(0xbb);
    const data = [0x70, 0x82, 0x01, 0x00, ...value];
    const result = parseTlv(data);

    expect(result).toHaveLength(1);
    expect(result[0].length).toBe(256);
  });

  it('should handle empty data', () => {
    expect(parseTlv([])).toEqual([]);
  });

  it('should handle truncated data gracefully', () => {
    // Incomplete TLV - tag without length
    const data = [0x50];
    const result = parseTlv(data);
    expect(result).toEqual([]);
  });

  it('should handle data shorter than declared length', () => {
    // Tag 50, Length 10, but only 4 bytes of data
    const data = [0x50, 0x0a, 0x56, 0x49, 0x53, 0x41];
    const result = parseTlv(data);

    // Should adjust length to available data
    expect(result).toHaveLength(1);
    expect(result[0].length).toBe(4);
  });
});

describe('parseTlvFromHex', () => {
  it('should parse TLV from hex string', () => {
    const hex = '5004564953415A08123456789012345F';
    const result = parseTlvFromHex(hex);

    expect(result).toHaveLength(2);
    expect(result[0].tagHex).toBe('50');
    expect(result[1].tagHex).toBe('5A');
  });

  it('should handle hex string with spaces', () => {
    const hex = '50 04 56 49 53 41';
    const result = parseTlvFromHex(hex);

    expect(result).toHaveLength(1);
    expect(result[0].tagHex).toBe('50');
  });
});
