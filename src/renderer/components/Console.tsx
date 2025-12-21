import { useRef, useEffect } from 'react';
import type { LogEntry } from '../../shared/types';
import { LogItem } from './LogItem';
import './Console.scss';

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
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onRunCommand();
    }
  };

  return (
    <div className="console">
      <div className="console__toolbar">
        <button onClick={onInterrogate} disabled={!hasCard}>
          Interrogate Card
        </button>
        <button onClick={onClearLog} disabled={log.length === 0}>
          Clear Log
        </button>
        <span className="console__status">
          {hasCard ? 'Card ready' : 'No card'}
        </span>
      </div>

      <div className="console__log" ref={logRef}>
        {log.length === 0 ? (
          <div className="console__empty">
            {hasCard
              ? 'Enter APDU command below or click "Interrogate Card"'
              : 'Insert a smartcard to begin'}
          </div>
        ) : (
          log.map(entry => <LogItem key={entry.id} entry={entry} />)
        )}
      </div>

      <div className="console__repl">
        <textarea
          value={repl}
          onChange={e => onReplChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter APDU (hex): 00A4040007A0000000041010"
          disabled={!hasCard}
        />
        <button onClick={onRunCommand} disabled={!hasCard || !repl.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
