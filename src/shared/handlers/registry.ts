/**
 * Card handler registry.
 * Manages registration and detection of card handlers.
 */

import type { Response } from '../types';
import type { CardHandler, HandlerRegistration, DetectionResult } from './types';

/**
 * Result of detecting handlers for a card.
 */
export interface DetectedHandler {
  handler: CardHandler;
  result: DetectionResult;
}

/**
 * Registry for card handlers.
 * Handlers are checked in priority order during detection.
 */
export class HandlerRegistry {
  private handlers: HandlerRegistration[] = [];

  /**
   * Register a card handler.
   * @param handler - The handler to register
   * @param priority - Detection priority (higher = checked first)
   */
  register(handler: CardHandler, priority = 50): void {
    // Remove existing handler with same ID
    this.handlers = this.handlers.filter((h) => h.handler.id !== handler.id);

    // Add new registration
    this.handlers.push({ handler, priority });

    // Sort by priority (descending)
    this.handlers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Unregister a handler by ID.
   * @param handlerId - The handler ID to remove
   */
  unregister(handlerId: string): void {
    this.handlers = this.handlers.filter((h) => h.handler.id !== handlerId);
  }

  /**
   * Get a handler by ID.
   * @param handlerId - The handler ID
   * @returns The handler or undefined
   */
  getHandler(handlerId: string): CardHandler | undefined {
    return this.handlers.find((h) => h.handler.id === handlerId)?.handler;
  }

  /**
   * Get all registered handlers.
   * @returns Array of handlers sorted by priority
   */
  getAllHandlers(): CardHandler[] {
    return this.handlers.map((h) => h.handler);
  }

  /**
   * Detect which handlers can handle the given card.
   * @param atr - The card's ATR
   * @param sendCommand - Function to send APDU commands
   * @returns Array of detected handlers with their detection results
   */
  async detectHandlers(
    atr: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<DetectedHandler[]> {
    const detected: DetectedHandler[] = [];

    for (const registration of this.handlers) {
      try {
        const result = await registration.handler.detect(atr, sendCommand);
        if (result.detected) {
          detected.push({
            handler: registration.handler,
            result,
          });
        }
      } catch (error) {
        console.error(`Detection failed for handler ${registration.handler.id}:`, error);
      }
    }

    // Sort by confidence (descending)
    detected.sort((a, b) => b.result.confidence - a.result.confidence);

    return detected;
  }

  /**
   * Get the best matching handler for a card.
   * @param atr - The card's ATR
   * @param sendCommand - Function to send APDU commands
   * @returns The best matching handler or null
   */
  async detectBestHandler(
    atr: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<DetectedHandler | null> {
    const detected = await this.detectHandlers(atr, sendCommand);
    return detected.length > 0 ? detected[0] : null;
  }
}

/**
 * Global handler registry instance.
 */
export const globalRegistry = new HandlerRegistry();
