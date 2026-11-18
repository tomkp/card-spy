import { parseAtr } from '@shared/atr';
import { splitResponse } from '@shared/apdu';
import { sendWithResponses } from '@shared/exchange';
import { exploreCard } from '@shared/explorer/explore';
import { fromHex, toHex } from '@shared/hex';
import { describeSw, type SwSeverity } from '@shared/sw';
import type { CardInfo, ExchangeSource, ReaderInfo, TraceEntry } from '@shared/types';
import { VIRTUAL_READER_ID } from '@shared/types';
import { recordVirtualCard, sessionExchanges } from '@shared/virtual/recorder';
import { parseConsoleCommand } from './console-command';
import { errorText, ScriptRun } from './scripting/runner';
import { appendOutput, get, openScript, scriptContent, selectedReader, set } from './store';

const api = window.cardspy;

export async function init(): Promise<void> {
  // Listen before asking for the readers, and take each list as it arrives: one that changed while
  // the rest loaded would otherwise go unseen, with commands for its old card failing.
  const readersChanged = (readers: ReaderInfo[]) => {
    set({ readers });
    chooseReader();
    endWorkForRemovedCards(readers);
  };
  api.onReadersChanged(readersChanged);

  // The same for the trace: entries that arrive before getTrace's answer are in it, and later ones
  // aren't. One lost in between could be a PC/SC error that isn't recorded again for a whole outage.
  // Entries can arrive in bursts (an exploration sends dozens); batch them into one render per frame.
  // A console command's last exchange is selected, so its response shows in the inspector.
  let traceLoaded = false;
  let queued: TraceEntry[] = [];
  api.onTrace((entry) => {
    if (!traceLoaded) return;
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

  const [, , workspace] = await Promise.all([
    api.listReaders().then(readersChanged),
    api.getTrace().then((trace) => {
      set({ trace });
      traceLoaded = true;
    }),
    api.listWorkspace(),
  ]);
  set({ workspace });
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

/** Whether a reader still holds the card from `session`. */
function holdsCard(readers: ReaderInfo[], readerId: string | undefined, session: number): boolean {
  return readers.some((r) => r.id === readerId && r.card?.session === session);
}

/**
 * Ends work on cards that have gone. A card removed and inserted again, or held through a PC/SC
 * service outage, comes back reset, without the application it had selected, a verified PIN or a
 * secure channel. The main process already refuses commands meant for a card that has gone; this
 * stops the script or exploration at once, and says why.
 */
function endWorkForRemovedCards(readers: ReaderInfo[]): void {
  if (current && !holdsCard(readers, current.reader.id, current.session)) current.cardRemoved();
  const { explorer } = get();
  const card = readers.find((r) => r.id === explorer.readerId)?.card;
  if (explorer.session === undefined) {
    // An aborted exploration's message stays for the next card in the reader, and goes with it.
    if (explorer.status === 'error' && card)
      set({ explorer: { ...explorer, session: card.session } });
    return;
  }
  if (card?.session === explorer.session) return;
  if (explorer.status === 'running') {
    exploring?.abort();
    set({
      explorer: {
        status: 'error',
        readerId: explorer.readerId,
        session: card?.session,
        error: 'The card was removed before the exploration finished.',
      },
    });
  } else set({ explorer: { status: 'idle' } });
}

/** Sends APDUs to the card in `session`; they fail once it has gone. */
function transmitter(readerId: string, session: number, source: ExchangeSource) {
  return async (command: Uint8Array) =>
    fromHex(await api.transmit(readerId, session, toHex(command), source));
}

// ---- Console ----

export interface ConsoleResult {
  text: string;
  severity: SwSeverity;
}

/** Runs a line typed in the APDU console. Resolves with a one-line summary of the outcome. */
export async function runConsoleCommand(
  input: string,
  autoResponse: boolean,
): Promise<ConsoleResult> {
  const reader = selectedReader();
  if (!reader?.card) throw new Error('Insert a card first');
  const { session } = reader.card;
  const transmit = transmitter(reader.id, session, 'console');
  const parsed = parseConsoleCommand(input);
  if (parsed.kind === 'reset') {
    const atr = await api.resetCard(reader.id, session, parsed.cold);
    return { text: `${parsed.cold ? 'Cold' : 'Warm'} reset · ATR ${atr}`, severity: 'ok' };
  }
  const command = parsed.apdu;
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
  const target = { readerId: reader.id, session: reader.card.session };
  set({ explorer: { status: 'running', ...target }, activeTab: 'explorer' });
  try {
    const root = await exploreCard({
      transmit: transmitter(target.readerId, target.session, 'explorer'),
      atr: fromHex(reader.card.atr),
      signal: controller.signal,
      onUpdate: (root) => {
        if (!controller.signal.aborted) set({ explorer: { status: 'running', ...target, root } });
      },
    });
    if (!controller.signal.aborted) set({ explorer: { status: 'done', ...target, root } });
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
  current = new ScriptRun(scriptContent(name), reader, reader.card.session, step, {
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
 * Turns everything a card answered since it went in (its session) into a virtual card, saved in
 * the workspace. Returns the file name.
 */
export async function recordCard(
  name: string,
  reader: ReaderInfo,
  card: CardInfo,
): Promise<string> {
  const definition = recordVirtualCard({
    name,
    atr: card.atr,
    interface: parseAtr(fromHex(card.atr)).contactless ? 'contactless' : 'contact',
    exchanges: sessionExchanges(get().trace, card.session),
    description: `Recorded from ${reader.name} on ${new Date().toLocaleString()}`,
  });
  const file = await api.saveVirtualCard(definition);
  await refreshWorkspace();
  return file;
}

export function revealWorkspace(): void {
  void api.revealWorkspace();
}
