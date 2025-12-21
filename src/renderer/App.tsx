import { useState, useEffect, useCallback } from 'react';
import type { Device, Card, LogEntry } from '../shared/types';
import { Console } from './components/Console';
import { StatusBar } from './components/StatusBar';

export function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [repl, setRepl] = useState('');

  useEffect(() => {
    window.electronAPI.getDevices().then(setDevices);

    window.electronAPI.onDeviceActivated((device) => {
      setDevices(prev => [...prev, device as Device]);
    });

    window.electronAPI.onDeviceDeactivated((device) => {
      const d = device as Device;
      setDevices(prev => prev.filter(dev => dev.name !== d.name));
    });

    window.electronAPI.onCardInserted((c) => setCard(c as Card));
    window.electronAPI.onCardRemoved(() => setCard(null));

    window.electronAPI.onCommandIssued((command) => {
      const cmd = command as LogEntry['command'];
      setLog(prev => [...prev, { id: cmd.id, command: cmd }]);
    });

    window.electronAPI.onResponseReceived((response) => {
      const res = response as LogEntry['response'];
      if (res) {
        setLog(prev => prev.map(entry =>
          entry.id === res.id ? { ...entry, response: res } : entry
        ));
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
  }, []);

  const handleSelectDevice = useCallback(async (device: Device) => {
    await window.electronAPI.selectDevice(device.name);
    setActiveDevice(device);
  }, []);

  const handleInterrogate = useCallback(() => {
    window.electronAPI.interrogate();
  }, []);

  const handleRunCommand = useCallback(() => {
    const hex = repl.trim().replace(/\s+/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      const byte = parseInt(hex.substr(i, 2), 16);
      if (isNaN(byte)) return;
      bytes.push(byte);
    }
    if (bytes.length > 0) {
      window.electronAPI.sendCommand(bytes);
      setRepl('');
    }
  }, [repl]);

  const handleClearLog = useCallback(() => {
    setLog([]);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <Console
        log={log}
        repl={repl}
        onReplChange={setRepl}
        onRunCommand={handleRunCommand}
        onInterrogate={handleInterrogate}
        onClearLog={handleClearLog}
        hasCard={!!card}
      />
      <StatusBar
        devices={devices}
        activeDevice={activeDevice}
        card={card}
        onSelectDevice={handleSelectDevice}
      />
    </div>
  );
}
