import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransportHandler } from './transport-handler';
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

describe('TransportHandler', () => {
  let handler: TransportHandler;

  beforeEach(() => {
    handler = new TransportHandler();
  });

  describe('detect', () => {
    it('should detect DESFire card when GetVersion succeeds', async () => {
      // DESFire GetVersion returns 3 frames: HW (91 AF), SW (91 AF), Prod (91 00)
      // sendDesfireCommand handles multi-frame by calling ADDITIONAL_FRAME
      // After sendDesfireCommand returns, parseVersionInfo calls ADDITIONAL_FRAME twice more
      const mockSendCommand = vi.fn()
        // 1. GetVersion command -> returns HW version with AF (more data)
        .mockResolvedValueOnce(createMockResponse(0x91, 0xaf, [
          0x04, 0x01, 0x01, 0x01, 0x00, 0x18, 0x05, // Hardware version (7 bytes)
        ]))
        // 2. sendDesfireCommand sees AF, automatically sends ADDITIONAL_FRAME
        .mockResolvedValueOnce(createMockResponse(0x91, 0x00, [
          0x04, 0x01, 0x01, 0x01, 0x04, 0x18, 0x05, // SW version, no more frames
        ]))
        // 3. parseVersionInfo calls sendDesfireCommand(ADDITIONAL_FRAME) for SW frame
        .mockResolvedValueOnce(createMockResponse(0x91, 0x00, [
          0x04, 0x01, 0x01, 0x01, 0x04, 0x18, 0x05,
        ]))
        // 4. parseVersionInfo calls sendDesfireCommand(ADDITIONAL_FRAME) for production frame
        .mockResolvedValueOnce(createMockResponse(0x91, 0x00, [
          0x04, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D,
        ]));

      const result = await handler.detect('3B8180018080', mockSendCommand);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(90);
      expect(result.cardType).toContain('DESFire');
    });

    it('should detect transport card when UID read succeeds with DESFire ATR', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82)) // GetVersion fails
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00, [
          0x04, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, // 7-byte UID
        ]));

      // DESFire-like ATR
      const result = await handler.detect('3B8180018080', mockSendCommand);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(60);
    });

    it('should return low confidence for DESFire ATR when commands fail', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82)) // GetVersion fails
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82)); // UID fails

      // DESFire-like ATR
      const result = await handler.detect('3B8180018080', mockSendCommand);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBeLessThanOrEqual(50);
    });

    it('should detect Calypso transport cards', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82))
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82));

      // Calypso ATR
      const result = await handler.detect('3B8F8001805A0A014000FFFFFFFF829000', mockSendCommand);

      expect(result.detected).toBe(true);
      expect(result.cardType).toContain('Calypso');
    });

    it('should not detect non-transport cards', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82))
        .mockResolvedValueOnce(createMockResponse(0x6a, 0x82));

      // EMV card ATR
      const result = await handler.detect('3B6700002063CB6600', mockSendCommand);

      expect(result.detected).toBe(false);
    });
  });

  describe('getCommands', () => {
    it('should return transport commands', () => {
      const commands = handler.getCommands();

      expect(commands.length).toBeGreaterThan(0);
      expect(commands.some((c) => c.id === 'get-uid')).toBe(true);
      expect(commands.some((c) => c.id === 'get-version')).toBe(true);
      expect(commands.some((c) => c.id === 'get-application-ids')).toBe(true);
    });

    it('should have Identification category commands', () => {
      const commands = handler.getCommands();
      const identCommands = commands.filter((c) => c.category === 'Identification');

      expect(identCommands.length).toBeGreaterThan(0);
    });
  });

  describe('executeCommand', () => {
    it('should execute get-uid command', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00, [
          0x04, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc,
        ]));

      const context = {
        sendCommand: mockSendCommand,
        atr: '3B8180018080',
        protocol: 0,
        parameters: {},
      };

      const result = await handler.executeCommand('get-uid', context);

      expect(result.sw1).toBe(0x90);
      expect(result.data.length).toBe(7);
    });

    it('should execute get-version command', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x91, 0xaf, [
          0x04, 0x01, 0x01, 0x01, 0x00, 0x18, 0x05,
        ]))
        .mockResolvedValueOnce(createMockResponse(0x91, 0xaf, [
          0x04, 0x01, 0x01, 0x01, 0x04, 0x18, 0x05,
        ]))
        .mockResolvedValueOnce(createMockResponse(0x91, 0x00, [
          0x04, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
        ]));

      const context = {
        sendCommand: mockSendCommand,
        atr: '3B8180018080',
        protocol: 0,
        parameters: {},
      };

      const result = await handler.executeCommand('get-version', context);

      // Should aggregate version data
      expect(result.data.length).toBeGreaterThan(0);
    });
  });
});
