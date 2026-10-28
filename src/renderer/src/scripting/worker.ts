import { transform } from 'sucrase';
import { fromHex, toHex } from '@shared/hex';
import type { HostMessage, WorkerMessage } from './protocol';
import { createRuntime } from './runtime';

/** The parts of the worker global scope used here (the DOM and webworker libs can't both be in one tsconfig). */
interface WorkerScope {
  postMessage(message: WorkerMessage): void;
  onmessage: ((event: MessageEvent<HostMessage>) => void) | null;
  addEventListener(
    type: 'unhandledrejection',
    listener: (event: PromiseRejectionEvent) => void,
  ): void;
}
const scope = self as unknown as WorkerScope;

const post = (message: WorkerMessage) => scope.postMessage(message);

let nextId = 1;
const pending = new Map<
  number,
  { resolve: (value: string) => void; reject: (error: Error) => void }
>();
let stepping = false;
let resume: (() => void) | undefined;
let scriptUrl = '';

function request(
  message: { type: 'transmit'; command: string } | { type: 'reset'; cold: boolean },
): Promise<string> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    post({ ...message, id });
  });
}

/** Line in the user's script that is running now, from the stack (sucrase keeps line numbers). */
function currentLine(stack = new Error().stack ?? ''): number | undefined {
  for (const frame of stack.split('\n')) {
    const i = frame.indexOf(scriptUrl);
    if (i === -1) continue;
    const match = frame.slice(i + scriptUrl.length).match(/^:(\d+):\d+/);
    if (match) return Number(match[1]);
  }
  return undefined;
}

async function transmit(command: Uint8Array): Promise<Uint8Array> {
  const hex = toHex(command);
  if (stepping) {
    await new Promise<void>((r) => {
      resume = r;
      post({ type: 'paused', command: hex, ...withLine(currentLine()) });
    });
  }
  return fromHex(await request({ type: 'transmit', command: hex }));
}

function withLine(line: number | undefined): { line?: number } {
  return line === undefined ? {} : { line };
}

async function run(message: Extract<HostMessage, { type: 'run' }>): Promise<void> {
  const started = performance.now();
  stepping = message.step;
  const runtime = createRuntime({
    reader: message.reader,
    atr: message.atr,
    transmit,
    reset: (cold) => request({ type: 'reset', cold }),
    log: (text, level) => post({ type: 'log', text, level }),
  });
  Object.assign(globalThis, runtime);

  try {
    const { code } = transform(message.code, {
      transforms: ['typescript'],
      disableESTransforms: true,
    });
    scriptUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    await import(/* @vite-ignore */ scriptUrl);
    post({ type: 'done', durationMs: performance.now() - started });
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    post({
      type: 'done',
      error: error.message,
      ...withLine(currentLine(error.stack) ?? syntaxErrorLine(error)),
      durationMs: performance.now() - started,
    });
  }
}

/** Sucrase reports parse errors as "message (line:column)". */
function syntaxErrorLine(error: Error): number | undefined {
  const match = error.message.match(/\((\d+):\d+\)$/);
  return match ? Number(match[1]) : undefined;
}

// A promise the script forgot to await can still fail; say so rather than lose it.
scope.addEventListener('unhandledrejection', (event) => {
  post({
    type: 'log',
    text: `Unhandled: ${event.reason instanceof Error ? event.reason.message : String(event.reason)}`,
    level: 'error',
  });
});

scope.onmessage = (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'run':
      void run(message);
      break;
    case 'transmit-result':
    case 'reset-result': {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (!waiter) break;
      if (message.error !== undefined) waiter.reject(new Error(message.error));
      else waiter.resolve(message.type === 'transmit-result' ? message.response! : message.atr!);
      break;
    }
    case 'resume':
      stepping = message.step;
      resume?.();
      resume = undefined;
      break;
  }
};
