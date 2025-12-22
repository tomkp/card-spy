import type { Device, Card } from '../../shared/types';
import { Indicator } from './Indicator';

interface DeviceSelectorProps {
  devices: Device[];
  activeDevice: Device | null;
  cards: Map<string, Card>;
  onSelectDevice: (device: Device) => void;
}

export function DeviceSelector({
  devices,
  activeDevice,
  cards,
  onSelectDevice,
}: DeviceSelectorProps) {
  if (devices.length === 0) {
    return <div className="text-xs text-muted-foreground">No readers connected</div>;
  }

  return (
    <div className="flex gap-2">
      {devices.map((device) => {
        const hasCard = cards.has(device.name);
        const isActive = activeDevice?.name === device.name;

        return (
          <button
            key={device.name}
            onClick={() => onSelectDevice(device)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded border text-sm transition-colors ${
              isActive
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border hover:bg-accent'
            }`}
          >
            <Indicator
              status={device.isActivated ? 'activated' : 'deactivated'}
              title={device.isActivated ? 'Reader activated' : 'Reader deactivated'}
              size="sm"
            />
            <Indicator
              status={hasCard ? 'inserted' : 'removed'}
              title={hasCard ? 'Card inserted' : 'No card'}
              size="sm"
            />
            <span className="truncate max-w-[200px]">{device.name}</span>
          </button>
        );
      })}
    </div>
  );
}
