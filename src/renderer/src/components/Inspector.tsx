import { useState } from 'react';
import { describeCommand, splitResponse, tryParseCommand } from '@shared/apdu';
import { parseAtr } from '@shared/atr';
import type { ExplorerNode } from '@shared/explorer/model';
import { fromHex, isPrintable, toAscii, toHex } from '@shared/hex';
import { describeSw } from '@shared/sw';
import { decodeTagValue, lookupTag } from '@shared/tags/emv';
import { looksLikeTlv, parseTlv, type TlvNode } from '@shared/tlv';
import type { CardEventEntry, ExchangeEntry } from '@shared/types';
import { useStore } from '../store';
import { Icon } from './icons';

export function Inspector() {
  const selection = useStore((s) => s.selection);
  const entry = useStore((s) =>
    s.selection?.kind === 'entry'
      ? s.trace.find((e) => e.id === (s.selection as { id: number }).id)
      : undefined,
  );

  return (
    <div className="panel side">
      <div className="section-title">Inspector</div>
      <div className="panel-scroll">
        {entry?.type === 'exchange' && <ExchangeInspector entry={entry} />}
        {entry?.type === 'event' && <EventInspector entry={entry} />}
        {selection?.kind === 'node' && <NodeInspector node={selection.node} />}
        {!selection && (
          <div className="empty">
            Select an APDU in the trace or a node in the explorer to see what it means.
          </div>
        )}
      </div>
    </div>
  );
}

function CopyButton({ text, label = 'Copy hex' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="icon-btn"
      title={done ? 'Copied' : label}
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={12} />
    </button>
  );
}

function ExchangeInspector({ entry }: { entry: ExchangeEntry }) {
  const command = fromHex(entry.command);
  const { name, detail } = describeCommand(command);
  const parsed = tryParseCommand(command);
  const response =
    entry.response && entry.response.length >= 4
      ? splitResponse(fromHex(entry.response))
      : undefined;
  const sw = response ? describeSw(response.sw) : undefined;

  return (
    <div className="inspector">
      <h2>{name}</h2>
      {detail && <div className="subtitle">{detail}</div>}
      <div className="meta">
        <span>#{entry.id}</span>
        <span>{entry.source}</span>
        <span>{entry.readerName}</span>
        <span>{new Date(entry.startedAt).toLocaleTimeString()}</span>
        <span>{entry.durationMs.toFixed(1)} ms</span>
      </div>

      <h3>
        Command <CopyButton text={entry.command} />
      </h3>
      {parsed ? (
        <div className="apdu-header">
          <Field k="CLA" v={parsed.cla} />
          <Field k="INS" v={parsed.ins} />
          <Field k="P1" v={parsed.p1} />
          <Field k="P2" v={parsed.p2} />
          {parsed.data && <Field k="Lc" v={parsed.data.length} />}
          {parsed.le !== undefined && <Field k="Le" v={parsed.le === 256 ? 0 : parsed.le} />}
          <span className="apdu-byte">
            <span className="k">case</span>
            <span className="v">
              {parsed.case}
              {parsed.extended ? 'E' : ''}
            </span>
          </span>
        </div>
      ) : (
        <div className="note error-text">Not a well-formed command APDU.</div>
      )}
      {parsed?.data && parsed.data.length > 0 && (
        <>
          <h3>Command data</h3>
          <Bytes bytes={parsed.data} />
        </>
      )}
      {!parsed && <Bytes bytes={command} />}

      <h3>Response {entry.response && <CopyButton text={entry.response} />}</h3>
      {entry.error && <div className="error-text">{entry.error}</div>}
      {response && sw && (
        <>
          <div className="status-pill">
            <span className={`sw ${sw.severity}`}>{toHex([response.sw1, response.sw2])}</span>
            <span>{sw.text}</span>
          </div>
          {response.data.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <Bytes bytes={response.data} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ k, v }: { k: string; v: number }) {
  return (
    <span className="apdu-byte">
      <span className="k">{k}</span>
      <span className="v">
        {v > 255 ? v.toString(16).toUpperCase().padStart(4, '0') : toHex([v])}
      </span>
    </span>
  );
}

function EventInspector({ entry }: { entry: CardEventEntry }) {
  return (
    <div className="inspector">
      <h2>{entry.event.replace('-', ' ').replace(/^./, (c) => c.toUpperCase())}</h2>
      <div className="subtitle">{entry.readerName}</div>
      <div className="meta">
        <span>#{entry.id}</span>
        <span>{new Date(entry.at).toLocaleTimeString()}</span>
      </div>
      {entry.atr && <AtrDetails atr={entry.atr} />}
    </div>
  );
}

function AtrDetails({ atr }: { atr: string }) {
  const parsed = parseAtr(fromHex(atr));
  return (
    <>
      <h3>
        ATR <CopyButton text={atr} />
      </h3>
      <div className="mono selectable" style={{ color: 'var(--hex)', wordBreak: 'break-all' }}>
        {toHex(parsed.bytes, ' ')}
      </div>
      <div className="note">{parsed.summary}</div>
      <h3>Bytes</h3>
      <dl className="fields">
        {parsed.fields.map((f, i) => (
          <FieldRow
            key={i}
            name={`${f.name}`}
            value={`${toHex(parsed.bytes.subarray(f.offset, f.offset + f.length), ' ')} · ${f.description}`}
          />
        ))}
      </dl>
      {parsed.errors.map((e) => (
        <div key={e} className="note error-text">
          {e}
        </div>
      ))}
    </>
  );
}

function FieldRow({ name, value }: { name: string; value: string }) {
  return (
    <>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </>
  );
}

function NodeInspector({ node }: { node: ExplorerNode }) {
  const info = node.tag ? lookupTag(node.tag) : undefined;
  return (
    <div className="inspector">
      <h2>{node.label}</h2>
      {node.value && <div className="subtitle">{node.value}</div>}
      {info && (
        <div className="meta">
          <span>Tag {info.tag}</span>
          <span>Format {info.format}</span>
        </div>
      )}
      {info?.description && <div className="note">{info.description}</div>}
      {node.label === 'ATR' && node.bytes && <AtrDetails atr={toHex(node.bytes)} />}
      {node.bytes && node.bytes.length > 0 && node.label !== 'ATR' && (
        <>
          <h3>
            Bytes <span className="faint">{node.bytes.length}</span>{' '}
            <CopyButton text={toHex(node.bytes)} />
          </h3>
          <Bytes bytes={node.bytes} />
        </>
      )}
    </div>
  );
}

/** Hex dump, plus the TLV structure when the bytes parse as TLV. Hovering a TLV row highlights its bytes. */
function Bytes({ bytes }: { bytes: Uint8Array }) {
  const [highlight, setHighlight] = useState<[number, number]>();
  const tlv = looksLikeTlv(bytes) ? parseTlv(bytes).nodes : undefined;
  return (
    <>
      <HexDump bytes={bytes} highlight={highlight} />
      {!tlv && isPrintable(bytes) && <div className="note">“{toAscii(bytes)}”</div>}
      {tlv && (
        <div className="tlv" style={{ marginTop: 10 }} onMouseLeave={() => setHighlight(undefined)}>
          {tlv.map((node) => (
            <TlvRow key={node.offset} node={node} onHover={setHighlight} />
          ))}
        </div>
      )}
    </>
  );
}

/** Eight bytes a row: sixteen don't fit the inspector's width. */
const PER_ROW = 8;

function HexDump({ bytes, highlight }: { bytes: Uint8Array; highlight?: [number, number] }) {
  const rows: number[] = [];
  for (let i = 0; i < bytes.length; i += PER_ROW) rows.push(i);
  const lit = (i: number) => highlight !== undefined && i >= highlight[0] && i < highlight[1];
  return (
    <div className="hexdump selectable">
      {rows.map((start) => {
        const slice = Array.from(bytes.subarray(start, start + PER_ROW));
        return (
          <div className="row" key={start}>
            <span className="off">{start.toString(16).padStart(4, '0')}</span>
            <span>
              {slice.map((b, i) => (
                <span key={i} className={`b${lit(start + i) ? ' hl' : ''}`}>
                  {toHex([b])}
                  {i < PER_ROW - 1 ? ' ' : ''}
                </span>
              ))}
              {' '.repeat((PER_ROW - slice.length) * 3)}
            </span>
            <span className="ascii">
              {slice.map((b, i) => (
                <span key={i} className={`a${lit(start + i) ? ' hl' : ''}`}>
                  {toAscii([b])}
                </span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TlvRow({
  node,
  parent,
  onHover,
}: {
  node: TlvNode;
  /** Tag of the enclosing template: inside 62/64/6F, tags have their ISO 7816-4 meanings. */
  parent?: string;
  onHover: (range: [number, number]) => void;
}) {
  const info = lookupTag(node.tagHex, parent);
  const end = node.offset + node.headerLength + node.value.length;
  const decoded = node.children ? undefined : decodeTagValue(node.tagHex, node.value, parent);
  const text =
    decoded ??
    ((info?.format === 'an' || info?.format === 'ans') && isPrintable(node.value)
      ? toAscii(node.value)
      : undefined);
  return (
    <>
      <div
        className="tlv-row"
        onMouseEnter={(e) => {
          e.stopPropagation();
          onHover([node.offset, end]);
        }}
      >
        <span className="t">{node.tagHex}</span>
        <span>
          <span className="n">{info?.name ?? 'Unknown tag'}</span>
          <span className="l">{node.length} bytes</span>
        </span>
        {!node.children && (
          <span className={`val${text === undefined ? ' mono' : ''}`}>
            {text ?? toHex(node.value, ' ')}
            {text !== undefined && decoded !== undefined && (
              <span className="mono faint"> · {toHex(node.value, ' ')}</span>
            )}
          </span>
        )}
        {node.error && <span className="val error-text">{node.error}</span>}
      </div>
      {node.children && (
        <div className="tlv-children">
          {node.children.map((child) => (
            <TlvRow key={child.offset} node={child} parent={node.tagHex} onHover={onHover} />
          ))}
        </div>
      )}
    </>
  );
}
