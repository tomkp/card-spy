import type { Device, Card } from '../../shared/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface StatusBarProps {
  devices: Device[];
  activeDevice: Device | null;
  card: Card | null;
  onSelectDevice: (device: Device) => void;
}

export function StatusBar({ devices, activeDevice, card, onSelectDevice }: StatusBarProps) {
  return (
    <div className="flex items-center gap-4 px-3 py-2 bg-card border-t border-border text-xs">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${devices.length > 0 ? 'bg-success' : 'bg-muted-foreground'}`} />
        <span className="text-muted-foreground">
          {devices.length} reader{devices.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${card ? 'bg-success' : 'bg-muted-foreground'}`} />
        <span className="text-muted-foreground font-mono">
          {card
            ? `ATR: ${card.atr.substring(0, 24).toUpperCase()}${card.atr.length > 24 ? '...' : ''}`
            : 'No card inserted'}
        </span>
      </div>

      {devices.length > 0 && (
        <div className="ml-auto">
          <Select
            value={activeDevice?.name ?? ''}
            onValueChange={(value) => {
              const device = devices.find(d => d.name === value);
              if (device) onSelectDevice(device);
            }}
          >
            <SelectTrigger className="w-[220px] h-7 text-xs">
              <SelectValue placeholder="Select reader..." />
            </SelectTrigger>
            <SelectContent>
              {devices.map(device => (
                <SelectItem key={device.name} value={device.name}>
                  {device.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
