// Send an APDU and read the answer. Run with ⌘↩ (Ctrl+Enter); each exchange also shows in the trace.

log('Reader', card.reader);
log('ATR', card.atr);

// SELECT the contactless payment directory (PPSE). Hex can be spaced however you like.
const response = await card.send('00 A4 04 00 0E 32 50 41 59 2E 53 59 53 2E 44 44 46 30 31 00');
log(response.swHex, response.status);

if (response.ok) {
  log(response.tlv());
}
