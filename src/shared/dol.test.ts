import { describe, it, expect } from 'vitest';
import { fromHex, toHex } from './hex';
import { buildDolData, defaultTerminalData, parseDol } from './dol';

// A typical qVSDC PDOL: TTQ, amount, amount other, country, TVR, currency, date, type, UN
const PDOL = fromHex('9F66049F02069F03069F1A0295055F2A029A039C019F3704');

describe('parseDol', () => {
  it('reads tag and length pairs', () => {
    const dol = parseDol(PDOL);
    expect(dol.map((e) => `${e.tagHex}:${e.length}`)).toEqual([
      '9F66:4',
      '9F02:6',
      '9F03:6',
      '9F1A:2',
      '95:5',
      '5F2A:2',
      '9A:3',
      '9C:1',
      '9F37:4',
    ]);
    expect(dol[0]!.tag).toBe(0x9f66);
  });

  it('stops at a malformed entry', () => {
    expect(parseDol(fromHex('9F6604 9F'))).toHaveLength(1);
  });
});

describe('buildDolData', () => {
  it('pads and truncates by format', () => {
    const dol = parseDol(fromHex('9F0208 9F0202 5A0A 5A02 9F1E04 9F1E10 9F3704'));
    const data = buildDolData(dol, {
      '9F02': fromHex('000000000100'),
      '5A': fromHex('4761739001010010'),
      '9F1E': fromHex('4341524453505931'),
    });
    expect(toHex(data)).toBe(
      [
        '0000000000000100', // n: leading zeros
        '0100', // n: truncated on the left
        '4761739001010010FFFF', // cn: trailing FF
        '4761', // cn: truncated on the right
        '43415244', // an: truncated on the right
        '43415244535059310000000000000000', // an: trailing zeros
        '00000000', // missing: zeros
      ].join(''),
    );
  });

  it('builds a PDOL from terminal defaults', () => {
    const data = buildDolData(parseDol(PDOL), defaultTerminalData(new Date(2026, 9, 28, 11, 5, 9)));
    expect(data).toHaveLength(33);
    expect(toHex(data.subarray(0, 4))).toBe('36000000');
    expect(toHex(data.subarray(4, 10))).toBe('000000000100');
    expect(toHex(data.subarray(16, 18))).toBe('0826');
    expect(toHex(data.subarray(25, 28))).toBe('261028');
  });
});

describe('defaultTerminalData', () => {
  it('has a fresh unpredictable number and the given date and time', () => {
    const now = new Date(2026, 0, 2, 3, 4, 5);
    const a = defaultTerminalData(now);
    expect(toHex(a['9A']!)).toBe('260102');
    expect(toHex(a['9F21']!)).toBe('030405');
    expect(a['9F37']).toHaveLength(4);
  });
});
