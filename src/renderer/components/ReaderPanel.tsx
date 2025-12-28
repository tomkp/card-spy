import { useRef, useEffect, useState, useMemo } from 'react';
import type { ReaderSession, LogEntry, TlvNode, CommandLogEntry } from '../../shared/types';
import { Play, Trash2, Keyboard, Search, X, CheckCircle, XCircle, Circle } from 'lucide-react';
import { Button } from './ui/button';
import { CopyButton } from './CopyButton';
import { SplitPane, Pane } from 'react-split-pane';
import { formatHex, getStatusWordInfo, isSuccessStatus } from '../../shared/apdu';

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const cmdKey = isMac ? '⌘' : 'Ctrl+';

type StatusFilter = 'all' | 'success' | 'error';

// Highlight matching text in a string
function HighlightText({ text, search }: { text: string; search: string }) {
  if (!search.trim()) {
    return <>{text}</>;
  }

  const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 text-foreground rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

interface ReaderPanelProps {
  session: ReaderSession;
  onInterrogate: () => void;
  onClear: () => void;
  onShowShortcuts?: () => void;
}

function TlvNodeDisplay({ node, indent, searchTerm }: { node: TlvNode; indent: number; searchTerm: string }) {
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
        <span className="text-primary font-medium">
          <HighlightText text={node.tagHex} search={searchTerm} />
        </span>
        {tagName && (
          <span className="text-muted-foreground ml-2">
            <HighlightText text={tagName} search={searchTerm} />
          </span>
        )}
        {asciiValue && (
          <span className="text-foreground ml-2">
            <HighlightText text={asciiValue} search={searchTerm} />
          </span>
        )}
        {valueStr && !asciiValue && (
          <span className="text-muted-foreground ml-2">
            <HighlightText text={valueStr} search={searchTerm} />
          </span>
        )}
        {copyValue && (
          <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-2">
            <CopyButton text={copyValue} label={`${node.tagHex} value`} />
          </span>
        )}
      </div>
      {node.isConstructed && Array.isArray(node.value) && (
        <TlvTree nodes={node.value as TlvNode[]} indent={indent + 1} searchTerm={searchTerm} />
      )}
    </>
  );
}

function TlvTree({ nodes, indent = 0, searchTerm = '' }: { nodes: TlvNode[]; indent?: number; searchTerm?: string }) {
  return (
    <>
      {nodes.map((node, index) => (
        <TlvNodeDisplay key={`${node.tagHex}-${index}`} node={node} indent={indent} searchTerm={searchTerm} />
      ))}
    </>
  );
}

interface CommandEntryDisplayProps {
  entry: CommandLogEntry;
  isSelected: boolean;
  onSelect: () => void;
  searchTerm: string;
}

function CommandEntryDisplay({ entry, isSelected, onSelect, searchTerm }: CommandEntryDisplayProps) {
  const sw1 = entry.response?.sw1 ?? 0;
  const sw2 = entry.response?.sw2 ?? 0;
  const swHex = `${sw1.toString(16).padStart(2, '0')}${sw2.toString(16).padStart(2, '0')}`;
  const swMeaning = entry.response ? getStatusWordInfo(sw1, sw2).meaning : '';
  const success = entry.response ? isSuccessStatus(sw1) : false;

  return (
    <div
      className={`px-4 py-3 border-b border-border last:border-b-0 cursor-pointer hover:bg-accent/50 ${isSelected ? 'bg-accent' : ''}`}
      onClick={onSelect}
    >
      <div className="text-foreground">
        <HighlightText text={entry.command.hex.toLowerCase()} search={searchTerm} />
      </div>

      {entry.response && (
        <div className={success ? 'text-success' : 'text-error'}>
          <HighlightText text={`${swHex} ${swMeaning}`} search={searchTerm} />
        </div>
      )}
    </div>
  );
}

interface LogEntryDisplayProps {
  entry: LogEntry;
  isSelected: boolean;
  onSelect: () => void;
  searchTerm: string;
}

function LogEntryDisplay({ entry, isSelected, onSelect, searchTerm }: LogEntryDisplayProps) {
  if (entry.type === 'card-inserted') return null;
  return (
    <CommandEntryDisplay
      entry={entry as CommandLogEntry}
      isSelected={isSelected}
      onSelect={onSelect}
      searchTerm={searchTerm}
    />
  );
}

function DetailPanel({ entry, searchTerm }: { entry: CommandLogEntry | null; searchTerm: string }) {
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
  const swMeaning = entry.response ? getStatusWordInfo(sw1, sw2).meaning : '';
  const success = entry.response ? isSuccessStatus(sw1) : false;
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
        <div className="text-foreground">
          <HighlightText text={entry.command.hex.toLowerCase()} search={searchTerm} />
        </div>
      </div>

      {entry.response && (
        <div className="mb-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <span>Status</span>
            <CopyButton text={swHex} label="status" />
          </div>
          <div className={success ? 'text-success' : 'text-error'}>
            <HighlightText text={`${swHex} ${swMeaning}`} search={searchTerm} />
          </div>
        </div>
      )}

      {entry.response && entry.response.data.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <span>Response Data</span>
            <CopyButton text={responseDataHex} label="response data" />
          </div>
          <div className="text-success break-all">
            <HighlightText text={responseDataHex} search={searchTerm} />
          </div>
        </div>
      )}

      {entry.tlv && entry.tlv.length > 0 && (
        <div>
          <div className="text-muted-foreground text-xs mb-1">TLV Structure</div>
          <div><TlvTree nodes={entry.tlv} searchTerm={searchTerm} /></div>
        </div>
      )}
    </div>
  );
}

export function ReaderPanel({ session, onInterrogate, onClear, onShowShortcuts }: ReaderPanelProps) {
  const hasCard = !!session.card;
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session.log]);

  // Filter and search log entries
  const filteredLog = useMemo(() => {
    return session.log.filter((entry) => {
      // Only filter command entries
      if (entry.type !== 'command') return false;

      const cmdEntry = entry as CommandLogEntry;

      // Status filter
      if (statusFilter !== 'all') {
        const sw1 = cmdEntry.response?.sw1 ?? 0;
        const success = isSuccessStatus(sw1);
        if (statusFilter === 'success' && !success) return false;
        if (statusFilter === 'error' && success) return false;
      }

      // Search filter
      if (searchTerm.trim()) {
        const search = searchTerm.toLowerCase();
        const commandHex = cmdEntry.command.hex.toLowerCase();
        const sw1 = cmdEntry.response?.sw1 ?? 0;
        const sw2 = cmdEntry.response?.sw2 ?? 0;
        const swHex = `${sw1.toString(16).padStart(2, '0')}${sw2.toString(16).padStart(2, '0')}`;
        const swMeaning = cmdEntry.response ? getStatusWordInfo(sw1, sw2).meaning.toLowerCase() : '';
        const responseHex = cmdEntry.response ? formatHex(cmdEntry.response.data) : '';

        // Search in command, status, response data
        if (
          !commandHex.includes(search) &&
          !swHex.includes(search) &&
          !swMeaning.includes(search) &&
          !responseHex.includes(search)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [session.log, searchTerm, statusFilter]);

  const selectedEntry = selectedEntryId
    ? (session.log.find((e) => e.id === selectedEntryId) as CommandLogEntry | undefined)
    : null;

  const commandCount = session.log.filter((e) => e.type === 'command').length;
  const successCount = session.log.filter((e) => {
    if (e.type !== 'command') return false;
    const cmd = e as CommandLogEntry;
    return cmd.response && isSuccessStatus(cmd.response.sw1);
  }).length;
  const errorCount = commandCount - successCount;

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
        {/* Log Header with Search and Filters */}
        <div className="px-3 py-2 border-b border-border bg-muted/30 space-y-2">
          {/* Title row */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Command Log
            </span>
            <span className="text-xs text-muted-foreground">
              {filteredLog.length === commandCount
                ? `${commandCount} commands`
                : `${filteredLog.length} of ${commandCount}`}
            </span>
          </div>

          {/* Search and Filter row */}
          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search commands..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-7 pr-7 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Status Filter Buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setStatusFilter('all')}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
                title="Show all commands"
              >
                <Circle className="h-3 w-3" />
                All
              </button>
              <button
                onClick={() => setStatusFilter('success')}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  statusFilter === 'success'
                    ? 'bg-green-600 text-white'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
                title={`Show successful commands (${successCount})`}
              >
                <CheckCircle className="h-3 w-3" />
                {successCount}
              </button>
              <button
                onClick={() => setStatusFilter('error')}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  statusFilter === 'error'
                    ? 'bg-red-600 text-white'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
                title={`Show error commands (${errorCount})`}
              >
                <XCircle className="h-3 w-3" />
                {errorCount}
              </button>
            </div>
          </div>
        </div>

        <SplitPane direction="horizontal" className="flex-1">
          <Pane minSize={200} defaultSize="50%">
            <div ref={scrollRef} className="h-full overflow-auto px-0 py-2 font-mono text-sm">
              {session.log.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  No commands yet. Use the command panel or REPL to send APDUs.
                </div>
              ) : filteredLog.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  No matching commands found.
                </div>
              ) : (
                filteredLog.map((entry) => (
                  <LogEntryDisplay
                    key={entry.id}
                    entry={entry}
                    isSelected={entry.id === selectedEntryId}
                    onSelect={() => setSelectedEntryId(entry.id)}
                    searchTerm={searchTerm}
                  />
                ))
              )}
            </div>
          </Pane>
          <Pane minSize={200}>
            <DetailPanel entry={selectedEntry ?? null} searchTerm={searchTerm} />
          </Pane>
        </SplitPane>
      </div>
    </div>
  );
}
