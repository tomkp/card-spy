import { BrowserWindow } from 'electron';
import { Devices, Card, Reader } from 'smartcard';
import type { Device, Command, Response } from '../shared/types';
import { getStatusWordInfo } from '../shared/apdu';
import {
  globalRegistry,
  registerBuiltinHandlers,
  type CardHandler,
  type DetectedHandler,
  type CardCommand,
} from '../shared/handlers';

export class SmartcardService {
  private devices: Devices;
  private window: BrowserWindow;
  private readers: Map<string, Reader> = new Map();
  private cards: Map<string, Card> = new Map(); // Cards per reader
  private activeReaderName: string | null = null;
  private commandId = 0;

  // Handler state per reader
  private detectedHandlers: Map<string, DetectedHandler[]> = new Map();
  private activeHandlers: Map<string, CardHandler> = new Map();

  constructor(window: BrowserWindow) {
    this.window = window;
    this.devices = new Devices();
    // Register all built-in handlers
    registerBuiltinHandlers();
  }

  start(): void {
    this.devices.on('reader-attached', (reader: Reader) => {
      console.log('Reader attached:', reader.name);
      this.readers.set(reader.name, reader);
      this.send('device-activated', { name: reader.name, isActivated: true });
    });

    this.devices.on('reader-detached', (reader: Reader) => {
      console.log('Reader detached:', reader.name);
      this.readers.delete(reader.name);
      this.send('device-deactivated', { name: reader.name, isActivated: false });
    });

    this.devices.on('card-inserted', async ({ reader, card }: { reader: Reader; card: Card }) => {
      console.log('[card-inserted] Reader:', reader.name, 'ATR:', card.atr?.toString('hex'));
      this.cards.set(reader.name, card);
      // Auto-select this reader if none selected
      if (!this.activeReaderName) {
        this.activeReaderName = reader.name;
      }
      const atr = card.atr?.toString('hex') ?? '';
      const payload = {
        atr,
        protocol: card.protocol,
        deviceName: reader.name,
      };
      console.log('[card-inserted] Sending to renderer:', payload);
      this.send('card-inserted', payload);

      // Detect card handlers
      await this.detectCardHandlers(reader.name, atr);
    });

    this.devices.on('card-removed', ({ reader }: { reader: Reader }) => {
      console.log('[card-removed] Reader:', reader.name);
      this.cards.delete(reader.name);
      this.detectedHandlers.delete(reader.name);
      this.activeHandlers.delete(reader.name);
      if (this.activeReaderName === reader.name) {
        // Switch to another reader with a card, if any
        const nextReader = Array.from(this.cards.keys())[0] || null;
        this.activeReaderName = nextReader;
      }
      const payload = { deviceName: reader.name };
      console.log('[card-removed] Sending to renderer:', payload);
      this.send('card-removed', payload);
    });

    this.devices.on('error', (error: Error) => {
      console.error('Smartcard error:', error);
    });

    console.log('Starting smartcard device monitoring...');
    this.devices.start();
  }

  stop(): void {
    console.log('Stopping smartcard service...');
    this.devices.removeAllListeners();
    this.devices.stop();
    this.readers.clear();
    this.cards.clear();
    this.detectedHandlers.clear();
    this.activeHandlers.clear();
    this.activeReaderName = null;
    console.log('Smartcard service stopped');
  }

  getDevices(): Device[] {
    return Array.from(this.readers.keys()).map((name) => ({
      name,
      isActivated: true,
    }));
  }

  getCards(): Array<{ deviceName: string; atr: string; protocol: number }> {
    const result: Array<{ deviceName: string; atr: string; protocol: number }> = [];

    for (const [deviceName, card] of this.cards.entries()) {
      result.push({
        deviceName,
        atr: card.atr?.toString('hex') ?? '',
        protocol: card.protocol ?? 0,
      });
    }

    return result;
  }

  async selectDevice(name: string): Promise<void> {
    console.log('Selected device:', name);
    this.activeReaderName = name;
  }

  private getActiveCard(): Card | null {
    if (!this.activeReaderName) return null;
    return this.cards.get(this.activeReaderName) || null;
  }

  async sendCommand(apdu: number[]): Promise<Response> {
    const activeCard = this.getActiveCard();
    if (!activeCard) {
      throw new Error('No card inserted');
    }

    const id = String(++this.commandId);
    const command: Command = {
      id,
      timestamp: Date.now(),
      apdu,
      hex: Buffer.from(apdu).toString('hex').toUpperCase(),
    };

    this.send('command-issued', command);

    let result = await activeCard.transmit(Buffer.from(apdu));
    let sw1 = result[result.length - 2];
    let sw2 = result[result.length - 1];

    // Handle 6C XX (wrong Le, retry with correct length)
    if (sw1 === 0x6c) {
      const correctLe = sw2;
      const retryApdu = [...apdu.slice(0, -1), correctLe];
      console.log(`Retrying with Le=${correctLe.toString(16)}`);
      result = await activeCard.transmit(Buffer.from(retryApdu));
      sw1 = result[result.length - 2];
      sw2 = result[result.length - 1];
    }

    // Handle 61 XX (more data available, use GET RESPONSE)
    let allData = Array.from(result.slice(0, -2));
    while (sw1 === 0x61) {
      const remaining = sw2;
      console.log(`Getting ${remaining} more bytes with GET RESPONSE`);
      const getResponse = [0x00, 0xc0, 0x00, 0x00, remaining];
      result = await activeCard.transmit(Buffer.from(getResponse));
      allData = allData.concat(Array.from(result.slice(0, -2)));
      sw1 = result[result.length - 2];
      sw2 = result[result.length - 1];
    }

    const response: Response = {
      id,
      timestamp: Date.now(),
      data: allData,
      sw1,
      sw2,
      hex: Buffer.from([...allData, sw1, sw2])
        .toString('hex')
        .toUpperCase(),
      meaning: getStatusWordInfo(sw1, sw2).meaning,
    };

    this.send('response-received', response);
    return response;
  }

  async repl(command: string): Promise<Response> {
    // Parse hex string to byte array
    const cleaned = command.replace(/0x/gi, '').replace(/,/g, '').replace(/\s+/g, '').toUpperCase();

    const bytes: number[] = [];
    for (let i = 0; i < cleaned.length; i += 2) {
      bytes.push(parseInt(cleaned.substring(i, i + 2), 16));
    }

    return this.sendCommand(bytes);
  }

  /**
   * Detect card handlers for a card.
   * Can be called on card insert or for existing cards on startup.
   */
  async detectCardHandlers(readerName: string, atr: string): Promise<void> {
    const prevActiveReader = this.activeReaderName;
    this.activeReaderName = readerName;

    try {
      const sendCommand = this.sendCommand.bind(this);
      const handlers = await globalRegistry.detectHandlers(atr, sendCommand);

      this.detectedHandlers.set(readerName, handlers);

      // Set the best handler as active
      if (handlers.length > 0) {
        this.activeHandlers.set(readerName, handlers[0].handler);
      }

      // Notify renderer of detected handlers
      this.send('handlers-detected', {
        deviceName: readerName,
        handlers: handlers.map((h) => ({
          id: h.handler.id,
          name: h.handler.name,
          description: h.handler.description,
          cardType: h.result.cardType,
          confidence: h.result.confidence,
          commands: h.handler.getCommands(h.result.metadata),
        })),
      });

      console.log(
        `Detected ${handlers.length} handlers for ${readerName}:`,
        handlers.map((h) => h.handler.name)
      );
    } catch (error) {
      console.error('Handler detection error:', error);
    } finally {
      this.activeReaderName = prevActiveReader || readerName;
    }
  }

  /**
   * Get available commands for the active card.
   */
  getAvailableCommands(): CardCommand[] {
    if (!this.activeReaderName) return [];

    const handler = this.activeHandlers.get(this.activeReaderName);
    if (!handler) return [];

    const detected = this.detectedHandlers.get(this.activeReaderName);
    const metadata = detected?.find((h) => h.handler.id === handler.id)?.result.metadata;

    return handler.getCommands(metadata);
  }

  /**
   * Get detected handlers for the active card.
   */
  getDetectedHandlers(): Array<{ id: string; name: string; cardType?: string }> {
    if (!this.activeReaderName) return [];

    const handlers = this.detectedHandlers.get(this.activeReaderName) || [];
    return handlers.map((h) => ({
      id: h.handler.id,
      name: h.handler.name,
      cardType: h.result.cardType,
    }));
  }

  /**
   * Set the active handler for the current card.
   */
  setActiveHandler(handlerId: string): boolean {
    if (!this.activeReaderName) return false;

    const handlers = this.detectedHandlers.get(this.activeReaderName) || [];
    const handler = handlers.find((h) => h.handler.id === handlerId);

    if (handler) {
      this.activeHandlers.set(this.activeReaderName, handler.handler);
      this.send('active-handler-changed', {
        deviceName: this.activeReaderName,
        handlerId,
        commands: handler.handler.getCommands(handler.result.metadata),
      });
      return true;
    }
    return false;
  }

  /**
   * Execute a handler command.
   */
  async executeCommand(
    commandId: string,
    parameters: Record<string, string | number | boolean> = {}
  ): Promise<Response> {
    if (!this.activeReaderName) {
      throw new Error('No active reader');
    }

    const handler = this.activeHandlers.get(this.activeReaderName);
    if (!handler) {
      throw new Error('No active handler');
    }

    const card = this.cards.get(this.activeReaderName);
    if (!card) {
      throw new Error('No card inserted');
    }

    const context = {
      sendCommand: this.sendCommand.bind(this),
      atr: card.atr?.toString('hex') ?? '',
      protocol: card.protocol ?? 0,
      parameters,
    };

    return handler.executeCommand(commandId, context);
  }

  /**
   * Interrogate the card using the active handler.
   */
  async interrogate(): Promise<void> {
    if (!this.activeReaderName) {
      console.error('No active reader for interrogation');
      return;
    }

    const handler = this.activeHandlers.get(this.activeReaderName);
    if (!handler) {
      console.error('No handler available for interrogation');
      return;
    }

    try {
      const result = await handler.interrogate(this.sendCommand.bind(this));

      if (result.success && result.applications) {
        for (const app of result.applications) {
          this.send('application-found', {
            handlerId: handler.id,
            ...app,
          });
        }
      }

      this.send('interrogation-complete', {
        deviceName: this.activeReaderName,
        handlerId: handler.id,
        success: result.success,
        error: result.error,
      });
    } catch (error) {
      console.error('Interrogation error:', error);
      this.send('interrogation-complete', {
        deviceName: this.activeReaderName,
        handlerId: handler.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private send(channel: string, data: unknown): void {
    this.window.webContents.send(channel, data);
  }
}
