import type { ReaderInfo } from '@shared/types';

export interface ReaderChoice {
  /** The reader selected now. */
  selected?: string;
  /**
   * The reader the user picked last, or the first reader with a card picked for them. When it goes
   * away and comes back, as every PC/SC reader does in a service outage, it gets the selection back.
   */
  preferred?: string;
}

/**
 * The selection after the reader list changes.
 *
 * - The preferred reader, if it's present, unless the selection has moved to another hardware
 *   reader that has a card: that card may be in use, and it's safer not to switch cards under it.
 * - Else the selected reader, if it's still present and something is preferred.
 * - Else the first PC/SC reader with a card, then any reader with a card, then the first reader.
 *   Until a reader with a card has been picked, this runs again on every change, so a card that
 *   connects just after its reader appears still gets picked.
 */
export function pickReader(readers: ReaderInfo[], choice: ReaderChoice): ReaderChoice {
  const find = (id: string | undefined) => readers.find((r) => r.id === id);
  const selected = find(choice.selected);
  const inUse = selected?.kind === 'pcsc' && selected.card !== undefined;
  if (find(choice.preferred) && !inUse) {
    return { selected: choice.preferred, preferred: choice.preferred };
  }
  if (selected && choice.preferred !== undefined) return choice;
  const pick =
    readers.find((r) => r.kind === 'pcsc' && r.card) ?? readers.find((r) => r.card) ?? readers[0];
  return { selected: pick?.id, preferred: choice.preferred ?? (pick?.card ? pick.id : undefined) };
}
