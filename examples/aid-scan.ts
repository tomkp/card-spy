// Tries to SELECT well-known applications and reports which ones the card answers.

const candidates: Record<string, string> = {
  Visa: 'A0000000031010',
  Mastercard: 'A0000000041010',
  Maestro: 'A0000000043060',
  'American Express': 'A00000002501',
  PIV: 'A000000308',
  OpenPGP: 'D27600012401',
  'FIDO U2F': 'A0000006472F0001',
  'NDEF (Type 4 tag)': 'D2760000850101',
  'eMRTD (passport)': 'A0000002471001',
  'GlobalPlatform card manager': 'A000000003000000',
};

for (const [name, aid] of Object.entries(candidates)) {
  const response = await card.select(aid);
  log(
    response.ok ? '✓' : '·',
    name.padEnd(28),
    aid.padEnd(18),
    response.swHex,
    response.ok ? '' : response.status,
  );
}
