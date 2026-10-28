import type { ReaderInfo } from '@shared/types';
import type { HostMessage, WorkerMessage } from './protocol';
import ScriptWorker from './worker?worker';

export interface RunResult {
  error?: string;
  line?: number;
  durationMs: number;
  stopped?: boolean;
}

export interface RunCallbacks {
  log(text: string, level: 'info' | 'error'): void;
  paused(command: string, line?: number): void;
  done(result: RunResult): void;
}

/**
 * Runs one script in its own worker against one reader. Stopping terminates the worker,
 * which is the only reliable way to halt a script that is stuck in a loop.
 */
export class ScriptRun {
  private worker = new ScriptWorker();
  private started = performance.now();
  private finished = false;

  constructor(
    code: string,
    private reader: ReaderInfo,
    step: boolean,
    private callbacks: RunCallbacks,
  ) {
    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => void this.handle(event.data);
    this.worker.onerror = (event) =>
      this.finish({ error: event.message, durationMs: this.elapsed() });
    this.send({ type: 'run', code, reader: reader.name, atr: reader.card?.atr ?? '', step });
  }

  /** Continue after a pause: `step` pauses again before the next APDU. */
  resume(step: boolean): void {
    this.send({ type: 'resume', step });
  }

  stop(): void {
    this.finish({ stopped: true, durationMs: this.elapsed() });
  }

  private async handle(message: WorkerMessage): Promise<void> {
    switch (message.type) {
      case 'transmit':
        try {
          const response = await window.cardspy.transmit(this.reader.id, message.command, 'script');
          this.send({ type: 'transmit-result', id: message.id, response });
        } catch (e) {
          this.send({ type: 'transmit-result', id: message.id, error: errorText(e) });
        }
        break;
      case 'reset':
        try {
          const atr = await window.cardspy.resetCard(this.reader.id, message.cold);
          this.send({ type: 'reset-result', id: message.id, atr });
        } catch (e) {
          this.send({ type: 'reset-result', id: message.id, error: errorText(e) });
        }
        break;
      case 'log':
        this.callbacks.log(message.text, message.level);
        break;
      case 'paused':
        this.callbacks.paused(message.command, message.line);
        break;
      case 'done':
        this.finish(message);
        break;
    }
  }

  private send(message: HostMessage): void {
    if (!this.finished) this.worker.postMessage(message);
  }

  private finish(result: RunResult): void {
    if (this.finished) return;
    this.finished = true;
    this.worker.terminate();
    this.callbacks.done(result);
  }

  private elapsed(): number {
    return performance.now() - this.started;
  }
}

/**
 * Errors from ipcRenderer.invoke arrive as "Error invoking remote method '…': <Name>: <message>",
 * where Name is Error or one of smartcard's typed PC/SC errors (PCSCError, CardRemovedError…).
 */
export function errorText(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '');
}
