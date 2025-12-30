import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HandlerLogger, LogLevel, setLogLevel, getLogLevel } from './handler-logger';

describe('HandlerLogger', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    setLogLevel(LogLevel.WARN);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    setLogLevel(LogLevel.WARN); // Reset to default
  });

  describe('constructor', () => {
    it('should create logger with handler ID', () => {
      const logger = new HandlerLogger('emv');
      expect(logger).toBeDefined();
    });
  });

  describe('warn', () => {
    it('should log warning with handler prefix', () => {
      const logger = new HandlerLogger('emv');
      logger.warn('Something went wrong', 'detect');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Handler:emv:detect]',
        'Something went wrong'
      );
    });

    it('should log warning without operation when not provided', () => {
      const logger = new HandlerLogger('piv');
      logger.warn('General warning');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Handler:piv]',
        'General warning'
      );
    });

    it('should include error details when error provided', () => {
      const logger = new HandlerLogger('fido');
      const error = new Error('Connection failed');
      logger.warn('Selection failed', 'detect', error);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Handler:fido:detect]',
        'Selection failed',
        error
      );
    });
  });

  describe('debug', () => {
    it('should not log debug when level is WARN', () => {
      setLogLevel(LogLevel.WARN);
      const logger = new HandlerLogger('emv');
      logger.debug('Debug message', 'interrogate');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('should log debug when level is DEBUG', () => {
      setLogLevel(LogLevel.DEBUG);
      const logger = new HandlerLogger('emv');
      logger.debug('Debug message', 'interrogate');

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[Handler:emv:interrogate]',
        'Debug message'
      );
    });
  });

  describe('catchAndLog', () => {
    it('should catch error and log it', () => {
      const logger = new HandlerLogger('sim');
      const error = new Error('Test error');

      const callback = () => {
        throw error;
      };

      const result = logger.catchAndLog(callback, 'executeCommand');

      expect(result).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Handler:sim:executeCommand]',
        'Operation failed',
        error
      );
    });

    it('should return value when no error', () => {
      const logger = new HandlerLogger('transport');

      const callback = () => 42;
      const result = logger.catchAndLog(callback, 'getVersion');

      expect(result).toBe(42);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should use custom message when provided', () => {
      const logger = new HandlerLogger('openpgp');
      const error = new Error('Test');

      const callback = () => {
        throw error;
      };

      logger.catchAndLog(callback, 'detect', 'Custom failure message');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Handler:openpgp:detect]',
        'Custom failure message',
        error
      );
    });
  });

  describe('catchAndLogAsync', () => {
    it('should catch async error and log it', async () => {
      const logger = new HandlerLogger('health');
      const error = new Error('Async error');

      const asyncCallback = async () => {
        throw error;
      };

      const result = await logger.catchAndLogAsync(asyncCallback, 'interrogate');

      expect(result).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Handler:health:interrogate]',
        'Operation failed',
        error
      );
    });

    it('should return value when async operation succeeds', async () => {
      const logger = new HandlerLogger('eid');

      const asyncCallback = async () => 'success';
      const result = await logger.catchAndLogAsync(asyncCallback, 'select');

      expect(result).toBe('success');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('setLogLevel and getLogLevel', () => {
    it('should default to WARN level', () => {
      expect(getLogLevel()).toBe(LogLevel.WARN);
    });

    it('should allow changing log level', () => {
      setLogLevel(LogLevel.DEBUG);
      expect(getLogLevel()).toBe(LogLevel.DEBUG);

      setLogLevel(LogLevel.NONE);
      expect(getLogLevel()).toBe(LogLevel.NONE);
    });

    it('should suppress all logs when NONE', () => {
      setLogLevel(LogLevel.NONE);
      const logger = new HandlerLogger('test');

      logger.warn('This should not appear');
      logger.debug('This should not appear either');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });
  });
});
