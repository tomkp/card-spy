/**
 * EMV (Europay, Mastercard, Visa) card handler.
 * Supports contact and contactless payment cards.
 */

import type { Response, TlvNode } from '../types';
import type {
  CardHandler,
  CardCommand,
  CommandContext,
  DetectionResult,
  InterrogationResult,
  ApplicationInfo,
} from './types';
import { parseTlv, findTag, findTags, getValueHex, hexToBytes } from '../tlv';
import {
  buildSelectCommand,
  buildReadRecordCommand,
  buildGpoCommand,
  buildGpoCommandWithPdol,
  buildSelectPseCommand,
  buildSelectPpseCommand,
  parseAfl,
  buildDefaultPdolData,
  buildDefaultCdolData,
  type DolEntry,
} from '../emv';

/**
 * Common EMV AIDs for detection.
 */
const KNOWN_AIDS: Record<string, string> = {
  A0000000041010: 'Mastercard Credit/Debit',
  A0000000043060: 'Mastercard Maestro',
  A0000000042203: 'Mastercard US Maestro',
  A0000000031010: 'Visa Credit/Debit',
  A0000000032010: 'Visa Electron',
  A0000000033010: 'Visa Interlink',
  A0000000034010: 'Visa Specific',
  A0000000035010: 'Visa Specific',
  A0000000038010: 'Visa Plus',
  A0000000038002: 'Visa Plus',
  A0000000039010: 'Visa V Pay',
  A000000003101001: 'Visa Credit',
  A000000003101002: 'Visa Debit',
  A000000025010104: 'American Express',
  A000000025010701: 'American Express ExpressPay',
  A0000001523010: 'Discover',
  A0000001524010: 'Discover Common Debit',
  A0000000651010: 'JCB',
  A0000002771010: 'Interac',
  A00000000410101213: 'Mastercard PayPass M/Chip',
  A00000000410101215: 'Mastercard PayPass MStripe',
};

/**
 * EMV command definitions.
 */
const EMV_COMMANDS: CardCommand[] = [
  {
    id: 'select-pse',
    name: 'Select PSE',
    description: 'Select Payment System Environment (contact cards)',
    category: 'Discovery',
  },
  {
    id: 'select-ppse',
    name: 'Select PPSE',
    description: 'Select Proximity PSE (contactless cards)',
    category: 'Discovery',
  },
  {
    id: 'select-application',
    name: 'Select Application',
    description: 'Select an application by AID',
    category: 'Discovery',
    parameters: [
      {
        id: 'aid',
        name: 'Application ID (AID)',
        type: 'hex',
        required: true,
        description: 'The AID to select (e.g., A0000000041010 for Mastercard)',
      },
    ],
  },
  {
    id: 'get-processing-options',
    name: 'Get Processing Options',
    description: 'Initialize transaction and get AFL',
    category: 'Transaction',
  },
  {
    id: 'read-record',
    name: 'Read Record',
    description: 'Read a record from a file',
    category: 'Read',
    parameters: [
      {
        id: 'sfi',
        name: 'Short File Identifier',
        type: 'number',
        required: true,
        defaultValue: 1,
        description: 'SFI (1-30)',
      },
      {
        id: 'record',
        name: 'Record Number',
        type: 'number',
        required: true,
        defaultValue: 1,
        description: 'Record number to read',
      },
    ],
  },
  {
    id: 'get-data',
    name: 'Get Data',
    description: 'Get data object by tag',
    category: 'Read',
    parameters: [
      {
        id: 'tag',
        name: 'Tag',
        type: 'select',
        required: true,
        options: [
          { value: '9F36', label: 'Application Transaction Counter (ATC)' },
          { value: '9F17', label: 'PIN Try Counter' },
          { value: '9F13', label: 'Last Online ATC Register' },
          { value: '9F4F', label: 'Log Format' },
        ],
        description: 'Data object tag to retrieve',
      },
    ],
  },
  {
    id: 'verify-pin',
    name: 'Verify PIN',
    description: 'Verify cardholder PIN (plaintext)',
    category: 'Security',
    requiresConfirmation: true,
    parameters: [
      {
        id: 'pin',
        name: 'PIN',
        type: 'string',
        required: true,
        validation: '^[0-9]{4,12}$',
        description: 'Cardholder PIN (4-12 digits)',
      },
    ],
  },
  {
    id: 'generate-ac',
    name: 'Generate AC',
    description: 'Generate Application Cryptogram',
    category: 'Transaction',
    parameters: [
      {
        id: 'type',
        name: 'Cryptogram Type',
        type: 'select',
        required: true,
        options: [
          { value: '00', label: 'AAC (Application Authentication Cryptogram)' },
          { value: '40', label: 'TC (Transaction Certificate)' },
          { value: '80', label: 'ARQC (Authorization Request Cryptogram)' },
        ],
        description: 'Type of cryptogram to generate',
      },
      {
        id: 'amount',
        name: 'Amount (cents)',
        type: 'number',
        required: false,
        defaultValue: 100,
        description: 'Transaction amount in minor units (e.g., 100 = $1.00)',
      },
      {
        id: 'currency',
        name: 'Currency',
        type: 'select',
        required: false,
        options: [
          { value: '0840', label: 'USD (US Dollar)' },
          { value: '0826', label: 'GBP (British Pound)' },
          { value: '0978', label: 'EUR (Euro)' },
          { value: '0124', label: 'CAD (Canadian Dollar)' },
          { value: '0036', label: 'AUD (Australian Dollar)' },
        ],
        description: 'Transaction currency code',
      },
    ],
  },
  {
    id: 'internal-authenticate',
    name: 'Internal Authenticate',
    description: 'Perform internal authentication',
    category: 'Security',
    parameters: [
      {
        id: 'data',
        name: 'Authentication Data',
        type: 'hex',
        required: true,
        defaultValue: '0102030405060708',
        description: 'Data to authenticate (typically random)',
      },
    ],
  },
  {
    id: 'change-pin',
    name: 'Change PIN',
    description: 'Change cardholder PIN (plaintext)',
    category: 'Security',
    requiresConfirmation: true,
    parameters: [
      {
        id: 'oldPin',
        name: 'Current PIN',
        type: 'string',
        required: true,
        validation: '^[0-9]{4,12}$',
        description: 'Current PIN (4-12 digits)',
      },
      {
        id: 'newPin',
        name: 'New PIN',
        type: 'string',
        required: true,
        validation: '^[0-9]{4,12}$',
        description: 'New PIN (4-12 digits)',
      },
    ],
  },
  {
    id: 'get-processing-options-with-amount',
    name: 'Get Processing Options (with amount)',
    description: 'Initialize transaction with amount and currency',
    category: 'Transaction',
    parameters: [
      {
        id: 'amount',
        name: 'Amount (cents)',
        type: 'number',
        required: true,
        defaultValue: 100,
        description: 'Transaction amount in minor units (e.g., 100 = $1.00)',
      },
      {
        id: 'currency',
        name: 'Currency',
        type: 'select',
        required: true,
        options: [
          { value: '0840', label: 'USD (US Dollar)' },
          { value: '0826', label: 'GBP (British Pound)' },
          { value: '0978', label: 'EUR (Euro)' },
          { value: '0124', label: 'CAD (Canadian Dollar)' },
          { value: '0036', label: 'AUD (Australian Dollar)' },
        ],
        description: 'Transaction currency code',
      },
    ],
  },
];

export class EmvHandler implements CardHandler {
  readonly id = 'emv';
  readonly name = 'EMV Payment Card';
  readonly description = 'Europay, Mastercard, Visa payment cards (contact and contactless)';
  readonly workflow = 'emv' as const;

  private discoveredApplications: ApplicationInfo[] = [];

  async detect(
    atr: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<DetectionResult> {
    // Try to select PSE or PPSE - if either succeeds, it's an EMV card
    try {
      // Try PSE first (contact)
      const pseResponse = await sendCommand(buildSelectPseCommand());
      if (pseResponse.sw1 === 0x90 || pseResponse.sw1 === 0x61) {
        return {
          detected: true,
          confidence: 95,
          cardType: 'EMV Contact Card',
          metadata: { environment: 'pse' },
        };
      }
    } catch {
      // PSE failed, try PPSE
    }

    try {
      // Try PPSE (contactless)
      const ppseResponse = await sendCommand(buildSelectPpseCommand());
      if (ppseResponse.sw1 === 0x90 || ppseResponse.sw1 === 0x61) {
        return {
          detected: true,
          confidence: 95,
          cardType: 'EMV Contactless Card',
          metadata: { environment: 'ppse' },
        };
      }
    } catch {
      // PPSE also failed
    }

    // Check ATR for common EMV patterns
    const atrUpper = atr.toUpperCase();
    if (
      atrUpper.includes('3B') && // Direct convention
      (atrUpper.includes('80') || atrUpper.includes('90'))
    ) {
      return {
        detected: true,
        confidence: 30,
        cardType: 'Possible EMV Card',
      };
    }

    return { detected: false, confidence: 0 };
  }

  getCommands(_metadata?: Record<string, unknown>): CardCommand[] {
    // Return base EMV commands plus any application-specific commands
    const commands = [...EMV_COMMANDS];

    // Add commands for discovered applications
    for (const app of this.discoveredApplications) {
      const appName = KNOWN_AIDS[app.aid.toUpperCase()] || app.label || app.aid;
      commands.push({
        id: `select-app-${app.aid}`,
        name: `Select ${appName}`,
        description: `Select application ${app.aid}`,
        category: 'Applications',
      });
    }

    return commands;
  }

  async executeCommand(commandId: string, context: CommandContext): Promise<Response> {
    const { sendCommand, parameters } = context;

    switch (commandId) {
      case 'select-pse':
        return sendCommand(buildSelectPseCommand());

      case 'select-ppse':
        return sendCommand(buildSelectPpseCommand());

      case 'select-application': {
        const aid = parameters.aid as string;
        return sendCommand(buildSelectCommand(aid));
      }

      case 'get-processing-options':
        return sendCommand(buildGpoCommand());

      case 'read-record': {
        const sfi = parameters.sfi as number;
        const record = parameters.record as number;
        return sendCommand(buildReadRecordCommand(record, sfi));
      }

      case 'get-data': {
        const tag = parameters.tag as string;
        const tagBytes = hexToBytes(tag);
        // GET DATA: 80 CA P1 P2 00
        const p1 = tagBytes.length > 1 ? tagBytes[0] : 0x00;
        const p2 = tagBytes.length > 1 ? tagBytes[1] : tagBytes[0];
        return sendCommand([0x80, 0xca, p1, p2, 0x00]);
      }

      case 'verify-pin': {
        const pin = parameters.pin as string;
        const pinBlock = this.buildPinBlock(pin);
        // VERIFY: 00 20 00 80 08 [PIN block]
        return sendCommand([0x00, 0x20, 0x00, 0x80, 0x08, ...pinBlock]);
      }

      case 'generate-ac': {
        const type = parseInt(parameters.type as string, 16);
        const amount = (parameters.amount as number) ?? 100;
        const currency = parseInt((parameters.currency as string) ?? '0840', 16);
        // GENERATE AC: 80 AE [type] 00 Lc [CDOL data] 00
        // Build proper CDOL1 data with amount, currency, date, etc.
        const cdolData = buildDefaultCdolData({
          amount,
          currencyCode: currency,
        });
        return sendCommand([0x80, 0xae, type, 0x00, cdolData.length, ...cdolData, 0x00]);
      }

      case 'internal-authenticate': {
        const data = hexToBytes(parameters.data as string);
        // INTERNAL AUTHENTICATE: 00 88 00 00 Lc [data] 00
        return sendCommand([0x00, 0x88, 0x00, 0x00, data.length, ...data, 0x00]);
      }

      case 'change-pin': {
        const oldPin = parameters.oldPin as string;
        const newPin = parameters.newPin as string;
        const oldPinBlock = this.buildPinBlock(oldPin);
        const newPinBlock = this.buildPinBlock(newPin);
        // CHANGE REFERENCE DATA: 00 24 00 80 10 [old PIN block] [new PIN block]
        return sendCommand([0x00, 0x24, 0x00, 0x80, 0x10, ...oldPinBlock, ...newPinBlock]);
      }

      case 'get-processing-options-with-amount': {
        const amount = parameters.amount as number;
        const currency = parseInt(parameters.currency as string, 16);
        // Build PDOL data with the provided amount and currency
        // Use a standard set of PDOL entries that most cards accept
        const pdolEntries: DolEntry[] = [
          { tag: 0x9f02, length: 6 }, // Amount
          { tag: 0x9f03, length: 6 }, // Other Amount
          { tag: 0x9f1a, length: 2 }, // Terminal Country Code
          { tag: 0x5f2a, length: 2 }, // Currency Code
          { tag: 0x9a, length: 3 }, // Date
          { tag: 0x9c, length: 1 }, // Type
          { tag: 0x9f37, length: 4 }, // Unpredictable Number
        ];
        const pdolData = buildDefaultPdolData(pdolEntries, {
          amount,
          currencyCode: currency,
        });
        return sendCommand(buildGpoCommandWithPdol(pdolData));
      }

      default:
        // Check for dynamic app selection commands
        if (commandId.startsWith('select-app-')) {
          const aid = commandId.replace('select-app-', '');
          return sendCommand(buildSelectCommand(aid));
        }
        throw new Error(`Unknown command: ${commandId}`);
    }
  }

  async interrogate(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<InterrogationResult> {
    this.discoveredApplications = [];

    try {
      // Step 1: Select PSE or PPSE
      const pseResponse = await this.selectPseOrPpse(sendCommand);
      if (!pseResponse) {
        return { success: false, error: 'Failed to select PSE/PPSE' };
      }

      // Step 2: Discover applications
      await this.discoverApplications(pseResponse, sendCommand);

      // Step 3: Select and read each application
      for (const app of this.discoveredApplications) {
        await this.selectAndReadApplication(app.aid, sendCommand);
      }

      return {
        success: true,
        applications: this.discoveredApplications,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async selectPseOrPpse(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response | null> {
    // Try PSE first
    try {
      const response = await sendCommand(buildSelectPseCommand());
      if (response.sw1 === 0x90 || response.sw1 === 0x61) {
        return response;
      }
    } catch {
      // PSE failed
    }

    // Try PPSE
    try {
      const response = await sendCommand(buildSelectPpseCommand());
      if (response.sw1 === 0x90 || response.sw1 === 0x61) {
        return response;
      }
    } catch {
      // PPSE also failed
    }

    return null;
  }

  private async discoverApplications(
    pseResponse: Response,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<void> {
    // Parse PSE response to find SFI
    const tlvNodes = parseTlv(pseResponse.data);
    const sfiNode = findTag(tlvNodes, 0x88);
    const sfi = sfiNode ? (sfiNode.value as number[])[0] : 1;

    // Read records from the SFI
    for (let record = 1; record <= 10; record++) {
      try {
        const response = await sendCommand(buildReadRecordCommand(record, sfi));

        if (response.sw1 !== 0x90 && response.sw1 !== 0x61) {
          break;
        }

        // Parse record and find Application Templates
        const recordTlv = parseTlv(response.data);
        const appTemplates = findTags(recordTlv, 0x61);

        for (const appTemplate of appTemplates) {
          const aidNode = findTag([appTemplate], 0x4f);
          if (aidNode) {
            const aid = getValueHex(aidNode);
            const labelNode = findTag([appTemplate], 0x50);
            const label = labelNode
              ? String.fromCharCode(...(labelNode.value as number[]))
              : undefined;
            const priorityNode = findTag([appTemplate], 0x87);
            const priority = priorityNode ? (priorityNode.value as number[])[0] : undefined;

            this.discoveredApplications.push({
              aid,
              name: KNOWN_AIDS[aid.toUpperCase()],
              label,
              priority,
              tlv: appTemplate,
            });
          }
        }
      } catch {
        break;
      }
    }
  }

  private async selectAndReadApplication(
    aid: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<void> {
    // Select the application
    const selectResponse = await sendCommand(buildSelectCommand(aid));
    if (selectResponse.sw1 !== 0x90 && selectResponse.sw1 !== 0x61) {
      return;
    }

    // Get Processing Options
    try {
      const gpoResponse = await sendCommand(buildGpoCommand());
      if (gpoResponse.sw1 === 0x90 || gpoResponse.sw1 === 0x61) {
        // Parse AFL and read records
        const gpoTlv = parseTlv(gpoResponse.data);
        await this.readRecordsFromAfl(gpoTlv, sendCommand);
      }
    } catch {
      // GPO failed, try reading default records
      await this.readDefaultRecords(sendCommand);
    }
  }

  private async readRecordsFromAfl(
    gpoTlv: TlvNode[],
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<void> {
    // AFL can be in tag 94 or as raw bytes in template 80
    const aflNode = findTag(gpoTlv, 0x94);
    let aflBytes: number[] = [];

    if (aflNode) {
      aflBytes = aflNode.value as number[];
    } else {
      const format1 = findTag(gpoTlv, 0x80);
      if (format1) {
        const data = format1.value as number[];
        if (data.length > 2) {
          aflBytes = data.slice(2);
        }
      }
    }

    if (aflBytes.length === 0) {
      await this.readDefaultRecords(sendCommand);
      return;
    }

    const aflEntries = parseAfl(aflBytes);
    for (const entry of aflEntries) {
      for (let record = entry.firstRecord; record <= entry.lastRecord; record++) {
        try {
          await sendCommand(buildReadRecordCommand(record, entry.sfi));
        } catch {
          break;
        }
      }
    }
  }

  private async readDefaultRecords(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<void> {
    for (let sfi = 1; sfi <= 3; sfi++) {
      for (let record = 1; record <= 5; record++) {
        try {
          const response = await sendCommand(buildReadRecordCommand(record, sfi));
          if (response.sw1 !== 0x90 && response.sw1 !== 0x61) {
            break;
          }
        } catch {
          break;
        }
      }
    }
  }

  private buildPinBlock(pin: string): number[] {
    // ISO 9564-1 Format 2 PIN block
    const pinLen = pin.length;
    const block: number[] = [0x20 | pinLen];

    // Add PIN digits (2 per byte)
    for (let i = 0; i < 14; i += 2) {
      const d1 = i < pin.length ? parseInt(pin[i], 10) : 0xf;
      const d2 = i + 1 < pin.length ? parseInt(pin[i + 1], 10) : 0xf;
      block.push((d1 << 4) | d2);
    }

    return block;
  }
}
