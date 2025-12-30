import { describe, it, expect } from 'vitest';
import {
  buildVerifyPinApdu,
  buildGetDataApdu,
  PinEncoding,
} from './command-utils';

describe('command-utils', () => {
  describe('buildVerifyPinApdu', () => {
    it('should build ASCII-encoded PIN APDU with 0xFF padding (PIV style)', () => {
      const apdu = buildVerifyPinApdu('123456', {
        encoding: PinEncoding.ASCII,
        padByte: 0xff,
        padLength: 8,
        p2: 0x80,
      });

      // VERIFY: 00 20 00 80 08 [PIN padded to 8 bytes]
      expect(apdu).toEqual([
        0x00, 0x20, 0x00, 0x80, 0x08,
        0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0xff, 0xff,
      ]);
    });

    it('should build ASCII-encoded PIN APDU without padding (OpenPGP style)', () => {
      const apdu = buildVerifyPinApdu('123456', {
        encoding: PinEncoding.ASCII,
        p2: 0x81,
      });

      // VERIFY: 00 20 00 81 06 [PIN]
      expect(apdu).toEqual([
        0x00, 0x20, 0x00, 0x81, 0x06,
        0x31, 0x32, 0x33, 0x34, 0x35, 0x36,
      ]);
    });

    it('should build BCD-encoded PIN APDU (SIM style)', () => {
      const apdu = buildVerifyPinApdu('1234', {
        encoding: PinEncoding.BCD,
        padByte: 0xff,
        padLength: 8,
        p2: 0x01,
        cla: 0xa0,
      });

      // VERIFY with SIM class byte: A0 20 00 01 08 [BCD PIN]
      // BCD: 0x21 0x43 0xFF 0xFF 0xFF 0xFF 0xFF 0xFF
      expect(apdu[0]).toBe(0xa0); // SIM class byte
      expect(apdu[1]).toBe(0x20); // VERIFY instruction
      expect(apdu[4]).toBe(0x08); // 8 bytes of PIN data
    });

    it('should use custom CLA byte when specified', () => {
      const apdu = buildVerifyPinApdu('1234', {
        encoding: PinEncoding.ASCII,
        cla: 0x00,
        p2: 0x80,
      });

      expect(apdu[0]).toBe(0x00);
    });
  });

  describe('buildGetDataApdu', () => {
    describe('PIV style (tag in data field)', () => {
      it('should build GET DATA with tag in 5C TLV wrapper', () => {
        const apdu = buildGetDataApdu('5FC102', { style: 'piv' });

        // GET DATA: 00 CB 3F FF Lc [5C len tag] Le
        expect(apdu).toEqual([
          0x00, 0xcb, 0x3f, 0xff,
          0x05, // Lc = 5 (5C + len + 3 tag bytes)
          0x5c, 0x03, 0x5f, 0xc1, 0x02,
          0x00, // Le
        ]);
      });

      it('should handle short tags', () => {
        const apdu = buildGetDataApdu('7E', { style: 'piv' });

        expect(apdu).toEqual([
          0x00, 0xcb, 0x3f, 0xff,
          0x03, // Lc = 3 (5C + len + 1 tag byte)
          0x5c, 0x01, 0x7e,
          0x00,
        ]);
      });
    });

    describe('OpenPGP style (tag in P1P2)', () => {
      it('should build GET DATA with 2-byte tag in P1P2', () => {
        const apdu = buildGetDataApdu('5F50', { style: 'openpgp' });

        // GET DATA: 00 CA P1 P2 Le
        expect(apdu).toEqual([0x00, 0xca, 0x5f, 0x50, 0x00]);
      });

      it('should build GET DATA with 1-byte tag (P1=00)', () => {
        const apdu = buildGetDataApdu('4F', { style: 'openpgp' });

        expect(apdu).toEqual([0x00, 0xca, 0x00, 0x4f, 0x00]);
      });
    });
  });
});
