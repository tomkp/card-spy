// Reads a payment card the way a terminal starts a transaction:
// payment directory → applications → GET PROCESSING OPTIONS → every record in the AFL.

let directory = await card.select('2PAY.SYS.DDF01'); // contactless directory (PPSE)
const contactless = directory.ok;
if (!contactless) directory = await card.select('1PAY.SYS.DDF01'); // contact directory (PSE)
assert(directory.ok, `No payment directory: ${directory.status}`);

const aids: string[] = [];
if (contactless) {
  for (const node of tlv.findAll(directory.tlv(), '4F')) aids.push(hex.to(node.value));
} else {
  // The PSE lists its applications in records of the SFI given by tag 88.
  const sfi = directory.find('88')?.value[0] ?? 1;
  for (let record = 1; ; record++) {
    const entry = await card.readRecord(sfi, record);
    if (!entry.ok) break;
    for (const node of tlv.findAll(entry.tlv(), '4F')) aids.push(hex.to(node.value));
  }
}
log(
  'Applications',
  aids.map((aid) => `${aid} ${emv.aidName(aid) ?? ''}`.trim()),
);

for (const aid of aids) {
  const fci = (await card.select(aid)).expectOk();
  const label = fci.find('50');
  log(`\n${label ? hex.ascii(label.value) : aid}`);

  // Answer the card's PDOL with default terminal data, wrapped in tag 83.
  const pdol = fci.find('9F38')?.value ?? new Uint8Array();
  const gpo = await card.send({
    cla: 0x80,
    ins: 0xa8,
    p1: 0,
    p2: 0,
    data: tlv.encode('83', emv.buildDol(pdol)),
    le: 256,
  });
  if (!gpo.ok) {
    log('GET PROCESSING OPTIONS failed:', gpo.status);
    continue;
  }
  const { afl } = emv.parseGpo(gpo.data);

  const found = new Map<string, Uint8Array>();
  for (const { sfi, first, last } of afl) {
    for (let record = first; record <= last; record++) {
      const response = await card.readRecord(sfi, record);
      if (!response.ok) continue;
      for (const tag of ['5A', '5F24', '5F20', '57', '5F28', '9F07']) {
        const node = response.find(tag);
        if (node && !found.has(tag)) found.set(tag, node.value);
      }
    }
  }
  for (const [tag, value] of found) {
    log(`${emv.tagName(tag) ?? tag}:`, emv.describe(tag, value) ?? hex.to(value));
  }

  const atc = await card.getData('9F36');
  if (atc.ok)
    log('Transaction counter:', emv.describe('9F36', atc.find('9F36')?.value ?? atc.data));
}
