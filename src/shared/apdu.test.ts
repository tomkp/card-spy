import { describe, it, expect } from 'vitest';
import { fromHex, toHex } from './hex';
import {
  describeCommand,
  encodeCommand,
  parseCommand,
  splitResponse,
  tryParseCommand,
} from './apdu';

const d = (hex: string) => describeCommand(fromHex(hex));

describe('parseCommand', () => {
  it('handles all four short cases', () => {
    expect(parseCommand(fromHex('00840000'))).toMatchObject({ case: 1, extended: false });
    expect(parseCommand(fromHex('0084000008'))).toMatchObject({ case: 2, le: 8 });
    expect(parseCommand(fromHex('00C0000000')).le).toBe(256);
    const c3 = parseCommand(fromHex('00A4040007A0000000031010'));
    expect(c3).toMatchObject({ cla: 0, ins: 0xa4, p1: 4, p2: 0, case: 3 });
    expect(toHex(c3.data!)).toBe('A0000000031010');
    expect(parseCommand(fromHex('00A4040007A000000003101000'))).toMatchObject({ case: 4, le: 256 });
  });

  it('handles extended cases', () => {
    expect(parseCommand(fromHex('00B0000000FFFF'))).toMatchObject({
      case: 2,
      extended: true,
      le: 65535,
    });
    expect(parseCommand(fromHex('00B00000000000')).le).toBe(65536);
    expect(parseCommand(fromHex('00DA0000000002AABB'))).toMatchObject({ case: 3, extended: true });
    expect(parseCommand(fromHex('00DA0000000002AABB0100'))).toMatchObject({
      case: 4,
      extended: true,
      le: 256,
    });
  });

  it('rejects inconsistent lengths', () => {
    expect(() => parseCommand(fromHex('00A404'))).toThrow(/too short/);
    expect(() => parseCommand(fromHex('00A4040007A000'))).toThrow(/Lc is 7/);
    expect(() => parseCommand(fromHex('00A404000000'))).toThrow();
    expect(tryParseCommand(fromHex('00A4040007A000'))).toBeUndefined();
  });
});

describe('encodeCommand', () => {
  it('encodes short APDUs', () => {
    expect(toHex(encodeCommand({ cla: 0, ins: 0x84, p1: 0, p2: 0 }))).toBe('00840000');
    expect(toHex(encodeCommand({ cla: 0, ins: 0xc0, p1: 0, p2: 0, le: 256 }))).toBe('00C0000000');
    expect(toHex(encodeCommand({ cla: 0, ins: 0xc0, p1: 0, p2: 0, le: 0 }))).toBe('00C0000000');
    expect(
      toHex(
        encodeCommand({
          cla: 0,
          ins: 0xa4,
          p1: 4,
          p2: 0,
          data: fromHex('A0000000031010'),
          le: 256,
        }),
      ),
    ).toBe('00A4040007A000000003101000');
  });

  it('switches to extended length when needed', () => {
    expect(toHex(encodeCommand({ cla: 0, ins: 0xb0, p1: 0, p2: 0, le: 1000 }))).toBe(
      '00B000000003E8',
    );
    const big = encodeCommand({
      cla: 0,
      ins: 0xda,
      p1: 0,
      p2: 0,
      data: new Uint8Array(300),
      le: 65536,
    });
    expect(toHex(big.subarray(0, 7))).toBe('00DA000000012C');
    expect(toHex(big.subarray(-2))).toBe('0000');
    expect(parseCommand(big)).toMatchObject({ case: 4, extended: true, le: 65536 });
    expect(toHex(encodeCommand({ cla: 0, ins: 0x84, p1: 0, p2: 0, le: 8, extended: true }))).toBe(
      '00840000000008',
    );
  });

  it('round-trips', () => {
    for (const hex of [
      '00A404000E325041592E5359532E444446303100',
      '80A8000002830000',
      '00B2010C00',
    ]) {
      expect(toHex(encodeCommand(parseCommand(fromHex(hex))))).toBe(hex);
    }
  });
});

describe('splitResponse', () => {
  it('splits data and status', () => {
    const r = splitResponse(fromHex('5A0147 9000'));
    expect(toHex(r.data)).toBe('5A0147');
    expect(r).toMatchObject({ sw1: 0x90, sw2: 0x00, sw: 0x9000 });
    expect(splitResponse(fromHex('6A82')).data).toHaveLength(0);
    expect(() => splitResponse(fromHex('90'))).toThrow();
  });
});

describe('describeCommand', () => {
  it('names SELECT variants', () => {
    expect(d('00A404000E325041592E5359532E444446303100')).toEqual({
      name: 'SELECT',
      detail: 'by DF name 2PAY.SYS.DDF01',
    });
    expect(d('00A4040007A000000003101000')).toEqual({
      name: 'SELECT',
      detail: 'by DF name A0000000031010 · Visa Credit/Debit',
    });
    expect(d('00A40000023F00')).toEqual({ name: 'SELECT', detail: 'by FID 3F00' });
    expect(d('00A4040207A0000000031010')).toMatchObject({
      detail: expect.stringMatching(/next occurrence/),
    });
  });

  it('names EMV commands', () => {
    expect(d('00B2010C00')).toEqual({ name: 'READ RECORD', detail: 'SFI 1, record 1' });
    expect(d('00B2021400')).toEqual({ name: 'READ RECORD', detail: 'SFI 2, record 2' });
    expect(d('80CA9F3600')).toEqual({
      name: 'GET DATA',
      detail: '9F36 · Application Transaction Counter (ATC)',
    });
    expect(d('80A8000002830000')).toEqual({
      name: 'GET PROCESSING OPTIONS',
      detail: 'PDOL data 0 bytes',
    });
    expect(d('80AE80001D' + '00'.repeat(29) + '00')).toEqual({
      name: 'GENERATE AC',
      detail: 'ARQC',
    });
    expect(d('80AE5000020000')).toEqual({ name: 'GENERATE AC', detail: 'TC, CDA requested' });
    expect(d('0020008008241234FFFFFFFFFF')).toEqual({ name: 'VERIFY', detail: 'reference 80' });
    expect(d('00200080')).toEqual({ name: 'VERIFY', detail: 'reference 80, query retries' });
    expect(d('0084000008')).toEqual({ name: 'GET CHALLENGE', detail: 'Le 8' });
    expect(d('00C0000020')).toEqual({ name: 'GET RESPONSE', detail: 'Le 32' });
  });

  it('names ISO and GlobalPlatform commands', () => {
    expect(d('00B0000010')).toEqual({ name: 'READ BINARY', detail: 'offset 0, 16 bytes' });
    expect(d('00B0810000')).toEqual({ name: 'READ BINARY', detail: 'SFI 1, offset 0, 256 bytes' });
    expect(d('00D6000402AABB')).toEqual({ name: 'UPDATE BINARY', detail: 'offset 4, 2 bytes' });
    expect(d('002241B6')).toEqual({
      name: 'MANAGE SECURITY ENVIRONMENT',
      detail: 'SET (computation) DST',
    });
    expect(d('002A9E9A00')).toEqual({
      name: 'PERFORM SECURITY OPERATION',
      detail: 'COMPUTE DIGITAL SIGNATURE',
    });
    expect(d('00870D9C04')).toEqual({
      name: 'GENERAL AUTHENTICATE',
      detail: 'algorithm 0D, key 9C',
    });
    expect(d('8050000008' + '00'.repeat(8) + '00')).toEqual({
      name: 'INITIALIZE UPDATE',
      detail: 'key version 0',
    });
    expect(d('80F28000024F0000')).toEqual({ name: 'GET STATUS', detail: 'issuer security domain' });
    expect(d('00CB3FFF055C035FC10200')).toEqual({ name: 'GET DATA', detail: 'object 5FC102' });
    expect(d('00CA006E00')).toMatchObject({
      name: 'GET DATA',
      detail: expect.stringMatching(/^6E/),
    });
  });

  it('names PC/SC pseudo-APDUs', () => {
    expect(d('FFCA000000')).toEqual({ name: 'GET UID' });
    expect(d('FFCA010000')).toEqual({ name: 'GET ATS' });
    expect(d('FFB0000410')).toEqual({ name: 'READ BINARY', detail: 'page/block 4, 16 bytes' });
    expect(d('FFD6000404DEADBEEF')).toEqual({
      name: 'UPDATE BINARY',
      detail: 'page/block 4, 4 bytes',
    });
    expect(d('FF82000006FFFFFFFFFFFF')).toEqual({ name: 'LOAD KEY', detail: 'key slot 0' });
    expect(d('FF860000050100046000')).toEqual({
      name: 'GENERAL AUTHENTICATE',
      detail: 'block 4, key A, slot 0',
    });
    expect(d('FF00000003D44201')).toEqual({ name: 'DIRECT TRANSMIT', detail: '3 bytes' });
  });

  it('names DESFire and GSM commands', () => {
    expect(d('9060000000')).toEqual({ name: 'GET VERSION', detail: 'DESFire' });
    expect(d('A0F2000016')).toEqual({ name: 'STATUS' });
    expect(d('A0A40000027F20')).toEqual({ name: 'SELECT', detail: 'by FID 7F20' });
  });

  it('copes with unknown and malformed commands', () => {
    expect(d('00990000')).toEqual({ name: 'INS 99' });
    expect(d('FF990000')).toEqual({ name: 'INS 99' });
    expect(d('00A4')).toEqual({ name: 'Malformed APDU', detail: '2 bytes' });
    expect(d('00A4040007A000').name).toBe('SELECT');
  });
});
