import { useState, useEffect, useRef, useMemo } from 'react';
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
  ApplicationFoundEvent,
  HandlersDetectedEvent,
  ActiveHandlerChangedEvent,
  DetectedHandlerInfo,
} from '../shared/types';
import { ReaderPanel } from './components/ReaderPanel';
import { DeviceSelector } from './components/DeviceSelector';
import { CommandPanel } from './components/CommandPanel';
import { CardInfoHeader } from './components/CardInfoHeader';
import { Repl, ReplHandle } from './components/Repl';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { ApplicationsPanel, DiscoveredApp } from './components/ApplicationsPanel';
import { parseTlv } from '../shared/tlv';
import { useKeyboardShortcuts, KeyboardShortcut } from './hooks/useKeyboardShortcuts';

export function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);
  const [cards, setCards] = useState<Map<string, Card>>(new Map());
  const [sessions, setSessions] = useState<Map<string, ReaderSession>>(new Map());
  // Track discovered applications per device
  const [applications, setApplications] = useState<Map<string, DiscoveredApp[]>>(new Map());
  const [selectedApplication, setSelectedApplication] = useState<string | null>(null);
  // Handler state
  const [handlers, setHandlers] = useState<Map<string, DetectedHandlerInfo[]>>(new Map());
  const [activeHandlerId, setActiveHandlerId] = useState<string | null>(null);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const logIdCounter = useRef(0);
  const activeDeviceRef = useRef<Device | null>(null);
  const replRef = useRef<ReplHandle>(null);

  // Keep ref in sync with state for use in event handlers
  useEffect(() => {
    activeDeviceRef.current = activeDevice;
  }, [activeDevice]);

  // Define keyboard shortcuts
  const shortcuts: KeyboardShortcut[] = useMemo(
    () => [
      {
        key: 'i',
        meta: true,
        action: () => {
          if (activeDeviceRef.current && cards.has(activeDeviceRef.current.name)) {
            window.electronAPI.interrogate();
          }
        },
        description: 'Interrogate card',
      },
      {
        key: 'l',
        meta: true,
        action: () => {
          if (activeDeviceRef.current) {
            setSessions((prev) => {
              const newSessions = new Map(prev);
              const session = newSessions.get(activeDeviceRef.current!.name);
              if (session) {
                newSessions.set(activeDeviceRef.current!.name, { ...session, log: [] });
              }
              return newSessions;
            });
          }
        },
        description: 'Clear log',
      },
      {
        key: 'k',
        meta: true,
        action: () => {
          replRef.current?.focus();
        },
        description: 'Focus command input',
      },
      {
        key: '/',
        meta: true,
        action: () => {
          setShowShortcutHelp((prev) => !prev);
        },
        description: 'Toggle keyboard shortcuts help',
      },
      {
        key: 'Escape',
        action: () => {
          setShowShortcutHelp(false);
        },
        description: 'Close dialogs',
      },
    ],
    [cards]
  );

  useKeyboardShortcuts(shortcuts);

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

        // Don't auto-select - user should explicitly select a device
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
      setApplications((prev) => {
        const newApps = new Map(prev);
        newApps.delete(deviceName);
        return newApps;
      });
      setSelectedApplication(null);
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
      console.log('EMV Application found (legacy):', event.aid);
    });

    window.electronAPI.onApplicationFound((data) => {
      const event = data as ApplicationFoundEvent;
      console.log('Application found:', event.aid, event.name || event.label);
      const currentDevice = activeDeviceRef.current;
      if (currentDevice) {
        setApplications((prev) => {
          const newApps = new Map(prev);
          const deviceApps = newApps.get(currentDevice.name) || [];
          // Avoid duplicates
          if (!deviceApps.some((app) => app.aid === event.aid)) {
            newApps.set(currentDevice.name, [
              ...deviceApps,
              {
                aid: event.aid,
                name: event.name,
                label: event.label,
                handlerId: event.handlerId,
              },
            ]);
          }
          return newApps;
        });
      }
    });

    window.electronAPI.onApplicationSelected((data) => {
      const event = data as ApplicationSelectedEvent;
      console.log('Application selected:', event.aid);
      setSelectedApplication(event.aid);
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
      window.electronAPI.removeAllListeners('application-found');
      window.electronAPI.removeAllListeners('application-selected');
      window.electronAPI.removeAllListeners('handlers-detected');
      window.electronAPI.removeAllListeners('active-handler-changed');
    };
  }, []);

  async function handleSelectDevice(device: Device) {
    await window.electronAPI.selectDevice(device.name);
    setActiveDevice(device);

    // Detect handlers if device has a card
    const card = cards.get(device.name);
    if (card) {
      window.electronAPI.detectHandlers(device.name, card.atr);
    }
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
  const activeCard = activeDevice ? cards.get(activeDevice.name) || null : null;
  const activeApplications = activeDevice ? applications.get(activeDevice.name) || [] : [];

  function handleSelectApplication(aid: string) {
    setSelectedApplication(aid);
    // Execute the select command for this application
    window.electronAPI.executeCommand(`select-app-${aid}`, {});
  }

  return (
    <div className="flex flex-col h-full">
      {/* Card Info Header */}
      {activeSession && (
        <CardInfoHeader
          card={activeCard}
          handlers={activeHandlers}
          activeHandlerId={activeHandlerId}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {activeSession ? (
          <>
            {/* Left Side Panel - Applications + Commands */}
            <div className="w-64 border-r border-border flex flex-col bg-card">
              {/* Applications Panel */}
              {activeApplications.length > 0 && (
                <div className="border-b border-border">
                  <ApplicationsPanel
                    applications={activeApplications}
                    selectedAid={selectedApplication}
                    onSelectApp={handleSelectApplication}
                  />
                </div>
              )}

              {/* Command Panel */}
              <div className="flex-1 overflow-hidden">
                <CommandPanel
                  handlers={activeHandlers}
                  activeHandlerId={activeHandlerId}
                  onSelectHandler={handleSelectHandler}
                  onExecuteCommand={handleExecuteCommand}
                />
              </div>
            </div>

            {/* Reader Panel - Center */}
            <ReaderPanel
              session={activeSession}
              onInterrogate={handleInterrogate}
              onClear={handleClearLog}
              onShowShortcuts={() => setShowShortcutHelp(true)}
            />
          </>
        ) : devices.length > 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg">Select a reader to get started</p>
              <p className="text-sm mt-1">Click on a reader in the status bar below</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg">No card readers detected</p>
              <p className="text-sm mt-1">Connect a smart card reader to get started</p>
            </div>
          </div>
        )}
      </div>

      <Repl ref={replRef} onSubmit={handleRepl} disabled={!activeDevice || !hasCard} />

      <DeviceSelector
        devices={devices}
        activeDevice={activeDevice}
        cards={cards}
        onSelectDevice={handleSelectDevice}
      />

      {/* Keyboard Shortcuts Help Overlay */}
      {showShortcutHelp && (
        <KeyboardShortcutsHelp onClose={() => setShowShortcutHelp(false)} />
      )}
    </div>
  );
}
