import { describe, it, expect } from 'vitest';
import type {
  Device,
  Card,
  ReaderSession,
  Command,
  Response,
  CardInsertedLogEntry,
  CommandLogEntry,
} from './types';
import {
  initializeSessions,
  buildCardsMap,
  addDeviceSession,
  removeDeviceSession,
  insertCard,
  removeCard,
  addCommand,
  addResponse,
  clearLog,
  findDeviceWithCard,
  getCommandsFromLog,
  countSuccessfulCommands,
  countFailedCommands,
} from './session';

const createDevice = (name: string): Device => ({ name, isActivated: true });
const createCard = (deviceName: string): Card => ({
  atr: '3B00',
  protocol: 1,
  deviceName,
});
const createCommand = (id: string): Command => ({
  id,
  timestamp: Date.now(),
  apdu: [0x00, 0xa4, 0x04, 0x00],
  hex: '00A40400',
});
const createResponse = (id: string, sw1: number, sw2: number): Response => ({
  id,
  timestamp: Date.now(),
  data: [],
  sw1,
  sw2,
  hex: `${sw1.toString(16)}${sw2.toString(16)}`,
});

describe('initializeSessions', () => {
  it('should create sessions for each device', () => {
    const devices = [createDevice('Reader 1'), createDevice('Reader 2')];
    const cards = new Map<string, Card>();

    const sessions = initializeSessions(devices, cards);

    expect(sessions.size).toBe(2);
    expect(sessions.get('Reader 1')).toBeDefined();
    expect(sessions.get('Reader 2')).toBeDefined();
  });

  it('should associate cards with their devices', () => {
    const devices = [createDevice('Reader 1')];
    const cards = new Map<string, Card>();
    cards.set('Reader 1', createCard('Reader 1'));

    const sessions = initializeSessions(devices, cards);

    expect(sessions.get('Reader 1')?.card).not.toBeNull();
    expect(sessions.get('Reader 1')?.card?.atr).toBe('3B00');
  });

  it('should start with empty logs', () => {
    const devices = [createDevice('Reader 1')];
    const sessions = initializeSessions(devices, new Map());

    expect(sessions.get('Reader 1')?.log).toEqual([]);
  });
});

describe('buildCardsMap', () => {
  it('should build map from card data array', () => {
    const cardData = [
      { deviceName: 'Reader 1', atr: '3B00', protocol: 1 },
      { deviceName: 'Reader 2', atr: '3B01', protocol: 2 },
    ];

    const cards = buildCardsMap(cardData);

    expect(cards.size).toBe(2);
    expect(cards.get('Reader 1')?.atr).toBe('3B00');
    expect(cards.get('Reader 2')?.protocol).toBe(2);
  });

  it('should handle empty array', () => {
    const cards = buildCardsMap([]);
    expect(cards.size).toBe(0);
  });
});

describe('addDeviceSession', () => {
  it('should add new device session', () => {
    const sessions = new Map<string, ReaderSession>();
    const device = createDevice('Reader 1');

    const result = addDeviceSession(sessions, device);

    expect(result.size).toBe(1);
    expect(result.get('Reader 1')?.device.name).toBe('Reader 1');
    expect(result.get('Reader 1')?.card).toBeNull();
  });

  it('should not modify if device already exists', () => {
    const device = createDevice('Reader 1');
    const sessions = new Map<string, ReaderSession>();
    sessions.set('Reader 1', { device, card: createCard('Reader 1'), log: [] });

    const result = addDeviceSession(sessions, device);

    expect(result).toBe(sessions); // Same reference
    expect(result.get('Reader 1')?.card).not.toBeNull();
  });
});

describe('removeDeviceSession', () => {
  it('should remove device session', () => {
    const device = createDevice('Reader 1');
    const sessions = new Map<string, ReaderSession>();
    sessions.set('Reader 1', { device, card: null, log: [] });

    const result = removeDeviceSession(sessions, 'Reader 1');

    expect(result.size).toBe(0);
  });

  it('should return same map if device not found', () => {
    const sessions = new Map<string, ReaderSession>();

    const result = removeDeviceSession(sessions, 'Nonexistent');

    expect(result).toBe(sessions);
  });
});

describe('insertCard', () => {
  it('should update session with card and log entry', () => {
    const device = createDevice('Reader 1');
    const sessions = new Map<string, ReaderSession>();
    sessions.set('Reader 1', { device, card: null, log: [] });

    const card = createCard('Reader 1');
    const logEntry: CardInsertedLogEntry = {
      type: 'card-inserted',
      id: 'card-1',
      device: 'Reader 1',
      atr: '3B00',
    };

    const result = insertCard(sessions, 'Reader 1', card, logEntry);

    expect(result.get('Reader 1')?.card).toEqual(card);
    expect(result.get('Reader 1')?.log).toHaveLength(1);
    expect(result.get('Reader 1')?.log[0].type).toBe('card-inserted');
  });

  it('should return same map if device not found', () => {
    const sessions = new Map<string, ReaderSession>();
    const card = createCard('Reader 1');
    const logEntry: CardInsertedLogEntry = {
      type: 'card-inserted',
      id: 'card-1',
      device: 'Reader 1',
      atr: '3B00',
    };

    const result = insertCard(sessions, 'Reader 1', card, logEntry);

    expect(result).toBe(sessions);
  });
});

describe('removeCard', () => {
  it('should set card to null', () => {
    const device = createDevice('Reader 1');
    const sessions = new Map<string, ReaderSession>();
    sessions.set('Reader 1', { device, card: createCard('Reader 1'), log: [] });

    const result = removeCard(sessions, 'Reader 1');

    expect(result.get('Reader 1')?.card).toBeNull();
  });

  it('should preserve log entries', () => {
    const device = createDevice('Reader 1');
    const logEntry: CardInsertedLogEntry = {
      type: 'card-inserted',
      id: 'card-1',
      device: 'Reader 1',
      atr: '3B00',
    };
    const sessions = new Map<string, ReaderSession>();
    sessions.set('Reader 1', { device, card: createCard('Reader 1'), log: [logEntry] });

    const result = removeCard(sessions, 'Reader 1');

    expect(result.get('Reader 1')?.log).toHaveLength(1);
  });
});

describe('addCommand', () => {
  it('should add command to log', () => {
    const device = createDevice('Reader 1');
    const sessions = new Map<string, ReaderSession>();
    sessions.set('Reader 1', { device, card: null, log: [] });

    const command = createCommand('cmd-1');
    const result = addCommand(sessions, 'Reader 1', command);

    expect(result.get('Reader 1')?.log).toHaveLength(1);
    const entry = result.get('Reader 1')?.log[0] as CommandLogEntry;
    expect(entry.type).toBe('command');
    expect(entry.command.id).toBe('cmd-1');
    expect(entry.response).toBeUndefined();
  });
});

describe('addResponse', () => {
  it('should update matching command with response', () => {
    const device = createDevice('Reader 1');
    const command = createCommand('cmd-1');
    const commandEntry: CommandLogEntry = {
      type: 'command',
      id: 'cmd-1',
      command,
    };
    const sessions = new Map<string, ReaderSession>();
    sessions.set('Reader 1', { device, card: null, log: [commandEntry] });

    const response = createResponse('cmd-1', 0x90, 0x00);
    const result = addResponse(sessions, 'Reader 1', response);

    const entry = result.get('Reader 1')?.log[0] as CommandLogEntry;
    expect(entry.response).toBeDefined();
    expect(entry.response?.sw1).toBe(0x90);
  });

  it('should include TLV data when provided', () => {
    const device = createDevice('Reader 1');
    const command = createCommand('cmd-1');
    const commandEntry: CommandLogEntry = {
      type: 'command',
      id: 'cmd-1',
      command,
    };
    const sessions = new Map<string, ReaderSession>();
    sessions.set('Reader 1', { device, card: null, log: [commandEntry] });

    const response = createResponse('cmd-1', 0x90, 0x00);
    const tlv = [
      { tag: 0x50, tagHex: '50', length: 4, value: [0x56, 0x49, 0x53, 0x41], isConstructed: false },
    ];
    const result = addResponse(sessions, 'Reader 1', response, tlv);

    const entry = result.get('Reader 1')?.log[0] as CommandLogEntry;
    expect(entry.tlv).toBeDefined();
    expect(entry.tlv?.[0].tagHex).toBe('50');
  });

  it('should not modify other log entries', () => {
    const device = createDevice('Reader 1');
    const command1 = createCommand('cmd-1');
    const command2 = createCommand('cmd-2');
    const sessions = new Map<string, ReaderSession>();
    sessions.set('Reader 1', {
      device,
      card: null,
      log: [
        { type: 'command', id: 'cmd-1', command: command1 },
        { type: 'command', id: 'cmd-2', command: command2 },
      ],
    });

    const response = createResponse('cmd-1', 0x90, 0x00);
    const result = addResponse(sessions, 'Reader 1', response);

    const entry2 = result.get('Reader 1')?.log[1] as CommandLogEntry;
    expect(entry2.response).toBeUndefined();
  });
});

describe('clearLog', () => {
  it('should clear all log entries', () => {
    const device = createDevice('Reader 1');
    const sessions = new Map<string, ReaderSession>();
    sessions.set('Reader 1', {
      device,
      card: null,
      log: [
        { type: 'card-inserted', id: 'card-1', device: 'Reader 1', atr: '3B00' },
        { type: 'command', id: 'cmd-1', command: createCommand('cmd-1') },
      ],
    });

    const result = clearLog(sessions, 'Reader 1');

    expect(result.get('Reader 1')?.log).toEqual([]);
  });

  it('should preserve card', () => {
    const device = createDevice('Reader 1');
    const card = createCard('Reader 1');
    const sessions = new Map<string, ReaderSession>();
    sessions.set('Reader 1', {
      device,
      card,
      log: [{ type: 'command', id: 'cmd-1', command: createCommand('cmd-1') }],
    });

    const result = clearLog(sessions, 'Reader 1');

    expect(result.get('Reader 1')?.card).toEqual(card);
  });
});

describe('findDeviceWithCard', () => {
  it('should find first device with card', () => {
    const devices = [createDevice('Reader 1'), createDevice('Reader 2')];
    const cards = new Map<string, Card>();
    cards.set('Reader 2', createCard('Reader 2'));

    const result = findDeviceWithCard(devices, cards);

    expect(result?.name).toBe('Reader 2');
  });

  it('should return null if no device has card', () => {
    const devices = [createDevice('Reader 1')];
    const cards = new Map<string, Card>();

    const result = findDeviceWithCard(devices, cards);

    expect(result).toBeNull();
  });

  it('should return first match when multiple devices have cards', () => {
    const devices = [createDevice('Reader 1'), createDevice('Reader 2')];
    const cards = new Map<string, Card>();
    cards.set('Reader 1', createCard('Reader 1'));
    cards.set('Reader 2', createCard('Reader 2'));

    const result = findDeviceWithCard(devices, cards);

    expect(result?.name).toBe('Reader 1');
  });
});

describe('getCommandsFromLog', () => {
  it('should filter out non-command entries', () => {
    const log = [
      { type: 'card-inserted' as const, id: 'card-1', device: 'Reader 1', atr: '3B00' },
      { type: 'command' as const, id: 'cmd-1', command: createCommand('cmd-1') },
      { type: 'command' as const, id: 'cmd-2', command: createCommand('cmd-2') },
    ];

    const result = getCommandsFromLog(log);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('cmd-1');
    expect(result[1].id).toBe('cmd-2');
  });

  it('should handle empty log', () => {
    expect(getCommandsFromLog([])).toEqual([]);
  });
});

describe('countSuccessfulCommands', () => {
  it('should count commands with 90xx status', () => {
    const log = [
      {
        type: 'command' as const,
        id: 'cmd-1',
        command: createCommand('cmd-1'),
        response: createResponse('cmd-1', 0x90, 0x00),
      },
      {
        type: 'command' as const,
        id: 'cmd-2',
        command: createCommand('cmd-2'),
        response: createResponse('cmd-2', 0x6a, 0x82),
      },
    ];

    expect(countSuccessfulCommands(log)).toBe(1);
  });

  it('should count commands with 61xx status as success', () => {
    const log = [
      {
        type: 'command' as const,
        id: 'cmd-1',
        command: createCommand('cmd-1'),
        response: createResponse('cmd-1', 0x61, 0x10),
      },
    ];

    expect(countSuccessfulCommands(log)).toBe(1);
  });

  it('should not count commands without response', () => {
    const log = [{ type: 'command' as const, id: 'cmd-1', command: createCommand('cmd-1') }];

    expect(countSuccessfulCommands(log)).toBe(0);
  });
});

describe('countFailedCommands', () => {
  it('should count commands with error status', () => {
    const log = [
      {
        type: 'command' as const,
        id: 'cmd-1',
        command: createCommand('cmd-1'),
        response: createResponse('cmd-1', 0x90, 0x00),
      },
      {
        type: 'command' as const,
        id: 'cmd-2',
        command: createCommand('cmd-2'),
        response: createResponse('cmd-2', 0x6a, 0x82),
      },
      {
        type: 'command' as const,
        id: 'cmd-3',
        command: createCommand('cmd-3'),
        response: createResponse('cmd-3', 0x69, 0x85),
      },
    ];

    expect(countFailedCommands(log)).toBe(2);
  });
});
