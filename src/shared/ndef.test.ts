import { describe, it, expect } from 'vitest';
import { fromHex, toHex } from './hex';
import {
  encodeNdefMessage,
  encodeNdefText,
  encodeNdefUri,
  parseCapabilityContainer,
  parseNdefMessage,
  parseType2Tlvs,
  wrapNdefForType2,
} from './ndef';

describe('parseNdefMessage', () => {
  it('decodes a URI record', () => {
    // D1 01 0D 55 04 "example.com/" -> https://example.com/
    const { records, error } = parseNdefMessage(fromHex('D1010D55046578616D706C652E636F6D2F'));
    expect(error).toBeUndefined();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      tnf: 1,
      tnfName: 'Well-known',
      type: 'U',
      mb: true,
      me: true,
    });
    expect(records[0]!.decoded).toEqual({ kind: 'uri', uri: 'https://example.com/' });
  });

  it('decodes text, mime, external and empty records', () => {
    const text = parseNdefMessage(encodeNdefText('Héllo', 'fr')).records[0]!;
    expect(text.decoded).toEqual({ kind: 'text', lang: 'fr', text: 'Héllo', encoding: 'utf-8' });

    // UTF-16 text: status 0x82, "en", "Hi" big-endian
    const utf16 = parseNdefMessage(fromHex('D10107548265 6E00480069'.replace(/\s/g, '')))
      .records[0]!;
    expect(utf16.decoded).toEqual({ kind: 'text', lang: 'en', text: 'Hi', encoding: 'utf-16' });

    const mime = parseNdefMessage(fromHex('D20A02746578742F706C61696E6869')).records[0]!;
    expect(mime.decoded).toEqual({ kind: 'mime', mime: 'text/plain', text: 'hi' });

    const ext = parseNdefMessage(fromHex('D40F01616E64726F69642E636F6D3A706B6778')).records[0]!;
    expect(ext.decoded).toEqual({ kind: 'external', type: 'android.com:pkg' });

    expect(parseNdefMessage(fromHex('D00000')).records[0]!.decoded).toEqual({ kind: 'empty' });
  });

  it('decodes a smart poster', () => {
    const inner = encodeNdefMessage([
      encodeNdefUri('https://example.com'),
      encodeNdefText('Example'),
    ]);
    const poster = fromHex(`D102${inner.length.toString(16).padStart(2, '0')}5370${toHex(inner)}`);
    const decoded = parseNdefMessage(poster).records[0]!.decoded;
    expect(decoded.kind).toBe('smart-poster');
    if (decoded.kind === 'smart-poster') {
      expect(decoded.records.map((r) => r.decoded.kind)).toEqual(['uri', 'text']);
    }
  });

  it('reads multi-record messages, ids and long records', () => {
    const msg = encodeNdefMessage([encodeNdefUri('tel:+441234'), encodeNdefText('a'.repeat(300))]);
    const { records } = parseNdefMessage(msg);
    expect(records.map((r) => [r.mb, r.me])).toEqual([
      [true, false],
      [false, true],
    ]);
    expect(records[0]!.decoded).toEqual({ kind: 'uri', uri: 'tel:+441234' });
    expect(records[1]!.payload).toHaveLength(303);

    // header D9 (IL set), type 'U', id 07, payload 03 -> "http://"
    const withId = parseNdefMessage(fromHex('D9 01 01 01 55 07 03')).records[0]!;
    expect(toHex(withId.id!)).toBe('07');
    expect(withId.decoded).toEqual({ kind: 'uri', uri: 'http://' });
  });

  it('reports truncation and chunking', () => {
    expect(parseNdefMessage(fromHex('D1010D5504')).error).toMatch(/needs 12 more bytes/);
    expect(parseNdefMessage(fromHex('D1')).error).toMatch(/Truncated/);
    expect(parseNdefMessage(fromHex('F101015500')).error).toMatch(/Chunked/);
    expect(parseNdefMessage(new Uint8Array())).toEqual({ records: [] });
  });
});

describe('encodeNdefUri', () => {
  it('picks the longest prefix', () => {
    expect(toHex(encodeNdefUri('https://www.example.com'))).toBe(
      'D1010C5502' + toHex(new TextEncoder().encode('example.com')),
    );
    expect(toHex(encodeNdefUri('urn:epc:id:x'))).toBe('D1010255' + '1E78');
    expect(parseNdefMessage(encodeNdefUri('custom:thing')).records[0]!.decoded).toEqual({
      kind: 'uri',
      uri: 'custom:thing',
    });
  });
});

describe('Type 2 tag memory', () => {
  // NTAG215 user memory from page 4: lock/memory control TLVs, NDEF URI, terminator, zero fill
  const ndef = encodeNdefUri('https://example.com/');
  const memory = fromHex(
    `0103A00C34 00 03${ndef.length.toString(16).padStart(2, '0')}${toHex(ndef)} FE 000000`,
  );

  it('walks TLV blocks', () => {
    const blocks = parseType2Tlvs(memory);
    expect(blocks.map((b) => b.typeName)).toEqual(['Lock Control', 'NDEF Message', 'Terminator']);
    expect(blocks[1]!.offset).toBe(6);
    expect(parseNdefMessage(blocks[1]!.value).records[0]!.decoded).toEqual({
      kind: 'uri',
      uri: 'https://example.com/',
    });
  });

  it('handles the 3-byte length form and truncation', () => {
    const long = parseType2Tlvs(fromHex('03FF0002AABB FE'));
    expect(long[0]).toMatchObject({ type: 3, length: 2 });
    expect(long[1]!.typeName).toBe('Terminator');
    const cut = parseType2Tlvs(fromHex('0310AABB'));
    expect(cut).toHaveLength(1);
    expect(cut[0]!.value).toHaveLength(2);
  });

  it('wraps an NDEF message', () => {
    expect(toHex(wrapNdefForType2(ndef))).toBe(
      `03${ndef.length.toString(16).padStart(2, '0').toUpperCase()}${toHex(ndef)}FE`,
    );
    expect(toHex(wrapNdefForType2(new Uint8Array(300)).subarray(0, 4))).toBe('03FF012C');
  });

  it('parses the capability container', () => {
    expect(parseCapabilityContainer(fromHex('E1103E00'))).toEqual({
      magic: 0xe1,
      version: '1.0',
      dataAreaSize: 496,
      readAccess: 0,
      writeAccess: 0,
      tagGuess: 'NTAG215',
    });
    expect(parseCapabilityContainer(fromHex('E1106D0F'))).toMatchObject({
      tagGuess: 'NTAG216',
      writeAccess: 15,
    });
    expect(parseCapabilityContainer(fromHex('00000000'))).toBeUndefined();
    expect(parseCapabilityContainer(fromHex('E110'))).toBeUndefined();
  });
});
