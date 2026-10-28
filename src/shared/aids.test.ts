import { describe, it, expect } from 'vitest';
import { asciiToBytes, toHex } from './hex';
import { KNOWN_AIDS, PAYMENT_SYSTEM_ENVIRONMENTS, lookupAid } from './aids';

describe('aids', () => {
  it('encodes the payment system environments', () => {
    expect(PAYMENT_SYSTEM_ENVIRONMENTS.PPSE).toBe(toHex(asciiToBytes('2PAY.SYS.DDF01')));
    expect(PAYMENT_SYSTEM_ENVIRONMENTS.PSE).toBe(toHex(asciiToBytes('1PAY.SYS.DDF01')));
  });

  it('looks up exact and prefix matches', () => {
    expect(lookupAid('A0000000031010')?.name).toBe('Visa Credit/Debit');
    expect(lookupAid('a0 00 00 00 04 10 10')?.name).toBe('Mastercard Credit/Debit');
    expect(lookupAid('A0000000031010FF')?.name).toBe('Visa Credit/Debit');
    expect(lookupAid('A0000000039999')?.name).toBe('Visa');
    expect(lookupAid('A000000308000010000100')?.category).toBe('identity');
    expect(lookupAid('D2760001240102000005000012340000')?.name).toBe('OpenPGP card');
    expect(lookupAid('A000000003000000')?.name).toBe('GlobalPlatform Issuer Security Domain');
    expect(lookupAid('F000000000')).toBeUndefined();
  });

  it('has well-formed, unique entries', () => {
    const aids = KNOWN_AIDS.map((a) => a.aid);
    expect(new Set(aids).size).toBe(aids.length);
    for (const aid of aids) expect(aid).toMatch(/^([0-9A-F]{2}){5,16}$/);
  });
});
