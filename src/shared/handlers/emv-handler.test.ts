import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmvHandler } from './emv-handler';
import type { Response } from '../types';

// Helper to create mock responses
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

describe('EmvHandler', () => {
  let handler: EmvHandler;

  beforeEach(() => {
    handler = new EmvHandler();
  });

  describe('metadata', () => {
    it('should have correct id', () => {
      expect(handler.id).toBe('emv');
    });

    it('should have correct name', () => {
      expect(handler.name).toBe('EMV Payment Card');
    });

    it('should have description', () => {
      expect(handler.description).toContain('payment');
    });
  });

  describe('detect', () => {
    it('should detect EMV contact card when PSE select succeeds', async () => {
      const mockSendCommand = vi.fn().mockResolvedValue(createMockResponse(0x90, 0x00));

      const result = await handler.detect('3B6500002063CB6600', mockSendCommand);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(95);
      expect(result.cardType).toBe('EMV Contact Card');
      expect(result.metadata?.environment).toBe('pse');
    });

    it('should detect EMV contactless card when PPSE select succeeds', async () => {
      const mockSendCommand = vi
        .fn()
        .mockRejectedValueOnce(new Error('PSE failed')) // First call (PSE) fails
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00)); // Second call (PPSE) succeeds

      const result = await handler.detect('3B6500002063CB6600', mockSendCommand);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(95);
      expect(result.cardType).toBe('EMV Contactless Card');
      expect(result.metadata?.environment).toBe('ppse');
    });

    it('should detect EMV card with 61XX response (more data)', async () => {
      const mockSendCommand = vi.fn().mockResolvedValue(createMockResponse(0x61, 0x10));

      const result = await handler.detect('3B6500002063CB6600', mockSendCommand);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(95);
    });

    it('should return low confidence for ATR-only detection', async () => {
      // Both PSE and PPSE fail, but ATR looks like EMV
      const mockSendCommand = vi.fn().mockResolvedValue(createMockResponse(0x6a, 0x82));

      const result = await handler.detect('3B8080019080', mockSendCommand);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBe(30);
      expect(result.cardType).toBe('Possible EMV Card');
    });

    it('should return not detected for non-EMV cards', async () => {
      const mockSendCommand = vi.fn().mockResolvedValue(createMockResponse(0x6a, 0x82));

      const result = await handler.detect('3B00', mockSendCommand);

      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe('getCommands', () => {
    it('should return command list', () => {
      const commands = handler.getCommands();

      expect(commands.length).toBeGreaterThan(0);
      expect(commands.find((c) => c.id === 'select-pse')).toBeDefined();
      expect(commands.find((c) => c.id === 'select-ppse')).toBeDefined();
      expect(commands.find((c) => c.id === 'get-processing-options')).toBeDefined();
    });

    it('should have discovery category commands', () => {
      const commands = handler.getCommands();
      const discoveryCommands = commands.filter((c) => c.category === 'Discovery');

      expect(discoveryCommands.length).toBeGreaterThan(0);
    });
  });

  describe('executeCommand', () => {
    it('should execute select-pse command', async () => {
      const mockSendCommand = vi.fn().mockResolvedValue(createMockResponse(0x90, 0x00));
      const context = {
        sendCommand: mockSendCommand,
        atr: '3B00',
        protocol: 1,
        parameters: {},
      };

      await handler.executeCommand('select-pse', context);

      expect(mockSendCommand).toHaveBeenCalled();
      // Check the APDU was for PSE select (1PAY.SYS.DDF01)
      const apdu = mockSendCommand.mock.calls[0][0];
      expect(apdu[0]).toBe(0x00); // CLA
      expect(apdu[1]).toBe(0xa4); // INS (SELECT)
      expect(apdu[2]).toBe(0x04); // P1
      expect(apdu[3]).toBe(0x00); // P2
    });

    it('should execute select-ppse command', async () => {
      const mockSendCommand = vi.fn().mockResolvedValue(createMockResponse(0x90, 0x00));
      const context = {
        sendCommand: mockSendCommand,
        atr: '3B00',
        protocol: 1,
        parameters: {},
      };

      await handler.executeCommand('select-ppse', context);

      expect(mockSendCommand).toHaveBeenCalled();
      const apdu = mockSendCommand.mock.calls[0][0];
      expect(apdu[0]).toBe(0x00);
      expect(apdu[1]).toBe(0xa4);
    });

    it('should execute select-application with AID parameter', async () => {
      const mockSendCommand = vi.fn().mockResolvedValue(createMockResponse(0x90, 0x00));
      const context = {
        sendCommand: mockSendCommand,
        atr: '3B00',
        protocol: 1,
        parameters: { aid: 'A0000000041010' },
      };

      await handler.executeCommand('select-application', context);

      expect(mockSendCommand).toHaveBeenCalled();
      const apdu = mockSendCommand.mock.calls[0][0];
      // Check AID bytes are in the APDU
      expect(apdu).toContain(0xa0);
      expect(apdu).toContain(0x00);
      expect(apdu).toContain(0x04);
    });

    it('should execute get-processing-options', async () => {
      const mockSendCommand = vi.fn().mockResolvedValue(createMockResponse(0x90, 0x00));
      const context = {
        sendCommand: mockSendCommand,
        atr: '3B00',
        protocol: 1,
        parameters: {},
      };

      await handler.executeCommand('get-processing-options', context);

      expect(mockSendCommand).toHaveBeenCalled();
      const apdu = mockSendCommand.mock.calls[0][0];
      expect(apdu[0]).toBe(0x80); // CLA
      expect(apdu[1]).toBe(0xa8); // INS (GPO)
    });

    it('should execute read-record with parameters', async () => {
      const mockSendCommand = vi.fn().mockResolvedValue(createMockResponse(0x90, 0x00));
      const context = {
        sendCommand: mockSendCommand,
        atr: '3B00',
        protocol: 1,
        parameters: { sfi: 1, record: 1 },
      };

      await handler.executeCommand('read-record', context);

      expect(mockSendCommand).toHaveBeenCalled();
      const apdu = mockSendCommand.mock.calls[0][0];
      expect(apdu[0]).toBe(0x00); // CLA
      expect(apdu[1]).toBe(0xb2); // INS (READ RECORD)
      expect(apdu[2]).toBe(1); // P1 (record number)
    });

    it('should throw for unknown command', async () => {
      const context = {
        sendCommand: vi.fn(),
        atr: '3B00',
        protocol: 1,
        parameters: {},
      };

      await expect(handler.executeCommand('unknown-command', context)).rejects.toThrow(
        'Unknown command'
      );
    });
  });
});
