import type {
  ReaderSession,
  LogEntry,
  TlvNode,
  CommandLogEntry,
  CardInsertedLogEntry,
} from '../../shared/types';
import { Play, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

interface ReaderPanelProps {
  session: ReaderSession;
  onInterrogate: () => void;
  onClear: () => void;
}

function formatHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getSwMeaning(sw1: number, sw2: number): string {
  const sw = (sw1 << 8) | sw2;
  if (sw === 0x9000) return 'Normal processing';
  if (sw1 === 0x61)
    return `Normal processing, (sw2 indicates the number of response bytes still available)`;
  if (sw1 === 0x6c) return `Checking error: wrong length (sw2 indicates correct length for le)`;
  if (sw === 0x6a86) return 'Checking error: wrong parameters (p1 or p2) (see sw2)';
  if (sw === 0x6a82) return 'File not found';
  if (sw === 0x6a83) return 'Record not found';
  if (sw === 0x6a88) return 'Referenced data not found';
  if (sw1 === 0x6a) return 'Checking error: wrong parameters';
  return '';
}

function isSwSuccess(sw1: number, _sw2: number): boolean {
  return sw1 === 0x90 || sw1 === 0x61;
}

function renderTlvTree(nodes: TlvNode[], indent: number = 0): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  const indentPx = indent * 16;

  for (const node of nodes) {
    const tagName = node.description || '';
    const valueStr =
      Array.isArray(node.value) && !node.isConstructed ? formatHex(node.value as number[]) : '';

    // Try to decode ASCII for certain tags like APP LABEL, LANGUAGE PREFERENCE
    let asciiValue = '';
    if (!node.isConstructed && Array.isArray(node.value)) {
      const bytes = node.value as number[];
      if (bytes.every((b) => b >= 0x20 && b <= 0x7e)) {
        asciiValue = String.fromCharCode(...bytes);
      }
    }

    result.push(
      <div
        key={`${node.tagHex}-${result.length}`}
        className="leading-relaxed"
        style={{ paddingLeft: indentPx }}
      >
        <span className="text-primary font-semibold">{node.tagHex}</span>
        {tagName && <span className="text-muted-foreground ml-2">{tagName}</span>}
        {valueStr && <span className="text-foreground ml-2">{valueStr}</span>}
        {asciiValue && <span className="text-success ml-2">&quot;{asciiValue}&quot;</span>}
      </div>
    );

    if (node.isConstructed && Array.isArray(node.value)) {
      result.push(...renderTlvTree(node.value as TlvNode[], indent + 1));
    }
  }

  return result;
}

function CardInsertedDisplay({ entry }: { entry: CardInsertedLogEntry }) {
  return (
    <div className="border-b border-border py-2 bg-accent/30">
      <div className="text-primary font-semibold">Card Inserted</div>
      <div className="text-muted-foreground text-xs">{entry.device}</div>
      <div className="text-foreground mt-1">ATR: {entry.atr}</div>
    </div>
  );
}

function CommandEntryDisplay({ entry }: { entry: CommandLogEntry }) {
  const sw1 = entry.response?.sw1 ?? 0;
  const sw2 = entry.response?.sw2 ?? 0;
  const swHex = `${sw1.toString(16).padStart(2, '0')}${sw2.toString(16).padStart(2, '0')}`;
  const swMeaning = entry.response ? getSwMeaning(sw1, sw2) : '';
  const success = entry.response ? isSwSuccess(sw1, sw2) : false;

  return (
    <div className="border-b border-border py-2">
      {/* Command */}
      <div className="text-foreground">{entry.command.hex}</div>

      {/* Response SW with meaning */}
      {entry.response && (
        <div className={success ? 'text-success' : 'text-error'}>
          {swHex} {swMeaning}
        </div>
      )}

      {/* If we have response data, show it */}
      {entry.response && entry.response.data.length > 0 && !entry.tlv && (
        <div className="text-foreground mt-1">{formatHex(entry.response.data)}</div>
      )}

      {/* TLV parsed data */}
      {entry.tlv && entry.tlv.length > 0 && (
        <div className="mt-1">
          <div className="text-foreground">{formatHex(entry.response?.data ?? [])}</div>
          {renderTlvTree(entry.tlv)}
        </div>
      )}
    </div>
  );
}

function LogEntryDisplay({ entry }: { entry: LogEntry }) {
  if (entry.type === 'card-inserted') {
    return <CardInsertedDisplay entry={entry} />;
  }
  return <CommandEntryDisplay entry={entry} />;
}

export function ReaderPanel({ session, onInterrogate, onClear }: ReaderPanelProps) {
  const hasCard = !!session.card;

  return (
    <div className="flex flex-col border-b border-border">
      {/* Header with reader name and controls */}
      <div className="flex items-center gap-2 px-3 py-2 bg-card">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={onInterrogate}
          disabled={!hasCard}
        >
          <Play className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={onClear}
          disabled={session.log.length === 0}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{session.device.name}</span>
      </div>

      {/* ATR if card is present */}
      {session.card && <div className="px-3 py-1 text-xs">Answer to reset: {session.card.atr}</div>}

      {/* Log entries */}
      {session.log.length > 0 && (
        <ScrollArea className="max-h-80">
          <div className="px-3 py-1 text-xs font-mono">
            {session.log.map((entry) => (
              <LogEntryDisplay key={entry.id} entry={entry} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
