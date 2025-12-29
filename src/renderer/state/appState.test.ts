import { describe, it, expect } from 'vitest';
import { appReducer, initialState, type AppState, type AppAction } from './appState';
import type { Device, Card, ReaderSession, Command, Response, DetectedHandlerInfo } from '../../shared/types';
import type { DiscoveredApp } from '../components/ApplicationsPanel';

function createDevice(name: string): Device {
  return { name, isActivated: true };
}

function createCard(deviceName: string, atr = '3B00'): Card {
  return { deviceName, atr, protocol: 1 };
}

function createSession(device: Device, card: Card | null = null): ReaderSession {
  return { device, card, log: [] };
}

function createCommand(id: string): Command {
  return { id, apdu: [0x00, 0xa4, 0x04, 0x00], timestamp: Date.now(), hex: '00A40400' };
}

function createResponse(id: string): Response {
  return { id, sw1: 0x90, sw2: 0x00, data: [], timestamp: Date.now(), hex: '9000' };
}

function createHandler(id: string, name: string): DetectedHandlerInfo {
  return { id, name, description: `${name} description`, confidence: 90, commands: [] };
}

function createApp(aid: string, name: string): DiscoveredApp {
  return { aid, name, handlerId: 'test-handler' };
}

describe('appReducer', () => {
  describe('INITIALIZE', () => {
    it('should set devices, cards, and sessions', () => {
      const device = createDevice('Reader 1');
      const card = createCard('Reader 1');
      const session = createSession(device, card);

      const devices = [device];
      const cards = new Map([['Reader 1', card]]);
      const sessions = new Map([['Reader 1', session]]);

      const action: AppAction = { type: 'INITIALIZE', devices, cards, sessions };
      const result = appReducer(initialState, action);

      expect(result.devices).toEqual(devices);
      expect(result.cards).toEqual(cards);
      expect(result.sessions).toEqual(sessions);
    });
  });

  describe('SET_ACTIVE_DEVICE', () => {
    it('should set the active device', () => {
      const device = createDevice('Reader 1');
      const action: AppAction = { type: 'SET_ACTIVE_DEVICE', device };

      const result = appReducer(initialState, action);

      expect(result.activeDevice).toEqual(device);
    });

    it('should allow setting active device to null', () => {
      const state: AppState = { ...initialState, activeDevice: createDevice('Reader 1') };
      const action: AppAction = { type: 'SET_ACTIVE_DEVICE', device: null };

      const result = appReducer(state, action);

      expect(result.activeDevice).toBeNull();
    });
  });

  describe('DEVICE_ACTIVATED', () => {
    it('should add a new device to the list', () => {
      const device = createDevice('Reader 1');
      const action: AppAction = { type: 'DEVICE_ACTIVATED', device };

      const result = appReducer(initialState, action);

      expect(result.devices).toContainEqual(device);
      expect(result.sessions.has('Reader 1')).toBe(true);
    });

    it('should not duplicate an existing device', () => {
      const device = createDevice('Reader 1');
      const state: AppState = {
        ...initialState,
        devices: [device],
        sessions: new Map([['Reader 1', createSession(device)]]),
      };
      const action: AppAction = { type: 'DEVICE_ACTIVATED', device };

      const result = appReducer(state, action);

      expect(result.devices).toHaveLength(1);
    });
  });

  describe('DEVICE_DEACTIVATED', () => {
    it('should remove device from list', () => {
      const device = createDevice('Reader 1');
      const state: AppState = {
        ...initialState,
        devices: [device],
        sessions: new Map([['Reader 1', createSession(device)]]),
        cards: new Map([['Reader 1', createCard('Reader 1')]]),
      };
      const action: AppAction = { type: 'DEVICE_DEACTIVATED', device };

      const result = appReducer(state, action);

      expect(result.devices).toHaveLength(0);
      expect(result.sessions.has('Reader 1')).toBe(false);
      expect(result.cards.has('Reader 1')).toBe(false);
    });
  });

  describe('CARD_INSERTED', () => {
    it('should add card and log entry', () => {
      const device = createDevice('Reader 1');
      const card = createCard('Reader 1');
      const state: AppState = {
        ...initialState,
        devices: [device],
        sessions: new Map([['Reader 1', createSession(device)]]),
      };

      const action: AppAction = {
        type: 'CARD_INSERTED',
        card,
        logEntry: {
          type: 'card-inserted',
          id: 'card-1',
          device: 'Reader 1',
          atr: card.atr,
        },
      };

      const result = appReducer(state, action);

      expect(result.cards.get('Reader 1')).toEqual(card);
      expect(result.sessions.get('Reader 1')?.log).toHaveLength(1);
      expect(result.sessions.get('Reader 1')?.log[0].type).toBe('card-inserted');
    });
  });

  describe('CARD_REMOVED', () => {
    it('should remove card and clear related state', () => {
      const device = createDevice('Reader 1');
      const card = createCard('Reader 1');
      const state: AppState = {
        ...initialState,
        devices: [device],
        activeDevice: device,
        cards: new Map([['Reader 1', card]]),
        sessions: new Map([['Reader 1', createSession(device, card)]]),
        applications: new Map([['Reader 1', [createApp('1234', 'Test')]]]),
        handlers: new Map([['Reader 1', [createHandler('h1', 'Handler 1')]]]),
        selectedApplication: '1234',
        activeHandlerId: 'h1',
      };

      const action: AppAction = { type: 'CARD_REMOVED', deviceName: 'Reader 1' };

      const result = appReducer(state, action);

      expect(result.cards.has('Reader 1')).toBe(false);
      expect(result.sessions.get('Reader 1')?.card).toBeNull();
      expect(result.applications.has('Reader 1')).toBe(false);
      expect(result.handlers.has('Reader 1')).toBe(false);
      expect(result.selectedApplication).toBeNull();
      expect(result.activeHandlerId).toBeNull();
    });
  });

  describe('COMMAND_ISSUED', () => {
    it('should add command to session log', () => {
      const device = createDevice('Reader 1');
      const state: AppState = {
        ...initialState,
        devices: [device],
        sessions: new Map([['Reader 1', createSession(device)]]),
      };

      const command = createCommand('cmd-1');
      const action: AppAction = {
        type: 'COMMAND_ISSUED',
        deviceName: 'Reader 1',
        command,
      };

      const result = appReducer(state, action);

      expect(result.sessions.get('Reader 1')?.log).toHaveLength(1);
      expect(result.sessions.get('Reader 1')?.log[0].type).toBe('command');
    });
  });

  describe('RESPONSE_RECEIVED', () => {
    it('should attach response to matching command', () => {
      const device = createDevice('Reader 1');
      const command = createCommand('cmd-1');
      const state: AppState = {
        ...initialState,
        devices: [device],
        sessions: new Map([
          [
            'Reader 1',
            {
              device,
              card: null,
              log: [{ type: 'command' as const, id: 'cmd-1', command }],
            },
          ],
        ]),
      };

      const response = createResponse('cmd-1');
      const action: AppAction = {
        type: 'RESPONSE_RECEIVED',
        deviceName: 'Reader 1',
        response,
      };

      const result = appReducer(state, action);

      const logEntry = result.sessions.get('Reader 1')?.log[0];
      expect(logEntry?.type).toBe('command');
      if (logEntry?.type === 'command') {
        expect(logEntry.response).toEqual(response);
      }
    });
  });

  describe('CLEAR_LOG', () => {
    it('should clear the log for the device', () => {
      const device = createDevice('Reader 1');
      const state: AppState = {
        ...initialState,
        devices: [device],
        sessions: new Map([
          [
            'Reader 1',
            {
              device,
              card: null,
              log: [
                { type: 'card-inserted' as const, id: 'card-1', device: 'Reader 1', atr: '3B00' },
              ],
            },
          ],
        ]),
      };

      const action: AppAction = { type: 'CLEAR_LOG', deviceName: 'Reader 1' };

      const result = appReducer(state, action);

      expect(result.sessions.get('Reader 1')?.log).toHaveLength(0);
    });
  });

  describe('TOGGLE_SHORTCUT_HELP', () => {
    it('should toggle shortcut help visibility', () => {
      const action: AppAction = { type: 'TOGGLE_SHORTCUT_HELP' };

      const result1 = appReducer(initialState, action);
      expect(result1.showShortcutHelp).toBe(true);

      const result2 = appReducer(result1, action);
      expect(result2.showShortcutHelp).toBe(false);
    });
  });

  describe('HIDE_SHORTCUT_HELP', () => {
    it('should hide shortcut help', () => {
      const state: AppState = { ...initialState, showShortcutHelp: true };
      const action: AppAction = { type: 'HIDE_SHORTCUT_HELP' };

      const result = appReducer(state, action);

      expect(result.showShortcutHelp).toBe(false);
    });
  });

  describe('HANDLERS_DETECTED', () => {
    it('should set handlers and active handler for active device', () => {
      const device = createDevice('Reader 1');
      const handlers = [
        createHandler('emv', 'EMV Handler'),
        createHandler('piv', 'PIV Handler'),
      ];
      const state: AppState = {
        ...initialState,
        devices: [device],
        activeDevice: device,
      };

      const action: AppAction = {
        type: 'HANDLERS_DETECTED',
        deviceName: 'Reader 1',
        handlers,
      };

      const result = appReducer(state, action);

      expect(result.handlers.get('Reader 1')).toEqual(handlers);
      expect(result.activeHandlerId).toBe('emv');
    });

    it('should not set active handler if not the active device', () => {
      const device1 = createDevice('Reader 1');
      const device2 = createDevice('Reader 2');
      const handlers = [createHandler('emv', 'EMV Handler')];
      const state: AppState = {
        ...initialState,
        devices: [device1, device2],
        activeDevice: device1,
      };

      const action: AppAction = {
        type: 'HANDLERS_DETECTED',
        deviceName: 'Reader 2',
        handlers,
      };

      const result = appReducer(state, action);

      expect(result.handlers.get('Reader 2')).toEqual(handlers);
      expect(result.activeHandlerId).toBeNull();
    });
  });

  describe('APPLICATION_FOUND', () => {
    it('should add application to device', () => {
      const device = createDevice('Reader 1');
      const state: AppState = {
        ...initialState,
        devices: [device],
      };

      const action: AppAction = {
        type: 'APPLICATION_FOUND',
        deviceName: 'Reader 1',
        app: createApp('A0000000041010', 'Visa'),
      };

      const result = appReducer(state, action);

      expect(result.applications.get('Reader 1')).toHaveLength(1);
      expect(result.applications.get('Reader 1')?.[0].aid).toBe('A0000000041010');
    });

    it('should not add duplicate applications', () => {
      const device = createDevice('Reader 1');
      const state: AppState = {
        ...initialState,
        devices: [device],
        applications: new Map([['Reader 1', [createApp('A0000000041010', 'Visa')]]]),
      };

      const action: AppAction = {
        type: 'APPLICATION_FOUND',
        deviceName: 'Reader 1',
        app: createApp('A0000000041010', 'Visa'),
      };

      const result = appReducer(state, action);

      expect(result.applications.get('Reader 1')).toHaveLength(1);
    });
  });

  describe('APPLICATION_SELECTED', () => {
    it('should set selected application', () => {
      const action: AppAction = { type: 'APPLICATION_SELECTED', aid: 'A0000000041010' };

      const result = appReducer(initialState, action);

      expect(result.selectedApplication).toBe('A0000000041010');
    });
  });

  describe('ACTIVE_HANDLER_CHANGED', () => {
    it('should update active handler for active device', () => {
      const device = createDevice('Reader 1');
      const state: AppState = {
        ...initialState,
        devices: [device],
        activeDevice: device,
        activeHandlerId: 'emv',
      };

      const action: AppAction = {
        type: 'ACTIVE_HANDLER_CHANGED',
        deviceName: 'Reader 1',
        handlerId: 'piv',
      };

      const result = appReducer(state, action);

      expect(result.activeHandlerId).toBe('piv');
    });

    it('should not update if not the active device', () => {
      const device = createDevice('Reader 1');
      const state: AppState = {
        ...initialState,
        devices: [device],
        activeDevice: device,
        activeHandlerId: 'emv',
      };

      const action: AppAction = {
        type: 'ACTIVE_HANDLER_CHANGED',
        deviceName: 'Reader 2',
        handlerId: 'piv',
      };

      const result = appReducer(state, action);

      expect(result.activeHandlerId).toBe('emv');
    });
  });
});
