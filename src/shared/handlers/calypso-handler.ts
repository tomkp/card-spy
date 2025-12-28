/**
 * Calypso Transport Card handler.
 * Supports reading data from Calypso-based transport cards.
 *
 * Calypso is used in many European transport systems:
 * - Paris (Navigo)
 * - Brussels (MOBIB)
 * - Lisbon (Viva Viagem)
 * - Porto (Andante)
 * - Various French cities
 *
 * References:
 * - Calypso Basic Specification
 * - EN 1545 (Transport data elements)
 */

import type { Response } from '../types';
import type {
  CardHandler,
  CardCommand,
  CommandContext,
  DetectionResult,
  InterrogationResult,
  ApplicationInfo,
} from './types';

/**
 * Calypso Application Identifiers.
 */
const CALYPSO_AIDS = {
  // Intercode (French standard)
  INTERCODE_1: '315449432E494341',
  INTERCODE_2: '315449432E49434132',
  // Navigo (Paris)
  NAVIGO: 'A00000000404',
  NAVIGO_IDF: 'A0000004040125',
  // Generic Calypso
  CALYPSO: '315449432E494341',
  CALYPSO_REV3: 'A000000291',
  // MOBIB (Brussels)
  MOBIB: 'A00000000401',
  // Intercode 2.2
  INTERCODE_22: '315449432E49434132',
};

/**
 * Known Calypso AIDs with descriptions.
 */
const KNOWN_AIDS: Record<string, string> = {
  '315449432E494341': 'Calypso Intercode',
  '315449432E49434132': 'Calypso Intercode 2',
  A00000000404: 'Navigo',
  A0000004040125: 'Navigo IDF',
  A00000000401: 'MOBIB Brussels',
  A000000291: 'Calypso Rev3',
  '1TIC.ICA': 'Calypso Intercode',
  A0000004040001: 'Navigo Environment',
};

/**
 * Calypso file structure (common files).
 */
const CALYPSO_FILES = {
  // Environment and Holder
  ENVIRONMENT: { sfi: 0x07, lid: 0x2001 },
  HOLDER: { sfi: 0x08, lid: 0x2002 },
  HOLDER_EXTENDED: { sfi: 0x09, lid: 0x2003 },

  // Contracts
  CONTRACTS: { sfi: 0x09, lid: 0x2020 },
  CONTRACT_1: { sfi: 0x09, lid: 0x2050 },
  CONTRACT_2: { sfi: 0x0a, lid: 0x2051 },
  CONTRACT_3: { sfi: 0x0b, lid: 0x2052 },
  CONTRACT_4: { sfi: 0x0c, lid: 0x2053 },

  // Event logs
  EVENTS: { sfi: 0x08, lid: 0x2010 },
  EVENT_LOG: { sfi: 0x08, lid: 0x2040 },

  // Special event logs
  SPECIAL_EVENTS: { sfi: 0x1d, lid: 0x2060 },

  // Counters
  COUNTERS: { sfi: 0x19, lid: 0x202A },
  COUNTER_1: { sfi: 0x19, lid: 0x202B },
};

/**
 * Calypso command definitions.
 */
const CALYPSO_COMMANDS: CardCommand[] = [
  {
    id: 'select-app',
    name: 'Select Application',
    description: 'Select the Calypso application',
    category: 'Selection',
  },
  {
    id: 'select-aid',
    name: 'Select by AID',
    description: 'Select application by AID',
    category: 'Selection',
    parameters: [
      {
        id: 'aid',
        name: 'Application ID',
        type: 'hex',
        required: true,
        description: 'Calypso AID to select',
      },
    ],
  },
  {
    id: 'read-environment',
    name: 'Read Environment',
    description: 'Read card environment (issuer info)',
    category: 'Read',
  },
  {
    id: 'read-holder',
    name: 'Read Holder',
    description: 'Read cardholder information',
    category: 'Read',
  },
  {
    id: 'read-contracts',
    name: 'Read Contracts',
    description: 'Read all transport contracts',
    category: 'Read',
  },
  {
    id: 'read-events',
    name: 'Read Event Log',
    description: 'Read travel event history',
    category: 'Read',
  },
  {
    id: 'read-counters',
    name: 'Read Counters',
    description: 'Read usage counters',
    category: 'Read',
  },
  {
    id: 'get-challenge',
    name: 'Get Challenge',
    description: 'Get random challenge from card',
    category: 'Security',
  },
  {
    id: 'read-record',
    name: 'Read Record',
    description: 'Read a specific record from a file',
    category: 'Advanced',
    parameters: [
      {
        id: 'sfi',
        name: 'SFI',
        type: 'number',
        required: true,
        defaultValue: 7,
        description: 'Short File Identifier (1-30)',
      },
      {
        id: 'record',
        name: 'Record Number',
        type: 'number',
        required: true,
        defaultValue: 1,
        description: 'Record number (1-255)',
      },
    ],
  },
  {
    id: 'select-file',
    name: 'Select File',
    description: 'Select a file by LID',
    category: 'Advanced',
    parameters: [
      {
        id: 'lid',
        name: 'LID',
        type: 'hex',
        required: true,
        description: 'Logical file identifier (2 bytes)',
      },
    ],
  },
  {
    id: 'get-data',
    name: 'Get Data',
    description: 'Read specific data object',
    category: 'Advanced',
    parameters: [
      {
        id: 'tag',
        name: 'Tag',
        type: 'select',
        required: true,
        options: [
          { value: 'DF05', label: 'Card Serial Number' },
          { value: 'DF2D', label: 'Startup Info' },
          { value: '9F7F', label: 'Card Production Info' },
        ],
        description: 'Data object to retrieve',
      },
    ],
  },
];

export class CalypsoHandler implements CardHandler {
  readonly id = 'calypso';
  readonly name = 'Calypso Transport';
  readonly description = 'Calypso transport cards (Navigo, MOBIB, etc.)';

  private selectedAid: string = '';
  private discoveredApplications: ApplicationInfo[] = [];

  async detect(
    atr: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<DetectionResult> {
    const atrUpper = atr.toUpperCase().replace(/\s/g, '');

    // Calypso ATR patterns
    const calypsoPatterns = [
      /^3B8F80/, // Calypso standard
      /^3B8E80/, // Calypso variant
      /^3B6F/, // Calypso contactless
      /^3B8[0-9A-F]8001/, // Common Calypso prefix
    ];

    const isCalypsoAtr = calypsoPatterns.some((p) => p.test(atrUpper));

    // Try to select known Calypso applications
    const aidsToTry = [
      CALYPSO_AIDS.INTERCODE_1,
      CALYPSO_AIDS.NAVIGO,
      CALYPSO_AIDS.NAVIGO_IDF,
      CALYPSO_AIDS.MOBIB,
      CALYPSO_AIDS.CALYPSO_REV3,
    ];

    for (const aid of aidsToTry) {
      try {
        const response = await this.selectApplication(sendCommand, aid);
        if (this.isSuccess(response)) {
          this.selectedAid = aid;
          const appName = KNOWN_AIDS[aid.toUpperCase()] || 'Calypso Application';
          return {
            detected: true,
            confidence: 95,
            cardType: appName,
            metadata: {
              aid,
              appName,
            },
          };
        }
      } catch {
        // Try next AID
      }
    }

    // Try generic selection by DF name (Intercode ASCII)
    try {
      const intercodeAscii = this.stringToHex('1TIC.ICA');
      const response = await this.selectApplication(sendCommand, intercodeAscii);
      if (this.isSuccess(response)) {
        this.selectedAid = intercodeAscii;
        return {
          detected: true,
          confidence: 90,
          cardType: 'Calypso Intercode',
        };
      }
    } catch {
      // Selection failed
    }

    if (isCalypsoAtr) {
      return {
        detected: true,
        confidence: 60,
        cardType: 'Possible Calypso Card',
      };
    }

    return { detected: false, confidence: 0 };
  }

  getCommands(_metadata?: Record<string, unknown>): CardCommand[] {
    const commands = [...CALYPSO_COMMANDS];

    // Add quick-select for discovered applications
    for (const app of this.discoveredApplications) {
      commands.push({
        id: `quick-select-${app.aid}`,
        name: `Select ${app.name}`,
        description: `Select application ${app.aid}`,
        category: 'Applications',
      });
    }

    return commands;
  }

  async executeCommand(commandId: string, context: CommandContext): Promise<Response> {
    const { sendCommand, parameters } = context;

    switch (commandId) {
      case 'select-app':
        if (this.selectedAid) {
          return this.selectApplication(sendCommand, this.selectedAid);
        }
        // Try default Intercode
        return this.selectApplication(sendCommand, CALYPSO_AIDS.INTERCODE_1);

      case 'select-aid': {
        const aid = parameters.aid as string;
        return this.selectApplication(sendCommand, aid);
      }

      case 'read-environment':
        return this.readRecord(sendCommand, CALYPSO_FILES.ENVIRONMENT.sfi, 1);

      case 'read-holder':
        return this.readRecord(sendCommand, CALYPSO_FILES.HOLDER.sfi, 1);

      case 'read-contracts':
        return this.readContracts(sendCommand);

      case 'read-events':
        return this.readEvents(sendCommand);

      case 'read-counters':
        return this.readRecord(sendCommand, CALYPSO_FILES.COUNTERS.sfi, 1);

      case 'get-challenge':
        return this.getChallenge(sendCommand);

      case 'read-record': {
        const sfi = parameters.sfi as number;
        const record = parameters.record as number;
        return this.readRecord(sendCommand, sfi, record);
      }

      case 'select-file': {
        const lid = parameters.lid as string;
        return this.selectFile(sendCommand, lid);
      }

      case 'get-data': {
        const tag = parameters.tag as string;
        return this.getData(sendCommand, tag);
      }

      default:
        if (commandId.startsWith('quick-select-')) {
          const aid = commandId.replace('quick-select-', '');
          return this.selectApplication(sendCommand, aid);
        }
        throw new Error(`Unknown command: ${commandId}`);
    }
  }

  async interrogate(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<InterrogationResult> {
    this.discoveredApplications = [];

    try {
      // Step 1: Try to select Calypso application
      const aidsToTry = [
        CALYPSO_AIDS.INTERCODE_1,
        CALYPSO_AIDS.NAVIGO,
        CALYPSO_AIDS.NAVIGO_IDF,
        CALYPSO_AIDS.MOBIB,
      ];

      let selectedApp: ApplicationInfo | null = null;

      for (const aid of aidsToTry) {
        const response = await this.selectApplication(sendCommand, aid);
        if (this.isSuccess(response)) {
          this.selectedAid = aid;
          selectedApp = {
            aid,
            name: KNOWN_AIDS[aid.toUpperCase()] || 'Calypso Application',
          };
          this.discoveredApplications.push(selectedApp);
          break;
        }
      }

      if (!selectedApp) {
        return {
          success: false,
          error: 'No Calypso application found',
        };
      }

      // Step 2: Read environment (always available)
      const envResponse = await this.readRecord(
        sendCommand,
        CALYPSO_FILES.ENVIRONMENT.sfi,
        1
      );
      if (this.isSuccess(envResponse) && envResponse.data.length > 0) {
        const envInfo = this.parseEnvironment(envResponse.data);
        this.discoveredApplications.push({
          aid: 'ENV',
          name: 'Environment',
          label: envInfo,
        });
      }

      // Step 3: Read holder
      const holderResponse = await this.readRecord(
        sendCommand,
        CALYPSO_FILES.HOLDER.sfi,
        1
      );
      if (this.isSuccess(holderResponse) && holderResponse.data.length > 0) {
        this.discoveredApplications.push({
          aid: 'HOLDER',
          name: 'Cardholder',
          label: 'Holder data present',
        });
      }

      // Step 4: Count contracts
      let contractCount = 0;
      for (let i = 1; i <= 4; i++) {
        const contractResponse = await this.readRecord(
          sendCommand,
          CALYPSO_FILES.CONTRACT_1.sfi + i - 1,
          1
        );
        if (this.isSuccess(contractResponse) && this.hasData(contractResponse.data)) {
          contractCount++;
        }
      }

      if (contractCount > 0) {
        this.discoveredApplications.push({
          aid: 'CONTRACTS',
          name: 'Contracts',
          label: `${contractCount} contract(s) found`,
        });
      }

      // Step 5: Count events
      let eventCount = 0;
      for (let i = 1; i <= 3; i++) {
        const eventResponse = await this.readRecord(
          sendCommand,
          CALYPSO_FILES.EVENT_LOG.sfi,
          i
        );
        if (this.isSuccess(eventResponse) && this.hasData(eventResponse.data)) {
          eventCount++;
        }
      }

      if (eventCount > 0) {
        this.discoveredApplications.push({
          aid: 'EVENTS',
          name: 'Event Log',
          label: `${eventCount}+ events`,
        });
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

  // Command implementations

  private async selectApplication(
    sendCommand: (apdu: number[]) => Promise<Response>,
    aid: string
  ): Promise<Response> {
    const aidBytes = this.hexToBytes(aid);
    // SELECT by DF name: 94 A4 04 00 Lc [AID]
    // Calypso uses CLA=0x94 for Rev 1/2, CLA=0x00 for Rev 3
    let apdu = [0x94, 0xa4, 0x04, 0x00, aidBytes.length, ...aidBytes];
    let response = await sendCommand(apdu);

    // If failed with 0x94, try with 0x00
    if (!this.isSuccess(response)) {
      apdu = [0x00, 0xa4, 0x04, 0x00, aidBytes.length, ...aidBytes, 0x00];
      response = await sendCommand(apdu);
    }

    return this.handleGetResponse(sendCommand, response);
  }

  private async readRecord(
    sendCommand: (apdu: number[]) => Promise<Response>,
    sfi: number,
    record: number
  ): Promise<Response> {
    // READ RECORD: 94 B2 [record] [P2] 00
    // P2 = (SFI << 3) | 0x04 (read record by record number)
    const p2 = (sfi << 3) | 0x04;
    const apdu = [0x94, 0xb2, record, p2, 0x00];
    const response = await sendCommand(apdu);
    return this.handleGetResponse(sendCommand, response);
  }

  private async selectFile(
    sendCommand: (apdu: number[]) => Promise<Response>,
    lid: string
  ): Promise<Response> {
    const lidBytes = this.hexToBytes(lid);
    // SELECT by LID: 94 A4 09 00 02 [LID]
    const apdu = [0x94, 0xa4, 0x09, 0x00, 0x02, ...lidBytes];
    return sendCommand(apdu);
  }

  private async getData(
    sendCommand: (apdu: number[]) => Promise<Response>,
    tag: string
  ): Promise<Response> {
    const tagBytes = this.hexToBytes(tag);
    // GET DATA: 94 CA [P1] [P2] 00
    const p1 = tagBytes.length > 1 ? tagBytes[0] : 0x00;
    const p2 = tagBytes.length > 1 ? tagBytes[1] : tagBytes[0];
    const apdu = [0x94, 0xca, p1, p2, 0x00];
    const response = await sendCommand(apdu);
    return this.handleGetResponse(sendCommand, response);
  }

  private async getChallenge(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    // GET CHALLENGE: 94 84 00 00 08
    const apdu = [0x94, 0x84, 0x00, 0x00, 0x08];
    return sendCommand(apdu);
  }

  private async readContracts(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    const allData: number[] = [];

    // Read up to 4 contracts
    for (let i = 0; i < 4; i++) {
      const sfi = CALYPSO_FILES.CONTRACT_1.sfi + i;
      const response = await this.readRecord(sendCommand, sfi, 1);
      if (this.isSuccess(response)) {
        allData.push(...response.data);
      }
    }

    return {
      id: `contracts-${Date.now()}`,
      timestamp: Date.now(),
      data: allData,
      sw1: 0x90,
      sw2: 0x00,
      hex: this.bytesToHex(allData),
    };
  }

  private async readEvents(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    const allData: number[] = [];

    // Read event log (typically 3 records)
    for (let i = 1; i <= 3; i++) {
      const response = await this.readRecord(
        sendCommand,
        CALYPSO_FILES.EVENT_LOG.sfi,
        i
      );
      if (this.isSuccess(response)) {
        allData.push(...response.data);
      }
    }

    return {
      id: `events-${Date.now()}`,
      timestamp: Date.now(),
      data: allData,
      sw1: 0x90,
      sw2: 0x00,
      hex: this.bytesToHex(allData),
    };
  }

  // Helper methods

  private async handleGetResponse(
    sendCommand: (apdu: number[]) => Promise<Response>,
    response: Response
  ): Promise<Response> {
    if (response.sw1 === 0x61) {
      // More data available
      const getResponseApdu = [0x94, 0xc0, 0x00, 0x00, response.sw2];
      return sendCommand(getResponseApdu);
    }
    if (response.sw1 === 0x6c) {
      // Wrong Le, retry with correct length
      // Would need to know original command to retry
    }
    return response;
  }

  private parseEnvironment(data: number[]): string {
    if (data.length < 6) return 'Unknown';

    // Environment structure varies by implementation
    // Common fields: network ID, version, validity dates

    // First byte often contains version info
    const version = data[0];

    // Try to extract network/operator ID (typically bytes 1-3)
    const networkId = this.bytesToHex(data.slice(1, 4));

    return `v${version}, Network: ${networkId}`;
  }

  private hasData(data: number[]): boolean {
    // Check if data contains meaningful content (not all zeros or FFs)
    if (data.length === 0) return false;
    const allZeros = data.every((b) => b === 0x00);
    const allFfs = data.every((b) => b === 0xff);
    return !allZeros && !allFfs;
  }

  private isSuccess(response: Response): boolean {
    return (
      (response.sw1 === 0x90 && response.sw2 === 0x00) ||
      response.sw1 === 0x61 || // More data
      response.sw1 === 0x62 || // Warning (data may be invalid)
      (response.sw1 === 0x9f) // Calypso-specific success with length
    );
  }

  private stringToHex(str: string): string {
    return str
      .split('')
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('');
  }

  private hexToBytes(hex: string): number[] {
    const clean = hex.replace(/\s/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < clean.length; i += 2) {
      bytes.push(parseInt(clean.substring(i, i + 2), 16));
    }
    return bytes;
  }

  private bytesToHex(bytes: number[]): string {
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
}
