import { useMemo, useState } from 'react';
import type { ExplorerNode } from '@shared/explorer/model';
import { explore } from '../actions';
import { selectedReader, set, useStore } from '../store';
import { Icon } from './icons';
import { MOD } from './TitleBar';

export function ExplorerView() {
  const reader = useStore((s) => selectedReader(s));
  const explorer = useStore((s) => s.explorer);
  const run = useStore((s) => s.run);

  if (!reader?.card) {
    return (
      <div className="explorer-empty">
        <h2>No card</h2>
        <p>
          Put a card on a reader, or click one of the virtual cards in the sidebar to insert it into
          the virtual reader.
        </p>
      </div>
    );
  }

  const stale = explorer.readerId !== reader.id;
  if (explorer.status === 'idle' || stale || !explorer.root) {
    return (
      <div className="explorer-empty">
        <h2>{reader.card.virtualName ?? reader.name}</h2>
        <p>
          Explore reads everything Card Spy understands: the ATR, payment applications and their
          records, NFC tag memory and NDEF, and well-known applications such as PIV and OpenPGP.
        </p>
        <p className="faint">
          On payment cards this sends GET PROCESSING OPTIONS to each payment application, which
          advances the card's transaction counter once per application.
        </p>
        <button
          className="btn primary"
          onClick={() => void explore()}
          disabled={Boolean(run) || explorer.status === 'running'}
        >
          <Icon name="explore" /> Explore card <kbd>{MOD}E</kbd>
        </button>
      </div>
    );
  }

  return (
    <div className="panel-scroll">
      {explorer.status === 'error' && (
        <div className="note error-text" style={{ padding: '8px 12px' }}>
          {explorer.error}
        </div>
      )}
      <Tree root={explorer.root} />
    </div>
  );
}

function initiallyOpen(root: ExplorerNode): Set<string> {
  const open = new Set<string>();
  const walk = (node: ExplorerNode, depth: number) => {
    if (depth < 2 || node.kind === 'application' || node.kind === 'section') open.add(node.id);
    // A lone child (e.g. the 70 template inside a record) opens with its parent.
    if (node.children?.length === 1) open.add(node.children[0]!.id);
    node.children?.forEach((c) => walk(c, depth + 1));
  };
  walk(root, 0);
  return open;
}

function Tree({ root }: { root: ExplorerNode }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const defaults = useMemo(() => initiallyOpen(root), [root]);
  const selection = useStore((s) => s.selection);
  const selectedId = selection?.kind === 'node' ? selection.node.id : undefined;

  const isOpen = (id: string) => !closed.has(id) && (opened.has(id) || defaults.has(id));
  const toggle = (id: string) => {
    if (isOpen(id)) {
      setClosed((s) => new Set(s).add(id));
      setOpened((s) => withoutId(s, id));
    } else {
      setOpened((s) => new Set(s).add(id));
      setClosed((s) => withoutId(s, id));
    }
  };

  // Flatten the visible rows so arrow keys can move through them.
  const rows: Array<{ node: ExplorerNode; depth: number }> = [];
  const walk = (node: ExplorerNode, depth: number) => {
    rows.push({ node, depth });
    if (node.children?.length && isOpen(node.id)) node.children.forEach((c) => walk(c, depth + 1));
  };
  walk(root, 0);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = rows.findIndex((r) => r.node.id === selectedId);
    const current = rows[i]?.node;
    const select = (node?: ExplorerNode) => node && set({ selection: { kind: 'node', node } });
    if (e.key === 'ArrowDown') select(rows[Math.min(rows.length - 1, i + 1)]?.node);
    else if (e.key === 'ArrowUp') select(rows[Math.max(0, i - 1)]?.node);
    else if (e.key === 'ArrowRight' && current?.children?.length && !isOpen(current.id))
      toggle(current.id);
    else if (e.key === 'ArrowLeft' && current && isOpen(current.id) && current.children?.length)
      toggle(current.id);
    else return;
    e.preventDefault();
  };

  return (
    <div className="tree" tabIndex={0} onKeyDown={onKeyDown} style={{ outline: 'none' }}>
      {rows.map(({ node, depth }) => (
        <div
          key={node.id}
          className={`tree-row kind-${node.kind}${node.id === selectedId ? ' selected' : ''}`}
          style={{ paddingLeft: 10 + depth * 16 }}
          onClick={() => set({ selection: { kind: 'node', node } })}
          onDoubleClick={() => node.children?.length && toggle(node.id)}
        >
          <span
            className="twisty"
            onClick={(e) => {
              e.stopPropagation();
              if (node.children?.length) toggle(node.id);
            }}
          >
            {node.children?.length ? (isOpen(node.id) ? '▾' : '▸') : ''}
          </span>
          {node.tag && <span className="tag">{node.tag}</span>}
          <span className="label">{node.label}</span>
          {node.value && (
            <span className={`value${node.kind === 'tlv' || node.kind === 'data' ? ' mono' : ''}`}>
              {node.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function withoutId(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}
