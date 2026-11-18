import type { ReaderInfo } from '@shared/types';

export interface ReaderChoice {
  /** The reader selected now. */
  selected?: string;
  /**
   * The reader the user picked last, or the first one picked for them. It's selected again
   * whenever it's present, so a reader that goes away and comes back gets the selection back.
   * Every PC/SC reader does that in a service outage.
   */
  preferred?: string;
}

/**
 * The selection after the reader list changes: the preferred reader if it's present, else the
 * selected one if it still is, else the first PC/SC reader with a card, any reader with a card, or
 * the first reader. A reader picked only because the preferred one went away doesn't replace it.
 */
export function pickReader(readers: ReaderInfo[], choice: ReaderChoice): ReaderChoice {
  const present = (id: string | undefined) => readers.some((r) => r.id === id);
  if (present(choice.preferred)) return { selected: choice.preferred, preferred: choice.preferred };
  const fallback =
    readers.find((r) => r.kind === 'pcsc' && r.card) ?? readers.find((r) => r.card) ?? readers[0];
  const selected = present(choice.selected) ? choice.selected : fallback?.id;
  return { selected, preferred: choice.preferred ?? selected };
}
