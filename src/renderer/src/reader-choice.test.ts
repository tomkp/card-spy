import { describe, expect, it } from 'vitest';
import type { CardInfo, ReaderInfo } from '@shared/types';
import { pickReader, type ReaderChoice } from './reader-choice';

/** Only whether a reader has a card matters here. */
const card = { atr: '3B00' } as CardInfo;
const virtual: ReaderInfo = { id: 'virtual:0', name: 'Virtual Reader', kind: 'virtual' };
const pcsc = (name: string, inserted = false): ReaderInfo => ({
  id: `pcsc:${name}`,
  name,
  kind: 'pcsc',
  ...(inserted ? { card } : {}),
});

/** Feeds each reader list to pickReader in turn, as the readers-changed events would. */
function selections(lists: ReaderInfo[][], start: ReaderChoice = {}): Array<string | undefined> {
  let choice = start;
  return lists.map((readers) => (choice = pickReader(readers, choice)).selected);
}

describe('pickReader', () => {
  it('picks a PC/SC reader with a card, then any reader with a card, then the first', () => {
    expect(pickReader([virtual, pcsc('A'), pcsc('B', true)], {}).selected).toBe('pcsc:B');
    expect(pickReader([pcsc('A'), { ...virtual, card }], {}).selected).toBe('virtual:0');
    expect(pickReader([virtual, pcsc('A')], {}).selected).toBe('virtual:0');
    expect(pickReader([], {})).toEqual({ selected: undefined, preferred: undefined });
  });

  it('keeps a present selection when the preferred reader is gone', () => {
    const choice = { selected: 'virtual:0', preferred: 'pcsc:A' };
    expect(pickReader([virtual, pcsc('B', true)], choice)).toEqual(choice);
  });

  it('gives the selection back to a reader that goes away and comes back', () => {
    // A PC/SC service outage: the reader is detached, then attached again, then its card is back.
    expect(
      selections([
        [virtual, pcsc('A', true)],
        [virtual, pcsc('A')],
        [virtual],
        [virtual, pcsc('A')],
        [virtual, pcsc('A', true)],
      ]),
    ).toEqual(['pcsc:A', 'pcsc:A', 'virtual:0', 'pcsc:A', 'pcsc:A']);
  });

  it('gives the selection back to the reader the user picked, not the one picked for them', () => {
    const first = pickReader([virtual, pcsc('A', true), pcsc('B')], {});
    expect(first).toEqual({ selected: 'pcsc:A', preferred: 'pcsc:A' });
    // The user clicks B (selectReader), which then goes away and comes back.
    const clicked = { selected: 'pcsc:B', preferred: 'pcsc:B' };
    expect(
      selections(
        [
          [virtual, pcsc('A')],
          [virtual, pcsc('A'), pcsc('B')],
        ],
        clicked,
      ),
    ).toEqual(['virtual:0', 'pcsc:B']);
  });

  it('leaves the selection on another hardware reader with a card', () => {
    // A is unplugged and B, with a card, is picked instead: B may be in use, so A doesn't take it back.
    expect(
      selections([
        [virtual, pcsc('A', true), pcsc('B', true)],
        [virtual, pcsc('B', true)],
        [virtual, pcsc('A'), pcsc('B', true)],
        [virtual, pcsc('A', true), pcsc('B', true)],
      ]),
    ).toEqual(['pcsc:A', 'pcsc:B', 'pcsc:B', 'pcsc:B']);
  });

  it('picks the card that connects just after its reader appears', () => {
    // smartcard reports a reader before it has connected to the card in it.
    expect(
      selections([
        [virtual, pcsc('A')],
        [virtual, pcsc('A', true)],
      ]),
    ).toEqual(['virtual:0', 'pcsc:A']);
  });

  it("doesn't let a fallback replace the preferred reader", () => {
    let choice = pickReader([virtual, pcsc('A', true)], {});
    choice = pickReader([virtual], choice);
    expect(choice).toEqual({ selected: 'virtual:0', preferred: 'pcsc:A' });
    choice = pickReader([virtual, pcsc('A')], choice);
    expect(choice.selected).toBe('pcsc:A');
  });
});
