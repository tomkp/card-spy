import { useRef, useEffect } from 'react';
import type { LogEntry } from '../../shared/types';
import { LogItem } from './LogItem';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

interface ConsoleProps {
  log: LogEntry[];
  repl: string;
  onReplChange: (value: string) => void;
  onRunCommand: () => void;
  onInterrogate: () => void;
  onClearLog: () => void;
  hasCard: boolean;
}

export function Console({
  log,
  repl,
  onReplChange,
  onRunCommand,
  onInterrogate,
  onClearLog,
  hasCard
}: ConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [log]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onRunCommand();
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary border-b border-border">
        <Button size="sm" onClick={onInterrogate} disabled={!hasCard}>
          Interrogate Card
        </Button>
        <Button size="sm" variant="outline" onClick={onClearLog} disabled={log.length === 0}>
          Clear Log
        </Button>
        <span className={`ml-auto text-xs ${hasCard ? 'text-success' : 'text-muted-foreground'}`}>
          {hasCard ? 'Card ready' : 'No card'}
        </span>
      </div>

      {/* Log Area */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-3 font-mono text-xs">
          {log.length === 0 ? (
            <div className="text-muted-foreground text-center py-8">
              {hasCard
                ? 'Enter APDU command below or click "Interrogate Card"'
                : 'Insert a smartcard to begin'}
            </div>
          ) : (
            <div className="space-y-2">
              {log.map(entry => <LogItem key={entry.id} entry={entry} />)}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* REPL Input */}
      <div className="flex items-stretch gap-2 p-3 bg-secondary border-t border-border">
        <textarea
          value={repl}
          onChange={e => onReplChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter APDU (hex): 00A4040007A0000000041010"
          disabled={!hasCard}
          className="flex-1 min-h-[60px] px-3 py-2 bg-background border border-input rounded-md font-mono text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed resize-none"
        />
        <Button onClick={onRunCommand} disabled={!hasCard || !repl.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
