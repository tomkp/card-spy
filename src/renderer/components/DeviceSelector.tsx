import { useState, useEffect, useRef } from 'react';
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
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (devices.length === 0) {
    return (
      <div className="border-t border-border bg-card px-4 py-2 text-sm text-muted-foreground">
        No readers connected
      </div>
    );
  }

  const activeHasCard = activeDevice ? cards.has(activeDevice.name) : false;

  return (
    <div className="relative border-t border-border bg-card">
      {isOpen && (
        <div
          ref={popupRef}
          className="absolute bottom-full left-2 mb-1 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[280px]"
        >
          {devices.map((device) => {
            const hasCard = cards.has(device.name);
            const isActive = activeDevice?.name === device.name;

            return (
              <button
                key={device.name}
                onClick={() => {
                  onSelectDevice(device);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors ${
                  isActive ? 'bg-accent' : ''
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
                <span className="truncate">{device.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex">
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground"
        >
          <Indicator
            status={activeDevice?.isActivated ? 'activated' : 'deactivated'}
            title={activeDevice?.isActivated ? 'Reader activated' : 'Reader deactivated'}
            size="sm"
          />
          <Indicator
            status={activeHasCard ? 'inserted' : 'removed'}
            title={activeHasCard ? 'Card inserted' : 'No card'}
            size="sm"
          />
          <span className="truncate max-w-[200px]">{activeDevice?.name || 'Select Reader'}</span>
        </button>
      </div>
    </div>
  );
}
