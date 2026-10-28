import { describe, it, expect } from 'vitest';
import { asciiToBytes, fromHex } from '../hex';
import { decodeTagValue, lookupTag } from './emv';

const decode = (tag: string, hex: string) => decodeTagValue(tag, fromHex(hex));

describe('lookupTag', () => {
  it('finds tags by number or hex', () => {
    expect(lookupTag(0x9f27)).toMatchObject({ tag: '9F27', format: 'b' });
    expect(lookupTag('5a')?.name).toBe('Application Primary Account Number (PAN)');
    expect(lookupTag('BF0C')?.format).toBe('tlv');
    expect(lookupTag(0x5f24)?.description).toBe('YYMMDD');
    expect(lookupTag('DF7F')).toBeUndefined();
  });
});

describe('decodeTagValue', () => {
  it('decodes text and numeric formats', () => {
    expect(decodeTagValue('50', asciiToBytes('VISA CREDIT'))).toBe('VISA CREDIT');
    expect(decode('50', '0001')).toBeUndefined();
    expect(decode('9F15', '5411')).toBe('5411');
    expect(decode('5F34', '01')).toBe('01');
    expect(decode('5F30', '0201')).toBe('201');
    expect(decode('5F2D', '656E6672')).toBe('en, fr');
  });

  it('decodes PAN, track 2 and dates', () => {
    expect(decode('5A', '4761739001010010')).toBe('4761739001010010');
    expect(decode('5A', '476173900101001F')).toBe('476173900101001');
    expect(decode('57', '4761739001010010D2512201123456789F')).toBe(
      'PAN 4761739001010010, exp 2512, svc 201',
    );
    expect(decode('5F24', '251231')).toBe('2025-12-31');
    expect(decode('5F25', '991231')).toBe('1999-12-31');
    expect(decode('9A', '2610')).toBe('2610'); // wrong length: plain digits
    expect(decode('9F21', '110509')).toBe('11:05:09');
  });

  it('decodes currencies, countries and amounts', () => {
    expect(decode('5F2A', '0826')).toBe('GBP (0826)');
    expect(decode('9F42', '0978')).toBe('EUR (0978)');
    expect(decode('5F28', '0840')).toBe('US (0840)');
    expect(decode('9F1A', '0999')).toBe('0999');
    expect(decode('9F02', '000000000100')).toBe('1.00');
    expect(decode('9F02', '000000123456')).toBe('1234.56');
    expect(decode('9F03', '000000000005')).toBe('0.05');
  });

  it('decodes the AIP, AFL and CVM list', () => {
    expect(decode('82', '1980')).toBe(
      'Cardholder verification supported, Terminal risk management to be performed, CDA supported, EMV mode supported (contactless)',
    );
    expect(decode('82', '0000')).toBe('none');
    expect(decode('94', '08010100 10010300 18010201')).toBe(
      'SFI 1 record 1; SFI 2 records 1–3; SFI 3 records 1–2 (1 for ODA)',
    );
    expect(decode('94', '080101')).toBeUndefined();
    expect(decode('8E', '00000000 00000000 4203 1E03 1F00')).toBe(
      'Enciphered PIN online, if terminal supports CVM, else next rule; Signature, if terminal supports CVM; No CVM required, always',
    );
    expect(decode('8E', '00000064 00000000 0100')).toBe('X=100, Y=0; Plaintext PIN by ICC, always');
  });

  it('decodes cryptogram and verification results', () => {
    expect(decode('9F27', '80')).toBe('ARQC');
    expect(decode('9F27', '4A')).toBe('TC, advice required, PIN try limit exceeded');
    expect(decode('9F34', '1F0002')).toBe('No CVM required, always: successful');
    expect(decode('9F34', '3F0000')).toBe('No CVM performed');
    expect(decode('95', '8000048000')).toBe(
      'Offline data authentication not performed, Online PIN entered, Transaction exceeds floor limit',
    );
    expect(decode('95', '0000000000')).toBe('none');
  });

  it('decodes counters, usage and qualifiers', () => {
    expect(decode('9F36', '0012')).toBe('18');
    expect(decode('9F17', '03')).toBe('3 tries left');
    expect(decode('87', '01')).toBe('priority 1');
    expect(decode('87', '81')).toBe('priority 1, cardholder confirmation required');
    expect(decode('88', '01')).toBe('SFI 1');
    expect(decode('9F4D', '0B0A')).toBe('SFI 11, 10 records');
    expect(decode('9F07', 'FF00')).toMatch(/^Domestic cash, International cash/);
    expect(decode('9F66', '36000000')).toBe(
      'qVSDC supported, EMV contact chip supported, Online PIN supported, Signature supported',
    );
    expect(decode('9F6C', '0080')).toBe('Consumer device CVM performed');
    expect(decode('9F33', 'E0F8C8')).toMatch(
      /^Manual key entry, Magnetic stripe, IC with contacts/,
    );
  });

  it('names AIDs and DF names', () => {
    expect(decode('4F', 'A0000000031010')).toBe('Visa Credit/Debit');
    expect(decode('84', '325041592E5359532E4444463031')).toBe('2PAY.SYS.DDF01');
    expect(decode('4F', 'F0010203040506')).toBeUndefined();
  });

  it('expands data object lists', () => {
    expect(decode('9F38', '9F66049F02069F3704')).toBe(
      '9F66 Terminal Transaction Qualifiers (TTQ) (4), 9F02 Amount, Authorised (Numeric) (6), 9F37 Unpredictable Number (4)',
    );
    expect(decode('9F4F', 'DF0102')).toBe('DF01 (2)');
  });

  it('returns undefined for plain binary', () => {
    expect(decode('9F26', '1122334455667788')).toBeUndefined();
    expect(decode('DF01', '01')).toBeUndefined();
    expect(decodeTagValue('50', new Uint8Array())).toBeUndefined();
  });
});
