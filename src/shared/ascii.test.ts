import { describe, it, expect } from 'vitest';
import {
  isPrintableAscii,
  isAllPrintableAscii,
  tryDecodeAscii,
  decodeAsciiWithPlaceholder,
  encodeAscii,
  isAsciiString,
  isPrintableAsciiString,
  getControlCharName,
  ASCII_PRINTABLE_MIN,
  ASCII_PRINTABLE_MAX,
} from './ascii';

describe('isPrintableAscii', () => {
  it('should return true for printable characters', () => {
    expect(isPrintableAscii(0x20)).toBe(true); // Space
    expect(isPrintableAscii(0x41)).toBe(true); // 'A'
    expect(isPrintableAscii(0x7a)).toBe(true); // 'z'
    expect(isPrintableAscii(0x7e)).toBe(true); // '~'
    expect(isPrintableAscii(0x30)).toBe(true); // '0'
  });

  it('should return false for control characters', () => {
    expect(isPrintableAscii(0x00)).toBe(false); // NUL
    expect(isPrintableAscii(0x09)).toBe(false); // TAB
    expect(isPrintableAscii(0x0a)).toBe(false); // LF
    expect(isPrintableAscii(0x0d)).toBe(false); // CR
    expect(isPrintableAscii(0x1f)).toBe(false); // US
  });

  it('should return false for DEL and above', () => {
    expect(isPrintableAscii(0x7f)).toBe(false); // DEL
    expect(isPrintableAscii(0x80)).toBe(false);
    expect(isPrintableAscii(0xff)).toBe(false);
  });
});

describe('isAllPrintableAscii', () => {
  it('should return true for all printable bytes', () => {
    expect(isAllPrintableAscii([0x48, 0x65, 0x6c, 0x6c, 0x6f])).toBe(true); // "Hello"
    expect(isAllPrintableAscii([0x20, 0x21, 0x7e])).toBe(true); // " !~"
  });

  it('should return false if any byte is non-printable', () => {
    expect(isAllPrintableAscii([0x48, 0x00, 0x6c])).toBe(false);
    expect(isAllPrintableAscii([0x0a, 0x48])).toBe(false);
  });

  it('should return false for empty array', () => {
    expect(isAllPrintableAscii([])).toBe(false);
  });
});

describe('tryDecodeAscii', () => {
  it('should decode printable ASCII', () => {
    expect(tryDecodeAscii([0x48, 0x65, 0x6c, 0x6c, 0x6f])).toBe('Hello');
    expect(tryDecodeAscii([0x56, 0x49, 0x53, 0x41])).toBe('VISA');
  });

  it('should return null for non-printable bytes', () => {
    expect(tryDecodeAscii([0x48, 0x00, 0x6c])).toBeNull();
    expect(tryDecodeAscii([0x7f])).toBeNull();
  });

  it('should return null for empty array', () => {
    expect(tryDecodeAscii([])).toBeNull();
  });

  it('should handle space and special printable chars', () => {
    expect(tryDecodeAscii([0x48, 0x20, 0x49])).toBe('H I');
    expect(tryDecodeAscii([0x21, 0x40, 0x23])).toBe('!@#');
  });
});

describe('decodeAsciiWithPlaceholder', () => {
  it('should replace non-printable with dots', () => {
    expect(decodeAsciiWithPlaceholder([0x48, 0x00, 0x6c, 0x6c, 0x6f])).toBe('H.llo');
    expect(decodeAsciiWithPlaceholder([0x00, 0x00, 0x00])).toBe('...');
  });

  it('should use custom placeholder', () => {
    expect(decodeAsciiWithPlaceholder([0x48, 0x00, 0x6c], '?')).toBe('H?l');
    expect(decodeAsciiWithPlaceholder([0x00, 0x41], '_')).toBe('_A');
  });

  it('should handle all printable bytes', () => {
    expect(decodeAsciiWithPlaceholder([0x48, 0x65, 0x6c, 0x6c, 0x6f])).toBe('Hello');
  });

  it('should handle empty array', () => {
    expect(decodeAsciiWithPlaceholder([])).toBe('');
  });
});

describe('encodeAscii', () => {
  it('should encode ASCII string to bytes', () => {
    expect(encodeAscii('Hello')).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    expect(encodeAscii('VISA')).toEqual([0x56, 0x49, 0x53, 0x41]);
  });

  it('should handle special characters', () => {
    expect(encodeAscii(' !@#')).toEqual([0x20, 0x21, 0x40, 0x23]);
  });

  it('should handle empty string', () => {
    expect(encodeAscii('')).toEqual([]);
  });
});

describe('isAsciiString', () => {
  it('should return true for ASCII strings', () => {
    expect(isAsciiString('Hello')).toBe(true);
    expect(isAsciiString('Hello\n')).toBe(true); // LF is ASCII
    expect(isAsciiString('\x00\x7f')).toBe(true); // NUL and DEL are ASCII
  });

  it('should return false for non-ASCII', () => {
    expect(isAsciiString('Héllo')).toBe(false); // é is not ASCII
    expect(isAsciiString('日本語')).toBe(false);
    expect(isAsciiString('€')).toBe(false);
  });

  it('should handle empty string', () => {
    expect(isAsciiString('')).toBe(true);
  });
});

describe('isPrintableAsciiString', () => {
  it('should return true for printable strings', () => {
    expect(isPrintableAsciiString('Hello')).toBe(true);
    expect(isPrintableAsciiString('Hello World!')).toBe(true);
    expect(isPrintableAsciiString(' ~')).toBe(true);
  });

  it('should return false for strings with control chars', () => {
    expect(isPrintableAsciiString('Hello\n')).toBe(false);
    expect(isPrintableAsciiString('Hello\t')).toBe(false);
    expect(isPrintableAsciiString('\x00')).toBe(false);
  });

  it('should handle empty string', () => {
    expect(isPrintableAsciiString('')).toBe(true);
  });
});

describe('getControlCharName', () => {
  it('should return names for control characters', () => {
    expect(getControlCharName(0x00)).toBe('NUL');
    expect(getControlCharName(0x09)).toBe('HT');
    expect(getControlCharName(0x0a)).toBe('LF');
    expect(getControlCharName(0x0d)).toBe('CR');
    expect(getControlCharName(0x1b)).toBe('ESC');
    expect(getControlCharName(0x7f)).toBe('DEL');
  });

  it('should return undefined for non-control chars', () => {
    expect(getControlCharName(0x20)).toBeUndefined();
    expect(getControlCharName(0x41)).toBeUndefined();
    expect(getControlCharName(0x80)).toBeUndefined();
  });
});

describe('constants', () => {
  it('should have correct range values', () => {
    expect(ASCII_PRINTABLE_MIN).toBe(0x20);
    expect(ASCII_PRINTABLE_MAX).toBe(0x7e);
  });
});
