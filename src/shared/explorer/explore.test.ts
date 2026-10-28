import { describe, expect, it } from 'vitest';
import { asciiToBytes, fromHex, toHex } from '../hex';
import { encodeTlvTree } from '../tlv';
import { DEMO_CARDS } from '../virtual/demo-cards';
import { createVirtualCard } from '../virtual/simulator';
import { exploreCard } from './explore';
import type { ExplorerNode } from './model';

function explore(index: number) {
  const card = createVirtualCard(DEMO_CARDS[index]!);
  const sent: string[] = [];
  const transmit = async (command: Uint8Array) => {
    sent.push(
      Array.from(command, (b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase(),
    );
    return card.transmit(command);
  };
  return { root: exploreCard({ transmit, atr: card.atr }), sent };
}

function find(node: ExplorerNode, label: string): ExplorerNode | undefined {
  if (node.label === label) return node;
  for (const child of node.children ?? []) {
    const hit = find(child, label);
    if (hit) return hit;
  }
  return undefined;
}

describe('exploreCard', () => {
  it('reads the demo Visa through PSE, GET RESPONSE, GPO, records, GET DATA and the log', async () => {
    const { root, sent } = explore(0);
    const tree = await root;

    expect(find(tree, 'Payment directory (PSE)')).toBeDefined();
    const app = find(tree, 'VISA DEBIT')!;
    expect(app.value).toBe('A0000000031010');
    // The application SELECT answers 61xx, so a GET RESPONSE must follow it.
    expect(sent.some((c) => c.startsWith('00C00000'))).toBe(true);

    const records = find(app, 'Records')!;
    expect(records.children!.map((r) => r.label)).toEqual([
      'SFI 1 · record 1',
      'SFI 2 · record 1',
      'SFI 2 · record 2',
      'SFI 3 · record 1',
      'SFI 3 · record 2',
    ]);
    expect(records.children![1]!.value).toBe('signed (ODA)');

    const expiry = find(app, 'Application Expiration Date');
    expect(expiry?.value).toBe('2029-12-31');

    const log = find(app, 'Transaction log')!;
    expect(log.children).toHaveLength(3);
    expect(log.children![0]!.value).toContain('2026-10-20');
  });

  it('reads the demo NTAG215 memory and NDEF records', async () => {
    const { root } = explore(1);
    const tree = await root;
    expect(find(tree, 'UID')?.value).toBe('04 A2 3B 7A 1C 5E 80');
    const ndef = find(tree, 'NDEF message')!;
    expect(ndef.children!.map((n) => n.value)).toEqual([
      'https://github.com/tomkp/card-spy',
      'Hello from Card Spy',
    ]);
    expect(find(tree, 'Memory')?.bytes?.length).toBe(512);
  });

  it('explains a listed application that will not open over contactless', async () => {
    // What new cards did on an ACR122U: the PPSE answers, every other SELECT gets 6A81.
    const ppse = encodeTlvTree([
      {
        tag: '6F',
        children: [
          { tag: '84', value: asciiToBytes('2PAY.SYS.DDF01') },
          {
            tag: 'A5',
            children: [
              {
                tag: 'BF0C',
                children: [
                  { tag: '61', children: [{ tag: '4F', value: fromHex('A0000000031010') }] },
                ],
              },
            ],
          },
        ],
      },
    ]);
    const card = createVirtualCard({
      format: 'card-spy/virtual-card',
      version: 1,
      name: 'Not yet activated',
      atr: '3B858001112233445515',
      model: {
        kind: 'apdu',
        rules: [
          { command: 'FFCA000000', response: '010203049000' },
          { command: '00A404000E325041592E5359532E444446303100', response: toHex(ppse) + '9000' },
        ],
        fallback: '6A81',
      },
    });
    const tree = await exploreCard({ transmit: async (c) => card.transmit(c), atr: card.atr });
    const app = find(tree, 'Visa Credit/Debit')!;
    expect(find(app, 'SELECT failed')?.value).toMatch(/^6A81/);
    expect(find(app, 'Likely cause')?.value).toMatch(/contactless.*chip-and-PIN/);
  });

  it('gives the plain EMV meaning of 6A81 over contact', async () => {
    const card = createVirtualCard({
      ...DEMO_CARDS[0]!,
      model: {
        kind: 'apdu',
        rules: [
          ...(DEMO_CARDS[0]!.model.kind === 'apdu' ? DEMO_CARDS[0]!.model.rules.slice(0, 3) : []),
          { command: '00A4040007A000000003101000', response: '6A81' },
        ],
      },
    });
    const tree = await exploreCard({ transmit: async (c) => card.transmit(c), atr: card.atr });
    const hint = find(tree, 'Likely cause')?.value;
    expect(hint).toMatch(/blocked card or application/);
    expect(hint).not.toMatch(/contactless/);
  });

  it('turns a failing section into an error node and carries on', async () => {
    let calls = 0;
    const tree = await exploreCard({
      atr: fromHex('3B6800000073C84012009000'),
      transmit: async () => {
        calls++;
        if (calls === 1) throw new Error('Card removed');
        return fromHex('6A82');
      },
    });
    expect(tree.children!.some((n) => n.kind === 'error' && n.value === 'Card removed')).toBe(true);
  });
});
