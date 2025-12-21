import type { Device, Card } from '../../shared/types';
import './StatusBar.scss';

interface StatusBarProps {
  devices: Device[];
  activeDevice: Device | null;
  card: Card | null;
  onSelectDevice: (device: Device) => void;
}

export function StatusBar({ devices, activeDevice, card, onSelectDevice }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-bar__item">
        <span className={`status-bar__indicator ${devices.length > 0 ? 'status-bar__indicator--active' : ''}`} />
        <span>{devices.length} reader{devices.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="status-bar__item">
        <span className={`status-bar__indicator ${card ? 'status-bar__indicator--active' : ''}`} />
        <span>
          {card
            ? `ATR: ${card.atr.substring(0, 24).toUpperCase()}${card.atr.length > 24 ? '...' : ''}`
            : 'No card inserted'}
        </span>
      </div>

      {devices.length > 0 && (
        <select
          className="status-bar__select"
          value={activeDevice?.name ?? ''}
          onChange={e => {
            const device = devices.find(d => d.name === e.target.value);
            if (device) onSelectDevice(device);
          }}
        >
          <option value="">Select reader...</option>
          {devices.map(device => (
            <option key={device.name} value={device.name}>
              {device.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
