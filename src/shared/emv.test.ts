import { describe, it, expect } from 'vitest';
import {
  parseAfl,
  extractSfiFromAflByte,
  calculateReadRecordP2,
  buildSelectCommand,
  buildReadRecordCommand,
  buildGetResponseCommand,
  buildGpoCommand,
  buildSelectPseCommand,
  buildSelectPpseCommand,
  PSE_NAME,
  PPSE_NAME,
  EMV_TAGS,
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
