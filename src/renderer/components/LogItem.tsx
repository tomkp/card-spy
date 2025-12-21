import type { LogEntry } from '../../shared/types';
import './LogItem.scss';

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
    <div className={`log-item ${isSuccess ? 'log-item--success' : ''} ${isPending ? 'log-item--pending' : ''}`}>
      <div className="log-item__command">
        <span className="log-item__arrow">{'>'}</span>
        <span className="log-item__hex">{formatHex(entry.command.hex)}</span>
      </div>
      {entry.response && (
        <div className="log-item__response">
          <span className="log-item__arrow">{'<'}</span>
          <span className="log-item__data">
            {hasData && (
              <span className="log-item__hex">{formatHex(entry.response.hex.slice(0, -4))}</span>
            )}
            <span className={`log-item__status ${isSuccess ? 'log-item__status--success' : 'log-item__status--error'}`}>
              {entry.response.hex.slice(-4)}
            </span>
          </span>
          <span className="log-item__meaning">{entry.response.meaning}</span>
        </div>
      )}
    </div>
  );
}
