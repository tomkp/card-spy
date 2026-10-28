import { parseAtr } from '@shared/atr';
import { fromHex } from '@shared/hex';
import type { ReaderInfo, ScriptFile, VirtualCardFile } from '@shared/types';
import {
  deleteScript,
  deleteVirtualCard,
  ejectVirtualCard,
  insertVirtualCard,
  newScript,
  renameScript,
  revealWorkspace,
  selectReader,
} from '../actions';
import { disposeModel } from '../scripting/monaco';
import { openScript, useStore } from '../store';
import { confirm, prompt } from './Dialog';
import { Icon } from './icons';

// Selectors must return stable values: a fresh [] on every call makes zustand re-render forever.
const NO_SCRIPTS: ScriptFile[] = [];
const NO_CARDS: VirtualCardFile[] = [];

export function Sidebar() {
  return (
    <div className="panel side">
      <div className="panel-scroll">
        <Readers />
        <Scripts />
        <VirtualCards />
      </div>
    </div>
  );
}

function cardSummary(reader: ReaderInfo): string {
  if (!reader.card)
    return reader.kind === 'virtual' ? 'Empty: insert a virtual card below' : 'No card';
  if (reader.card.virtualName) return reader.card.virtualName;
  const atr = parseAtr(fromHex(reader.card.atr));
  return atr.contactless ? atr.contactless.cardName : atr.summary;
}

function Readers() {
  const readers = useStore((s) => s.readers);
  const readerId = useStore((s) => s.readerId);
  const hardware = readers.filter((r) => r.kind === 'pcsc');
  return (
    <section>
      <div className="section-title">Readers</div>
      <div className="list">
        {readers.map((reader) => (
          <div
            key={reader.id}
            className={`list-item${reader.id === readerId ? ' active' : ''}`}
            onClick={() => selectReader(reader.id)}
            title={reader.name}
          >
            <span className={`dot${reader.card ? ' on' : ''}`} />
            <span className="grow">
              {reader.name}
              <span className="sub">{cardSummary(reader)}</span>
            </span>
            {reader.kind === 'virtual' && reader.card && (
              <span className="actions">
                <button
                  className="icon-btn"
                  title="Eject"
                  onClick={(e) => (e.stopPropagation(), void ejectVirtualCard())}
                >
                  <Icon name="eject" />
                </button>
              </span>
            )}
          </div>
        ))}
        {hardware.length === 0 && (
          <div className="empty">
            No PC/SC readers connected. Plug one in, or use a virtual card.
          </div>
        )}
      </div>
    </section>
  );
}

function Scripts() {
  const scripts = useStore((s) => s.workspace?.scripts ?? NO_SCRIPTS);
  const activeTab = useStore((s) => s.activeTab);
  const drafts = useStore((s) => s.drafts);

  const rename = async (name: string) => {
    const to = await prompt({
      title: 'Rename script',
      initial: name.replace(/\.ts$/, ''),
      confirmLabel: 'Rename',
    });
    if (!to) return;
    disposeModel(name);
    await renameScript(name, to);
  };

  const remove = async (name: string) => {
    const ok = await confirm({
      title: `Delete ${name}?`,
      message: 'The file is removed from your workspace folder.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    disposeModel(name);
    await deleteScript(name);
  };

  return (
    <section>
      <div className="section-title">
        <span className="grow">Scripts</span>
        <button className="icon-btn" title="Open the workspace folder" onClick={revealWorkspace}>
          <Icon name="folder" />
        </button>
        <button className="icon-btn" title="New script" onClick={() => void newScript()}>
          <Icon name="plus" />
        </button>
      </div>
      <div className="list">
        {scripts.map(({ name }) => (
          <div
            key={name}
            className={`list-item${activeTab === name ? ' active' : ''}`}
            onClick={() => openScript(name)}
          >
            <span className="grow mono">
              {name}
              {drafts[name] !== undefined && ' •'}
            </span>
            <span className="actions">
              <button
                className="icon-btn"
                title="Rename"
                onClick={(e) => (e.stopPropagation(), void rename(name))}
              >
                <Icon name="pencil" />
              </button>
              <button
                className="icon-btn"
                title="Delete"
                onClick={(e) => (e.stopPropagation(), void remove(name))}
              >
                <Icon name="trash" />
              </button>
            </span>
          </div>
        ))}
        {scripts.length === 0 && <div className="empty">No scripts yet.</div>}
      </div>
    </section>
  );
}

function VirtualCards() {
  const cards = useStore((s) => s.workspace?.cards ?? NO_CARDS);
  const inserted = useStore((s) => s.readers.find((r) => r.kind === 'virtual')?.card?.virtualName);
  return (
    <section>
      <div className="section-title">Virtual cards</div>
      <div className="list">
        {cards.map((card) => (
          <div
            key={card.id}
            className={`list-item${inserted === card.definition.name ? ' active' : ''}`}
            onClick={() => void insertVirtualCard(card.id)}
            title={card.definition.description ?? 'Insert into the virtual reader'}
          >
            <span className="grow">
              {card.definition.name}
              <span className="sub">
                {card.definition.interface === 'contactless' ? 'Contactless' : 'Contact'} ·{' '}
                {card.definition.model.kind === 'memory'
                  ? 'memory tag'
                  : `${card.definition.model.rules.length} rules`}
              </span>
            </span>
            {card.builtin ? (
              <span className="badge">demo</span>
            ) : (
              <span className="actions">
                <button
                  className="icon-btn"
                  title="Delete"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const ok = await confirm({
                      title: `Delete ${card.definition.name}?`,
                      message: `Removes ${card.id} from your workspace.`,
                      confirmLabel: 'Delete',
                    });
                    if (ok) await deleteVirtualCard(card.id);
                  }}
                >
                  <Icon name="trash" />
                </button>
              </span>
            )}
          </div>
        ))}
        <div className="empty">
          Click a card to insert it. Record a real card from the trace to add your own.
        </div>
      </div>
    </section>
  );
}
