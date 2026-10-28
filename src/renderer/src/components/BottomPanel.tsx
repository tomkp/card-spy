import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { describeCommand } from '@shared/apdu';
import { fromHex } from '@shared/hex';
import { describeSw } from '@shared/sw';
import type { CardEventKind, TraceEntry } from '@shared/types';
import { clearTrace, recordCurrentCard, runConsoleCommand } from '../actions';
import { errorText } from '../scripting/runner';
import { selectedReader, set, useStore } from '../store';
import { prompt } from './Dialog';
import { Icon } from './icons';

export function BottomPanel() {
  const tab = useStore((s) => s.bottomTab);
  const traceCount = useStore((s) => s.trace.length);
  const outputCount = useStore((s) => s.output.length);
  const [filter, setFilter] = useState('');
  const hasCard = useStore((s) => Boolean(selectedReader(s)?.card));

  const record = async () => {
    const reader = selectedReader();
    const name = await prompt({
      title: 'Save as virtual card',
      message: `Everything sent to ${reader?.name ?? 'this reader'} since the card went in becomes a virtual card you can replay without the real one.`,
      initial: reader?.card?.virtualName
        ? `${reader.card.virtualName} (recorded)`
        : 'Recorded card',
      confirmLabel: 'Save',
    });
    if (name) await recordCurrentCard(name);
  };

  return (
    <div className="panel">
      <div className="toolbar">
        <div className="seg">
          <button
            className={`seg-btn${tab === 'trace' ? ' active' : ''}`}
            onClick={() => set({ bottomTab: 'trace' })}
          >
            Trace<span className="count">{traceCount}</span>
          </button>
          <button
            className={`seg-btn${tab === 'output' ? ' active' : ''}`}
            onClick={() => set({ bottomTab: 'output' })}
          >
            Output{outputCount > 0 && <span className="count">{outputCount}</span>}
          </button>
        </div>
        <span className="grow" />
        {tab === 'trace' ? (
          <>
            <input
              className="search"
              placeholder="Filter: name, hex, SW…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              spellCheck={false}
            />
            <button
              className="btn small"
              onClick={() => void record()}
              disabled={!hasCard}
              title="Save this card's session as a virtual card"
            >
              <Icon name="record" size={10} /> Save as virtual card
            </button>
            <button className="btn small" onClick={clearTrace}>
              Clear
            </button>
          </>
        ) : (
          <button className="btn small" onClick={() => set({ output: [] })}>
            Clear
          </button>
        )}
      </div>
      {tab === 'trace' ? (
        <>
          <TraceList filter={filter} />
          <Console />
        </>
      ) : (
        <Output />
      )}
    </div>
  );
}

const ROW = 22;

interface Row {
  entry: TraceEntry;
  name: string;
  search: string;
}

function describeEntry(entry: TraceEntry): Row {
  if (entry.type === 'event') {
    const name = EVENT_NAMES[entry.event];
    return { entry, name, search: `${name} ${entry.readerName} ${entry.atr ?? ''}`.toLowerCase() };
  }
  const { name, detail } = describeCommand(fromHex(entry.command));
  const label = detail ? `${name} ${detail}` : name;
  const sw = entry.response?.slice(-4) ?? '';
  return {
    entry,
    name: label,
    search: `${label} ${entry.command} ${sw} ${entry.source}`.toLowerCase(),
  };
}

const EVENT_NAMES: Record<CardEventKind, string> = {
  'reader-attached': 'Reader attached',
  'reader-detached': 'Reader detached',
  'card-inserted': 'Card inserted',
  'card-removed': 'Card removed',
  'card-reset': 'Card reset',
};

function TraceList({ filter }: { filter: string }) {
  const trace = useStore((s) => s.trace);
  const selection = useStore((s) => s.selection);
  const selectedId = selection?.kind === 'entry' ? selection.id : undefined;
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 300 });
  const pinned = useRef(true);

  // Describing an entry decodes its APDU, so do it once per entry rather than on every scroll.
  const described = useMemo(() => new WeakMap<TraceEntry, Row>(), []);
  const rows = useMemo(() => {
    const all = trace.map((entry) => {
      let row = described.get(entry);
      if (!row) described.set(entry, (row = describeEntry(entry)));
      return row;
    });
    const q = filter.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!q) return all;
    const compact = q.replace(/\s/g, '');
    return all.filter((r) => r.search.includes(q) || r.search.replace(/\s/g, '').includes(compact));
  }, [trace, filter, described]);

  useEffect(() => {
    const el = scroller.current!;
    const measure = () => setView({ top: el.scrollTop, height: el.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  // Follow new entries while the list is scrolled to the bottom.
  useLayoutEffect(() => {
    const el = scroller.current!;
    if (pinned.current) el.scrollTop = el.scrollHeight;
  }, [rows.length]);

  const first = Math.max(0, Math.floor(view.top / ROW) - 10);
  const last = Math.min(rows.length, Math.ceil((view.top + view.height) / ROW) + 10);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = rows.findIndex((r) => r.entry.id === selectedId);
    const next =
      rows[e.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1)];
    if (!next) return;
    set({ selection: { kind: 'entry', id: next.entry.id } });
    const index = rows.indexOf(next);
    const el = scroller.current!;
    if (index * ROW < el.scrollTop) el.scrollTop = index * ROW;
    else if ((index + 1) * ROW > el.scrollTop + el.clientHeight)
      el.scrollTop = (index + 1) * ROW - el.clientHeight;
  };

  return (
    <div
      ref={scroller}
      className="panel-scroll"
      tabIndex={0}
      style={{ outline: 'none' }}
      onKeyDown={onKeyDown}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollTop + el.clientHeight >= el.scrollHeight - ROW;
        setView({ top: el.scrollTop, height: el.clientHeight });
      }}
    >
      {rows.length === 0 && (
        <div className="empty" style={{ padding: 14 }}>
          {trace.length === 0
            ? 'Every APDU sent to a card appears here: from the console below, the explorer and scripts.'
            : 'Nothing matches the filter.'}
        </div>
      )}
      <div className="trace-rows" style={{ height: rows.length * ROW }}>
        {rows.slice(first, last).map((row, i) => (
          <TraceRow
            key={row.entry.id}
            row={row}
            top={(first + i) * ROW}
            selected={row.entry.id === selectedId}
          />
        ))}
      </div>
    </div>
  );
}

function time(ms: number): string {
  const d = new Date(ms);
  return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function TraceRow({ row, top, selected }: { row: Row; top: number; selected: boolean }) {
  const { entry } = row;
  const select = () => set({ selection: { kind: 'entry', id: entry.id } });
  if (entry.type === 'event') {
    return (
      <div
        className={`trace-row event${selected ? ' selected' : ''}`}
        style={{ top }}
        onClick={select}
      >
        <span className="num mono">{entry.id}</span>
        <span className="mono faint">{time(entry.at)}</span>
        <span className="what">
          {row.name} · {entry.readerName}
          {entry.atr ? <span className="mono"> · ATR {entry.atr}</span> : null}
        </span>
      </div>
    );
  }
  const sw = entry.response && entry.response.length >= 4 ? entry.response.slice(-4) : undefined;
  const severity = sw ? describeSw(parseInt(sw, 16)).severity : 'error';
  return (
    <div className={`trace-row${selected ? ' selected' : ''}`} style={{ top }} onClick={select}>
      <span className="num mono">{entry.id}</span>
      <span className="mono faint">{time(entry.startedAt)}</span>
      <span className={`src ${entry.source}`}>{entry.source}</span>
      <span title={row.name}>{row.name}</span>
      <span className="cmd mono">{entry.command}</span>
      <span className={`sw ${severity}`} title={entry.error}>
        {sw ?? 'ERR'}
      </span>
      <span className="ms mono">{entry.durationMs.toFixed(1)}ms</span>
    </div>
  );
}

function Console() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const [autoResponse, setAutoResponse] = useState(true);
  const history = useRef<string[]>([]);
  const position = useRef(0);
  const hasCard = useStore((s) => Boolean(selectedReader(s)?.card));

  const submit = async () => {
    const input = value.trim();
    if (!input) return;
    history.current = [...history.current.filter((h) => h !== input), input].slice(-200);
    position.current = history.current.length;
    setError(undefined);
    try {
      await runConsoleCommand(input, autoResponse);
      setValue('');
    } catch (e) {
      setError(errorText(e));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'ArrowUp' && history.current.length) {
      e.preventDefault();
      position.current = Math.max(0, position.current - 1);
      setValue(history.current[position.current] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      position.current = Math.min(history.current.length, position.current + 1);
      setValue(history.current[position.current] ?? '');
    }
  };

  return (
    <div className="console">
      <span className="prompt">›</span>
      <input
        id="console-input"
        type="text"
        value={value}
        disabled={!hasCard}
        placeholder={
          hasCard
            ? 'APDU in hex (00 A4 04 00 …) or: select <aid|name> · read <sfi> <rec> · getdata <tag> · uid · reset'
            : 'Insert a card to send APDUs'
        }
        onChange={(e) => {
          setValue(e.target.value);
          setError(undefined);
        }}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoComplete="off"
      />
      {error && (
        <span className="error" title={error}>
          {error}
        </span>
      )}
      <label
        className="check"
        title="Follow 61xx with GET RESPONSE and resend 6Cxx with the right Le"
      >
        <input
          type="checkbox"
          checked={autoResponse}
          onChange={(e) => setAutoResponse(e.target.checked)}
        />{' '}
        Auto GET RESPONSE
      </label>
    </div>
  );
}

function Output() {
  const output = useStore((s) => s.output);
  const end = useRef<HTMLDivElement>(null);
  // Block body on purpose: scrollIntoView returns a Promise in current Chromium, and React would
  // take a returned value for a cleanup function.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [output.length]);
  return (
    <div className="panel-scroll">
      <div className="output">
        {output.length === 0 && (
          <div className="faint">Script output appears here. Open a script and press Run.</div>
        )}
        {output.map((line) => (
          <div key={line.id} className={`output-line ${line.level}`}>
            {line.text}
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}
