import { describe, it, expect } from 'vitest';
import { describeSw } from './sw';

describe('describeSw', () => {
  it('knows success and common errors', () => {
    expect(describeSw(0x9000)).toEqual({ text: 'Success', severity: 'ok' });
    expect(describeSw(0x6a82)).toEqual({
      text: 'File or application not found',
      severity: 'error',
    });
    expect(describeSw(0x6982).severity).toBe('error');
    expect(describeSw(0x6d00).text).toMatch(/Instruction/);
  });

  it('decodes parameterised status words', () => {
    expect(describeSw(0x6120)).toEqual({
      text: '32 bytes available (GET RESPONSE)',
      severity: 'ok',
    });
    expect(describeSw(0x6100).text).toMatch(/^256 bytes/);
    expect(describeSw(0x6c1c).text).toBe('Wrong Le, use 1C (28 bytes)');
    expect(describeSw(0x63c2)).toEqual({ text: '2 tries left', severity: 'warning' });
    expect(describeSw(0x63c1).text).toBe('1 try left');
  });

  it('falls back by class', () => {
    expect(describeSw(0x6299).severity).toBe('warning');
    expect(describeSw(0x6a90)).toEqual({ text: 'Wrong parameters P1-P2', severity: 'error' });
    expect(describeSw(0x9123)).toEqual({ text: 'Proprietary status', severity: 'warning' });
    expect(describeSw(0x1234)).toEqual({ text: 'Unknown status', severity: 'error' });
  });
});

describe('Java Card', () => {
  it('names applet selection failure', () => {
    expect(describeSw(0x6999)).toEqual({
      text: 'Applet selection failed (Java Card)',
      severity: 'error',
    });
  });
});
