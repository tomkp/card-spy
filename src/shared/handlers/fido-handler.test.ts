import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FidoHandler } from './fido-handler';
import type { Response } from '../types';

function createMockResponse(sw1: number, sw2: number, data: number[] = []): Response {
  return {
    id: 'test',
    timestamp: Date.now(),
    data,
    sw1,
    sw2,
    hex: [...data, sw1, sw2].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase(),
  };
}

describe('FidoHandler', () => {
  let handler: FidoHandler;

  beforeEach(() => {
    handler = new FidoHandler();
  });

  describe('detect', () => {
    it('should detect FIDO device when select and version succeed', async () => {
      // Version returns "U2F_V2" as bytes
      const versionBytes = Array.from('U2F_V2').map((c) => c.charCodeAt(0));
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00)) // SELECT FIDO
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00, versionBytes)); // GET VERSION

      const result = await handler.detect('3B8180018080', mockSendCommand);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(95);
      expect(result.cardType).toContain('FIDO');
      expect(result.cardType).toContain('U2F_V2');
      expect(result.metadata?.version).toBe('U2F_V2');
    });

    it('should detect FIDO device with lower confidence when version fails', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00)) // SELECT succeeds
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82)); // VERSION fails

      const result = await handler.detect('3B8180018080', mockSendCommand);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(85);
      expect(result.cardType).toBe('FIDO Authenticator');
    });

    it('should detect FIDO with SW1=0x61 (more data available)', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x61, 0x10)) // SELECT with more data
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82)); // VERSION fails

      const result = await handler.detect('3B8180018080', mockSendCommand);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(85);
    });

    it('should not detect when select fails', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82)); // SELECT fails

      const result = await handler.detect('3B8180018080', mockSendCommand);

      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should not detect when command throws', async () => {
      const mockSendCommand = vi.fn()
        .mockRejectedValueOnce(new Error('Connection failed'));

      const result = await handler.detect('3B8180018080', mockSendCommand);

      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe('getCommands', () => {
    it('should return FIDO commands', () => {
      const commands = handler.getCommands();

      expect(commands.length).toBeGreaterThan(0);
      expect(commands.some((c) => c.id === 'select-fido')).toBe(true);
      expect(commands.some((c) => c.id === 'get-version')).toBe(true);
      expect(commands.some((c) => c.id === 'ctap2-get-info')).toBe(true);
      expect(commands.some((c) => c.id === 'u2f-register')).toBe(true);
      expect(commands.some((c) => c.id === 'u2f-authenticate')).toBe(true);
    });

    it('should have commands in expected categories', () => {
      const commands = handler.getCommands();
      const categories = new Set(commands.map((c) => c.category));

      expect(categories.has('Discovery')).toBe(true);
      expect(categories.has('Read')).toBe(true);
      expect(categories.has('Operations')).toBe(true);
      expect(categories.has('Security')).toBe(true);
      expect(categories.has('Management')).toBe(true);
    });

    it('should mark destructive commands appropriately', () => {
      const commands = handler.getCommands();
      const resetCmd = commands.find((c) => c.id === 'ctap2-reset');

      expect(resetCmd).toBeDefined();
      expect(resetCmd?.isDestructive).toBe(true);
      expect(resetCmd?.requiresConfirmation).toBe(true);
    });
  });

  describe('executeCommand', () => {
    it('should execute select-fido command', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00));

      const context = {
        sendCommand: mockSendCommand,
        atr: '3B8180018080',
        protocol: 0,
        parameters: {},
      };

      const result = await handler.executeCommand('select-fido', context);

      expect(result.sw1).toBe(0x90);
      expect(mockSendCommand).toHaveBeenCalledWith(
        expect.arrayContaining([0x00, 0xa4, 0x04, 0x00])
      );
    });

    it('should execute get-version command', async () => {
      const versionBytes = Array.from('U2F_V2').map((c) => c.charCodeAt(0));
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00, versionBytes));

      const context = {
        sendCommand: mockSendCommand,
        atr: '3B8180018080',
        protocol: 0,
        parameters: {},
      };

      const result = await handler.executeCommand('get-version', context);

      expect(result.sw1).toBe(0x90);
      expect(result.data).toEqual(versionBytes);
      // Verify it sends U2F VERSION command (INS=0x03)
      expect(mockSendCommand).toHaveBeenCalledWith([0x00, 0x03, 0x00, 0x00, 0x00]);
    });

    it('should execute ctap2-get-info command', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00, [0x00])); // CTAP2 success status

      const context = {
        sendCommand: mockSendCommand,
        atr: '3B8180018080',
        protocol: 0,
        parameters: {},
      };

      const result = await handler.executeCommand('ctap2-get-info', context);

      expect(result.sw1).toBe(0x90);
      // CTAP2 CBOR command with 0x04 (getInfo)
      expect(mockSendCommand).toHaveBeenCalledWith([0x80, 0x11, 0x00, 0x00, 1, 0x04, 0x00]);
    });

    it('should execute u2f-register command with parameters', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00));

      const context = {
        sendCommand: mockSendCommand,
        atr: '3B8180018080',
        protocol: 0,
        parameters: {
          challenge: '0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F20',
          appId: '0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F20',
        },
      };

      const result = await handler.executeCommand('u2f-register', context);

      expect(result.sw1).toBe(0x90);
      // U2F REGISTER command (INS=0x01), data = challenge (32) + appId (32) = 64 bytes
      expect(mockSendCommand).toHaveBeenCalledWith(
        expect.arrayContaining([0x00, 0x01, 0x00, 0x00, 64])
      );
    });

    it('should execute u2f-authenticate-check with check-only flag', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x69, 0x85)); // Conditions not satisfied = credential exists

      const context = {
        sendCommand: mockSendCommand,
        atr: '3B8180018080',
        protocol: 0,
        parameters: {
          challenge: '0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F20',
          appId: '0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F20',
          keyHandle: '0102030405060708',
        },
      };

      await handler.executeCommand('u2f-authenticate-check', context);

      // P1=0x07 for check-only
      expect(mockSendCommand).toHaveBeenCalledWith(
        expect.arrayContaining([0x00, 0x02, 0x07, 0x00])
      );
    });

    it('should execute u2f-authenticate with enforce-presence flag', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00));

      const context = {
        sendCommand: mockSendCommand,
        atr: '3B8180018080',
        protocol: 0,
        parameters: {
          challenge: '0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F20',
          appId: '0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F20',
          keyHandle: '0102030405060708',
        },
      };

      await handler.executeCommand('u2f-authenticate', context);

      // P1=0x03 for enforce-user-presence-and-sign
      expect(mockSendCommand).toHaveBeenCalledWith(
        expect.arrayContaining([0x00, 0x02, 0x03, 0x00])
      );
    });

    it('should execute ctap2-client-pin command', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00));

      const context = {
        sendCommand: mockSendCommand,
        atr: '3B8180018080',
        protocol: 0,
        parameters: {
          subCommand: '01', // Get Retries
        },
      };

      await handler.executeCommand('ctap2-client-pin', context);

      // CTAP2 command 0x06 (clientPIN)
      expect(mockSendCommand).toHaveBeenCalledWith(
        expect.arrayContaining([0x80, 0x11, 0x00, 0x00])
      );
    });

    it('should execute ctap2-reset command', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00));

      const context = {
        sendCommand: mockSendCommand,
        atr: '3B8180018080',
        protocol: 0,
        parameters: {},
      };

      await handler.executeCommand('ctap2-reset', context);

      // CTAP2 reset command: 0x07
      expect(mockSendCommand).toHaveBeenCalledWith([0x80, 0x11, 0x00, 0x00, 1, 0x07, 0x00]);
    });

    it('should throw for unknown command', async () => {
      const mockSendCommand = vi.fn();

      const context = {
        sendCommand: mockSendCommand,
        atr: '3B8180018080',
        protocol: 0,
        parameters: {},
      };

      await expect(handler.executeCommand('unknown-command', context))
        .rejects.toThrow('Unknown command: unknown-command');
    });
  });

  describe('interrogate', () => {
    it('should interrogate FIDO device successfully', async () => {
      const versionBytes = Array.from('U2F_V2').map((c) => c.charCodeAt(0));
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00)) // SELECT
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00, versionBytes)) // VERSION
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00)); // CTAP2 GetInfo

      const result = await handler.interrogate(mockSendCommand);

      expect(result.success).toBe(true);
      expect(result.applications).toBeDefined();
      expect(result.applications?.length).toBe(1);
      expect(result.applications?.[0].name).toBe('FIDO Application');
    });

    it('should fail interrogation when select fails', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82));

      const result = await handler.interrogate(mockSendCommand);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to select FIDO application');
    });

    it('should succeed even when optional commands fail', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00)) // SELECT succeeds
        .mockRejectedValueOnce(new Error('Version not supported')) // VERSION fails
        .mockRejectedValueOnce(new Error('CTAP2 not supported')); // CTAP2 fails

      const result = await handler.interrogate(mockSendCommand);

      expect(result.success).toBe(true);
    });
  });
});
