import { useRef, useEffect, useState } from 'react';
import type { ReaderSession, LogEntry, TlvNode, CommandLogEntry } from '../../shared/types';
import { Play, Trash2, Keyboard, ClipboardCopy } from 'lucide-react';
import { Button } from './ui/button';
import { CopyButton } from './CopyButton';
import { SplitPane, Pane } from 'react-split-pane';

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const cmdKey = isMac ? '⌘' : 'Ctrl+';

interface ReaderPanelProps {
  session: ReaderSession;
  onInterrogate: () => void;
  onClear: () => void;
  onShowShortcuts?: () => void;
}

function formatHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getSwMeaning(sw1: number, sw2: number): string {
  const sw = (sw1 << 8) | sw2;
  if (sw === 0x9000) return 'Normal processing';
  if (sw1 === 0x61)
    return 'Normal processing, (sw2 indicates the number of response bytes still available)';
  if (sw1 === 0x6c) return 'Checking error: wrong length (sw2 indicates correct length for le)';
  if (sw === 0x6a86) return 'Checking error: wrong parameters (p1 or p2) (see sw2)';
  if (sw === 0x6a82) return 'File not found';
  if (sw === 0x6a83) return 'Record not found';
  if (sw === 0x6a88) return 'Referenced data not found';
  if (sw1 === 0x6a) return 'Checking error: wrong parameters';
  return '';
}

function isSwSuccess(sw1: number): boolean {
  return sw1 === 0x90 || sw1 === 0x61;
}

function TlvNodeDisplay({ node, indent }: { node: TlvNode; indent: number }) {
  const indentStr = '   '.repeat(indent);
  const tagName = node.description || '';
  const valueStr =
    Array.isArray(node.value) && !node.isConstructed ? formatHex(node.value as number[]) : '';

  let asciiValue = '';
  if (!node.isConstructed && Array.isArray(node.value)) {
    const bytes = node.value as number[];
    if (bytes.every((b) => b >= 0x20 && b <= 0x7e)) {
      asciiValue = String.fromCharCode(...bytes);
    }
  }

  const copyValue = asciiValue || valueStr;

  return (
    <>
      <div className="leading-relaxed group flex items-center">
        <span className="text-muted-foreground">{indentStr}</span>
        <span className="text-primary font-medium">{node.tagHex}</span>
        {tagName && <span className="text-muted-foreground ml-2">{tagName}</span>}
        {asciiValue && <span className="text-foreground ml-2">{asciiValue}</span>}
        {valueStr && !asciiValue && <span className="text-muted-foreground ml-2">{valueStr}</span>}
        {copyValue && (
          <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-2">
            <CopyButton text={copyValue} label={`${node.tagHex} value`} />
          </span>
        )}
      </div>
      {node.isConstructed && Array.isArray(node.value) && (
        <TlvTree nodes={node.value as TlvNode[]} indent={indent + 1} />
      )}
    </>
  );
}

function TlvTree({ nodes, indent = 0 }: { nodes: TlvNode[]; indent?: number }) {
  return (
    <>
      {nodes.map((node, index) => (
        <TlvNodeDisplay key={`${node.tagHex}-${index}`} node={node} indent={indent} />
      ))}
    </>
  );
}

interface CommandEntryDisplayProps {
  entry: CommandLogEntry;
  isSelected: boolean;
  onSelect: () => void;
}

function CommandEntryDisplay({ entry, isSelected, onSelect }: CommandEntryDisplayProps) {
  const sw1 = entry.response?.sw1 ?? 0;
  const sw2 = entry.response?.sw2 ?? 0;
  const swHex = `${sw1.toString(16).padStart(2, '0')}${sw2.toString(16).padStart(2, '0')}`;
  const swMeaning = entry.response ? getSwMeaning(sw1, sw2) : '';
  const success = entry.response ? isSwSuccess(sw1) : false;

  return (
    <div
      className={`px-4 py-3 border-b border-border last:border-b-0 cursor-pointer hover:bg-accent/50 ${isSelected ? 'bg-accent' : ''}`}
      onClick={onSelect}
    >
      <div className="text-foreground">{entry.command.hex.toLowerCase()}</div>

      {entry.response && (
        <div className={success ? 'text-success' : 'text-error'}>
          {swHex} {swMeaning}
        </div>
      )}
    </div>
  );
}

interface LogEntryDisplayProps {
  entry: LogEntry;
  isSelected: boolean;
  onSelect: () => void;
}

function LogEntryDisplay({ entry, isSelected, onSelect }: LogEntryDisplayProps) {
  if (entry.type === 'card-inserted') return null;
  return (
    <CommandEntryDisplay
      entry={entry as CommandLogEntry}
      isSelected={isSelected}
      onSelect={onSelect}
    />
  );
}

function DetailPanel({ entry }: { entry: CommandLogEntry | null }) {
  if (!entry) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a command to view details
      </div>
    );
  }

  const sw1 = entry.response?.sw1 ?? 0;
  const sw2 = entry.response?.sw2 ?? 0;
  const swHex = `${sw1.toString(16).padStart(2, '0')}${sw2.toString(16).padStart(2, '0')}`;
  const swMeaning = entry.response ? getSwMeaning(sw1, sw2) : '';
  const success = entry.response ? isSwSuccess(sw1) : false;
  const responseDataHex = entry.response ? formatHex(entry.response.data) : '';

  // Build full formatted text for copy all
  const getFullText = () => {
    let text = `Command: ${entry.command.hex.toLowerCase()}\n`;
    if (entry.response) {
      text += `Status: ${swHex}${swMeaning ? ` (${swMeaning})` : ''}\n`;
      if (entry.response.data.length > 0) {
        text += `Response: ${responseDataHex}\n`;
      }
    }
    return text;
  };

  return (
    <div className="h-full overflow-auto p-4 font-mono text-sm">
      {/* Copy All Button */}
      <div className="flex justify-end mb-2">
        <CopyButton text={getFullText()} label="all" className="text-xs px-2 py-1 rounded bg-muted hover:bg-accent" />
        <span className="text-xs text-muted-foreground ml-1">Copy all</span>
      </div>

      <div className="mb-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          <span>Command</span>
          <CopyButton text={entry.command.hex.toLowerCase()} label="command" />
        </div>
        <div className="text-foreground">{entry.command.hex.toLowerCase()}</div>
      </div>

      {entry.response && (
        <div className="mb-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <span>Status</span>
            <CopyButton text={swHex} label="status" />
          </div>
          <div className={success ? 'text-success' : 'text-error'}>
            {swHex} {swMeaning}
          </div>
        </div>
      )}

      {entry.response && entry.response.data.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <span>Response Data</span>
            <CopyButton text={responseDataHex} label="response data" />
          </div>
          <div className="text-success break-all">{responseDataHex}</div>
        </div>
      )}

      {entry.tlv && entry.tlv.length > 0 && (
        <div>
          <div className="text-muted-foreground text-xs mb-1">TLV Structure</div>
          <div><TlvTree nodes={entry.tlv} /></div>
        </div>
      )}
    </div>
  );
}

export function ReaderPanel({ session, onInterrogate, onClear, onShowShortcuts }: ReaderPanelProps) {
  const hasCard = !!session.card;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session.log]);

  const selectedEntry = selectedEntryId
    ? (session.log.find((e) => e.id === selectedEntryId) as CommandLogEntry | undefined)
    : null;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 p-2 border-r border-border bg-card">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={onInterrogate}
          disabled={!hasCard}
          title={`Interrogate card (${cmdKey}I)`}
        >
          <Play className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={onClear}
          disabled={session.log.length === 0}
          title={`Clear log (${cmdKey}L)`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        {onShowShortcuts && (
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full mt-auto"
            onClick={onShowShortcuts}
            title={`Keyboard shortcuts (${cmdKey}/)`}
          >
            <Keyboard className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Log and Detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Log Header */}
        <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Command Log
          </span>
          <span className="text-xs text-muted-foreground">
            {session.log.filter((e) => e.type === 'command').length} commands
          </span>
        </div>

        <SplitPane direction="horizontal" className="flex-1">
          <Pane minSize={200} defaultSize="50%">
            <div ref={scrollRef} className="h-full overflow-auto px-0 py-2 font-mono text-sm">
              {session.log.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  No commands yet. Use the command panel or REPL to send APDUs.
                </div>
              ) : (
                session.log.map((entry) => (
                  <LogEntryDisplay
                    key={entry.id}
                    entry={entry}
                    isSelected={entry.id === selectedEntryId}
                    onSelect={() => setSelectedEntryId(entry.id)}
                  />
                ))
              )}
            </div>
          </Pane>
          <Pane minSize={200}>
            <DetailPanel entry={selectedEntry ?? null} />
          </Pane>
        </SplitPane>
      </div>
    </div>
  );
}
