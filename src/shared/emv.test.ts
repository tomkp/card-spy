import { describe, it, expect } from 'vitest';
import {
  parseAfl,
  extractSfiFromAflByte,
  calculateReadRecordP2,
  buildSelectCommand,
  buildReadRecordCommand,
  buildGetResponseCommand,
  buildGpoCommand,
  buildGpoCommandWithPdol,
  buildSelectPseCommand,
  buildSelectPpseCommand,
  parseDol,
  buildDolData,
  buildDefaultPdolData,
  buildDefaultCdolData,
  amountToBcd,
  dateToBcd,
  parseCvmList,
  evaluateCvm,
  PSE_NAME,
  PPSE_NAME,
  EMV_TAGS,
  type DolEntry,
} from './emv';

describe('parseAfl', () => {
  it('should parse single AFL entry', () => {
    // SFI=1 (0x08), records 1-3, 2 ODA records
    const aflBytes = [0x08, 0x01, 0x03, 0x02];
    const result = parseAfl(aflBytes);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      sfi: 1,
      firstRecord: 1,
      lastRecord: 3,
      offlineDataAuthRecords: 2,
    });
  });

  it('should parse multiple AFL entries', () => {
    // Two entries: SFI=1 records 1-2, SFI=2 records 1-4
    const aflBytes = [
      0x08,
      0x01,
      0x02,
      0x01, // SFI 1, records 1-2, 1 ODA
      0x10,
      0x01,
      0x04,
      0x00, // SFI 2, records 1-4, 0 ODA
    ];
    const result = parseAfl(aflBytes);

    expect(result).toHaveLength(2);
    expect(result[0].sfi).toBe(1);
    expect(result[0].firstRecord).toBe(1);
    expect(result[0].lastRecord).toBe(2);
    expect(result[1].sfi).toBe(2);
    expect(result[1].firstRecord).toBe(1);
    expect(result[1].lastRecord).toBe(4);
  });

  it('should return empty array for invalid length', () => {
    expect(parseAfl([0x08, 0x01, 0x02])).toEqual([]);
    expect(parseAfl([0x08, 0x01, 0x02, 0x01, 0x10])).toEqual([]);
  });

  it('should return empty array for empty input', () => {
    expect(parseAfl([])).toEqual([]);
  });
});

describe('extractSfiFromAflByte', () => {
  it('should extract SFI from AFL byte', () => {
    expect(extractSfiFromAflByte(0x08)).toBe(1); // 00001000 >> 3 = 1
    expect(extractSfiFromAflByte(0x10)).toBe(2); // 00010000 >> 3 = 2
    expect(extractSfiFromAflByte(0x18)).toBe(3); // 00011000 >> 3 = 3
    expect(extractSfiFromAflByte(0x78)).toBe(15); // 01111000 >> 3 = 15
    expect(extractSfiFromAflByte(0xf8)).toBe(31); // 11111000 >> 3 = 31 (max SFI in 5 bits)
  });

  it('should mask out bits 0-2', () => {
    // Bits 0-2 should be ignored
    expect(extractSfiFromAflByte(0x08)).toBe(1);
    expect(extractSfiFromAflByte(0x09)).toBe(1);
    expect(extractSfiFromAflByte(0x0a)).toBe(1);
    expect(extractSfiFromAflByte(0x0b)).toBe(1);
    expect(extractSfiFromAflByte(0x0c)).toBe(1);
    expect(extractSfiFromAflByte(0x0d)).toBe(1);
    expect(extractSfiFromAflByte(0x0e)).toBe(1);
    expect(extractSfiFromAflByte(0x0f)).toBe(1);
  });
});

describe('calculateReadRecordP2', () => {
  it('should calculate P2 for READ RECORD', () => {
    expect(calculateReadRecordP2(1)).toBe(0x0c); // (1 << 3) | 0x04 = 12
    expect(calculateReadRecordP2(2)).toBe(0x14); // (2 << 3) | 0x04 = 20
    expect(calculateReadRecordP2(3)).toBe(0x1c); // (3 << 3) | 0x04 = 28
    expect(calculateReadRecordP2(10)).toBe(0x54); // (10 << 3) | 0x04 = 84
  });

  it('should always set control bits to 0x04', () => {
    for (let sfi = 1; sfi <= 30; sfi++) {
      const p2 = calculateReadRecordP2(sfi);
      expect(p2 & 0x07).toBe(0x04);
    }
  });
});

describe('buildSelectCommand', () => {
  it('should build SELECT command from hex string', () => {
    const aid = 'A0000000041010';
    const result = buildSelectCommand(aid);

    expect(result).toEqual([
      0x00,
      0xa4,
      0x04,
      0x00, // CLA INS P1 P2
      0x07, // Lc (length of AID)
      0xa0,
      0x00,
      0x00,
      0x00,
      0x04,
      0x10,
      0x10, // AID
      0x00, // Le
    ]);
  });

  it('should build SELECT command from byte array', () => {
    const aid = [0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10];
    const result = buildSelectCommand(aid);

    expect(result).toEqual([
      0x00, 0xa4, 0x04, 0x00, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10, 0x00,
    ]);
  });

  it('should handle different AID lengths', () => {
    const shortAid = 'A000000004';
    const result = buildSelectCommand(shortAid);
    expect(result[4]).toBe(5); // Lc = 5
    expect(result.length).toBe(11); // 5 header + 5 AID + 1 Le
  });
});

describe('buildReadRecordCommand', () => {
  it('should build READ RECORD command', () => {
    const result = buildReadRecordCommand(1, 1);

    expect(result).toEqual([
      0x00,
      0xb2, // CLA INS
      0x01, // P1 (record number)
      0x0c, // P2 (SFI 1 with control 0x04)
      0x00, // Le
    ]);
  });

  it('should use correct P2 for different SFIs', () => {
    expect(buildReadRecordCommand(1, 2)[3]).toBe(0x14);
    expect(buildReadRecordCommand(5, 3)[3]).toBe(0x1c);
  });

  it('should set correct record number', () => {
    expect(buildReadRecordCommand(1, 1)[2]).toBe(1);
    expect(buildReadRecordCommand(5, 1)[2]).toBe(5);
    expect(buildReadRecordCommand(10, 1)[2]).toBe(10);
  });
});

describe('buildGetResponseCommand', () => {
  it('should build GET RESPONSE command', () => {
    const result = buildGetResponseCommand(0x20);

    expect(result).toEqual([
      0x00,
      0xc0,
      0x00,
      0x00, // CLA INS P1 P2
      0x20, // Le
    ]);
  });

  it('should use correct length', () => {
    expect(buildGetResponseCommand(0x10)[4]).toBe(0x10);
    expect(buildGetResponseCommand(0xff)[4]).toBe(0xff);
  });
});

describe('buildGpoCommand', () => {
  it('should build GPO command with empty PDOL', () => {
    const result = buildGpoCommand();

    expect(result).toEqual([
      0x80,
      0xa8,
      0x00,
      0x00, // CLA INS P1 P2
      0x02, // Lc
      0x83,
      0x00, // Empty PDOL (tag 83, length 0)
      0x00, // Le
    ]);
  });
});

describe('buildSelectPseCommand', () => {
  it('should build SELECT PSE command', () => {
    const result = buildSelectPseCommand();

    // "1PAY.SYS.DDF01" in ASCII
    expect(result[0]).toBe(0x00); // CLA
    expect(result[1]).toBe(0xa4); // INS
    expect(result[2]).toBe(0x04); // P1
    expect(result[3]).toBe(0x00); // P2
    expect(result[4]).toBe(14); // Lc (length of PSE name)
    expect(result[5]).toBe(0x31); // '1'
    expect(result[6]).toBe(0x50); // 'P'
    expect(result[7]).toBe(0x41); // 'A'
    expect(result[8]).toBe(0x59); // 'Y'
    expect(result[result.length - 1]).toBe(0x00); // Le
  });
});

describe('buildSelectPpseCommand', () => {
  it('should build SELECT PPSE command', () => {
    const result = buildSelectPpseCommand();

    expect(result[0]).toBe(0x00); // CLA
    expect(result[1]).toBe(0xa4); // INS
    expect(result[4]).toBe(14); // Lc
    expect(result[5]).toBe(0x32); // '2' (differs from PSE)
    expect(result[6]).toBe(0x50); // 'P'
  });
});

describe('constants', () => {
  it('should have correct PSE/PPSE names', () => {
    expect(PSE_NAME).toBe('1PAY.SYS.DDF01');
    expect(PPSE_NAME).toBe('2PAY.SYS.DDF01');
  });

  it('should have correct EMV tag values', () => {
    expect(EMV_TAGS.AID).toBe(0x4f);
    expect(EMV_TAGS.PAN).toBe(0x5a);
    expect(EMV_TAGS.AFL).toBe(0x94);
    expect(EMV_TAGS.FCI_TEMPLATE).toBe(0x6f);
  });
});

describe('parseDol', () => {
  it('should parse single-byte tag DOL entries', () => {
    // 9A 03 = Transaction Date (3 bytes)
    const dolBytes = [0x9a, 0x03];
    const result = parseDol(dolBytes);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ tag: 0x9a, length: 3 });
  });

  it('should parse two-byte tag DOL entries', () => {
    // 9F02 06 = Amount Authorized (6 bytes)
    const dolBytes = [0x9f, 0x02, 0x06];
    const result = parseDol(dolBytes);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ tag: 0x9f02, length: 6 });
  });

  it('should parse multiple DOL entries', () => {
    // 9F02 06 9F03 06 9A 03 = Amount (6) + Other Amount (6) + Date (3)
    const dolBytes = [0x9f, 0x02, 0x06, 0x9f, 0x03, 0x06, 0x9a, 0x03];
    const result = parseDol(dolBytes);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ tag: 0x9f02, length: 6 });
    expect(result[1]).toEqual({ tag: 0x9f03, length: 6 });
    expect(result[2]).toEqual({ tag: 0x9a, length: 3 });
  });

  it('should handle real PDOL from card', () => {
    // Common PDOL: 9F66 04 9F02 06 9F03 06 9F1A 02 95 05 5F2A 02 9A 03 9C 01 9F37 04
    const dolBytes = [
      0x9f, 0x66, 0x04, // TTQ (4)
      0x9f, 0x02, 0x06, // Amount (6)
      0x9f, 0x03, 0x06, // Other Amount (6)
      0x9f, 0x1a, 0x02, // Terminal Country (2)
      0x95, 0x05, // TVR (5)
      0x5f, 0x2a, 0x02, // Currency Code (2)
      0x9a, 0x03, // Date (3)
      0x9c, 0x01, // Type (1)
      0x9f, 0x37, 0x04, // Unpredictable Number (4)
    ];
    const result = parseDol(dolBytes);

    expect(result).toHaveLength(9);
    expect(result[0]).toEqual({ tag: 0x9f66, length: 4 });
    expect(result[4]).toEqual({ tag: 0x95, length: 5 });
  });

  it('should return empty array for empty input', () => {
    expect(parseDol([])).toEqual([]);
  });
});

describe('buildDolData', () => {
  it('should build DOL data from tag values', () => {
    const entries: DolEntry[] = [
      { tag: 0x9a, length: 3 }, // Transaction Date
      { tag: 0x9c, length: 1 }, // Transaction Type
    ];
    const values = new Map<number, number[]>([
      [0x9a, [0x25, 0x12, 0x30]], // 2025-12-30
      [0x9c, [0x00]], // Purchase
    ]);

    const result = buildDolData(entries, values);

    expect(result).toEqual([0x25, 0x12, 0x30, 0x00]);
  });

  it('should pad with zeros for missing values', () => {
    const entries: DolEntry[] = [
      { tag: 0x9f02, length: 6 }, // Amount
      { tag: 0x9a, length: 3 }, // Date
    ];
    const values = new Map<number, number[]>([
      [0x9a, [0x25, 0x12, 0x30]],
    ]);

    const result = buildDolData(entries, values);

    // Amount should be 6 zeros, then date
    expect(result).toEqual([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x25, 0x12, 0x30]);
  });

  it('should truncate values that are too long', () => {
    const entries: DolEntry[] = [{ tag: 0x9c, length: 1 }];
    const values = new Map<number, number[]>([
      [0x9c, [0x01, 0x02, 0x03]], // Too long
    ]);

    const result = buildDolData(entries, values);

    expect(result).toEqual([0x01]);
  });

  it('should left-pad shorter values with zeros', () => {
    const entries: DolEntry[] = [{ tag: 0x9f02, length: 6 }];
    const values = new Map<number, number[]>([
      [0x9f02, [0x01, 0x00]], // $1.00 but only 2 bytes
    ]);

    const result = buildDolData(entries, values);

    expect(result).toEqual([0x00, 0x00, 0x00, 0x00, 0x01, 0x00]);
  });
});

describe('amountToBcd', () => {
  it('should convert amount to 6-byte BCD', () => {
    // $1.00 = 100 cents
    const result = amountToBcd(100);
    expect(result).toEqual([0x00, 0x00, 0x00, 0x00, 0x01, 0x00]);
  });

  it('should convert larger amounts', () => {
    // $123.45 = 12345 cents
    const result = amountToBcd(12345);
    expect(result).toEqual([0x00, 0x00, 0x00, 0x01, 0x23, 0x45]);
  });

  it('should handle zero amount', () => {
    const result = amountToBcd(0);
    expect(result).toEqual([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  });

  it('should handle maximum 12-digit amount', () => {
    // 999999999999 (max 12 digits)
    const result = amountToBcd(999999999999);
    expect(result).toEqual([0x99, 0x99, 0x99, 0x99, 0x99, 0x99]);
  });
});

describe('dateToBcd', () => {
  it('should convert date to YYMMDD BCD format', () => {
    const date = new Date(2025, 11, 30); // Dec 30, 2025
    const result = dateToBcd(date);
    expect(result).toEqual([0x25, 0x12, 0x30]);
  });

  it('should handle single-digit months and days', () => {
    const date = new Date(2025, 0, 5); // Jan 5, 2025
    const result = dateToBcd(date);
    expect(result).toEqual([0x25, 0x01, 0x05]);
  });
});

describe('buildDefaultPdolData', () => {
  it('should build PDOL data with default values', () => {
    const entries: DolEntry[] = [
      { tag: 0x9f02, length: 6 }, // Amount
      { tag: 0x9a, length: 3 }, // Date
      { tag: 0x9c, length: 1 }, // Type
    ];

    const result = buildDefaultPdolData(entries, {
      amount: 100, // $1.00
      currencyCode: 0x0840, // USD
    });

    // Amount should be BCD 100 = 000000000100
    expect(result.slice(0, 6)).toEqual([0x00, 0x00, 0x00, 0x00, 0x01, 0x00]);
    // Date should be 3 bytes (current date)
    expect(result.length).toBe(10); // 6 + 3 + 1
  });

  it('should use provided overrides', () => {
    const entries: DolEntry[] = [{ tag: 0x9c, length: 1 }];

    const result = buildDefaultPdolData(entries, {
      amount: 100,
      currencyCode: 0x0840,
      transactionType: 0x01, // Cash advance
    });

    expect(result).toEqual([0x01]);
  });
});

describe('buildDefaultCdolData', () => {
  it('should build standard CDOL1 data', () => {
    const result = buildDefaultCdolData({
      amount: 100,
      currencyCode: 0x0840,
    });

    // Standard CDOL1 is 29 bytes:
    // Amount (6) + Other Amount (6) + Country (2) + TVR (5) + Currency (2) + Date (3) + Type (1) + UN (4)
    expect(result.length).toBe(29);

    // Check amount is at start
    expect(result.slice(0, 6)).toEqual([0x00, 0x00, 0x00, 0x00, 0x01, 0x00]);

    // Check other amount is zeros
    expect(result.slice(6, 12)).toEqual([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

    // Check country code (USD = 0840)
    expect(result.slice(12, 14)).toEqual([0x08, 0x40]);
  });
});

describe('buildGpoCommandWithPdol', () => {
  it('should build GPO command with PDOL data', () => {
    const pdolData = [0x01, 0x02, 0x03];
    const result = buildGpoCommandWithPdol(pdolData);

    expect(result).toEqual([
      0x80,
      0xa8,
      0x00,
      0x00, // CLA INS P1 P2
      0x05, // Lc = 1 (tag) + 1 (len) + 3 (data)
      0x83, // Command Template tag
      0x03, // Length of PDOL data
      0x01,
      0x02,
      0x03, // PDOL data
      0x00, // Le
    ]);
  });

  it('should handle empty PDOL data', () => {
    const result = buildGpoCommandWithPdol([]);

    expect(result).toEqual([0x80, 0xa8, 0x00, 0x00, 0x02, 0x83, 0x00, 0x00]);
  });
});

describe('parseCvmList', () => {
  it('should parse CVM list with amount thresholds', () => {
    // CVM List: Amount X = 100 (0x64), Amount Y = 200 (0xC8)
    // Rules: 1E00 (Signature, Always), 1F03 (No CVM, if terminal supports)
    const cvmBytes = [
      0x00, 0x00, 0x00, 0x64, // Amount X = 100
      0x00, 0x00, 0x00, 0xc8, // Amount Y = 200
      0x1e, 0x00, // Signature, Always
      0x1f, 0x03, // No CVM, if terminal supports CVM
    ];

    const result = parseCvmList(cvmBytes);

    expect(result.amountX).toBe(100);
    expect(result.amountY).toBe(200);
    expect(result.rules).toHaveLength(2);
    expect(result.rules[0]).toEqual({
      method: 'signature',
      condition: 'always',
      failIfUnsuccessful: true,
      cvmByte: 0x1e,
      conditionByte: 0x00,
    });
    expect(result.rules[1]).toEqual({
      method: 'no_cvm',
      condition: 'terminal_supports_cvm',
      failIfUnsuccessful: true,
      cvmByte: 0x1f,
      conditionByte: 0x03,
    });
  });

  it('should parse PIN verification methods', () => {
    const cvmBytes = [
      0x00, 0x00, 0x00, 0x00, // Amount X = 0
      0x00, 0x00, 0x00, 0x00, // Amount Y = 0
      0x41, 0x00, // Plaintext PIN (with continue flag), Always
      0x02, 0x00, // Enciphered PIN online, Always
    ];

    const result = parseCvmList(cvmBytes);

    expect(result.rules).toHaveLength(2);
    // 0x41 = 0x40 (continue) + 0x01 (plaintext PIN)
    expect(result.rules[0].method).toBe('plaintext_pin_icc');
    expect(result.rules[0].failIfUnsuccessful).toBe(false); // bit 6 set = continue
    expect(result.rules[1].method).toBe('enciphered_pin_online');
    expect(result.rules[1].failIfUnsuccessful).toBe(true);
  });

  it('should handle empty CVM list', () => {
    const result = parseCvmList([]);

    expect(result.amountX).toBe(0);
    expect(result.amountY).toBe(0);
    expect(result.rules).toEqual([]);
  });

  it('should handle CVM list with only thresholds', () => {
    const cvmBytes = [
      0x00, 0x00, 0x03, 0xe8, // Amount X = 1000
      0x00, 0x00, 0x07, 0xd0, // Amount Y = 2000
    ];

    const result = parseCvmList(cvmBytes);

    expect(result.amountX).toBe(1000);
    expect(result.amountY).toBe(2000);
    expect(result.rules).toEqual([]);
  });
});

describe('evaluateCvm', () => {
  it('should match always condition', () => {
    const cvmList = parseCvmList([
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x1e, 0x00, // Signature, Always
    ]);

    const result = evaluateCvm(cvmList, {});

    expect(result).toBeDefined();
    expect(result?.method).toBe('signature');
  });

  it('should match amount_under_x condition', () => {
    const cvmList = parseCvmList([
      0x00, 0x00, 0x00, 0x64, // Amount X = 100
      0x00, 0x00, 0x00, 0x00,
      0x1f, 0x06, // No CVM, if amount under X
      0x01, 0x00, // Plaintext PIN, Always (fallback)
    ]);

    // Amount 50 < 100, should match first rule
    const result1 = evaluateCvm(cvmList, { amount: 50 });
    expect(result1?.method).toBe('no_cvm');

    // Amount 150 > 100, should match second rule
    const result2 = evaluateCvm(cvmList, { amount: 150 });
    expect(result2?.method).toBe('plaintext_pin_icc');
  });

  it('should match terminal_supports_cvm condition', () => {
    const cvmList = parseCvmList([
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x02, 0x03, // Enciphered PIN online, if terminal supports CVM
      0x1f, 0x00, // No CVM, Always (fallback)
    ]);

    // Terminal supports CVM
    const result1 = evaluateCvm(cvmList, { terminalSupportsCvm: true });
    expect(result1?.method).toBe('enciphered_pin_online');

    // Terminal doesn't support CVM
    const result2 = evaluateCvm(cvmList, { terminalSupportsCvm: false });
    expect(result2?.method).toBe('no_cvm');
  });

  it('should return undefined when no rules match', () => {
    const cvmList = parseCvmList([
      0x00, 0x00, 0x00, 0x64, // Amount X = 100
      0x00, 0x00, 0x00, 0x00,
      0x1f, 0x06, // No CVM, if amount under X
    ]);

    // Amount 150 > 100, no fallback rule
    const result = evaluateCvm(cvmList, { amount: 150 });
    expect(result).toBeUndefined();
  });
});
