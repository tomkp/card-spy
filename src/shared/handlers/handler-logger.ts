/**
 * Logging utility for card handlers.
 *
 * Provides consistent error logging with handler context,
 * making it easier to debug issues while allowing graceful recovery.
 */

/**
 * Log levels for handler logging.
 */
export enum LogLevel {
  /** No logging */
  NONE = 0,
  /** Only warnings and errors */
  WARN = 1,
  /** All messages including debug */
  DEBUG = 2,
}

/** Current global log level */
let currentLogLevel = LogLevel.WARN;

/**
 * Set the global log level for handler logging.
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Get the current global log level.
 */
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

/**
 * Logger for card handlers that provides consistent error logging with context.
 *
 * @example
 * ```typescript
 * const logger = new HandlerLogger('emv');
 *
 * // In catch blocks
 * } catch (error) {
 *   logger.warn('PSE selection failed', 'detect', error);
 * }
 *
 * // Or use catchAndLog for simpler syntax
 * const result = logger.catchAndLog(() => {
 *   return sendCommand(apdu);
 * }, 'detect', 'Failed to send command');
 * ```
 */
export class HandlerLogger {
  constructor(private readonly handlerId: string) {}

  /**
   * Format a log prefix with handler ID and optional operation.
   */
  private formatPrefix(operation?: string): string {
    if (operation) {
      return `[Handler:${this.handlerId}:${operation}]`;
    }
    return `[Handler:${this.handlerId}]`;
  }

  /**
   * Log a warning message.
   *
   * @param message - The warning message
   * @param operation - Optional operation name for context (e.g., 'detect', 'interrogate')
   * @param error - Optional error object that caused the warning
   */
  warn(message: string, operation?: string, error?: unknown): void {
    if (currentLogLevel < LogLevel.WARN) return;

    const prefix = this.formatPrefix(operation);
    if (error) {
      console.warn(prefix, message, error);
    } else {
      console.warn(prefix, message);
    }
  }

  /**
   * Log a debug message.
   * Only logs when log level is DEBUG.
   *
   * @param message - The debug message
   * @param operation - Optional operation name for context
   */
  debug(message: string, operation?: string): void {
    if (currentLogLevel < LogLevel.DEBUG) return;

    const prefix = this.formatPrefix(operation);
    console.debug(prefix, message);
  }

  /**
   * Execute a callback and log any errors that occur.
   * Returns undefined if an error is caught.
   *
   * @param callback - The function to execute
   * @param operation - Operation name for logging context
   * @param message - Optional custom error message (defaults to 'Operation failed')
   * @returns The callback result, or undefined if an error occurred
   */
  catchAndLog<T>(
    callback: () => T,
    operation: string,
    message = 'Operation failed'
  ): T | undefined {
    try {
      return callback();
    } catch (error) {
      this.warn(message, operation, error);
      return undefined;
    }
  }

  /**
   * Execute an async callback and log any errors that occur.
   * Returns undefined if an error is caught.
   *
   * @param callback - The async function to execute
   * @param operation - Operation name for logging context
   * @param message - Optional custom error message (defaults to 'Operation failed')
   * @returns The callback result, or undefined if an error occurred
   */
  async catchAndLogAsync<T>(
    callback: () => Promise<T>,
    operation: string,
    message = 'Operation failed'
  ): Promise<T | undefined> {
    try {
      return await callback();
    } catch (error) {
      this.warn(message, operation, error);
      return undefined;
    }
  }
}
