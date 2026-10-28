/** Messages between the script worker and the page that hosts it. */

export type HostMessage =
  | { type: 'run'; code: string; reader: string; atr: string; step: boolean }
  | { type: 'transmit-result'; id: number; response?: string; error?: string }
  | { type: 'reset-result'; id: number; atr?: string; error?: string }
  | { type: 'resume'; step: boolean };

export type WorkerMessage =
  | { type: 'transmit'; id: number; command: string }
  | { type: 'reset'; id: number; cold: boolean }
  | { type: 'log'; text: string; level: 'info' | 'error' }
  /** Stepping: about to send `command` from `line`; waits for a `resume`. */
  | { type: 'paused'; command: string; line?: number }
  | { type: 'done'; error?: string; line?: number; durationMs: number };
