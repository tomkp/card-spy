/**
 * Application state management using useReducer pattern.
 * Centralizes all related state updates for the App component.
 */

import type {
  Device,
  Card,
  ReaderSession,
  CardInsertedLogEntry,
  CommandLogEntry,
  Command,
  Response,
  DetectedHandlerInfo,
  TlvNode,
} from '../../shared/types';
import type { DiscoveredApp } from '../components/ApplicationsPanel';

/**
 * Application state interface.
 */
export interface AppState {
  devices: Device[];
  activeDevice: Device | null;
  cards: Map<string, Card>;
  sessions: Map<string, ReaderSession>;
  applications: Map<string, DiscoveredApp[]>;
  selectedApplication: string | null;
  handlers: Map<string, DetectedHandlerInfo[]>;
  activeHandlerId: string | null;
  showShortcutHelp: boolean;
}

/**
 * Initial application state.
 */
export const initialState: AppState = {
  devices: [],
  activeDevice: null,
  cards: new Map(),
  sessions: new Map(),
  applications: new Map(),
  selectedApplication: null,
  handlers: new Map(),
  activeHandlerId: null,
  showShortcutHelp: false,
};

/**
 * Action types for the app reducer.
 */
export type AppAction =
  | { type: 'SET_DEVICES'; devices: Device[] }
  | { type: 'SET_ACTIVE_DEVICE'; device: Device | null }
  | { type: 'SET_CARDS'; cards: Map<string, Card> }
  | { type: 'SET_SESSIONS'; sessions: Map<string, ReaderSession> }
  | { type: 'DEVICE_ACTIVATED'; device: Device }
  | { type: 'DEVICE_DEACTIVATED'; device: Device }
  | { type: 'CARD_INSERTED'; card: Card; logEntry: CardInsertedLogEntry }
  | { type: 'CARD_REMOVED'; deviceName: string }
  | { type: 'COMMAND_ISSUED'; deviceName: string; command: Command }
  | { type: 'RESPONSE_RECEIVED'; deviceName: string; response: Response; tlv?: TlvNode[] }
  | { type: 'APPLICATION_FOUND'; deviceName: string; app: DiscoveredApp }
  | { type: 'APPLICATION_SELECTED'; aid: string }
  | { type: 'HANDLERS_DETECTED'; deviceName: string; handlers: DetectedHandlerInfo[] }
  | { type: 'ACTIVE_HANDLER_CHANGED'; deviceName: string; handlerId: string }
  | { type: 'CLEAR_LOG'; deviceName: string }
  | { type: 'TOGGLE_SHORTCUT_HELP' }
  | { type: 'HIDE_SHORTCUT_HELP' }
  | {
      type: 'INITIALIZE';
      devices: Device[];
      cards: Map<string, Card>;
      sessions: Map<string, ReaderSession>;
    };

/**
 * App reducer function.
 */
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_DEVICES':
      return { ...state, devices: action.devices };

    case 'SET_ACTIVE_DEVICE':
      return { ...state, activeDevice: action.device };

    case 'SET_CARDS':
      return { ...state, cards: action.cards };

    case 'SET_SESSIONS':
      return { ...state, sessions: action.sessions };

    case 'INITIALIZE':
      return {
        ...state,
        devices: action.devices,
        cards: action.cards,
        sessions: action.sessions,
      };

    case 'DEVICE_ACTIVATED': {
      const { device } = action;
      const deviceExists = state.devices.some((d) => d.name === device.name);
      if (deviceExists) return state;

      const newDevices = [...state.devices, device];
      const newSessions = new Map(state.sessions);
      if (!newSessions.has(device.name)) {
        newSessions.set(device.name, { device, card: null, log: [] });
      }
      return { ...state, devices: newDevices, sessions: newSessions };
    }

    case 'DEVICE_DEACTIVATED': {
      const { device } = action;
      const newDevices = state.devices.filter((d) => d.name !== device.name);
      const newSessions = new Map(state.sessions);
      newSessions.delete(device.name);
      const newCards = new Map(state.cards);
      newCards.delete(device.name);
      return { ...state, devices: newDevices, sessions: newSessions, cards: newCards };
    }

    case 'CARD_INSERTED': {
      const { card, logEntry } = action;
      const deviceName = card.deviceName;
      if (!deviceName) return state;

      const newCards = new Map(state.cards);
      newCards.set(deviceName, card);

      const newSessions = new Map(state.sessions);
      const session = newSessions.get(deviceName);
      if (session) {
        newSessions.set(deviceName, {
          ...session,
          card,
          log: [...session.log, logEntry],
        });
      }
      return { ...state, cards: newCards, sessions: newSessions };
    }

    case 'CARD_REMOVED': {
      const { deviceName } = action;
      const newCards = new Map(state.cards);
      newCards.delete(deviceName);

      const newSessions = new Map(state.sessions);
      const session = newSessions.get(deviceName);
      if (session) {
        newSessions.set(deviceName, { ...session, card: null });
      }

      const newApplications = new Map(state.applications);
      newApplications.delete(deviceName);

      const newHandlers = new Map(state.handlers);
      newHandlers.delete(deviceName);

      const activeHandlerId =
        state.activeDevice?.name === deviceName ? null : state.activeHandlerId;

      return {
        ...state,
        cards: newCards,
        sessions: newSessions,
        applications: newApplications,
        selectedApplication: null,
        handlers: newHandlers,
        activeHandlerId,
      };
    }

    case 'COMMAND_ISSUED': {
      const { deviceName, command } = action;
      const newSessions = new Map(state.sessions);
      const session = newSessions.get(deviceName);
      if (session) {
        const newEntry: CommandLogEntry = {
          type: 'command',
          id: command.id,
          command,
        };
        newSessions.set(deviceName, {
          ...session,
          log: [...session.log, newEntry],
        });
      }
      return { ...state, sessions: newSessions };
    }

    case 'RESPONSE_RECEIVED': {
      const { deviceName, response, tlv } = action;
      const newSessions = new Map(state.sessions);
      const session = newSessions.get(deviceName);
      if (session) {
        newSessions.set(deviceName, {
          ...session,
          log: session.log.map((entry) =>
            entry.type === 'command' && entry.id === response.id
              ? { ...entry, response, tlv }
              : entry
          ),
        });
      }
      return { ...state, sessions: newSessions };
    }

    case 'APPLICATION_FOUND': {
      const { deviceName, app } = action;
      const newApplications = new Map(state.applications);
      const deviceApps = newApplications.get(deviceName) || [];
      if (!deviceApps.some((a) => a.aid === app.aid)) {
        newApplications.set(deviceName, [...deviceApps, app]);
      }
      return { ...state, applications: newApplications };
    }

    case 'APPLICATION_SELECTED':
      return { ...state, selectedApplication: action.aid };

    case 'HANDLERS_DETECTED': {
      const { deviceName, handlers } = action;
      const newHandlers = new Map(state.handlers);
      newHandlers.set(deviceName, handlers);

      // Set active handler to first one if this is the active device
      const activeHandlerId =
        state.activeDevice?.name === deviceName && handlers.length > 0
          ? handlers[0].id
          : state.activeHandlerId;

      return { ...state, handlers: newHandlers, activeHandlerId };
    }

    case 'ACTIVE_HANDLER_CHANGED': {
      const { deviceName, handlerId } = action;
      if (state.activeDevice?.name !== deviceName) return state;
      return { ...state, activeHandlerId: handlerId };
    }

    case 'CLEAR_LOG': {
      const { deviceName } = action;
      const newSessions = new Map(state.sessions);
      const session = newSessions.get(deviceName);
      if (session) {
        newSessions.set(deviceName, { ...session, log: [] });
      }
      return { ...state, sessions: newSessions };
    }

    case 'TOGGLE_SHORTCUT_HELP':
      return { ...state, showShortcutHelp: !state.showShortcutHelp };

    case 'HIDE_SHORTCUT_HELP':
      return { ...state, showShortcutHelp: false };

    default:
      return state;
  }
}
