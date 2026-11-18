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

  it('keeps the selection while its reader is present', () => {
    const readers = [virtual, pcsc('A', true)];
    expect(pickReader(readers, { selected: 'virtual:0', preferred: 'virtual:0' }).selected).toBe(
      'virtual:0',
    );
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

  it('returns to the reader the user picked, not the first automatic pick', () => {
    const start = { selected: 'pcsc:B', preferred: 'pcsc:B' };
    expect(
      selections(
        [
          [virtual, pcsc('A', true), pcsc('B')],
          [virtual, pcsc('A', true)],
          [virtual, pcsc('A', true), pcsc('B')],
        ],
        start,
      ),
    ).toEqual(['pcsc:B', 'pcsc:A', 'pcsc:B']);
  });

  it("doesn't let a fallback replace the preferred reader", () => {
    let choice = pickReader([virtual, pcsc('A', true)], {});
    choice = pickReader([virtual, pcsc('B', true)], choice);
    expect(choice).toEqual({ selected: 'pcsc:B', preferred: 'pcsc:A' });
    choice = pickReader([virtual, pcsc('B', true)], choice);
    expect(choice.selected).toBe('pcsc:B');
  });
});
