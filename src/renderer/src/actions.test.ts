import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReaderInfo } from '@shared/types';

// actions.ts reads window.cardspy when it loads, so the fake API is in place before it's imported.
const fake = vi.hoisted(() => {
  const fake = {
    readersChanged: (_readers: ReaderInfo[]) => {},
    runs: [] as Array<{ reader: ReaderInfo; session: number; cardRemoved: () => void }>,
    api: {
      listReaders: vi.fn(async (): Promise<ReaderInfo[]> => []),
      getTrace: vi.fn(async () => []),
      listWorkspace: vi.fn(async () => ({ root: '', scripts: [], cards: [] })),
      onReadersChanged: vi.fn((listener: (readers: ReaderInfo[]) => void) => {
        fake.readersChanged = listener;
        return () => {};
      }),
      onTrace: vi.fn(() => () => {}),
      transmit: vi.fn(
        async (_readerId: string, _session: number, _command: string, _source: string) => '9000',
      ),
      resetCard: vi.fn(async (_readerId: string, _session: number, _cold?: boolean) => '3B00'),
    },
  };
  vi.stubGlobal('window', { cardspy: fake.api });
  return fake;
});

// The real runner starts a Web Worker; this one records the runs.
vi.mock('./scripting/runner', () => ({
  errorText: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  ScriptRun: class {
    cardRemoved = vi.fn();
    constructor(
      _code: string,
      readonly reader: ReaderInfo,
      readonly session: number,
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
      error: 'The card was removed before the exploration finished.',
    });

    answer('9000');
    await exploring;
    expect(get().explorer.status).toBe('error');
    // Nothing more was sent once the exploration was aborted.
    expect(fake.api.transmit).toHaveBeenCalledTimes(1);
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
  });
});
