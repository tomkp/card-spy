import { create } from 'zustand';
import type { ExplorerNode } from '@shared/explorer/model';
import type { ReaderInfo, TraceEntry, WorkspaceListing } from '@shared/types';

export type Selection = { kind: 'entry'; id: number } | { kind: 'node'; node: ExplorerNode };

export interface OutputLine {
  id: number;
  text: string;
  level: 'info' | 'error' | 'system';
}

export interface ExplorerState {
  status: 'idle' | 'running' | 'done' | 'error';
  readerId?: string;
  root?: ExplorerNode;
  error?: string;
}

export interface RunState {
  script: string;
  readerId: string;
  paused?: { command: string; line?: number };
}

interface State {
  readers: ReaderInfo[];
  readerId?: string;
  trace: TraceEntry[];
  selection?: Selection;
  workspace?: WorkspaceListing;

  /** Open editor tabs by script name; "explorer" is always first. */
  tabs: string[];
  activeTab: string;
  /** Unsaved editor contents by script name. */
  drafts: Record<string, string>;
  /** Line of the last script error, by script name, to mark in the editor. */
  errorLines: Record<string, number>;

  explorer: ExplorerState;
  output: OutputLine[];
  run?: RunState;
  bottomTab: 'trace' | 'output';
}

export const EXPLORER_TAB = 'explorer';

export const useStore = create<State>(() => ({
  readers: [],
  trace: [],
  tabs: [EXPLORER_TAB],
  activeTab: EXPLORER_TAB,
  drafts: {},
  errorLines: {},
  explorer: { status: 'idle' },
  output: [],
  bottomTab: 'trace',
}));

export const set = useStore.setState;
export const get = useStore.getState;

export function selectedReader(state: State = get()): ReaderInfo | undefined {
  return state.readers.find((r) => r.id === state.readerId);
}

let nextLine = 1;

export function appendOutput(text: string, level: OutputLine['level'] = 'info'): void {
  set((s) => ({ output: [...s.output.slice(-4999), { id: nextLine++, text, level }] }));
}

export function openScript(name: string): void {
  set((s) => ({ tabs: s.tabs.includes(name) ? s.tabs : [...s.tabs, name], activeTab: name }));
}

export function closeTab(name: string): void {
  if (name === EXPLORER_TAB) return;
  set((s) => {
    const tabs = s.tabs.filter((t) => t !== name);
    const { [name]: _discarded, ...drafts } = s.drafts;
    const i = s.tabs.indexOf(name);
    const activeTab =
      s.activeTab === name ? (tabs[Math.max(0, i - 1)] ?? EXPLORER_TAB) : s.activeTab;
    return { tabs, drafts, activeTab };
  });
}

export function scriptContent(name: string, state: State = get()): string {
  return state.drafts[name] ?? state.workspace?.scripts.find((s) => s.name === name)?.content ?? '';
}
