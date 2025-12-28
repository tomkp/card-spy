/**
 * Transport card handler for MIFARE DESFire cards (Oyster, etc.).
 * Supports reading publicly available data without authentication.
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
 * DESFire native commands (wrapped in ISO 7816 APDU format).
 * Format: 90 [CMD] 00 00 [Lc] [Data] 00
 */
const DESFIRE_COMMANDS = {
  GET_VERSION: 0x60,
  GET_APPLICATION_IDS: 0x6a,
  SELECT_APPLICATION: 0x5a,
  GET_FILE_IDS: 0x6f,
  GET_FILE_SETTINGS: 0xf5,
  READ_DATA: 0xbd,
  GET_VALUE: 0x6c,
  GET_KEY_SETTINGS: 0x45,
  GET_CARD_UID: 0x51,
  GET_FREE_MEMORY: 0x6e,
  ADDITIONAL_FRAME: 0xaf,
};

/**
 * DESFire status codes.
 */
const DESFIRE_STATUS = {
  OK: 0x00,
  ADDITIONAL_FRAME: 0xaf,
  AUTHENTICATION_ERROR: 0xae,
  PERMISSION_DENIED: 0x9d,
  NO_CHANGES: 0x0c,
  OUT_OF_MEMORY: 0x0e,
  ILLEGAL_COMMAND: 0x1c,
  INTEGRITY_ERROR: 0x1e,
  NO_SUCH_KEY: 0x40,
  LENGTH_ERROR: 0x7e,
  APPLICATION_NOT_FOUND: 0xa0,
  FILE_NOT_FOUND: 0xf0,
};

/**
 * Known transport card application IDs.
 */
const KNOWN_TRANSPORT_AIDS: Record<string, string> = {
  // Common transport AIDs (3-byte DESFire AIDs shown as hex)
  '505050': 'TfL Oyster',
  '4F5953': 'Oyster (OYS)',
  '544649': 'Transport for Ireland',
  '4E4543': 'NEC Transport',
};

/**
 * Transport card command definitions.
 */
const TRANSPORT_COMMANDS: CardCommand[] = [
  {
    id: 'get-uid',
    name: 'Get Card UID',
    description: 'Read the unique card identifier (works with most readers)',
    category: 'Identification',
  },
  {
    id: 'get-version',
    name: 'Get Version',
    description: 'Read card hardware/software version and manufacturer info',
    category: 'Identification',
  },
  {
    id: 'get-application-ids',
    name: 'Get Application IDs',
    description: 'List all applications stored on the card',
    category: 'Discovery',
  },
  {
    id: 'select-application',
    name: 'Select Application',
    description: 'Select an application by its 3-byte AID',
    category: 'Discovery',
    parameters: [
      {
        id: 'aid',
        name: 'Application ID',
        type: 'hex',
        required: true,
        description: '3-byte Application ID (e.g., 505050 for Oyster)',
      },
    ],
  },
  {
    id: 'get-file-ids',
    name: 'Get File IDs',
    description: 'List files in the currently selected application',
    category: 'Discovery',
  },
  {
    id: 'get-file-settings',
    name: 'Get File Settings',
    description: 'Read settings for a specific file (type, size, access rights)',
    category: 'Read',
    parameters: [
      {
        id: 'fileNo',
        name: 'File Number',
        type: 'number',
        required: true,
        defaultValue: 0,
        description: 'File number (0-31)',
      },
    ],
  },
  {
    id: 'get-key-settings',
    name: 'Get Key Settings',
    description: 'Read key configuration for the selected application',
    category: 'Security',
  },
  {
    id: 'get-free-memory',
    name: 'Get Free Memory',
    description: 'Read available memory on the card (EV1+)',
    category: 'Identification',
  },
  {
    id: 'read-data',
    name: 'Read Data',
    description: 'Attempt to read data from a file (requires free access)',
    category: 'Read',
    parameters: [
      {
        id: 'fileNo',
        name: 'File Number',
        type: 'number',
        required: true,
        defaultValue: 0,
        description: 'File number to read from',
      },
      {
        id: 'offset',
        name: 'Offset',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: 'Byte offset to start reading from',
      },
      {
        id: 'length',
        name: 'Length',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: 'Number of bytes to read (0 = all)',
      },
    ],
  },
  {
    id: 'get-value',
    name: 'Get Value',
    description: 'Read value from a value file (requires free access)',
    category: 'Read',
    parameters: [
      {
        id: 'fileNo',
        name: 'File Number',
        type: 'number',
        required: true,
        defaultValue: 0,
        description: 'Value file number',
      },
    ],
  },
];

/**
 * DESFire card version information.
 */
interface VersionInfo {
  hardwareVendorId: number;
  hardwareType: number;
  hardwareSubType: number;
  hardwareMajorVersion: number;
  hardwareMinorVersion: number;
  hardwareStorageSize: number;
  hardwareProtocol: number;
  softwareVendorId: number;
  softwareType: number;
  softwareSubType: number;
  softwareMajorVersion: number;
  softwareMinorVersion: number;
  softwareStorageSize: number;
  softwareProtocol: number;
  uid: string;
  batchNo: string;
  productionWeek: number;
  productionYear: number;
}

export class TransportHandler implements CardHandler {
  readonly id = 'transport';
  readonly name = 'Transport Card';
  readonly description = 'MIFARE DESFire transport cards (Oyster, etc.)';

  private discoveredApplications: ApplicationInfo[] = [];
  private versionInfo: VersionInfo | null = null;

  async detect(
    atr: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<DetectionResult> {
    const atrUpper = atr.toUpperCase().replace(/\s/g, '');

    // Check for DESFire ATR patterns
    // Common DESFire patterns in contactless mode
    const desfirePatterns = [
      /^3B8180018080/, // DESFire contactless
      /^3B8180.*80/, // Generic DESFire
      /^3B8[0-9A-F]80.*04.*D276.*00850[012]/, // NXP DESFire EV1/EV2/EV3
    ];

    const isDesfireAtr = desfirePatterns.some((p) => p.test(atrUpper));

    // Try GetVersion command to confirm it's a DESFire card
    try {
      const versionResponse = await this.sendDesfireCommand(
        sendCommand,
        DESFIRE_COMMANDS.GET_VERSION,
        []
      );

      if (versionResponse.success && versionResponse.data.length >= 7) {
        // Parse version info
        this.versionInfo = await this.parseVersionInfo(versionResponse.data, sendCommand);

        const cardType = this.getCardTypeName();
        return {
          detected: true,
          confidence: 95,
          cardType,
          metadata: {
            versionInfo: this.versionInfo,
            isDesfire: true,
          },
        };
      }
    } catch {
      // GetVersion failed
    }

    // Also try standard PC/SC Get UID command
    try {
      const uidResponse = await sendCommand([0xff, 0xca, 0x00, 0x00, 0x00]);
      if (uidResponse.sw1 === 0x90 && uidResponse.data.length >= 4) {
        // We got a UID, likely a contactless card
        if (isDesfireAtr) {
          return {
            detected: true,
            confidence: 70,
            cardType: 'Possible MIFARE DESFire',
            metadata: {
              uid: this.bytesToHex(uidResponse.data),
            },
          };
        }
      }
    } catch {
      // UID command failed
    }

    // Fall back to ATR pattern matching
    if (isDesfireAtr) {
      return {
        detected: true,
        confidence: 40,
        cardType: 'Possible Transport Card',
      };
    }

    // Check for Calypso transport cards
    if (atrUpper.startsWith('3B8F80')) {
      return {
        detected: true,
        confidence: 60,
        cardType: 'Calypso Transport Card',
        metadata: { isCalypso: true },
      };
    }

    return { detected: false, confidence: 0 };
  }

  getCommands(_metadata?: Record<string, unknown>): CardCommand[] {
    const commands = [...TRANSPORT_COMMANDS];

    // Add quick-select commands for discovered applications
    for (const app of this.discoveredApplications) {
      const appName = KNOWN_TRANSPORT_AIDS[app.aid.toUpperCase()] || `App ${app.aid}`;
      commands.push({
        id: `quick-select-${app.aid}`,
        name: `Select ${appName}`,
        description: `Quick select application ${app.aid}`,
        category: 'Applications',
      });
    }

    return commands;
  }

  async executeCommand(commandId: string, context: CommandContext): Promise<Response> {
    const { sendCommand, parameters } = context;

    switch (commandId) {
      case 'get-uid':
        return sendCommand([0xff, 0xca, 0x00, 0x00, 0x00]);

      case 'get-version': {
        const result = await this.sendDesfireCommand(
          sendCommand,
          DESFIRE_COMMANDS.GET_VERSION,
          []
        );
        return this.wrapDesfireResponse(result);
      }

      case 'get-application-ids': {
        const result = await this.sendDesfireCommand(
          sendCommand,
          DESFIRE_COMMANDS.GET_APPLICATION_IDS,
          []
        );
        return this.wrapDesfireResponse(result);
      }

      case 'select-application': {
        const aid = this.hexToBytes(parameters.aid as string);
        if (aid.length !== 3) {
          return this.createErrorResponse(0x6a, 0x80);
        }
        const result = await this.sendDesfireCommand(
          sendCommand,
          DESFIRE_COMMANDS.SELECT_APPLICATION,
          aid
        );
        return this.wrapDesfireResponse(result);
      }

      case 'get-file-ids': {
        const result = await this.sendDesfireCommand(
          sendCommand,
          DESFIRE_COMMANDS.GET_FILE_IDS,
          []
        );
        return this.wrapDesfireResponse(result);
      }

      case 'get-file-settings': {
        const fileNo = parameters.fileNo as number;
        const result = await this.sendDesfireCommand(
          sendCommand,
          DESFIRE_COMMANDS.GET_FILE_SETTINGS,
          [fileNo]
        );
        return this.wrapDesfireResponse(result);
      }

      case 'get-key-settings': {
        const result = await this.sendDesfireCommand(
          sendCommand,
          DESFIRE_COMMANDS.GET_KEY_SETTINGS,
          []
        );
        return this.wrapDesfireResponse(result);
      }

      case 'get-free-memory': {
        const result = await this.sendDesfireCommand(
          sendCommand,
          DESFIRE_COMMANDS.GET_FREE_MEMORY,
          []
        );
        return this.wrapDesfireResponse(result);
      }

      case 'read-data': {
        const fileNo = parameters.fileNo as number;
        const offset = (parameters.offset as number) || 0;
        const length = (parameters.length as number) || 0;
        // Offset and length are 3 bytes each, LSB first
        const data = [
          fileNo,
          offset & 0xff,
          (offset >> 8) & 0xff,
          (offset >> 16) & 0xff,
          length & 0xff,
          (length >> 8) & 0xff,
          (length >> 16) & 0xff,
        ];
        const result = await this.sendDesfireCommand(
          sendCommand,
          DESFIRE_COMMANDS.READ_DATA,
          data
        );
        return this.wrapDesfireResponse(result);
      }

      case 'get-value': {
        const fileNo = parameters.fileNo as number;
        const result = await this.sendDesfireCommand(
          sendCommand,
          DESFIRE_COMMANDS.GET_VALUE,
          [fileNo]
        );
        return this.wrapDesfireResponse(result);
      }

      default:
        // Check for quick-select commands
        if (commandId.startsWith('quick-select-')) {
          const aid = commandId.replace('quick-select-', '');
          const aidBytes = this.hexToBytes(aid);
          const result = await this.sendDesfireCommand(
            sendCommand,
            DESFIRE_COMMANDS.SELECT_APPLICATION,
            aidBytes
          );
          return this.wrapDesfireResponse(result);
        }
        throw new Error(`Unknown command: ${commandId}`);
    }
  }

  async interrogate(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<InterrogationResult> {
    this.discoveredApplications = [];

    try {
      // Step 1: Get card UID
      const uidResponse = await sendCommand([0xff, 0xca, 0x00, 0x00, 0x00]);
      const uid =
        uidResponse.sw1 === 0x90 ? this.bytesToHex(uidResponse.data) : 'Unknown';

      // Step 2: Get card version
      const versionResult = await this.sendDesfireCommand(
        sendCommand,
        DESFIRE_COMMANDS.GET_VERSION,
        []
      );

      if (versionResult.success) {
        this.versionInfo = await this.parseVersionInfo(versionResult.data, sendCommand);
      }

      // Step 3: Get application IDs
      const appResult = await this.sendDesfireCommand(
        sendCommand,
        DESFIRE_COMMANDS.GET_APPLICATION_IDS,
        []
      );

      if (appResult.success && appResult.data.length > 0) {
        // AIDs are 3 bytes each
        for (let i = 0; i < appResult.data.length; i += 3) {
          const aidBytes = appResult.data.slice(i, i + 3);
          const aid = this.bytesToHex(aidBytes);

          this.discoveredApplications.push({
            aid,
            name: KNOWN_TRANSPORT_AIDS[aid.toUpperCase()] || `Application ${aid}`,
          });
        }
      }

      // Step 4: For each application, try to get file info
      for (const app of this.discoveredApplications) {
        // Select application
        const selectResult = await this.sendDesfireCommand(
          sendCommand,
          DESFIRE_COMMANDS.SELECT_APPLICATION,
          this.hexToBytes(app.aid)
        );

        if (selectResult.success) {
          // Get file IDs
          const fileResult = await this.sendDesfireCommand(
            sendCommand,
            DESFIRE_COMMANDS.GET_FILE_IDS,
            []
          );

          if (fileResult.success) {
            // Store file count in metadata
            (app as ApplicationInfo & { fileCount?: number }).fileCount =
              fileResult.data.length;
          }
        }
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

  /**
   * Send a DESFire native command wrapped in ISO 7816 APDU.
   */
  private async sendDesfireCommand(
    sendCommand: (apdu: number[]) => Promise<Response>,
    command: number,
    data: number[]
  ): Promise<{ success: boolean; data: number[]; statusCode: number }> {
    // Build wrapped APDU: 90 [CMD] 00 00 [Lc] [Data] 00
    const apdu =
      data.length > 0
        ? [0x90, command, 0x00, 0x00, data.length, ...data, 0x00]
        : [0x90, command, 0x00, 0x00, 0x00];

    const response = await sendCommand(apdu);

    // DESFire returns status in SW2 (SW1 is always 0x91)
    if (response.sw1 !== 0x91) {
      // Not a DESFire response, check standard ISO response
      if (response.sw1 === 0x90 && response.sw2 === 0x00) {
        return { success: true, data: response.data, statusCode: 0x00 };
      }
      return { success: false, data: response.data, statusCode: response.sw2 };
    }

    const statusCode = response.sw2;
    let allData = [...response.data];

    // Handle additional frames (for multi-frame responses)
    if (statusCode === DESFIRE_STATUS.ADDITIONAL_FRAME) {
      let moreData = true;
      while (moreData) {
        const continueApdu = [0x90, DESFIRE_COMMANDS.ADDITIONAL_FRAME, 0x00, 0x00, 0x00];
        const continueResponse = await sendCommand(continueApdu);

        allData = [...allData, ...continueResponse.data];

        if (
          continueResponse.sw1 !== 0x91 ||
          continueResponse.sw2 !== DESFIRE_STATUS.ADDITIONAL_FRAME
        ) {
          moreData = false;
          if (continueResponse.sw2 === DESFIRE_STATUS.OK) {
            return { success: true, data: allData, statusCode: DESFIRE_STATUS.OK };
          }
          return { success: false, data: allData, statusCode: continueResponse.sw2 };
        }
      }
    }

    return {
      success: statusCode === DESFIRE_STATUS.OK,
      data: allData,
      statusCode,
    };
  }

  /**
   * Parse version info from GetVersion response (requires 3 frames).
   */
  private async parseVersionInfo(
    firstFrame: number[],
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<VersionInfo> {
    // First frame: hardware info (7 bytes)
    const hw = firstFrame;

    // Get second frame (software info)
    const sw2Result = await this.sendDesfireCommand(
      sendCommand,
      DESFIRE_COMMANDS.ADDITIONAL_FRAME,
      []
    );
    const sw = sw2Result.data;

    // Get third frame (production info)
    const prodResult = await this.sendDesfireCommand(
      sendCommand,
      DESFIRE_COMMANDS.ADDITIONAL_FRAME,
      []
    );
    const prod = prodResult.data;

    return {
      hardwareVendorId: hw[0] || 0,
      hardwareType: hw[1] || 0,
      hardwareSubType: hw[2] || 0,
      hardwareMajorVersion: hw[3] || 0,
      hardwareMinorVersion: hw[4] || 0,
      hardwareStorageSize: hw[5] || 0,
      hardwareProtocol: hw[6] || 0,
      softwareVendorId: sw[0] || 0,
      softwareType: sw[1] || 0,
      softwareSubType: sw[2] || 0,
      softwareMajorVersion: sw[3] || 0,
      softwareMinorVersion: sw[4] || 0,
      softwareStorageSize: sw[5] || 0,
      softwareProtocol: sw[6] || 0,
      uid: prod.length >= 7 ? this.bytesToHex(prod.slice(0, 7)) : '',
      batchNo: prod.length >= 12 ? this.bytesToHex(prod.slice(7, 12)) : '',
      productionWeek: prod[12] || 0,
      productionYear: prod[13] || 0,
    };
  }

  /**
   * Get a human-readable card type name from version info.
   */
  private getCardTypeName(): string {
    if (!this.versionInfo) return 'MIFARE DESFire';

    const { hardwareVendorId, hardwareMajorVersion, hardwareMinorVersion, hardwareStorageSize } =
      this.versionInfo;

    // Vendor 0x04 = NXP
    const vendor = hardwareVendorId === 0x04 ? 'NXP' : `Vendor ${hardwareVendorId}`;

    // Determine variant
    let variant = 'DESFire';
    if (hardwareMajorVersion === 0 && hardwareMinorVersion === 1) {
      variant = 'DESFire EV1';
    } else if (hardwareMajorVersion === 0 && hardwareMinorVersion === 2) {
      variant = 'DESFire EV2';
    } else if (hardwareMajorVersion === 0 && hardwareMinorVersion === 3) {
      variant = 'DESFire EV3';
    } else if (hardwareMajorVersion === 1) {
      variant = 'DESFire Light';
    }

    // Storage size (encoded as 2^(size/2) bytes for DESFire)
    const storageSizes: Record<number, string> = {
      0x16: '2KB',
      0x18: '4KB',
      0x1a: '8KB',
      0x1c: '16KB',
      0x1e: '32KB',
    };
    const storage = storageSizes[hardwareStorageSize] || '';

    return `${vendor} MIFARE ${variant}${storage ? ` (${storage})` : ''}`;
  }

  /**
   * Wrap DESFire response in standard Response format.
   */
  private wrapDesfireResponse(result: {
    success: boolean;
    data: number[];
    statusCode: number;
  }): Response {
    const hex = this.bytesToHex([...result.data, 0x91, result.statusCode]);
    return {
      id: `desfire-${Date.now()}`,
      timestamp: Date.now(),
      data: result.data,
      sw1: 0x91,
      sw2: result.statusCode,
      hex,
    };
  }

  /**
   * Create an error response.
   */
  private createErrorResponse(sw1: number, sw2: number): Response {
    return {
      id: `error-${Date.now()}`,
      timestamp: Date.now(),
      data: [],
      sw1,
      sw2,
      hex: this.bytesToHex([sw1, sw2]),
    };
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
