// Reads an NFC Forum Type 2 tag (NTAG213/215/216, MIFARE Ultralight) through a PC/SC contactless reader,
// then decodes its NDEF message.

log('UID', await card.getUid());

// Pages 0-3: UID, lock bytes and the capability container (CC) in page 3.
const header = await card.readPages(0, 4);
const cc = header.subarray(12, 16);
log('Capability container', hex.to(cc, ' '));
assert(cc[0] === 0xe1, 'Not NDEF formatted (CC magic byte is not E1)');

// CC byte 2 is the size of the data area in 8-byte units.
const dataBytes = cc[2]! * 8;
log(`Data area: ${dataBytes} bytes`);

const memory = await card.readPages(4, Math.ceil(dataBytes / 4));
for (const record of ndef.fromType2(memory)) {
  log(record.tnfName, record.type, record.decoded);
}
