import type { Device, Card } from '../../shared/types';

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
    return null;
  }

  return (
    <div className="border border-border rounded bg-card p-2 space-y-1 text-sm">
      {devices.map((device) => {
        const hasCard = cards.has(device.name);
        const isActive = activeDevice?.name === device.name;

        return (
          <button
            key={device.name}
            onClick={() => onSelectDevice(device)}
            className={`flex items-center gap-2 w-full px-2 py-1 rounded text-left hover:bg-accent ${
              isActive ? 'bg-accent' : ''
            }`}
          >
            {/* Connection indicator (green = activated) */}
            <span
              className={`w-2 h-2 rounded-full ${
                device.isActivated ? 'bg-success' : 'bg-muted-foreground'
              }`}
            />
            {/* Card indicator (green = card present, red = no card) */}
            <span
              className={`w-2 h-2 rounded-full ${
                hasCard ? 'bg-success' : 'bg-error'
              }`}
            />
            <span className="truncate">{device.name}</span>
          </button>
        );
      })}
    </div>
  );
}
