import { useState, useEffect, useCallback, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import type { Device, Card, ReaderSession, CardInsertedLogEntry, CommandLogEntry, Command, Response } from '../shared/types';
import { ReaderPanel } from './components/ReaderPanel';
import { DeviceSelector } from './components/DeviceSelector';
import { Repl } from './components/Repl';
import { parseTlv } from './utils/tlv-parser';

export function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);
  const [cards, setCards] = useState<Map<string, Card>>(new Map());
  const [sessions, setSessions] = useState<Map<string, ReaderSession>>(new Map());
  const logIdCounter = useRef(0);

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
            // Add card inserted log entry
            const cardInsertedEntry: CardInsertedLogEntry = {
              type: 'card-inserted',
              id: `card-${++logIdCounter.current}`,
              device: deviceName,
              atr: card.atr,
            };
            newSessions.set(deviceName, {
              ...session,
              card,
              log: [...session.log, cardInsertedEntry],
            });
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
      const cmd = command as Command;
      if (activeDevice) {
        setSessions((prev) => {
          const newSessions = new Map(prev);
          const session = newSessions.get(activeDevice.name);
          if (session) {
            const newEntry: CommandLogEntry = {
              type: 'command',
              id: cmd.id,
              command: cmd,
            };
            newSessions.set(activeDevice.name, {
              ...session,
              log: [...session.log, newEntry],
            });
          }
          return newSessions;
        });
      }
    });

    window.electronAPI.onResponseReceived((response) => {
      const res = response as Response;
      if (res && activeDevice) {
        // Try to parse TLV data from response
        let tlvData = undefined;
        if (res.data && res.data.length > 0) {
          try {
            const parsed = parseTlv(res.data);
            if (parsed.length > 0) {
              tlvData = parsed;
            }
          } catch {
            // TLV parsing failed, that's ok - not all responses are TLV
          }
        }

        setSessions((prev) => {
          const newSessions = new Map(prev);
          const session = newSessions.get(activeDevice.name);
          if (session) {
            newSessions.set(activeDevice.name, {
              ...session,
              log: session.log.map((entry) =>
                entry.type === 'command' && entry.id === res.id
                  ? { ...entry, response: res, tlv: tlvData }
                  : entry
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

  const handleRepl = useCallback((command: string) => {
    window.electronAPI.repl(command);
  }, []);

  // Get sessions as array for rendering
  const sessionArray = Array.from(sessions.values());

  const hasCard = activeDevice ? cards.has(activeDevice.name) : false;

  return (
    <div className="flex flex-col h-full">
      <PanelGroup direction="vertical" className="flex-1">
        {/* Main content area with reader panels */}
        <Panel defaultSize={75} minSize={30}>
          <div className="h-full overflow-auto">
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
        </Panel>

        <PanelResizeHandle className="h-1 bg-border hover:bg-primary transition-colors cursor-row-resize" />

        {/* REPL panel */}
        <Panel defaultSize={25} minSize={10}>
          <Repl onSubmit={handleRepl} disabled={!hasCard} />
        </Panel>
      </PanelGroup>

      {/* Bottom panel with device selector */}
      <div className="border-t border-border bg-card p-2">
        <DeviceSelector
          devices={devices}
          activeDevice={activeDevice}
          cards={cards}
          onSelectDevice={handleSelectDevice}
        />
      </div>
    </div>
  );
}
