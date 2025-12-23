import { useState, useEffect, useRef } from 'react';
import type {
  Device,
  Card,
  ReaderSession,
  CardInsertedLogEntry,
  CommandLogEntry,
  Command,
  Response,
  EmvApplicationFoundEvent,
  ApplicationSelectedEvent,
  HandlersDetectedEvent,
  ActiveHandlerChangedEvent,
  DetectedHandlerInfo,
} from '../shared/types';
import { ReaderPanel } from './components/ReaderPanel';
import { DeviceSelector } from './components/DeviceSelector';
import { CommandPanel } from './components/CommandPanel';
import { Repl } from './components/Repl';
import { parseTlv } from '../shared/tlv';

export function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);
  const [cards, setCards] = useState<Map<string, Card>>(new Map());
  const [sessions, setSessions] = useState<Map<string, ReaderSession>>(new Map());
  // Track discovered EMV applications (for future display/selection UI)
  const [_applications, setApplications] = useState<string[]>([]);
  const [_currentApplication, setCurrentApplication] = useState<string | null>(null);
  // Handler state
  const [handlers, setHandlers] = useState<Map<string, DetectedHandlerInfo[]>>(new Map());
  const [activeHandlerId, setActiveHandlerId] = useState<string | null>(null);
  const logIdCounter = useRef(0);
  const activeDeviceRef = useRef<Device | null>(null);

  // Keep ref in sync with state for use in event handlers
  useEffect(() => {
    activeDeviceRef.current = activeDevice;
  }, [activeDevice]);

  // Setup event listeners once on mount
  useEffect(() => {
    // Fetch devices and cards on startup
    Promise.all([window.electronAPI.getDevices(), window.electronAPI.getCards()]).then(
      ([devs, existingCards]) => {
        setDevices(devs);

        // Build cards map from existing cards
        const cardsMap = new Map<string, Card>();
        for (const c of existingCards) {
          cardsMap.set(c.deviceName, {
            atr: c.atr,
            protocol: c.protocol,
            deviceName: c.deviceName,
          });
        }
        setCards(cardsMap);

        // Initialize sessions for each device
        const newSessions = new Map<string, ReaderSession>();
        devs.forEach((device) => {
          const card = cardsMap.get(device.name) || null;
          newSessions.set(device.name, { device, card, log: [] });
        });
        setSessions(newSessions);

        // Auto-select first device with a card and detect handlers
        if (!activeDeviceRef.current) {
          for (const dev of devs) {
            const card = cardsMap.get(dev.name);
            if (card) {
              setActiveDevice(dev);
              window.electronAPI.selectDevice(dev.name);
              // Detect handlers for existing card
              window.electronAPI.detectHandlers(dev.name, card.atr);
              break;
            }
          }
        }
      }
    );

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
      const deviceName = card.deviceName;
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

    window.electronAPI.onCardRemoved((data) => {
      const { deviceName } = data;
      setCards((prev) => {
        const newCards = new Map(prev);
        newCards.delete(deviceName);
        return newCards;
      });
      setSessions((prev) => {
        const newSessions = new Map(prev);
        const session = newSessions.get(deviceName);
        if (session) {
          newSessions.set(deviceName, { ...session, card: null });
        }
        return newSessions;
      });
      // Clear applications and handlers when card is removed
      setApplications([]);
      setCurrentApplication(null);
      setHandlers((prev) => {
        const newHandlers = new Map(prev);
        newHandlers.delete(deviceName);
        return newHandlers;
      });
      if (activeDeviceRef.current?.name === deviceName) {
        setActiveHandlerId(null);
      }
    });

    window.electronAPI.onCommandIssued((command) => {
      const cmd = command as Command;
      const currentDevice = activeDeviceRef.current;
      if (currentDevice) {
        setSessions((prev) => {
          const newSessions = new Map(prev);
          const session = newSessions.get(currentDevice.name);
          if (session) {
            const newEntry: CommandLogEntry = {
              type: 'command',
              id: cmd.id,
              command: cmd,
            };
            newSessions.set(currentDevice.name, {
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
      const currentDevice = activeDeviceRef.current;
      if (res && currentDevice) {
        let tlvData = undefined;
        if (res.data && res.data.length > 0) {
          try {
            const parsed = parseTlv(res.data);
            if (parsed.length > 0) {
              tlvData = parsed;
            }
          } catch {
            // TLV parsing failed, that's ok
          }
        }

        setSessions((prev) => {
          const newSessions = new Map(prev);
          const session = newSessions.get(currentDevice.name);
          if (session) {
            newSessions.set(currentDevice.name, {
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

    window.electronAPI.onEmvApplicationFound((data) => {
      const event = data as EmvApplicationFoundEvent;
      console.log('EMV Application found:', event.aid);
      setApplications((prev) => {
        if (prev.includes(event.aid)) return prev;
        return [...prev, event.aid];
      });
    });

    window.electronAPI.onApplicationSelected((data) => {
      const event = data as ApplicationSelectedEvent;
      console.log('Application selected:', event.aid);
      setCurrentApplication(event.aid);
    });

    // Handler events
    window.electronAPI.onHandlersDetected((data) => {
      const event = data as HandlersDetectedEvent;
      console.log('Handlers detected:', event.handlers.map((h) => h.name));
      setHandlers((prev) => {
        const newHandlers = new Map(prev);
        newHandlers.set(event.deviceName, event.handlers);
        return newHandlers;
      });
      // Set active handler to the first one if this is the active device
      if (activeDeviceRef.current?.name === event.deviceName && event.handlers.length > 0) {
        setActiveHandlerId(event.handlers[0].id);
      }
    });

    window.electronAPI.onActiveHandlerChanged((data) => {
      const event = data as ActiveHandlerChangedEvent;
      console.log('Active handler changed:', event.handlerId);
      if (activeDeviceRef.current?.name === event.deviceName) {
        setActiveHandlerId(event.handlerId);
      }
    });

    return () => {
      window.electronAPI.removeAllListeners('device-activated');
      window.electronAPI.removeAllListeners('device-deactivated');
      window.electronAPI.removeAllListeners('card-inserted');
      window.electronAPI.removeAllListeners('card-removed');
      window.electronAPI.removeAllListeners('command-issued');
      window.electronAPI.removeAllListeners('response-received');
      window.electronAPI.removeAllListeners('emv-application-found');
      window.electronAPI.removeAllListeners('application-selected');
      window.electronAPI.removeAllListeners('handlers-detected');
      window.electronAPI.removeAllListeners('active-handler-changed');
    };
  }, []);

  async function handleSelectDevice(device: Device) {
    await window.electronAPI.selectDevice(device.name);
    setActiveDevice(device);
  }

  function handleInterrogate() {
    if (activeDevice) {
      window.electronAPI.interrogate();
    }
  }

  function handleClearLog() {
    if (activeDevice) {
      setSessions((prev) => {
        const newSessions = new Map(prev);
        const session = newSessions.get(activeDevice.name);
        if (session) {
          newSessions.set(activeDevice.name, { ...session, log: [] });
        }
        return newSessions;
      });
    }
  }

  function handleRepl(command: string) {
    window.electronAPI.repl(command);
  }

  function handleSelectHandler(handlerId: string) {
    window.electronAPI.setActiveHandler(handlerId);
    setActiveHandlerId(handlerId);
  }

  function handleExecuteCommand(commandId: string, parameters: Record<string, unknown>) {
    window.electronAPI.executeCommand(commandId, parameters);
  }

  const activeSession = activeDevice ? sessions.get(activeDevice.name) : null;
  const hasCard = activeDevice ? cards.has(activeDevice.name) : false;
  const activeHandlers = activeDevice ? handlers.get(activeDevice.name) || [] : [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex overflow-hidden">
        {activeSession ? (
          <>
            <ReaderPanel
              session={activeSession}
              onInterrogate={handleInterrogate}
              onClear={handleClearLog}
            />
            <div className="w-72 border-l border-border flex flex-col">
              <CommandPanel
                handlers={activeHandlers}
                activeHandlerId={activeHandlerId}
                onSelectHandler={handleSelectHandler}
                onExecuteCommand={handleExecuteCommand}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg">No card readers detected</p>
              <p className="text-sm mt-1">Connect a smart card reader to get started</p>
            </div>
          </div>
        )}
      </div>

      <Repl onSubmit={handleRepl} disabled={!hasCard} />

      <DeviceSelector
        devices={devices}
        activeDevice={activeDevice}
        cards={cards}
        onSelectDevice={handleSelectDevice}
      />
    </div>
  );
}
