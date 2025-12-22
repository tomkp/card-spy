import { describe, it, expect } from 'vitest';
import { emvTags, getTagDescription, isConstructedTag, isMultiByteTag } from './emv-tags';

describe('emvTags dictionary', () => {
  it('should contain common EMV tags', () => {
    expect(emvTags['4F']).toBe('AID');
    expect(emvTags['50']).toBe('APP LABEL');
    expect(emvTags['5A']).toBe('PAN');
    expect(emvTags['6F']).toBe('FCI TEMPLATE');
    expect(emvTags['9F26']).toBe('AC');
  });
});

describe('getTagDescription', () => {
  it('should return description for known tags (string input)', () => {
    expect(getTagDescription('50')).toBe('APP LABEL');
    expect(getTagDescription('5A')).toBe('PAN');
    expect(getTagDescription('9F26')).toBe('AC');
  });

  it('should handle lowercase input', () => {
    expect(getTagDescription('5a')).toBe('PAN');
    expect(getTagDescription('9f26')).toBe('AC');
  });

  it('should return description for known tags (number input)', () => {
    expect(getTagDescription(0x50)).toBe('APP LABEL');
    expect(getTagDescription(0x5a)).toBe('PAN');
    expect(getTagDescription(0x9f26)).toBe('AC');
  });

  it('should return undefined for unknown tags', () => {
    expect(getTagDescription('FF')).toBeUndefined();
    expect(getTagDescription('1234')).toBeUndefined();
    expect(getTagDescription(0xffff)).toBeUndefined();
  });
});

describe('isConstructedTag', () => {
  it('should return true for constructed tags (bit 6 set)', () => {
    // 0x6F = 0110 1111 - bit 6 is set
    expect(isConstructedTag(0x6f)).toBe(true);
    // 0x70 = 0111 0000 - bit 6 is set
    expect(isConstructedTag(0x70)).toBe(true);
    // 0x61 = 0110 0001 - bit 6 is set
    expect(isConstructedTag(0x61)).toBe(true);
    // 0xA5 = 1010 0101 - bit 6 is set
    expect(isConstructedTag(0xa5)).toBe(true);
  });

  it('should return false for primitive tags (bit 6 not set)', () => {
    // 0x50 = 0101 0000 - bit 6 is NOT set
    expect(isConstructedTag(0x50)).toBe(false);
    // 0x5A = 0101 1010 - bit 6 is NOT set
    expect(isConstructedTag(0x5a)).toBe(false);
    // 0x9F = 1001 1111 - bit 6 is NOT set (first byte of multi-byte tag)
    expect(isConstructedTag(0x9f)).toBe(false);
    // 0x82 = 1000 0010 - bit 6 is NOT set
    expect(isConstructedTag(0x82)).toBe(false);
  });
});

describe('isMultiByteTag', () => {
  it('should return true when bits 1-5 are all set (0x1F)', () => {
    // 0x9F = 1001 1111 - bits 1-5 are 1 1111
    expect(isMultiByteTag(0x9f)).toBe(true);
    // 0x5F = 0101 1111 - bits 1-5 are 1 1111
    expect(isMultiByteTag(0x5f)).toBe(true);
    // 0xBF = 1011 1111 - bits 1-5 are 1 1111
    expect(isMultiByteTag(0xbf)).toBe(true);
    // 0x1F = 0001 1111 - bits 1-5 are 1 1111
    expect(isMultiByteTag(0x1f)).toBe(true);
  });

  it('should return false when bits 1-5 are not all set', () => {
    // 0x50 = 0101 0000 - bits 1-5 are 1 0000
    expect(isMultiByteTag(0x50)).toBe(false);
    // 0x6F = 0110 1111 - bits 1-5 are 0 1111
    expect(isMultiByteTag(0x6f)).toBe(false);
    // 0x70 = 0111 0000 - bits 1-5 are 1 0000
    expect(isMultiByteTag(0x70)).toBe(false);
    // 0x5A = 0101 1010 - bits 1-5 are 1 1010
    expect(isMultiByteTag(0x5a)).toBe(false);
  });
});
