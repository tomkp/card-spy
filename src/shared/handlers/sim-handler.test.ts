import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimHandler } from './sim-handler';
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

describe('SimHandler', () => {
  let handler: SimHandler;

  beforeEach(() => {
    handler = new SimHandler();
  });

  describe('detect', () => {
    it('should detect GSM SIM when MF selection and ICCID read succeed', async () => {
      // Mock: SELECT MF success (9Fxx triggers GET RESPONSE), SELECT ICCID, READ BINARY
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x9f, 0x10)) // SELECT MF returns 9F (need GET RESPONSE)
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00)) // GET RESPONSE for MF
        .mockResolvedValueOnce(createMockResponse(0x9f, 0x0a)) // SELECT ICCID
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00)) // GET RESPONSE for ICCID
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00, [
          0x98, 0x10, 0x01, 0x23, 0x45, 0x67, 0x89, 0x01, 0x23, 0x45, // ICCID bytes
        ])); // READ BINARY

      const result = await handler.detect('3B9F958031E073FE211F6501060240008171A050', mockSendCommand);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(90);
      expect(result.cardType).toContain('SIM');
    });

    it('should detect USIM when USIM class byte works', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82)) // SELECT MF fails with SIM class
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00)) // SELECT MF succeeds with USIM class
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00)) // SELECT ICCID
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00, [
          0x98, 0x10, 0x01, 0x23, 0x45, 0x67, 0x89, 0x01, 0x23, 0x45,
        ]));

      const result = await handler.detect('3B9E9680318066B1A50101010346F00381009000', mockSendCommand);

      expect(result.detected).toBe(true);
      expect(result.cardType).toContain('USIM');
    });

    it('should return low confidence for SIM-like ATR when selection fails', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82)) // MF fails
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82)); // MF fails with USIM too

      // SIM-like ATR
      const result = await handler.detect('3B9F958031E073FE211F6501060240008171A050', mockSendCommand);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBeLessThanOrEqual(50);
    });

    it('should not detect non-SIM cards', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82))
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82));

      // Non-SIM ATR (EMV card)
      const result = await handler.detect('3B6700002063CB6600', mockSendCommand);

      expect(result.detected).toBe(false);
    });
  });

  describe('getCommands', () => {
    it('should return SIM commands', () => {
      const commands = handler.getCommands();

      expect(commands.length).toBeGreaterThan(0);
      expect(commands.some((c) => c.id === 'read-iccid')).toBe(true);
      expect(commands.some((c) => c.id === 'read-imsi')).toBe(true);
      expect(commands.some((c) => c.id === 'verify-pin')).toBe(true);
    });

    it('should have commands in expected categories', () => {
      const commands = handler.getCommands();
      const categories = new Set(commands.map((c) => c.category));

      expect(categories.has('Identification')).toBe(true);
      expect(categories.has('Security')).toBe(true);
    });
  });

  describe('executeCommand', () => {
    it('should execute read-iccid command', async () => {
      // read-iccid: selectFile(MF) -> selectFile(ICCID) -> readBinary
      // Each selectFile may trigger GET RESPONSE if 9Fxx returned
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00)) // SELECT MF success
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00)) // SELECT ICCID success
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00, [
          0x98, 0x10, 0x92, 0x14, 0x70, 0x00, 0x62, 0x87, 0x83, 0xf4,
        ])); // READ BINARY

      const context = {
        sendCommand: mockSendCommand,
        atr: '3B9F958031E073FE211F6501060240008171A050',
        protocol: 0,
        parameters: {},
      };

      const result = await handler.executeCommand('read-iccid', context);

      expect(result.sw1).toBe(0x90);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should throw for unknown command', async () => {
      const mockSendCommand = vi.fn();

      const context = {
        sendCommand: mockSendCommand,
        atr: '3B9F958031E073FE211F6501060240008171A050',
        protocol: 0,
        parameters: {},
      };

      await expect(handler.executeCommand('unknown-command', context))
        .rejects.toThrow('Unknown command: unknown-command');
    });
  });
});
