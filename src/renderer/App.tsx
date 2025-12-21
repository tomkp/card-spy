import { useState, useEffect, useCallback } from 'react';
import type { Device, Card, LogEntry, ReaderSession } from '../shared/types';
import { ReaderPanel } from './components/ReaderPanel';
import { DeviceSelector } from './components/DeviceSelector';

export function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);
  const [cards, setCards] = useState<Map<string, Card>>(new Map());
  const [sessions, setSessions] = useState<Map<string, ReaderSession>>(new Map());

  useEffect(() => {
    window.electronAPI.getDevices().then((devs) => {
      setDevices(devs);
      // Initialize sessions for each device
      const newSessions = new Map<string, ReaderSession>();
      devs.forEach((device) => {
        newSessions.set(device.name, { device, card: null, log: [] });
      });
      setSessions(newSessions);
    });

    window.electronAPI.onDeviceActivated((device) => {
      const d = device as Device;
      setDevices((prev) => {
        if (prev.find((p) => p.name === d.name)) return prev;
        return [...prev, d];
      });
      setSessions((prev) => {
        const newSessions = new Map(prev);
        if (!newSessions.has(d.name)) {
          newSessions.set(d.name, { device: d, card: null, log: [] });
        }
        return newSessions;
      });
    });

    window.electronAPI.onDeviceDeactivated((device) => {
      const d = device as Device;
      setDevices((prev) => prev.filter((dev) => dev.name !== d.name));
      setSessions((prev) => {
        const newSessions = new Map(prev);
        newSessions.delete(d.name);
        return newSessions;
      });
      setCards((prev) => {
        const newCards = new Map(prev);
        newCards.delete(d.name);
        return newCards;
      });
    });

    window.electronAPI.onCardInserted((c) => {
      const card = c as Card;
      const deviceName = card.deviceName || activeDevice?.name;
      if (deviceName) {
        setCards((prev) => {
          const newCards = new Map(prev);
          newCards.set(deviceName, card);
          return newCards;
        });
        setSessions((prev) => {
          const newSessions = new Map(prev);
          const session = newSessions.get(deviceName);
          if (session) {
            newSessions.set(deviceName, { ...session, card });
          }
          return newSessions;
        });
      }
    });

    window.electronAPI.onCardRemoved(() => {
      // For now, clear card from active device
      if (activeDevice) {
        setCards((prev) => {
          const newCards = new Map(prev);
          newCards.delete(activeDevice.name);
          return newCards;
        });
        setSessions((prev) => {
          const newSessions = new Map(prev);
          const session = newSessions.get(activeDevice.name);
          if (session) {
            newSessions.set(activeDevice.name, { ...session, card: null });
          }
          return newSessions;
        });
      }
    });

    window.electronAPI.onCommandIssued((command) => {
      const cmd = command as LogEntry['command'];
      if (activeDevice) {
        setSessions((prev) => {
          const newSessions = new Map(prev);
          const session = newSessions.get(activeDevice.name);
          if (session) {
            newSessions.set(activeDevice.name, {
              ...session,
              log: [...session.log, { id: cmd.id, command: cmd }],
            });
          }
          return newSessions;
        });
      }
    });

    window.electronAPI.onResponseReceived((response) => {
      const res = response as LogEntry['response'];
      if (res && activeDevice) {
        setSessions((prev) => {
          const newSessions = new Map(prev);
          const session = newSessions.get(activeDevice.name);
          if (session) {
            newSessions.set(activeDevice.name, {
              ...session,
              log: session.log.map((entry) =>
                entry.id === res.id ? { ...entry, response: res } : entry
              ),
            });
          }
          return newSessions;
        });
      }
    });

    return () => {
      window.electronAPI.removeAllListeners('device-activated');
      window.electronAPI.removeAllListeners('device-deactivated');
      window.electronAPI.removeAllListeners('card-inserted');
      window.electronAPI.removeAllListeners('card-removed');
      window.electronAPI.removeAllListeners('command-issued');
      window.electronAPI.removeAllListeners('response-received');
    };
  }, [activeDevice]);

  const handleSelectDevice = useCallback(async (device: Device) => {
    await window.electronAPI.selectDevice(device.name);
    setActiveDevice(device);
  }, []);

  const handleInterrogate = useCallback(
    (deviceName: string) => {
      const device = devices.find((d) => d.name === deviceName);
      if (device) {
        handleSelectDevice(device).then(() => {
          window.electronAPI.interrogate();
        });
      }
    },
    [devices, handleSelectDevice]
  );

  const handleClearLog = useCallback((deviceName: string) => {
    setSessions((prev) => {
      const newSessions = new Map(prev);
      const session = newSessions.get(deviceName);
      if (session) {
        newSessions.set(deviceName, { ...session, log: [] });
      }
      return newSessions;
    });
  }, []);

  // Get sessions as array for rendering
  const sessionArray = Array.from(sessions.values());

  return (
    <div className="flex flex-col h-full">
      {/* Main content area with reader panels */}
      <div className="flex-1 overflow-auto">
        {sessionArray.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p className="text-lg">No card readers detected</p>
              <p className="text-sm mt-1">Connect a smart card reader to get started</p>
            </div>
          </div>
        ) : (
          sessionArray.map((session) => (
            <ReaderPanel
              key={session.device.name}
              session={session}
              onInterrogate={() => handleInterrogate(session.device.name)}
              onClear={() => handleClearLog(session.device.name)}
            />
          ))
        )}
      </div>

      {/* Bottom panel with device selector and current device status */}
      <div className="border-t border-border bg-card p-2 flex items-end gap-4">
        <DeviceSelector
          devices={devices}
          activeDevice={activeDevice}
          cards={cards}
          onSelectDevice={handleSelectDevice}
        />
        {activeDevice && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={`w-2 h-2 rounded-full ${
                cards.has(activeDevice.name) ? 'bg-success' : 'bg-muted-foreground'
              }`}
            />
            <span>{activeDevice.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
