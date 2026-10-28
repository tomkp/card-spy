import { asciiToBytes, fromHex, toHex } from '../hex';
import { encodeNdefMessage, encodeNdefText, encodeNdefUri, wrapNdefForType2 } from '../ndef';
import { encodeTlvTree, type TlvBuildNode } from '../tlv';
import type { ApduRule, VirtualCardDefinition } from './definition';

/**
 * Cards bundled with the app so everything can be tried without a reader.
 * All data is test data: the Visa test PAN, made-up cryptograms and certificates that are filler patterns.
 */

const t = (tag: string, value: string | Uint8Array | TlvBuildNode[]): TlvBuildNode =>
  Array.isArray(value)
    ? { tag, children: value }
    : { tag, value: typeof value === 'string' ? fromHex(value) : value };

const tlv = (...nodes: TlvBuildNode[]) => toHex(encodeTlvTree(nodes));
const ascii = (text: string) => asciiToBytes(text);
const filler = (length: number, seed: number) =>
  Uint8Array.from({ length }, (_, i) => (seed * 31 + i * 17) & 0xff);

const AID = 'A0000000031010';
const PAN = '4761739001010010';

function demoVisa(): VirtualCardDefinition {
  const fci = tlv(
    t('6F', [
      t('84', AID),
      t('A5', [
        t('50', ascii('VISA DEBIT')),
        t('87', '01'),
        t('9F38', '9F02069F1A025F2A029A039F3704'),
        t('5F2D', ascii('en')),
        t('9F11', '01'),
        t('9F12', ascii('Visa Debit')),
        t('BF0C', [t('9F4D', '0B03')]),
      ]),
    ]),
  );

  const rules: ApduRule[] = [
    // Payment System Environment (contact cards). The contactless PPSE is not supported.
    {
      command: '00A404000E315041592E5359532E444446303100',
      response:
        tlv(
          t('6F', [
            t('84', ascii('1PAY.SYS.DDF01')),
            t('A5', [t('88', '01'), t('5F2D', ascii('en'))]),
          ]),
        ) + '9000',
      next: 'pse',
    },
    {
      command: '00B2010C00',
      state: 'pse',
      response:
        tlv(t('70', [t('61', [t('4F', AID), t('50', ascii('VISA DEBIT')), t('87', '01')])])) +
        '9000',
    },
    { command: '00B2020C00', state: 'pse', response: '6A83' },

    // The application answers T=0 style, 61xx then GET RESPONSE, so the trace shows the chaining.
    { command: `00A4040007${AID}00`, response: `61${toHex([fci.length / 2])}`, next: 'app~1' },
    {
      command: `00C00000${toHex([fci.length / 2])}`,
      state: 'app~1',
      response: fci + '9000',
      next: 'app',
    },

    // GET PROCESSING OPTIONS: AIP (DDA, cardholder verification, terminal risk management) and AFL.
    {
      command: '80A80000*',
      state: 'app',
      response: tlv(t('77', [t('82', '3C00'), t('94', '080101001001020118010200')])) + '9000',
      note: 'AFL: SFI 1 record 1; SFI 2 records 1-2 (1 signed); SFI 3 records 1-2',
    },
    {
      command: '00B2010C00',
      state: 'app',
      response:
        tlv(
          t('70', [
            t('57', `${PAN}D29122010000000000000F`),
            t('5F20', ascii('TEST/CARDHOLDER')),
            t('9F1F', ascii('000000000000')),
          ]),
        ) + '9000',
    },
    {
      command: '00B2011400',
      state: 'app',
      response:
        tlv(
          t('70', [
            t('5A', PAN),
            t('5F24', '291231'),
            t('5F25', '240101'),
            t('5F28', '0826'),
            t('5F34', '01'),
            t('9F07', 'FF00'),
            t('8E', '000000000000000041034203' + '1E031F00'),
            t('9F0D', 'F040008800'),
            t('9F0E', '0010000000'),
            t('9F0F', 'F040009800'),
            t('8C', '9F02069F03069F1A0295055F2A029A039C019F3704'),
            t('8D', '8A029F02069F03069F1A0295055F2A029A039C019F3704'),
          ]),
        ) + '9000',
    },
    {
      command: '00B2021400',
      state: 'app',
      response: tlv(t('70', [t('8F', '92'), t('90', filler(128, 1)), t('9F32', '03')])) + '9000',
    },
    {
      command: '00B2011C00',
      state: 'app',
      response:
        tlv(t('70', [t('9F08', '0096'), t('9F42', '0826'), t('9F44', '02'), t('5F30', '0201')])) +
        '9000',
    },
    {
      command: '00B2021C00',
      state: 'app',
      response:
        tlv(t('70', [t('9F46', filler(112, 2)), t('9F47', '03'), t('9F49', '9F3704')])) + '9000',
    },

    // Transaction log in SFI 11: amount, CID, country, currency, date, type, ATC per entry.
    {
      command: '00B2015C00',
      state: 'app',
      response: '000000001250' + '40' + '0826' + '0826' + '261020' + '00' + '0027' + '9000',
    },
    {
      command: '00B2025C00',
      state: 'app',
      response: '000000000399' + '40' + '0826' + '0826' + '261014' + '00' + '0026' + '9000',
    },
    {
      command: '00B2035C00',
      state: 'app',
      response: '000000004500' + '40' + '0250' + '0978' + '260930' + '00' + '0025' + '9000',
    },

    // GET DATA
    { command: '80CA9F3600', response: tlv(t('9F36', '002A')) + '9000' },
    { command: '80CA9F1300', response: tlv(t('9F13', '0028')) + '9000' },
    { command: '80CA9F1700', response: tlv(t('9F17', '03')) + '9000' },
    {
      command: '80CA9F4F00',
      response: tlv(t('9F4F', '9F02069F27019F1A025F2A029A039C019F3602')) + '9000',
    },

    // Offline PIN is 1234; anything else counts down.
    { command: '0020008008241234FFFFFFFFFF', state: 'app', response: '9000' },
    { command: '00200080*', state: 'app', response: '63C2' },
    { command: '0084000008', response: toHex(filler(8, 3)) + '9000' },
    {
      command: '80AE*',
      state: 'app',
      response:
        tlv(
          t('77', [
            t('9F27', '80'),
            t('9F36', '002B'),
            t('9F26', filler(8, 4)),
            t('9F10', '06010A03A00000'),
          ]),
        ) + '9000',
    },

    { command: '00A404*', response: '6A82' },
    { command: '00B2*', response: '6A83' },
  ];

  return {
    format: 'card-spy/virtual-card',
    version: 1,
    name: 'Demo Visa Debit',
    description:
      'A contact EMV card with test data: PSE, one Visa application, records, GET DATA, a transaction log and offline PIN 1234.',
    atr: '3B6800000073C84012009000',
    interface: 'contact',
    model: { kind: 'apdu', rules, fallback: '6D00' },
  };
}

function demoNtag215(): VirtualCardDefinition {
  const uid = fromHex('04A23B7A1C5E80');
  const memory = new Uint8Array(135 * 4);
  const bcc0 = 0x88 ^ uid[0]! ^ uid[1]! ^ uid[2]!;
  const bcc1 = uid[3]! ^ uid[4]! ^ uid[5]! ^ uid[6]!;
  memory.set(
    [uid[0]!, uid[1]!, uid[2]!, bcc0, uid[3]!, uid[4]!, uid[5]!, uid[6]!, bcc1, 0x48, 0x00, 0x00],
    0,
  );
  memory.set(fromHex('E1103E00'), 12); // capability container: NDEF 1.0, 496 bytes, read/write
  const ndef = encodeNdefMessage([
    encodeNdefUri('https://github.com/tomkp/card-spy'),
    encodeNdefText('Hello from Card Spy'),
  ]);
  memory.set(wrapNdefForType2(ndef), 16);
  memory.set(fromHex('000000BD' + '040000FF' + '00050000' + 'FFFFFFFF' + '00000000'), 130 * 4); // dynamic lock, CFG0, CFG1, PWD, PACK

  return {
    format: 'card-spy/virtual-card',
    version: 1,
    name: 'Demo NTAG215',
    description:
      'An NFC Forum Type 2 tag behind a contactless reader, holding a URI and a text record.',
    atr: '3B8F8001804F0CA0000003060300030000000068',
    interface: 'contactless',
    model: { kind: 'memory', uid: toHex(uid), pageSize: 4, memory: toHex(memory) },
  };
}

export const DEMO_CARDS: VirtualCardDefinition[] = [demoVisa(), demoNtag215()];
