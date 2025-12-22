import { useRef, useEffect } from 'react';
import type { ReaderSession, LogEntry, TlvNode, CommandLogEntry } from '../../shared/types';
import { Play, Trash2 } from 'lucide-react';
import { Button } from './ui/button';

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

function renderTlvTree(nodes: TlvNode[], indent = 0): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  const indentStr = '   '.repeat(indent);

  for (const node of nodes) {
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

    result.push(
      <div key={`${node.tagHex}-${result.length}`} className="leading-relaxed">
        <span className="text-muted-foreground">{indentStr}</span>
        <span className="text-primary font-medium">{node.tagHex}</span>
        {tagName && <span className="text-muted-foreground ml-2">{tagName}</span>}
        {asciiValue && <span className="text-foreground ml-2">{asciiValue}</span>}
        {valueStr && !asciiValue && <span className="text-muted-foreground ml-2">{valueStr}</span>}
      </div>
    );

    if (node.isConstructed && Array.isArray(node.value)) {
      result.push(...renderTlvTree(node.value as TlvNode[], indent + 1));
    }
  }

  return result;
}

function CommandEntryDisplay({ entry }: { entry: CommandLogEntry }) {
  const sw1 = entry.response?.sw1 ?? 0;
  const sw2 = entry.response?.sw2 ?? 0;
  const swHex = `${sw1.toString(16).padStart(2, '0')}${sw2.toString(16).padStart(2, '0')}`;
  const swMeaning = entry.response ? getSwMeaning(sw1, sw2) : '';
  const success = entry.response ? isSwSuccess(sw1) : false;

  return (
    <div className="py-3 border-b border-border last:border-b-0">
      <div className="text-foreground">{entry.command.hex.toLowerCase()}</div>

      {entry.response && (
        <div className={success ? 'text-success' : 'text-error'}>
          {swHex} {swMeaning}
        </div>
      )}

      {entry.response && entry.response.data.length > 0 && !entry.tlv && (
        <div className="text-success mt-1">{formatHex(entry.response.data)}</div>
      )}

      {entry.tlv && entry.tlv.length > 0 && (
        <div className="mt-1">
          <div className="text-success">{formatHex(entry.response?.data ?? [])}</div>
          <div className="mt-1">{renderTlvTree(entry.tlv)}</div>
        </div>
      )}
    </div>
  );
}

function LogEntryDisplay({ entry }: { entry: LogEntry }) {
  if (entry.type === 'card-inserted') return null;
  return <CommandEntryDisplay entry={entry as CommandLogEntry} />;
}

export function ReaderPanel({ session, onInterrogate, onClear }: ReaderPanelProps) {
  const hasCard = !!session.card;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session.log]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-col gap-2 p-2 border-r border-border bg-card">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={onInterrogate}
          disabled={!hasCard}
          title="Interrogate card"
        >
          <Play className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={onClear}
          disabled={session.log.length === 0}
          title="Clear log"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-card">
          <div className="font-medium">{session.device.name}</div>
          {session.card && (
            <div className="text-muted-foreground text-sm mt-1">
              Answer to reset: {session.card.atr}
            </div>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-2 font-mono text-sm">
          {session.log.map((entry) => (
            <LogEntryDisplay key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}
