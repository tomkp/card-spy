import type { CardSpyApi } from '@shared/types';

declare global {
  interface Window {
    cardspy: CardSpyApi;
  }
}
