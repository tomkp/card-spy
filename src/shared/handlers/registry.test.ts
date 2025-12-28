import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandlerRegistry } from './registry';
import type { CardHandler, DetectionResult, InterrogationResult } from './types';
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

// Create a mock handler
function createMockHandler(
  id: string,
  detectionResult: DetectionResult
): CardHandler {
  return {
    id,
    name: `${id} Handler`,
    description: `Mock ${id} handler`,
    detect: vi.fn().mockResolvedValue(detectionResult),
    getCommands: vi.fn().mockReturnValue([]),
    executeCommand: vi.fn().mockResolvedValue(createMockResponse(0x90, 0x00)),
    interrogate: vi.fn().mockResolvedValue({ success: true } as InterrogationResult),
  };
}

describe('HandlerRegistry', () => {
  let registry: HandlerRegistry;

  beforeEach(() => {
    registry = new HandlerRegistry();
  });

  describe('register', () => {
    it('should register a handler', () => {
      const handler = createMockHandler('test', { detected: true, confidence: 80 });

      registry.register(handler, 50);

      const handlers = registry.getAllHandlers();
      expect(handlers).toHaveLength(1);
      expect(handlers[0].id).toBe('test');
    });

    it('should register multiple handlers', () => {
      const handler1 = createMockHandler('test1', { detected: true, confidence: 80 });
      const handler2 = createMockHandler('test2', { detected: true, confidence: 90 });

      registry.register(handler1, 50);
      registry.register(handler2, 60);

      const handlers = registry.getAllHandlers();
      expect(handlers).toHaveLength(2);
    });
  });

  describe('detectHandlers', () => {
    it('should detect handlers that match the card', async () => {
      const handler = createMockHandler('test', {
        detected: true,
        confidence: 80,
        cardType: 'Test Card',
      });
      registry.register(handler, 50);

      const mockSendCommand = vi.fn().mockResolvedValue(createMockResponse(0x90, 0x00));
      const detected = await registry.detectHandlers('3B00', mockSendCommand);

      expect(detected).toHaveLength(1);
      expect(detected[0].handler.id).toBe('test');
      expect(detected[0].result.confidence).toBe(80);
    });

    it('should not include handlers that do not detect', async () => {
      const handler = createMockHandler('test', { detected: false, confidence: 0 });
      registry.register(handler, 50);

      const mockSendCommand = vi.fn().mockResolvedValue(createMockResponse(0x90, 0x00));
      const detected = await registry.detectHandlers('3B00', mockSendCommand);

      expect(detected).toHaveLength(0);
    });

    it('should sort detected handlers by confidence (descending)', async () => {
      const handler1 = createMockHandler('high-confidence', {
        detected: true,
        confidence: 95,
      });
      const handler2 = createMockHandler('low-confidence', {
        detected: true,
        confidence: 60,
      });

      registry.register(handler1, 30);
      registry.register(handler2, 70);

      const mockSendCommand = vi.fn().mockResolvedValue(createMockResponse(0x90, 0x00));
      const detected = await registry.detectHandlers('3B00', mockSendCommand);

      expect(detected).toHaveLength(2);
      // Sorted by confidence, not priority
      expect(detected[0].handler.id).toBe('high-confidence');
      expect(detected[1].handler.id).toBe('low-confidence');
    });

    it('should handle detection errors gracefully', async () => {
      const handler1 = createMockHandler('error-handler', { detected: false, confidence: 0 });
      (handler1.detect as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Detection failed'));

      const handler2 = createMockHandler('working-handler', {
        detected: true,
        confidence: 80,
      });

      registry.register(handler1, 50);
      registry.register(handler2, 50);

      const mockSendCommand = vi.fn().mockResolvedValue(createMockResponse(0x90, 0x00));
      const detected = await registry.detectHandlers('3B00', mockSendCommand);

      // Should still return the working handler
      expect(detected).toHaveLength(1);
      expect(detected[0].handler.id).toBe('working-handler');
    });

    it('should call detect on all registered handlers', async () => {
      const handler1 = createMockHandler('test1', { detected: true, confidence: 80 });
      const handler2 = createMockHandler('test2', { detected: true, confidence: 90 });

      registry.register(handler1, 50);
      registry.register(handler2, 60);

      const mockSendCommand = vi.fn().mockResolvedValue(createMockResponse(0x90, 0x00));
      await registry.detectHandlers('3B00', mockSendCommand);

      expect(handler1.detect).toHaveBeenCalledWith('3B00', mockSendCommand);
      expect(handler2.detect).toHaveBeenCalledWith('3B00', mockSendCommand);
    });
  });

  describe('getAllHandlers', () => {
    it('should return empty array when no handlers registered', () => {
      const handlers = registry.getAllHandlers();
      expect(handlers).toEqual([]);
    });

    it('should return handlers sorted by priority (descending)', () => {
      const handler1 = createMockHandler('low-priority', { detected: false, confidence: 0 });
      const handler2 = createMockHandler('high-priority', { detected: false, confidence: 0 });

      registry.register(handler1, 30);
      registry.register(handler2, 70);

      const handlers = registry.getAllHandlers();
      // Higher priority first
      expect(handlers[0].id).toBe('high-priority');
      expect(handlers[1].id).toBe('low-priority');
    });
  });

  describe('getHandler', () => {
    it('should return handler by ID', () => {
      const handler = createMockHandler('test', { detected: false, confidence: 0 });
      registry.register(handler, 50);

      const found = registry.getHandler('test');
      expect(found?.id).toBe('test');
    });

    it('should return undefined for unknown ID', () => {
      const found = registry.getHandler('unknown');
      expect(found).toBeUndefined();
    });
  });

  describe('unregister', () => {
    it('should remove handler by ID', () => {
      const handler = createMockHandler('test', { detected: false, confidence: 0 });
      registry.register(handler, 50);

      registry.unregister('test');

      expect(registry.getAllHandlers()).toHaveLength(0);
    });
  });
});
