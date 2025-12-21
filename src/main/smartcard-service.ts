import { BrowserWindow } from 'electron';
import { Devices, Card, Reader, Context } from 'smartcard';
import type { Device, Command, Response } from '../shared/types';

export class SmartcardService {
  private devices: Devices;
  private window: BrowserWindow;
  private readers: Map<string, Reader> = new Map();
  private activeCard: Card | null = null;
  private commandId = 0;

  constructor(window: BrowserWindow) {
    this.window = window;
    this.devices = new Devices();
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

    this.devices.on('card-inserted', ({ reader, card }: { reader: Reader; card: Card }) => {
      console.log('Card inserted in:', reader.name);
      this.activeCard = card;
      this.send('card-inserted', {
        atr: card.atr?.toString('hex') ?? '',
        protocol: card.protocol,
        deviceName: reader.name
      });
    });

    this.devices.on('card-removed', ({ reader }: { reader: Reader }) => {
      console.log('Card removed from:', reader.name);
      this.activeCard = null;
      this.send('card-removed', { deviceName: reader.name });
    });

    this.devices.on('error', (error: Error) => {
      console.error('Smartcard error:', error);
    });

    console.log('Starting smartcard device monitoring...');
    this.devices.start();

    // Get already-connected readers using low-level API
    try {
      const ctx = new Context();
      const existingReaders = ctx.listReaders();
      console.log('Found existing readers:', existingReaders.map(r => r.name));
      for (const reader of existingReaders) {
        if (!this.readers.has(reader.name)) {
          this.readers.set(reader.name, reader as unknown as Reader);
          this.send('device-activated', { name: reader.name, isActivated: true });
        }
      }
      ctx.close();
    } catch (err) {
      console.error('Error listing existing readers:', err);
    }
  }

  stop(): void {
    this.devices.stop();
  }

  getDevices(): Device[] {
    return Array.from(this.readers.keys()).map(name => ({
      name,
      isActivated: true
    }));
  }

  async selectDevice(name: string): Promise<void> {
    console.log('Selected device:', name);
  }

  async sendCommand(apdu: number[]): Promise<Response> {
    if (!this.activeCard) {
      throw new Error('No card inserted');
    }

    const id = String(++this.commandId);
    const command: Command = {
      id,
      timestamp: Date.now(),
      apdu,
      hex: Buffer.from(apdu).toString('hex').toUpperCase()
    };

    this.send('command-issued', command);

    const result = await this.activeCard.transmit(Buffer.from(apdu));
    const data = Array.from(result.slice(0, -2));
    const sw1 = result[result.length - 2];
    const sw2 = result[result.length - 1];

    const response: Response = {
      id,
      timestamp: Date.now(),
      data,
      sw1,
      sw2,
      hex: result.toString('hex').toUpperCase(),
      meaning: this.getStatusMeaning(sw1, sw2)
    };

    this.send('response-received', response);
    return response;
  }

  async interrogate(): Promise<void> {
    // Select PSE (1PAY.SYS.DDF01)
    const pse = [
      0x00, 0xA4, 0x04, 0x00, 0x0E,
      0x31, 0x50, 0x41, 0x59, 0x2E, 0x53, 0x59, 0x53,
      0x2E, 0x44, 0x44, 0x46, 0x30, 0x31, 0x00
    ];

    try {
      await this.sendCommand(pse);
    } catch (e) {
      console.error('PSE selection failed:', e);
      // Try PPSE for contactless
      const ppse = [
        0x00, 0xA4, 0x04, 0x00, 0x0E,
        0x32, 0x50, 0x41, 0x59, 0x2E, 0x53, 0x59, 0x53,
        0x2E, 0x44, 0x44, 0x46, 0x30, 0x31, 0x00
      ];
      try {
        await this.sendCommand(ppse);
      } catch {
        console.error('PPSE selection also failed');
      }
    }

    // Read first few records from common SFIs
    for (let sfi = 1; sfi <= 3; sfi++) {
      for (let record = 1; record <= 5; record++) {
        try {
          const p2 = (sfi << 3) | 0x04;
          await this.sendCommand([0x00, 0xB2, record, p2, 0x00]);
        } catch {
          break;
        }
      }
    }
  }

  private send(channel: string, data: unknown): void {
    this.window.webContents.send(channel, data);
  }

  private getStatusMeaning(sw1: number, sw2: number): string {
    if (sw1 === 0x90 && sw2 === 0x00) return 'Success';
    if (sw1 === 0x61) return `More data available: ${sw2} bytes`;
    if (sw1 === 0x6A && sw2 === 0x82) return 'File not found';
    if (sw1 === 0x6A && sw2 === 0x83) return 'Record not found';
    if (sw1 === 0x6A && sw2 === 0x86) return 'Incorrect P1-P2';
    if (sw1 === 0x69 && sw2 === 0x85) return 'Conditions not satisfied';
    if (sw1 === 0x6C) return `Wrong Le: use ${sw2}`;
    if (sw1 === 0x6E && sw2 === 0x00) return 'Class not supported';
    if (sw1 === 0x6D && sw2 === 0x00) return 'Instruction not supported';
    return `Status: ${sw1.toString(16).padStart(2, '0').toUpperCase()}${sw2.toString(16).padStart(2, '0').toUpperCase()}`;
  }
}
