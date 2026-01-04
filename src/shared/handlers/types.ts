/**
 * Card handler types and interfaces.
 * Defines the plugin architecture for supporting different card types.
 */

import type { Response, TlvNode } from '../types';

/**
 * A command that can be executed on a card.
 */
export interface CardCommand {
  /** Unique identifier for this command */
  id: string;
  /** Display name for the UI */
  name: string;
  /** Brief description of what the command does */
  description: string;
  /** Category for grouping in UI (e.g., "Read", "Write", "Security") */
  category: string;
  /** Whether this command requires user confirmation */
  requiresConfirmation?: boolean;
  /** Whether this command might modify card data */
  isDestructive?: boolean;
  /** Parameters the command accepts */
  parameters?: CommandParameter[];
}

/**
 * A parameter for a card command.
 */
export interface CommandParameter {
  /** Parameter identifier */
  id: string;
  /** Display name */
  name: string;
  /** Parameter type */
  type: 'string' | 'number' | 'hex' | 'boolean' | 'select';
  /** Whether this parameter is required */
  required: boolean;
  /** Default value */
  defaultValue?: string | number | boolean;
  /** For select type, the available options */
  options?: { value: string; label: string }[];
  /** Validation regex for string/hex types */
  validation?: string;
  /** Help text */
  description?: string;
}

/**
 * Context passed to command execution.
 */
export interface CommandContext {
  /** Function to send an APDU command and get response */
  sendCommand: (apdu: number[]) => Promise<Response>;
  /** Current card ATR */
  atr: string;
  /** Protocol (T=0 or T=1) */
  protocol: number;
  /** Parameter values provided by user */
  parameters: Record<string, string | number | boolean>;
}

/**
 * Result of detecting a card type.
 */
export interface DetectionResult {
  /** Whether this handler can handle the card */
  detected: boolean;
  /** Confidence level (0-100) */
  confidence: number;
  /** Human-readable card type name */
  cardType?: string;
  /** Additional info discovered during detection */
  metadata?: Record<string, unknown>;
}

/**
 * Result of an interrogation.
 */
export interface InterrogationResult {
  /** Whether interrogation succeeded */
  success: boolean;
  /** Applications found on the card */
  applications?: ApplicationInfo[];
  /** Any error that occurred */
  error?: string;
}

/**
 * Information about an application on the card.
 */
export interface ApplicationInfo {
  /** Application Identifier */
  aid: string;
  /** Human-readable name */
  name?: string;
  /** Application label from card */
  label?: string;
  /** Priority indicator */
  priority?: number;
  /** Additional TLV data */
  tlv?: TlvNode;
}

/**
 * A handler for a specific type of smart card.
 */
export interface CardHandler {
  /** Unique identifier for this handler */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Brief description */
  readonly description: string;

  /** UI workflow type - determines which panel style to use */
  readonly workflow?: 'emv' | 'generic';

  /**
   * Detect if this handler can handle the given card.
   * Called with the card's ATR and optionally after a SELECT command.
   * @param atr - The card's Answer To Reset
   * @param sendCommand - Function to send APDU commands for detection
   * @returns Detection result with confidence level
   */
  detect(
    atr: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<DetectionResult>;

  /**
   * Get available commands for this card type.
   * May return different commands based on detected applications.
   * @param metadata - Metadata from detection phase
   * @returns Array of available commands
   */
  getCommands(metadata?: Record<string, unknown>): CardCommand[];

  /**
   * Execute a command on the card.
   * @param commandId - The command to execute
   * @param context - Execution context with sendCommand function and parameters
   * @returns Command response
   */
  executeCommand(commandId: string, context: CommandContext): Promise<Response>;

  /**
   * Perform full card interrogation (discover all data).
   * @param sendCommand - Function to send APDU commands
   * @returns Interrogation result
   */
  interrogate(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<InterrogationResult>;
}

/**
 * Handler registration entry.
 */
export interface HandlerRegistration {
  handler: CardHandler;
  /** Priority for detection order (higher = checked first) */
  priority: number;
}
