import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReaderInfo, TraceEntry } from '@shared/types';
import type { RunCallbacks } from './scripting/runner';

// actions.ts reads window.cardspy when it loads, so the fake API is in place before it's imported.
const fake = vi.hoisted(() => {
  const fake = {
    readersChanged: (_readers: ReaderInfo[]) => {},
    traced: (_entry: TraceEntry) => {},
    runs: [] as Array<{ reader: ReaderInfo; session: number; cardRemoved: () => void }>,
    api: {
      listReaders: vi.fn(async (): Promise<ReaderInfo[]> => []),
      getTrace: vi.fn(async (): Promise<TraceEntry[]> => []),
      listWorkspace: vi.fn(async () => ({ root: '', scripts: [], cards: [] })),
      onReadersChanged: vi.fn((listener: (readers: ReaderInfo[]) => void) => {
        fake.readersChanged = listener;
        return () => {};
      }),
      onTrace: vi.fn((listener: (entry: TraceEntry) => void) => {
        fake.traced = listener;
        return () => {};
      }),
      transmit: vi.fn(
        async (_readerId: string, _session: number, _command: string, _source: string) => '9000',
      ),
      resetCard: vi.fn(async (_readerId: string, _session: number, _cold?: boolean) => '3B00'),
    },
  };
  vi.stubGlobal('window', { cardspy: fake.api });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 0));
  return fake;
});

// The real runner starts a Web Worker; this one records the runs, and ends one when told to.
vi.mock('./scripting/runner', () => ({
  errorText: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  ScriptRun: class {
    cardRemoved = vi.fn(() => this.callbacks.done({ error: 'removed', durationMs: 0 }));
    constructor(
      _code: string,
      readonly reader: ReaderInfo,
      readonly session: number,
      _step: boolean,
      private callbacks: RunCallbacks,
    ) {
      fake.runs.push(this);
    }
  },
}));

const { explore, init, runConsoleCommand, runScript } = await import('./actions');
const { get, set } = await import('./store');

const reader = (session?: number): ReaderInfo => ({
  id: 'pcsc:R',
  name: 'R',
  kind: 'pcsc',
  ...(session === undefined ? {} : { card: { atr: '3B00', insertedAt: 0, session } }),
});

beforeEach(async () => {
  vi.clearAllMocks();
  fake.runs.length = 0;
  set({ explorer: { status: 'idle' }, run: undefined, readerId: undefined });
  fake.api.listReaders.mockResolvedValue([reader(1)]);
  await init();
});

describe('work on a card ends with the card', () => {
  it('sends console commands to the card they were typed for', async () => {
    await runConsoleCommand('00A4040000', false);
    await runConsoleCommand('reset', false);
    expect(fake.api.transmit).toHaveBeenCalledWith('pcsc:R', 1, '00A4040000', 'console');
    expect(fake.api.resetCard).toHaveBeenCalledWith('pcsc:R', 1, false);
  });

  it('aborts an exploration when its card is replaced, and says so', async () => {
    let answer!: (response: string) => void;
    fake.api.transmit.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const exploring = explore();
    expect(get().explorer).toMatchObject({ status: 'running', readerId: 'pcsc:R', session: 1 });

    // Removed and inserted again (or held through a short PC/SC outage): a new session.
    fake.readersChanged([reader(2)]);
    expect(get().explorer).toEqual({
      status: 'error',
      readerId: 'pcsc:R',
      session: 2,
      error: 'The card was removed before the exploration finished.',
    });

    answer('9000');
    await exploring;
    expect(get().explorer.status).toBe('error');
    // Nothing more was sent once the exploration was aborted.
    expect(fake.api.transmit).toHaveBeenCalledTimes(1);
  });

  it('keeps that message for the next card in the reader, and drops it with that card', async () => {
    fake.api.transmit.mockImplementationOnce(() => new Promise(() => {}));
    void explore();
    fake.readersChanged([reader()]);
    fake.readersChanged([reader(2)]);
    expect(get().explorer).toMatchObject({ status: 'error', session: 2 });
    fake.readersChanged([reader(2)]);
    expect(get().explorer.status).toBe('error');
    fake.readersChanged([reader()]);
    expect(get().explorer).toEqual({ status: 'idle' });
  });

  it("drops an exploration's results when its card goes", async () => {
    await explore();
    expect(get().explorer.status).toBe('done');
    fake.readersChanged([reader()]);
    expect(get().explorer).toEqual({ status: 'idle' });
  });

  it('stops a script when its card goes', () => {
    set({ workspace: { root: '', scripts: [{ name: 'a.ts', content: '' }], cards: [] } });
    runScript('a.ts');
    const [run] = fake.runs;
    expect(run).toMatchObject({ session: 1 });

    fake.readersChanged([reader(1)]);
    expect(run!.cardRemoved).not.toHaveBeenCalled();
    fake.readersChanged([reader(2)]);
    expect(run!.cardRemoved).toHaveBeenCalled();
    expect(get().run).toBeUndefined();
  });

  it('takes a reader change that arrives while the app is loading', async () => {
    fake.readersChanged = () => {};
    set({ readers: [] });
    let traceLoaded!: (trace: TraceEntry[]) => void;
    fake.api.getTrace.mockImplementationOnce(
      () => new Promise((resolve) => (traceLoaded = resolve)),
    );
    const loading = init();
    await vi.waitFor(() => expect(get().readers).toEqual([reader(1)]));
    // The card is replaced after listReaders answered, before the rest has loaded.
    fake.readersChanged([reader(2)]);
    traceLoaded([]);
    await loading;
    await runConsoleCommand('00A4040000', false);
    expect(fake.api.transmit).toHaveBeenCalledWith('pcsc:R', 2, '00A4040000', 'console');
  });

  it('keeps a trace entry that arrives while the app is loading', async () => {
    const error = (id: number): TraceEntry => ({ type: 'pcsc-error', id, message: 'down', at: 0 });
    fake.traced = () => {};
    let traceLoaded!: (trace: TraceEntry[]) => void;
    let workspaceLoaded!: (workspace: { root: string; scripts: []; cards: [] }) => void;
    fake.api.getTrace.mockImplementationOnce(
      () => new Promise((resolve) => (traceLoaded = resolve)),
    );
    fake.api.listWorkspace.mockImplementationOnce(
      () => new Promise((resolve) => (workspaceLoaded = resolve)),
    );
    const loading = init();
    // Sent before getTrace's answer, so it's in that answer.
    fake.traced(error(1));
    traceLoaded([error(1)]);
    await vi.waitFor(() => expect(get().trace).toEqual([error(1)]));
    // Sent after it, while the workspace is still loading.
    fake.traced(error(2));
    workspaceLoaded({ root: '', scripts: [], cards: [] });
    await loading;
    await vi.waitFor(() => expect(get().trace).toEqual([error(1), error(2)]));
  });
});
