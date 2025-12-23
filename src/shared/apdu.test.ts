import { describe, it, expect } from 'vitest';
import {
  getStatusWordInfo,
  isSuccessStatus,
  formatStatusWord,
  parseHexInput,
  formatHex,
  formatHexSpaced,
} from './apdu';

describe('getStatusWordInfo', () => {
  describe('success statuses', () => {
    it('should recognize 9000 as success', () => {
      const result = getStatusWordInfo(0x90, 0x00);
      expect(result.isSuccess).toBe(true);
      expect(result.meaning).toBe('Success');
    });

    it('should recognize 61XX as success with more data', () => {
      const result = getStatusWordInfo(0x61, 0x10);
      expect(result.isSuccess).toBe(true);
      expect(result.meaning).toBe('More data available (16 bytes)');
    });

    it('should recognize 62XX as warning (state unchanged)', () => {
      const result = getStatusWordInfo(0x62, 0x00);
      expect(result.isSuccess).toBe(true);
      expect(result.meaning).toBe('Warning: state unchanged');
    });

    it('should recognize 63CX as counter warning', () => {
      const result = getStatusWordInfo(0x63, 0xc3);
      expect(result.isSuccess).toBe(true);
      expect(result.meaning).toBe('Warning: counter value 3');
    });
  });

  describe('error statuses', () => {
    it('should recognize 6700 as wrong length', () => {
      const result = getStatusWordInfo(0x67, 0x00);
      expect(result.isSuccess).toBe(false);
      expect(result.meaning).toBe('Wrong length');
    });

    it('should recognize 6982 as security not satisfied', () => {
      const result = getStatusWordInfo(0x69, 0x82);
      expect(result.isSuccess).toBe(false);
      expect(result.meaning).toBe('Security status not satisfied');
    });

    it('should recognize 6985 as conditions not satisfied', () => {
      const result = getStatusWordInfo(0x69, 0x85);
      expect(result.isSuccess).toBe(false);
      expect(result.meaning).toBe('Conditions of use not satisfied');
    });

    it('should recognize 6A82 as file not found', () => {
      const result = getStatusWordInfo(0x6a, 0x82);
      expect(result.isSuccess).toBe(false);
      expect(result.meaning).toBe('File not found');
    });

    it('should recognize 6A83 as record not found', () => {
      const result = getStatusWordInfo(0x6a, 0x83);
      expect(result.isSuccess).toBe(false);
      expect(result.meaning).toBe('Record not found');
    });

    it('should recognize 6A86 as incorrect P1-P2', () => {
      const result = getStatusWordInfo(0x6a, 0x86);
      expect(result.isSuccess).toBe(false);
      expect(result.meaning).toBe('Incorrect P1-P2 parameters');
    });

    it('should recognize 6A88 as referenced data not found', () => {
      const result = getStatusWordInfo(0x6a, 0x88);
      expect(result.isSuccess).toBe(false);
      expect(result.meaning).toBe('Referenced data not found');
    });

    it('should recognize 6CXX as wrong Le with correction', () => {
      const result = getStatusWordInfo(0x6c, 0x20);
      expect(result.isSuccess).toBe(false);
      expect(result.meaning).toBe('Wrong Le length (use 32)');
    });

    it('should recognize 6D00 as instruction not supported', () => {
      const result = getStatusWordInfo(0x6d, 0x00);
      expect(result.isSuccess).toBe(false);
      expect(result.meaning).toBe('Instruction not supported');
    });

    it('should recognize 6E00 as class not supported', () => {
      const result = getStatusWordInfo(0x6e, 0x00);
      expect(result.isSuccess).toBe(false);
      expect(result.meaning).toBe('Class not supported');
    });

    it('should recognize 6F00 as unknown error', () => {
      const result = getStatusWordInfo(0x6f, 0x00);
      expect(result.isSuccess).toBe(false);
      expect(result.meaning).toBe('Unknown error');
    });
  });

  describe('unknown statuses', () => {
    it('should return hex for unknown status', () => {
      const result = getStatusWordInfo(0x99, 0x99);
      expect(result.isSuccess).toBe(false);
      expect(result.meaning).toBe('Unknown status: 9999');
    });
  });
});

describe('isSuccessStatus', () => {
  it('should return true for 0x90', () => {
    expect(isSuccessStatus(0x90)).toBe(true);
  });

  it('should return true for 0x61', () => {
    expect(isSuccessStatus(0x61)).toBe(true);
  });

  it('should return false for error statuses', () => {
    expect(isSuccessStatus(0x6a)).toBe(false);
    expect(isSuccessStatus(0x6c)).toBe(false);
    expect(isSuccessStatus(0x69)).toBe(false);
  });
});

describe('formatStatusWord', () => {
  it('should format status word as uppercase hex', () => {
    expect(formatStatusWord(0x90, 0x00)).toBe('9000');
    expect(formatStatusWord(0x6a, 0x82)).toBe('6A82');
    expect(formatStatusWord(0x61, 0x10)).toBe('6110');
  });

  it('should pad single digit values', () => {
    expect(formatStatusWord(0x0a, 0x0b)).toBe('0A0B');
  });
});

describe('parseHexInput', () => {
  it('should parse continuous hex string', () => {
    expect(parseHexInput('00A40400')).toEqual([0x00, 0xa4, 0x04, 0x00]);
    expect(parseHexInput('AABBCCDD')).toEqual([0xaa, 0xbb, 0xcc, 0xdd]);
  });

  it('should handle lowercase', () => {
    expect(parseHexInput('aabbccdd')).toEqual([0xaa, 0xbb, 0xcc, 0xdd]);
  });

  it('should handle spaces', () => {
    expect(parseHexInput('00 A4 04 00')).toEqual([0x00, 0xa4, 0x04, 0x00]);
    expect(parseHexInput('AA BB CC DD')).toEqual([0xaa, 0xbb, 0xcc, 0xdd]);
  });

  it('should handle 0x prefixes', () => {
    expect(parseHexInput('0x00 0xA4 0x04 0x00')).toEqual([0x00, 0xa4, 0x04, 0x00]);
    expect(parseHexInput('0x00A40400')).toEqual([0x00, 0xa4, 0x04, 0x00]);
  });

  it('should handle commas', () => {
    expect(parseHexInput('00,A4,04,00')).toEqual([0x00, 0xa4, 0x04, 0x00]);
    expect(parseHexInput('0x00, 0xA4, 0x04, 0x00')).toEqual([0x00, 0xa4, 0x04, 0x00]);
  });

  it('should return null for invalid hex characters', () => {
    expect(parseHexInput('GHIJ')).toBeNull();
    expect(parseHexInput('00A4XX00')).toBeNull();
  });

  it('should return null for odd-length strings', () => {
    expect(parseHexInput('00A')).toBeNull();
    expect(parseHexInput('ABC')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseHexInput('')).toBeNull();
  });

  it('should return null for whitespace only', () => {
    expect(parseHexInput('   ')).toBeNull();
  });
});

describe('formatHex', () => {
  it('should format bytes as uppercase hex', () => {
    expect(formatHex([0x00, 0xa4, 0x04, 0x00])).toBe('00A40400');
    expect(formatHex([0xaa, 0xbb, 0xcc])).toBe('AABBCC');
  });

  it('should pad single digit values', () => {
    expect(formatHex([0x01, 0x02, 0x0f])).toBe('01020F');
  });

  it('should handle empty array', () => {
    expect(formatHex([])).toBe('');
  });
});

describe('formatHexSpaced', () => {
  it('should format bytes with spaces', () => {
    expect(formatHexSpaced([0x00, 0xa4, 0x04, 0x00])).toBe('00 A4 04 00');
    expect(formatHexSpaced([0xaa, 0xbb, 0xcc])).toBe('AA BB CC');
  });

  it('should handle single byte', () => {
    expect(formatHexSpaced([0x42])).toBe('42');
  });

  it('should handle empty array', () => {
    expect(formatHexSpaced([])).toBe('');
  });
});
