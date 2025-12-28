/**
 * JavaCard / GlobalPlatform handler.
 * Supports discovery and management of JavaCard applications.
 *
 * References:
 * - GlobalPlatform Card Specification v2.3
 * - ISO 7816-4 (Smart card commands)
 */

import type { Response } from '../types';
import { hexToBytes, bytesToHex } from '../tlv';
import type {
  CardHandler,
  CardCommand,
  CommandContext,
  DetectionResult,
  InterrogationResult,
  ApplicationInfo,
} from './types';

/**
 * GlobalPlatform class byte.
 */
const CLA_GP = 0x80;

/**
 * ISO 7816-4 class byte.
 */
const CLA_ISO = 0x00;

/**
 * GlobalPlatform instructions.
 */
const INS = {
  SELECT: 0xa4,
  GET_STATUS: 0xf2,
  GET_DATA: 0xca,
  INSTALL: 0xe6,
  DELETE: 0xe4,
  LOAD: 0xe8,
  PUT_KEY: 0xd8,
  STORE_DATA: 0xe2,
  INITIALIZE_UPDATE: 0x50,
  EXTERNAL_AUTHENTICATE: 0x82,
  GET_RESPONSE: 0xc0,
};

/**
 * GET STATUS P1 values (search qualifiers).
 */
const GET_STATUS_P1 = {
  ISD: 0x80, // Issuer Security Domain
  APPS: 0x40, // Executable Load Files (applications)
  APPS_AND_MODULES: 0x20, // Apps and their modules
  APPS_AND_SD: 0x10, // Apps and Security Domains
};

/**
 * Application life cycle states.
 */
const LIFECYCLE_STATE: Record<number, string> = {
  0x01: 'LOADED',
  0x03: 'INSTALLED',
  0x07: 'SELECTABLE',
  0x0f: 'PERSONALIZED',
  0x7f: 'LOCKED',
  0x83: 'LOCKED',
  0x87: 'LOCKED',
  0xff: 'TERMINATED',
};

/**
 * Known JavaCard / GlobalPlatform AIDs.
 */
const KNOWN_AIDS: Record<string, string> = {
  // Card managers / Security domains
  A000000003000000: 'Visa GlobalPlatform',
  A0000000030000: 'GlobalPlatform ISD',
  A000000151000000: 'GlobalPlatform ISD',
  A0000001510000: 'GlobalPlatform ISD',

  // JCOP
  D276000085304A434F5034: 'NXP JCOP4',
  D276000085304A434F5033: 'NXP JCOP3',
  D276000085: 'NXP JCOP',

  // Common applets
  A0000000048002: 'Mastercard SecureCode',
  A0000000041010: 'Mastercard',
  A0000000031010: 'Visa',
  A000000308: 'PIV',
  D27600012401: 'OpenPGP',
  A0000006472F0001: 'FIDO',
};

/**
 * JavaCard command definitions.
 */
const JAVACARD_COMMANDS: CardCommand[] = [
  {
    id: 'get-isd',
    name: 'Get Card Manager (ISD)',
    description: 'Get Issuer Security Domain info',
    category: 'Discovery',
  },
  {
    id: 'list-apps',
    name: 'List Applications',
    description: 'List all installed applications',
    category: 'Discovery',
  },
  {
    id: 'list-packages',
    name: 'List Packages',
    description: 'List executable load files and modules',
    category: 'Discovery',
  },
  {
    id: 'select-isd',
    name: 'Select Card Manager',
    description: 'Select the Issuer Security Domain',
    category: 'Selection',
  },
  {
    id: 'select-app',
    name: 'Select Application',
    description: 'Select an application by AID',
    category: 'Selection',
    parameters: [
      {
        id: 'aid',
        name: 'Application ID',
        type: 'hex',
        required: true,
        description: 'AID of the application to select',
      },
    ],
  },
  {
    id: 'get-cplc',
    name: 'Get CPLC Data',
    description: 'Read Card Production Life Cycle data',
    category: 'Information',
  },
  {
    id: 'get-key-info',
    name: 'Get Key Information',
    description: 'Read key template information',
    category: 'Security',
  },
  {
    id: 'get-card-data',
    name: 'Get Card Data',
    description: 'Read card recognition data',
    category: 'Information',
  },
  {
    id: 'get-isd-sequence',
    name: 'Get Sequence Counter',
    description: 'Read ISD sequence counter',
    category: 'Security',
  },
  {
    id: 'initialize-update',
    name: 'Initialize Update',
    description: 'Start secure channel (requires key knowledge)',
    category: 'Security',
    requiresConfirmation: true,
    parameters: [
      {
        id: 'keyVersion',
        name: 'Key Version',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: 'Key version number (0 = any)',
      },
      {
        id: 'keyId',
        name: 'Key ID',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: 'Key identifier (0 = any)',
      },
    ],
  },
];

/**
 * CPLC field definitions.
 */
const CPLC_FIELDS = [
  { name: 'IC Fabricator', offset: 0, length: 2 },
  { name: 'IC Type', offset: 2, length: 2 },
  { name: 'OS ID', offset: 4, length: 2 },
  { name: 'OS Release Date', offset: 6, length: 2 },
  { name: 'OS Release Level', offset: 8, length: 2 },
  { name: 'IC Fab Date', offset: 10, length: 2 },
  { name: 'IC Serial', offset: 12, length: 4 },
  { name: 'IC Batch', offset: 16, length: 2 },
  { name: 'IC Module Fab', offset: 18, length: 2 },
  { name: 'IC Module Pack Date', offset: 20, length: 2 },
  { name: 'ICC Manufacturer', offset: 22, length: 2 },
  { name: 'IC Embedding Date', offset: 24, length: 2 },
  { name: 'IC Pre-Personalizer', offset: 26, length: 2 },
  { name: 'IC Pre-Personalization Date', offset: 28, length: 2 },
  { name: 'IC Pre-Personalization Equipment', offset: 30, length: 4 },
  { name: 'IC Personalizer', offset: 34, length: 2 },
  { name: 'IC Personalization Date', offset: 36, length: 2 },
  { name: 'IC Personalization Equipment', offset: 38, length: 4 },
];

export class JavaCardHandler implements CardHandler {
  readonly id = 'javacard';
  readonly name = 'JavaCard';
  readonly description = 'JavaCard and GlobalPlatform smart cards';

  private discoveredApplications: ApplicationInfo[] = [];
  private isdAid: string = '';

  async detect(
    atr: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<DetectionResult> {
    const atrUpper = atr.toUpperCase().replace(/\s/g, '');

    // Check ATR patterns for JavaCards
    const javaCardPatterns = [
      /4A434F50/, // "JCOP" in hex
      /4A617661/, // "Java" in hex
      /^3BF[89]/, // Common JCOP ATR prefix
      /^3B[6-9A-F][89A-F]/, // T=1 cards (common for JavaCard)
    ];

    const isJavaCardAtr = javaCardPatterns.some((p) => p.test(atrUpper));

    // Try to select the Card Manager / ISD
    const isdAids = [
      'A000000003000000', // Visa GP
      'A0000000030000', // GP short
      'A000000151000000', // GP alternate
      'A0000001510000', // GP alternate short
    ];

    for (const aid of isdAids) {
      try {
        const response = await this.selectApplication(sendCommand, aid);
        if (this.isSuccess(response)) {
          this.isdAid = aid;
          return {
            detected: true,
            confidence: 95,
            cardType: 'GlobalPlatform JavaCard',
            metadata: {
              isdAid: aid,
              isdName: KNOWN_AIDS[aid.toUpperCase()] || 'Card Manager',
            },
          };
        }
      } catch {
        // Try next AID
      }
    }

    // Try GET STATUS without selecting ISD first (some cards support this)
    try {
      const statusResponse = await this.getStatus(sendCommand, GET_STATUS_P1.ISD);
      if (this.isSuccess(statusResponse) && statusResponse.data.length > 0) {
        return {
          detected: true,
          confidence: 90,
          cardType: 'GlobalPlatform JavaCard',
        };
      }
    } catch {
      // GET STATUS failed
    }

    // Check for JCOP-specific patterns in ATR
    if (atrUpper.includes('4A434F50')) {
      return {
        detected: true,
        confidence: 80,
        cardType: 'NXP JCOP Card',
      };
    }

    if (isJavaCardAtr) {
      return {
        detected: true,
        confidence: 40,
        cardType: 'Possible JavaCard',
      };
    }

    return { detected: false, confidence: 0 };
  }

  getCommands(_metadata?: Record<string, unknown>): CardCommand[] {
    const commands = [...JAVACARD_COMMANDS];

    // Add quick-select commands for discovered applications
    for (const app of this.discoveredApplications) {
      const appName = app.name || `App ${app.aid}`;
      commands.push({
        id: `quick-select-${app.aid}`,
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
      case 'get-isd':
        return this.getStatus(sendCommand, GET_STATUS_P1.ISD);

      case 'list-apps':
        return this.getStatus(sendCommand, GET_STATUS_P1.APPS);

      case 'list-packages':
        return this.getStatus(sendCommand, GET_STATUS_P1.APPS_AND_MODULES);

      case 'select-isd':
        if (this.isdAid) {
          return this.selectApplication(sendCommand, this.isdAid);
        }
        // Try default ISD AIDs
        for (const aid of ['A000000003000000', 'A000000151000000']) {
          const response = await this.selectApplication(sendCommand, aid);
          if (this.isSuccess(response)) {
            this.isdAid = aid;
            return response;
          }
        }
        return this.selectApplication(sendCommand, 'A000000003000000');

      case 'select-app': {
        const aid = parameters.aid as string;
        return this.selectApplication(sendCommand, aid);
      }

      case 'get-cplc':
        return this.getCplc(sendCommand);

      case 'get-key-info':
        return this.getKeyInfo(sendCommand);

      case 'get-card-data':
        return this.getCardData(sendCommand);

      case 'get-isd-sequence':
        return this.getSequenceCounter(sendCommand);

      case 'initialize-update': {
        const keyVersion = (parameters.keyVersion as number) || 0;
        const keyId = (parameters.keyId as number) || 0;
        return this.initializeUpdate(sendCommand, keyVersion, keyId);
      }

      default:
        // Check for quick-select commands
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
      // Step 1: Try to select ISD
      const isdAids = ['A000000003000000', 'A0000000030000', 'A000000151000000'];
      let isdSelected = false;

      for (const aid of isdAids) {
        const response = await this.selectApplication(sendCommand, aid);
        if (this.isSuccess(response)) {
          this.isdAid = aid;
          isdSelected = true;
          this.discoveredApplications.push({
            aid,
            name: KNOWN_AIDS[aid.toUpperCase()] || 'Card Manager (ISD)',
            label: 'Issuer Security Domain',
          });
          break;
        }
      }

      if (!isdSelected) {
        // Try without selecting ISD
      }

      // Step 2: Get installed applications
      const appsResponse = await this.getStatus(sendCommand, GET_STATUS_P1.APPS);
      if (this.isSuccess(appsResponse) && appsResponse.data.length > 0) {
        const apps = this.parseGetStatusResponse(appsResponse.data);
        for (const app of apps) {
          if (!this.discoveredApplications.find((a) => a.aid === app.aid)) {
            this.discoveredApplications.push(app);
          }
        }
      }

      // Step 3: Get packages/modules
      const packagesResponse = await this.getStatus(
        sendCommand,
        GET_STATUS_P1.APPS_AND_MODULES
      );
      if (this.isSuccess(packagesResponse) && packagesResponse.data.length > 0) {
        const packages = this.parseGetStatusResponse(packagesResponse.data);
        for (const pkg of packages) {
          if (!this.discoveredApplications.find((a) => a.aid === pkg.aid)) {
            this.discoveredApplications.push(pkg);
          }
        }
      }

      // Step 4: Try to read CPLC
      const cplcResponse = await this.getCplc(sendCommand);
      if (this.isSuccess(cplcResponse) && cplcResponse.data.length > 0) {
        // CPLC data available - could parse and store
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
    const aidBytes = hexToBytes(aid);
    // SELECT by DF name: 00 A4 04 00 Lc [AID] 00
    const apdu = [CLA_ISO, INS.SELECT, 0x04, 0x00, aidBytes.length, ...aidBytes, 0x00];
    const response = await sendCommand(apdu);
    return this.handleGetResponse(sendCommand, response);
  }

  private async getStatus(
    sendCommand: (apdu: number[]) => Promise<Response>,
    p1: number
  ): Promise<Response> {
    // GET STATUS: 80 F2 [P1] 02 02 4F00 00
    // P2=02 means return TLV format
    const apdu = [CLA_GP, INS.GET_STATUS, p1, 0x02, 0x02, 0x4f, 0x00, 0x00];
    let response = await sendCommand(apdu);
    response = await this.handleGetResponse(sendCommand, response);

    // Handle multi-block responses (SW=6310)
    let allData = [...response.data];
    while (response.sw1 === 0x63 && response.sw2 === 0x10) {
      // More data available, use P2=01 for next block
      const nextApdu = [CLA_GP, INS.GET_STATUS, p1, 0x01, 0x02, 0x4f, 0x00, 0x00];
      response = await sendCommand(nextApdu);
      response = await this.handleGetResponse(sendCommand, response);
      allData = [...allData, ...response.data];
    }

    return {
      ...response,
      data: allData,
    };
  }

  private async getCplc(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    // GET DATA [CPLC]: 80 CA 9F 7F 00
    const apdu = [CLA_GP, INS.GET_DATA, 0x9f, 0x7f, 0x00];
    const response = await sendCommand(apdu);
    return this.handleGetResponse(sendCommand, response);
  }

  private async getKeyInfo(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    // GET DATA [Key Template]: 80 CA 00 E0 00
    const apdu = [CLA_GP, INS.GET_DATA, 0x00, 0xe0, 0x00];
    const response = await sendCommand(apdu);
    return this.handleGetResponse(sendCommand, response);
  }

  private async getCardData(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    // GET DATA [Card Recognition Data]: 80 CA 00 66 00
    const apdu = [CLA_GP, INS.GET_DATA, 0x00, 0x66, 0x00];
    const response = await sendCommand(apdu);
    return this.handleGetResponse(sendCommand, response);
  }

  private async getSequenceCounter(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    // GET DATA [Sequence Counter]: 80 CA 00 C1 00
    const apdu = [CLA_GP, INS.GET_DATA, 0x00, 0xc1, 0x00];
    const response = await sendCommand(apdu);
    return this.handleGetResponse(sendCommand, response);
  }

  private async initializeUpdate(
    sendCommand: (apdu: number[]) => Promise<Response>,
    keyVersion: number,
    keyId: number
  ): Promise<Response> {
    // Generate 8 random bytes for host challenge
    const hostChallenge = new Array(8).fill(0).map(() => Math.floor(Math.random() * 256));

    // INITIALIZE UPDATE: 80 50 [keyVersion] [keyId] 08 [hostChallenge] 00
    const apdu = [
      CLA_GP,
      INS.INITIALIZE_UPDATE,
      keyVersion,
      keyId,
      0x08,
      ...hostChallenge,
      0x00,
    ];
    const response = await sendCommand(apdu);
    return this.handleGetResponse(sendCommand, response);
  }

  // Helper methods

  private async handleGetResponse(
    sendCommand: (apdu: number[]) => Promise<Response>,
    response: Response
  ): Promise<Response> {
    if (response.sw1 === 0x61) {
      // More data available
      const getResponseApdu = [CLA_ISO, INS.GET_RESPONSE, 0x00, 0x00, response.sw2];
      return sendCommand(getResponseApdu);
    }
    return response;
  }

  private parseGetStatusResponse(data: number[]): ApplicationInfo[] {
    const applications: ApplicationInfo[] = [];
    let offset = 0;

    while (offset < data.length) {
      // Each entry starts with tag E3 (application template)
      if (data[offset] !== 0xe3) {
        break;
      }

      const templateLength = data[offset + 1];
      if (offset + 2 + templateLength > data.length) {
        break;
      }

      const templateData = data.slice(offset + 2, offset + 2 + templateLength);
      const app = this.parseApplicationTemplate(templateData);
      if (app) {
        applications.push(app);
      }

      offset += 2 + templateLength;
    }

    return applications;
  }

  private parseApplicationTemplate(data: number[]): ApplicationInfo | null {
    let offset = 0;
    let aid = '';
    let lifecycle = 0;
    let privileges = 0;

    while (offset < data.length - 1) {
      const tag = data[offset];
      const len = data[offset + 1];

      if (offset + 2 + len > data.length) break;

      const value = data.slice(offset + 2, offset + 2 + len);

      switch (tag) {
        case 0x4f: // AID
          aid = bytesToHex(value);
          break;
        case 0x9f70: // Life Cycle State (2-byte tag)
          // Handle 2-byte tag
          if (data[offset] === 0x9f && data[offset + 1] === 0x70) {
            lifecycle = data[offset + 3];
            offset += 2; // Extra bytes for 2-byte tag
          }
          break;
        case 0xc5: // Privileges
          privileges = value[0] || 0;
          break;
        case 0xcf: // Life Cycle (single byte tag in some implementations)
          lifecycle = value[0] || 0;
          break;
      }

      offset += 2 + len;
    }

    if (!aid) return null;

    const lifecycleStr = LIFECYCLE_STATE[lifecycle] || `Unknown (${lifecycle.toString(16)})`;
    const knownName = KNOWN_AIDS[aid.toUpperCase()];

    return {
      aid,
      name: knownName || 'Unknown Application',
      label: lifecycleStr,
      priority: privileges,
    };
  }

  private isSuccess(response: Response): boolean {
    return (
      (response.sw1 === 0x90 && response.sw2 === 0x00) ||
      response.sw1 === 0x61 ||
      (response.sw1 === 0x63 && response.sw2 === 0x10) // More data available
    );
  }
}
