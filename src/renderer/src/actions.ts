import { parseAtr } from '@shared/atr';
import { splitResponse } from '@shared/apdu';
import * as commands from '@shared/commands';
import { sendWithResponses } from '@shared/exchange';
import { exploreCard } from '@shared/explorer/explore';
import { fromHex, toHex } from '@shared/hex';
import { describeSw, type SwSeverity } from '@shared/sw';
import type { ExchangeEntry, ExchangeSource, TraceEntry } from '@shared/types';
import { VIRTUAL_READER_ID } from '@shared/types';
import { recordVirtualCard } from '@shared/virtual/recorder';
import { errorText, ScriptRun } from './scripting/runner';
import { appendOutput, get, openScript, scriptContent, selectedReader, set } from './store';

const api = window.cardspy;

export async function init(): Promise<void> {
  const [readers, trace, workspace] = await Promise.all([
    api.listReaders(),
    api.getTrace(),
    api.listWorkspace(),
  ]);
  set({ readers, trace, workspace });
  chooseReader();

  api.onReadersChanged((readers) => {
    set({ readers });
    chooseReader();
    const { explorer } = get();
    const explored = readers.find((r) => r.id === explorer.readerId);
    if (explorer.status !== 'idle' && !explored?.card) set({ explorer: { status: 'idle' } });
  });

  // Entries can arrive in bursts (an exploration sends dozens); batch them into one render per frame.
  // A console command's last exchange is selected, so its response shows in the inspector.
  let queued: TraceEntry[] = [];
  api.onTrace((entry) => {
    if (queued.length === 0) {
      requestAnimationFrame(() => {
        const batch = queued;
        queued = [];
        const fromConsole = batch.findLast((e) => e.type === 'exchange' && e.source === 'console');
        set((s) => ({
          trace: [...s.trace, ...batch].slice(-20_000),
          ...(fromConsole
            ? {
                selection: { kind: 'entry' as const, id: fromConsole.id },
                bottomTab: 'trace' as const,
              }
            : {}),
        }));
      });
    }
    queued.push(entry);
  });
}

/** Keeps a sensible reader selected: the current one if it still exists, else the first with a card. */
function chooseReader(): void {
  const { readers, readerId } = get();
  if (readers.some((r) => r.id === readerId)) return;
  const pick =
    readers.find((r) => r.kind === 'pcsc' && r.card) ?? readers.find((r) => r.card) ?? readers[0];
  set({ readerId: pick?.id });
}

export function selectReader(readerId: string): void {
  set({ readerId });
}

function transmitter(source: ExchangeSource) {
  const reader = selectedReader();
  if (!reader?.card) throw new Error('Insert a card first');
  return async (command: Uint8Array) =>
    fromHex(await api.transmit(reader.id, toHex(command), source));
}

// ---- Console ----

export interface ConsoleResult {
  text: string;
  severity: SwSeverity;
}

/**
 * Raw hex is sent as is. A few shortcuts save typing:
 *   select <aid | name>   read <sfi> <record>   getdata <tag>   uid   reset   reset cold
 * Resolves with a one-line summary of the outcome.
 */
export async function runConsoleCommand(
  input: string,
  autoResponse: boolean,
): Promise<ConsoleResult> {
  const transmit = transmitter('console');
  const [word = '', ...args] = input.trim().split(/\s+/);
  const reader = selectedReader()!;
  let command: Uint8Array;
  switch (word.toLowerCase()) {
    case 'select':
      command = commands.selectByName(commands.nameBytes(args.join('')));
      break;
    case 'read':
      command = commands.readRecord(Number(args[0] ?? 1), Number(args[1] ?? 1));
      break;
    case 'getdata':
      command = commands.getData(args[0] ?? '');
      break;
    case 'uid':
      command = commands.GET_UID;
      break;
    case 'reset': {
      const cold = args[0] === 'cold';
      const atr = await api.resetCard(reader.id, cold);
      return { text: `${cold ? 'Cold' : 'Warm'} reset · ATR ${atr}`, severity: 'ok' };
    }
    default:
      command = fromHex(input);
  }
  if (command.length < 4) throw new Error('An APDU needs at least CLA INS P1 P2');
  const response = autoResponse
    ? await sendWithResponses(transmit, command)
    : splitResponse(await transmit(command));
  const { text, severity } = describeSw(response.sw);
  const bytes = response.data.length ? ` · ${response.data.length} bytes` : '';
  return { text: `${toHex([response.sw1, response.sw2])} ${text}${bytes}`, severity };
}

export function clearTrace(): void {
  void api.clearTrace();
  set({ trace: [], selection: undefined });
}

// ---- Explorer ----

let exploring: AbortController | undefined;

export async function explore(): Promise<void> {
  const reader = selectedReader();
  if (!reader?.card) return;
  exploring?.abort();
  const controller = (exploring = new AbortController());
  set({ explorer: { status: 'running', readerId: reader.id }, activeTab: 'explorer' });
  try {
    const root = await exploreCard({
      transmit: transmitter('explorer'),
      atr: fromHex(reader.card.atr),
      signal: controller.signal,
      onUpdate: (root) => {
        if (!controller.signal.aborted)
          set({ explorer: { status: 'running', readerId: reader.id, root } });
      },
    });
    if (!controller.signal.aborted)
      set({ explorer: { status: 'done', readerId: reader.id, root } });
  } catch (e) {
    if (!controller.signal.aborted) {
      set((s) => ({ explorer: { ...s.explorer, status: 'error', error: errorText(e) } }));
    }
  }
}

export function stopExploring(): void {
  exploring?.abort();
  set((s) => ({ explorer: { ...s.explorer, status: s.explorer.root ? 'done' : 'idle' } }));
}

// ---- Scripts ----

let current: ScriptRun | undefined;

export function runScript(name: string, step = false): void {
  const reader = selectedReader();
  if (current) return;
  set((s) => ({ bottomTab: 'output', errorLines: { ...s.errorLines, [name]: 0 } }));
  if (!reader?.card) {
    appendOutput('No card: insert one (or a virtual card) and select its reader.', 'error');
    return;
  }
  appendOutput(`▶ ${name} on ${reader.name}`, 'system');
  current = new ScriptRun(scriptContent(name), reader, step, {
    log: (text, level) => appendOutput(text, level),
    paused: (command, line) =>
      set({
        run: { script: name, readerId: reader.id, paused: { command, ...(line ? { line } : {}) } },
      }),
    done: (result) => {
      current = undefined;
      set({ run: undefined });
      const time = `${Math.round(result.durationMs)} ms`;
      if (result.stopped) appendOutput(`■ Stopped after ${time}`, 'system');
      else if (result.error) {
        appendOutput(`✖ ${result.error}${result.line ? ` (line ${result.line})` : ''}`, 'error');
        if (result.line) set((s) => ({ errorLines: { ...s.errorLines, [name]: result.line! } }));
      } else appendOutput(`✔ Done in ${time}`, 'system');
    },
  });
  set({ run: { script: name, readerId: reader.id } });
}

export function resumeScript(step: boolean): void {
  set((s) => (s.run ? { run: { script: s.run.script, readerId: s.run.readerId } } : {}));
  current?.resume(step);
}

export function stopScript(): void {
  current?.stop();
}

async function refreshWorkspace(): Promise<void> {
  set({ workspace: await api.listWorkspace() });
}

export async function saveScript(name: string): Promise<void> {
  const draft = get().drafts[name];
  if (draft === undefined) return;
  await api.saveScript(name, draft);
  await refreshWorkspace();
  set((s) => {
    const { [name]: _saved, ...drafts } = s.drafts;
    return { drafts };
  });
}

export async function newScript(): Promise<void> {
  const names = new Set(get().workspace?.scripts.map((s) => s.name));
  let n = 1;
  while (names.has(`untitled-${n}.ts`)) n++;
  const name = `untitled-${n}.ts`;
  await api.saveScript(name, `// ${name}\n\nlog(card.atr);\n`);
  await refreshWorkspace();
  openScript(name);
}

export async function renameScript(from: string, to: string): Promise<void> {
  const name = to.endsWith('.ts') ? to : `${to}.ts`;
  if (name === from) return;
  await api.renameScript(from, name);
  await refreshWorkspace();
  set((s) => {
    const { [from]: draft, ...drafts } = s.drafts;
    return {
      tabs: s.tabs.map((t) => (t === from ? name : t)),
      activeTab: s.activeTab === from ? name : s.activeTab,
      drafts: draft === undefined ? drafts : { ...drafts, [name]: draft },
    };
  });
}

export async function deleteScript(name: string): Promise<void> {
  await api.deleteScript(name);
  await refreshWorkspace();
  set((s) => {
    const tabs = s.tabs.filter((t) => t !== name);
    return { tabs, activeTab: s.activeTab === name ? 'explorer' : s.activeTab };
  });
}

// ---- Virtual cards ----

export async function insertVirtualCard(id: string): Promise<void> {
  const card = get().workspace?.cards.find((c) => c.id === id);
  if (!card) return;
  await api.insertVirtualCard(card.definition);
  set({ readerId: VIRTUAL_READER_ID });
}

export async function ejectVirtualCard(): Promise<void> {
  await api.ejectVirtualCard();
}

export async function deleteVirtualCard(id: string): Promise<void> {
  await api.deleteVirtualCard(id);
  await refreshWorkspace();
}

/**
 * Turns everything sent to the selected reader since its card was inserted into a virtual card,
 * saved in the workspace. Returns the file name.
 */
export async function recordCurrentCard(name: string): Promise<string | undefined> {
  const reader = selectedReader();
  if (!reader?.card) return undefined;
  const { trace } = get();
  let start = 0;
  for (let i = trace.length - 1; i >= 0; i--) {
    const e = trace[i]!;
    if (e.readerId === reader.id && e.type === 'event' && e.event === 'card-inserted') {
      start = i + 1;
      break;
    }
  }
  const exchanges = trace
    .slice(start)
    .filter(
      (e): e is ExchangeEntry & { response: string } =>
        e.type === 'exchange' && e.readerId === reader.id && !!e.response,
    )
    .map(({ command, response }) => ({ command, response }));
  const definition = recordVirtualCard({
    name,
    atr: reader.card.atr,
    interface: parseAtr(fromHex(reader.card.atr)).contactless ? 'contactless' : 'contact',
    exchanges,
    description: `Recorded from ${reader.name} on ${new Date().toLocaleString()}`,
  });
  const file = await api.saveVirtualCard(definition);
  await refreshWorkspace();
  return file;
}

export function revealWorkspace(): void {
  void api.revealWorkspace();
}
