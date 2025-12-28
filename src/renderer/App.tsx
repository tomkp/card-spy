import { useReducer, useEffect, useRef, useMemo } from 'react';
import type {
  Device,
  Card,
  ReaderSession,
  Command,
  Response,
  EmvApplicationFoundEvent,
  ApplicationSelectedEvent,
  ApplicationFoundEvent,
  HandlersDetectedEvent,
  ActiveHandlerChangedEvent,
} from '../shared/types';
import { ReaderPanel } from './components/ReaderPanel';
import { DeviceSelector } from './components/DeviceSelector';
import { CommandPanel } from './components/CommandPanel';
import { CardInfoHeader } from './components/CardInfoHeader';
import { Repl, ReplHandle } from './components/Repl';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { ApplicationsPanel } from './components/ApplicationsPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { parseTlv } from '../shared/tlv';
import { useKeyboardShortcuts, KeyboardShortcut } from './hooks/useKeyboardShortcuts';
import { appReducer, initialState } from './state/appState';

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const {
    devices,
    activeDevice,
    cards,
    sessions,
    applications,
    selectedApplication,
    handlers,
    activeHandlerId,
    showShortcutHelp,
  } = state;

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
            dispatch({ type: 'CLEAR_LOG', deviceName: activeDeviceRef.current.name });
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
          dispatch({ type: 'TOGGLE_SHORTCUT_HELP' });
        },
        description: 'Toggle keyboard shortcuts help',
      },
      {
        key: 'Escape',
        action: () => {
          dispatch({ type: 'HIDE_SHORTCUT_HELP' });
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
        // Build cards map from existing cards
        const cardsMap = new Map<string, Card>();
        for (const c of existingCards) {
          cardsMap.set(c.deviceName, {
            atr: c.atr,
            protocol: c.protocol,
            deviceName: c.deviceName,
          });
        }

        // Initialize sessions for each device
        const newSessions = new Map<string, ReaderSession>();
        devs.forEach((device) => {
          const card = cardsMap.get(device.name) || null;
          newSessions.set(device.name, { device, card, log: [] });
        });

        dispatch({
          type: 'INITIALIZE',
          devices: devs,
          cards: cardsMap,
          sessions: newSessions,
        });
      }
    );

    window.electronAPI.onDeviceActivated((device) => {
      dispatch({ type: 'DEVICE_ACTIVATED', device: device as Device });
    });

    window.electronAPI.onDeviceDeactivated((device) => {
      dispatch({ type: 'DEVICE_DEACTIVATED', device: device as Device });
    });

    window.electronAPI.onCardInserted((c) => {
      const card = c as Card;
      const deviceName = card.deviceName;
      if (deviceName) {
        dispatch({
          type: 'CARD_INSERTED',
          card,
          logEntry: {
            type: 'card-inserted',
            id: `card-${++logIdCounter.current}`,
            device: deviceName,
            atr: card.atr,
          },
        });
      }
    });

    window.electronAPI.onCardRemoved((data) => {
      dispatch({ type: 'CARD_REMOVED', deviceName: data.deviceName });
    });

    window.electronAPI.onCommandIssued((command) => {
      const cmd = command as Command;
      const currentDevice = activeDeviceRef.current;
      if (currentDevice) {
        dispatch({
          type: 'COMMAND_ISSUED',
          deviceName: currentDevice.name,
          command: cmd,
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

        dispatch({
          type: 'RESPONSE_RECEIVED',
          deviceName: currentDevice.name,
          response: res,
          tlv: tlvData,
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
        dispatch({
          type: 'APPLICATION_FOUND',
          deviceName: currentDevice.name,
          app: {
            aid: event.aid,
            name: event.name,
            label: event.label,
            handlerId: event.handlerId,
          },
        });
      }
    });

    window.electronAPI.onApplicationSelected((data) => {
      const event = data as ApplicationSelectedEvent;
      console.log('Application selected:', event.aid);
      dispatch({ type: 'APPLICATION_SELECTED', aid: event.aid });
    });

    // Handler events
    window.electronAPI.onHandlersDetected((data) => {
      const event = data as HandlersDetectedEvent;
      console.log('Handlers detected:', event.handlers.map((h) => h.name));
      dispatch({
        type: 'HANDLERS_DETECTED',
        deviceName: event.deviceName,
        handlers: event.handlers,
      });
    });

    window.electronAPI.onActiveHandlerChanged((data) => {
      const event = data as ActiveHandlerChangedEvent;
      console.log('Active handler changed:', event.handlerId);
      dispatch({
        type: 'ACTIVE_HANDLER_CHANGED',
        deviceName: event.deviceName,
        handlerId: event.handlerId,
      });
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
    dispatch({ type: 'SET_ACTIVE_DEVICE', device });

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
      dispatch({ type: 'CLEAR_LOG', deviceName: activeDevice.name });
    }
  }

  function handleRepl(command: string) {
    window.electronAPI.repl(command);
  }

  function handleSelectHandler(handlerId: string) {
    window.electronAPI.setActiveHandler(handlerId);
    if (activeDevice) {
      dispatch({
        type: 'ACTIVE_HANDLER_CHANGED',
        deviceName: activeDevice.name,
        handlerId,
      });
    }
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
    dispatch({ type: 'APPLICATION_SELECTED', aid });
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
                <ErrorBoundary>
                  <CommandPanel
                    handlers={activeHandlers}
                    activeHandlerId={activeHandlerId}
                    onSelectHandler={handleSelectHandler}
                    onExecuteCommand={handleExecuteCommand}
                  />
                </ErrorBoundary>
              </div>
            </div>

            {/* Reader Panel - Center */}
            <ErrorBoundary>
              <ReaderPanel
                session={activeSession}
                onInterrogate={handleInterrogate}
                onClear={handleClearLog}
                onShowShortcuts={() => dispatch({ type: 'TOGGLE_SHORTCUT_HELP' })}
              />
            </ErrorBoundary>
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
        <KeyboardShortcutsHelp onClose={() => dispatch({ type: 'HIDE_SHORTCUT_HELP' })} />
      )}
    </div>
  );
}
