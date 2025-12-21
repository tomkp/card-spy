import type { LogEntry } from '../../shared/types';

interface LogItemProps {
  entry: LogEntry;
}

function formatHex(hex: string): string {
  return hex.replace(/(.{2})/g, '$1 ').trim();
}

export function LogItem({ entry }: LogItemProps) {
  const isSuccess = entry.response?.sw1 === 0x90 && entry.response?.sw2 === 0x00;
  const isPending = !entry.response;
  const hasData = entry.response && entry.response.data.length > 0;

  return (
    <div className={`py-1 px-2 rounded ${isSuccess ? 'bg-success/10' : ''} ${isPending ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        <span className="text-primary shrink-0">{'>'}</span>
        <span className="text-foreground break-all">{formatHex(entry.command.hex)}</span>
      </div>
      {entry.response && (
        <div className="flex items-start gap-2 mt-1">
          <span className="text-muted-foreground shrink-0">{'<'}</span>
          <span className="break-all">
            {hasData && (
              <span className="text-foreground">{formatHex(entry.response.hex.slice(0, -4))}</span>
            )}
            <span className={`font-medium ${isSuccess ? 'text-success' : 'text-error'}`}>
              {' '}{entry.response.hex.slice(-4)}
            </span>
          </span>
          {entry.response.meaning && (
            <span className="text-muted-foreground ml-2 shrink-0">
              {entry.response.meaning}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
