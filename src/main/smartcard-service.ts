import { BrowserWindow } from 'electron';
import { Devices, Card, Reader } from 'smartcard';
import type { Device, Command, Response, TlvNode } from '../shared/types';
import { parseTlv, findTag, findTags, getValueHex } from './emv-utils';

export class SmartcardService {
  private devices: Devices;
  private window: BrowserWindow;
  private readers: Map<string, Reader> = new Map();
  private cards: Map<string, Card> = new Map(); // Cards per reader
  private activeReaderName: string | null = null;
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
      console.log('[card-inserted] Reader:', reader.name, 'ATR:', card.atr?.toString('hex'));
      this.cards.set(reader.name, card);
      // Auto-select this reader if none selected
      if (!this.activeReaderName) {
        this.activeReaderName = reader.name;
      }
      const payload = {
        atr: card.atr?.toString('hex') ?? '',
        protocol: card.protocol,
        deviceName: reader.name,
      };
      console.log('[card-inserted] Sending to renderer:', payload);
      this.send('card-inserted', payload);
    });

    this.devices.on('card-removed', ({ reader }: { reader: Reader }) => {
      console.log('[card-removed] Reader:', reader.name);
      this.cards.delete(reader.name);
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
      hex: Buffer.from([...allData, sw1, sw2]).toString('hex').toUpperCase(),
      meaning: this.getStatusMeaning(sw1, sw2),
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

  async interrogate(): Promise<void> {
    try {
      // Step 1: Select PSE (1PAY.SYS.DDF01) for contact cards
      const pseResponse = await this.selectPse();

      if (pseResponse) {
        // Step 2: Find SFI and read records to discover applications
        const applicationIds = await this.discoverApplications(pseResponse);

        // Step 3: Select each application and run GPO + read records
        for (const aid of applicationIds) {
          await this.selectAndReadApplication(aid);
        }
      }
    } catch (error) {
      console.error('Interrogation error:', error);
    }
  }

  /**
   * Select PSE (Payment System Environment) or PPSE for contactless
   */
  private async selectPse(): Promise<Response | null> {
    // PSE: 1PAY.SYS.DDF01
    const pse = [
      0x00, 0xa4, 0x04, 0x00, 0x0e, 0x31, 0x50, 0x41, 0x59, 0x2e, 0x53, 0x59, 0x53, 0x2e, 0x44,
      0x44, 0x46, 0x30, 0x31, 0x00,
    ];

    try {
      const response = await this.sendCommand(pse);
      if (response.sw1 === 0x90 || response.sw1 === 0x61) {
        console.log('PSE selected successfully');
        return response;
      }
    } catch {
      console.log('PSE selection failed, trying PPSE...');
    }

    // PPSE: 2PAY.SYS.DDF01 (for contactless)
    const ppse = [
      0x00, 0xa4, 0x04, 0x00, 0x0e, 0x32, 0x50, 0x41, 0x59, 0x2e, 0x53, 0x59, 0x53, 0x2e, 0x44,
      0x44, 0x46, 0x30, 0x31, 0x00,
    ];

    try {
      const response = await this.sendCommand(ppse);
      if (response.sw1 === 0x90 || response.sw1 === 0x61) {
        console.log('PPSE selected successfully');
        return response;
      }
    } catch {
      console.error('PPSE selection also failed');
    }

    return null;
  }

  /**
   * Discover applications by reading PSE records
   */
  private async discoverApplications(pseResponse: Response): Promise<string[]> {
    const applicationIds: string[] = [];

    // Parse PSE response to find SFI (tag 88)
    const tlvNodes = parseTlv(pseResponse.data);
    const sfiNode = findTag(tlvNodes, 0x88);

    if (!sfiNode) {
      console.log('No SFI found in PSE response, using default SFI 1');
    }

    const sfi = sfiNode ? (sfiNode.value as number[])[0] : 1;
    console.log(`Using SFI: ${sfi}`);

    // Read records from the SFI
    for (let record = 1; record <= 10; record++) {
      try {
        const p2 = (sfi << 3) | 0x04;
        const response = await this.sendCommand([0x00, 0xb2, record, p2, 0x00]);

        if (response.sw1 !== 0x90 && response.sw1 !== 0x61) {
          break; // No more records
        }

        // Parse record and find Application Templates (tag 61)
        const recordTlv = parseTlv(response.data);
        const appTemplates = findTags(recordTlv, 0x61);

        for (const appTemplate of appTemplates) {
          // Find AID (tag 4F) within application template
          const aidNode = findTag([appTemplate], 0x4f);
          if (aidNode) {
            const aid = getValueHex(aidNode);
            applicationIds.push(aid);

            // Send emv-application-found event
            this.send('emv-application-found', {
              aid,
              tlv: appTemplate,
            });

            console.log(`Found application: ${aid}`);
          }
        }
      } catch {
        break;
      }
    }

    return applicationIds;
  }

  /**
   * Select an application by AID, run GPO, and read records
   */
  private async selectAndReadApplication(aid: string): Promise<void> {
    // Convert AID hex string to bytes
    const aidBytes: number[] = [];
    for (let i = 0; i < aid.length; i += 2) {
      aidBytes.push(parseInt(aid.substring(i, i + 2), 16));
    }

    // SELECT command: 00 A4 04 00 [len] [AID] 00
    const selectCmd = [0x00, 0xa4, 0x04, 0x00, aidBytes.length, ...aidBytes, 0x00];

    try {
      const selectResponse = await this.sendCommand(selectCmd);

      if (selectResponse.sw1 !== 0x90 && selectResponse.sw1 !== 0x61) {
        console.log(`Failed to select application ${aid}`);
        return;
      }

      // Send application-selected event
      this.send('application-selected', { aid });

      // GET PROCESSING OPTIONS (GPO): 80 A8 00 00 02 83 00 00
      // Using empty PDOL for simplicity
      const gpoCmd = [0x80, 0xa8, 0x00, 0x00, 0x02, 0x83, 0x00, 0x00];

      try {
        const gpoResponse = await this.sendCommand(gpoCmd);

        if (gpoResponse.sw1 === 0x90 || gpoResponse.sw1 === 0x61) {
          // Parse AFL (Application File Locator) from GPO response
          const gpoTlv = parseTlv(gpoResponse.data);
          await this.readRecordsFromAfl(gpoTlv);
        }
      } catch {
        console.log('GPO failed, reading default SFIs');
        // Fallback: read from common SFIs
        await this.readDefaultRecords();
      }
    } catch (error) {
      console.error(`Error selecting application ${aid}:`, error);
    }
  }

  /**
   * Read records based on AFL (Application File Locator)
   */
  private async readRecordsFromAfl(gpoTlv: TlvNode[]): Promise<void> {
    // AFL can be in tag 94 (in template 77) or as raw bytes in template 80
    const aflNode = findTag(gpoTlv, 0x94);
    let aflBytes: number[] = [];

    if (aflNode) {
      aflBytes = aflNode.value as number[];
    } else {
      // Check for Format 1 response (tag 80)
      const format1 = findTag(gpoTlv, 0x80);
      if (format1) {
        const data = format1.value as number[];
        // First 2 bytes are AIP, rest is AFL
        if (data.length > 2) {
          aflBytes = data.slice(2);
        }
      }
    }

    if (aflBytes.length === 0) {
      console.log('No AFL found, reading default records');
      await this.readDefaultRecords();
      return;
    }

    // AFL is structured as 4-byte entries: SFI, First Record, Last Record, Offline Data Auth Records
    for (let i = 0; i < aflBytes.length; i += 4) {
      const sfi = (aflBytes[i] >> 3) & 0x1f;
      const firstRecord = aflBytes[i + 1];
      const lastRecord = aflBytes[i + 2];

      for (let record = firstRecord; record <= lastRecord; record++) {
        try {
          const p2 = (sfi << 3) | 0x04;
          await this.sendCommand([0x00, 0xb2, record, p2, 0x00]);
        } catch {
          break;
        }
      }
    }
  }

  /**
   * Read records from default SFIs when AFL is not available
   */
  private async readDefaultRecords(): Promise<void> {
    for (let sfi = 1; sfi <= 3; sfi++) {
      for (let record = 1; record <= 5; record++) {
        try {
          const p2 = (sfi << 3) | 0x04;
          const response = await this.sendCommand([0x00, 0xb2, record, p2, 0x00]);
          if (response.sw1 !== 0x90 && response.sw1 !== 0x61) {
            break;
          }
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
    if (sw1 === 0x6a && sw2 === 0x82) return 'File not found';
    if (sw1 === 0x6a && sw2 === 0x83) return 'Record not found';
    if (sw1 === 0x6a && sw2 === 0x86) return 'Incorrect P1-P2';
    if (sw1 === 0x69 && sw2 === 0x85) return 'Conditions not satisfied';
    if (sw1 === 0x6c) return `Wrong Le: use ${sw2}`;
    if (sw1 === 0x6e && sw2 === 0x00) return 'Class not supported';
    if (sw1 === 0x6d && sw2 === 0x00) return 'Instruction not supported';
    return `Status: ${sw1.toString(16).padStart(2, '0').toUpperCase()}${sw2.toString(16).padStart(2, '0').toUpperCase()}`;
  }
}
