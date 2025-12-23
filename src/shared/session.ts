/**
 * Pure functions for session state management.
 * These can be tested independently of React.
 */

import type {
  Device,
  Card,
  ReaderSession,
  LogEntry,
  CommandLogEntry,
  CardInsertedLogEntry,
  Command,
  Response,
  TlvNode,
} from './types';

/**
 * Initialize sessions for a list of devices.
 */
export function initializeSessions(
  devices: Device[],
  cards: Map<string, Card>
): Map<string, ReaderSession> {
  const sessions = new Map<string, ReaderSession>();
  for (const device of devices) {
    const card = cards.get(device.name) || null;
    sessions.set(device.name, { device, card, log: [] });
  }
  return sessions;
}

/**
 * Build a cards map from an array of card data.
 */
export function buildCardsMap(
  cardData: Array<{ deviceName: string; atr: string; protocol: number }>
): Map<string, Card> {
  const cards = new Map<string, Card>();
  for (const c of cardData) {
    cards.set(c.deviceName, {
      atr: c.atr,
      protocol: c.protocol,
      deviceName: c.deviceName,
    });
  }
  return cards;
}

/**
 * Add a device to the sessions map if not already present.
 */
export function addDeviceSession(
  sessions: Map<string, ReaderSession>,
  device: Device
): Map<string, ReaderSession> {
  if (sessions.has(device.name)) {
    return sessions;
  }
  const newSessions = new Map(sessions);
  newSessions.set(device.name, { device, card: null, log: [] });
  return newSessions;
}

/**
 * Remove a device from the sessions map.
 */
export function removeDeviceSession(
  sessions: Map<string, ReaderSession>,
  deviceName: string
): Map<string, ReaderSession> {
  if (!sessions.has(deviceName)) {
    return sessions;
  }
  const newSessions = new Map(sessions);
  newSessions.delete(deviceName);
  return newSessions;
}

/**
 * Update a session with a new card insertion.
 */
export function insertCard(
  sessions: Map<string, ReaderSession>,
  deviceName: string,
  card: Card,
  logEntry: CardInsertedLogEntry
): Map<string, ReaderSession> {
  const session = sessions.get(deviceName);
  if (!session) {
    return sessions;
  }
  const newSessions = new Map(sessions);
  newSessions.set(deviceName, {
    ...session,
    card,
    log: [...session.log, logEntry],
  });
  return newSessions;
}

/**
 * Update a session when a card is removed.
 */
export function removeCard(
  sessions: Map<string, ReaderSession>,
  deviceName: string
): Map<string, ReaderSession> {
  const session = sessions.get(deviceName);
  if (!session) {
    return sessions;
  }
  const newSessions = new Map(sessions);
  newSessions.set(deviceName, { ...session, card: null });
  return newSessions;
}

/**
 * Add a command to the session log.
 */
export function addCommand(
  sessions: Map<string, ReaderSession>,
  deviceName: string,
  command: Command
): Map<string, ReaderSession> {
  const session = sessions.get(deviceName);
  if (!session) {
    return sessions;
  }
  const newEntry: CommandLogEntry = {
    type: 'command',
    id: command.id,
    command,
  };
  const newSessions = new Map(sessions);
  newSessions.set(deviceName, {
    ...session,
    log: [...session.log, newEntry],
  });
  return newSessions;
}

/**
 * Update a command log entry with its response.
 */
export function addResponse(
  sessions: Map<string, ReaderSession>,
  deviceName: string,
  response: Response,
  tlv?: TlvNode[]
): Map<string, ReaderSession> {
  const session = sessions.get(deviceName);
  if (!session) {
    return sessions;
  }
  const newSessions = new Map(sessions);
  newSessions.set(deviceName, {
    ...session,
    log: session.log.map((entry) =>
      entry.type === 'command' && entry.id === response.id ? { ...entry, response, tlv } : entry
    ),
  });
  return newSessions;
}

/**
 * Clear the log for a session.
 */
export function clearLog(
  sessions: Map<string, ReaderSession>,
  deviceName: string
): Map<string, ReaderSession> {
  const session = sessions.get(deviceName);
  if (!session) {
    return sessions;
  }
  const newSessions = new Map(sessions);
  newSessions.set(deviceName, { ...session, log: [] });
  return newSessions;
}

/**
 * Find the first device with a card inserted.
 */
export function findDeviceWithCard(devices: Device[], cards: Map<string, Card>): Device | null {
  for (const device of devices) {
    if (cards.has(device.name)) {
      return device;
    }
  }
  return null;
}

/**
 * Get commands from a log (filtering out card-inserted entries).
 */
export function getCommandsFromLog(log: LogEntry[]): CommandLogEntry[] {
  return log.filter((entry): entry is CommandLogEntry => entry.type === 'command');
}

/**
 * Count successful commands in a log.
 */
export function countSuccessfulCommands(log: LogEntry[]): number {
  return getCommandsFromLog(log).filter(
    (entry) => entry.response && (entry.response.sw1 === 0x90 || entry.response.sw1 === 0x61)
  ).length;
}

/**
 * Count failed commands in a log.
 */
export function countFailedCommands(log: LogEntry[]): number {
  return getCommandsFromLog(log).filter(
    (entry) => entry.response && entry.response.sw1 !== 0x90 && entry.response.sw1 !== 0x61
  ).length;
}
