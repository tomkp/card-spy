/**
 * MIFARE Classic handler.
 * Supports reading data from MIFARE Classic 1K/4K cards.
 *
 * MIFARE Classic uses a proprietary protocol with Crypto-1 encryption.
 * Most PC/SC readers provide transparent access commands.
 *
 * References:
 * - NXP MF1S50YYX/V1 (MIFARE Classic 1K)
 * - NXP MF1S70YYX/V1 (MIFARE Classic 4K)
 * - PC/SC Part 3 Supplemental Document
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
 * MIFARE Classic card types.
 */
const MIFARE_TYPE = {
  CLASSIC_1K: 'MIFARE Classic 1K',
  CLASSIC_4K: 'MIFARE Classic 4K',
  CLASSIC_MINI: 'MIFARE Classic Mini',
  PLUS_SL1: 'MIFARE Plus (SL1)',
  UNKNOWN: 'MIFARE Classic',
};

/**
 * MIFARE Classic memory structure.
 */
const MEMORY_LAYOUT = {
  // MIFARE Classic 1K: 16 sectors, 4 blocks each
  CLASSIC_1K: {
    sectors: 16,
    blocksPerSector: 4,
    totalBlocks: 64,
    blockSize: 16,
  },
  // MIFARE Classic 4K: 32 sectors of 4 blocks + 8 sectors of 16 blocks
  CLASSIC_4K: {
    sectors: 40,
    smallSectors: 32,
    largeSectors: 8,
    totalBlocks: 256,
    blockSize: 16,
  },
};

/**
 * Default MIFARE keys (commonly used).
 */
const DEFAULT_KEYS = {
  TRANSPORT: 'FFFFFFFFFFFF', // Factory default
  MAD: 'A0A1A2A3A4A5', // MAD key A
  NDEF: 'D3F7D3F7D3F7', // NFC Forum NDEF
  NFC_FORUM: 'A0A1A2A3A4A5', // NFC Forum public key
};

/**
 * Key types.
 */
const KEY_TYPE = {
  KEY_A: 0x60,
  KEY_B: 0x61,
};

/**
 * PC/SC MIFARE commands (reader-specific, common implementation).
 */
const PCSC_MIFARE = {
  LOAD_KEY: 0x82, // Load authentication key
  AUTHENTICATE: 0x86, // General authenticate
  READ_BLOCK: 0xb0, // Read binary (block)
  UPDATE_BLOCK: 0xd6, // Update binary (block)
  VALUE_BLOCK: 0xd7, // Value block operations
};

/**
 * MIFARE Classic command definitions.
 */
const MIFARE_COMMANDS: CardCommand[] = [
  {
    id: 'get-uid',
    name: 'Get Card UID',
    description: 'Read the unique card identifier',
    category: 'Identification',
  },
  {
    id: 'get-ats',
    name: 'Get Card Info',
    description: 'Get card type and SAK information',
    category: 'Identification',
  },
  {
    id: 'read-manufacturer',
    name: 'Read Manufacturer Block',
    description: 'Read block 0 (UID and manufacturer data)',
    category: 'Read',
  },
  {
    id: 'read-mad',
    name: 'Read MAD',
    description: 'Read MIFARE Application Directory (sector 0)',
    category: 'Read',
  },
  {
    id: 'load-key',
    name: 'Load Key',
    description: 'Load authentication key into reader',
    category: 'Security',
    parameters: [
      {
        id: 'keyType',
        name: 'Key Type',
        type: 'select',
        required: true,
        options: [
          { value: 'A', label: 'Key A' },
          { value: 'B', label: 'Key B' },
        ],
        description: 'Authentication key type',
      },
      {
        id: 'key',
        name: 'Key',
        type: 'hex',
        required: true,
        defaultValue: 'FFFFFFFFFFFF',
        description: '6-byte key in hex',
      },
      {
        id: 'keySlot',
        name: 'Key Slot',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: 'Reader key slot (0-31)',
      },
    ],
  },
  {
    id: 'authenticate',
    name: 'Authenticate Sector',
    description: 'Authenticate to a sector using loaded key',
    category: 'Security',
    parameters: [
      {
        id: 'sector',
        name: 'Sector',
        type: 'number',
        required: true,
        defaultValue: 0,
        description: 'Sector number (0-15 for 1K, 0-39 for 4K)',
      },
      {
        id: 'keyType',
        name: 'Key Type',
        type: 'select',
        required: true,
        options: [
          { value: 'A', label: 'Key A' },
          { value: 'B', label: 'Key B' },
        ],
        description: 'Key type for authentication',
      },
      {
        id: 'keySlot',
        name: 'Key Slot',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: 'Reader key slot (0-31)',
      },
    ],
  },
  {
    id: 'read-block',
    name: 'Read Block',
    description: 'Read a single 16-byte block (requires auth)',
    category: 'Read',
    parameters: [
      {
        id: 'block',
        name: 'Block Number',
        type: 'number',
        required: true,
        defaultValue: 0,
        description: 'Block number (0-63 for 1K, 0-255 for 4K)',
      },
    ],
  },
  {
    id: 'read-sector',
    name: 'Read Sector',
    description: 'Read all blocks in a sector (requires auth)',
    category: 'Read',
    parameters: [
      {
        id: 'sector',
        name: 'Sector',
        type: 'number',
        required: true,
        defaultValue: 0,
        description: 'Sector number',
      },
    ],
  },
  {
    id: 'dump-card',
    name: 'Dump Card',
    description: 'Attempt to dump all readable sectors with default keys',
    category: 'Read',
    requiresConfirmation: true,
  },
  {
    id: 'read-value',
    name: 'Read Value Block',
    description: 'Read a value block as a signed integer',
    category: 'Read',
    parameters: [
      {
        id: 'block',
        name: 'Block Number',
        type: 'number',
        required: true,
        defaultValue: 1,
        description: 'Block number containing value',
      },
    ],
  },
  {
    id: 'check-keys',
    name: 'Check Default Keys',
    description: 'Test common default keys on sector 0',
    category: 'Security',
  },
];

export class MifareClassicHandler implements CardHandler {
  readonly id = 'mifare-classic';
  readonly name = 'MIFARE Classic';
  readonly description = 'NXP MIFARE Classic 1K/4K contactless cards';

  private cardType: string = MIFARE_TYPE.UNKNOWN;
  private uid: string = '';
  private sak: number = 0;

  async detect(
    atr: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<DetectionResult> {
    const atrUpper = atr.toUpperCase().replace(/\s/g, '');

    // MIFARE Classic ATR patterns
    // Common ATR: 3B8F8001804F0CA000000306030001000000006A
    const mifarePatterns = [
      /^3B8[0-9A-F]80.*0306/, // MIFARE with PC/SC transparent
      /^3B8F8001804F0CA0000003/, // Standard MIFARE Classic
      /^3B8[48]80/, // Common contactless prefix
    ];

    const isMifareAtr = mifarePatterns.some((p) => p.test(atrUpper));

    // Try to get UID to confirm it's a contactless card
    try {
      const uidResponse = await sendCommand([0xff, 0xca, 0x00, 0x00, 0x00]);
      if (uidResponse.sw1 === 0x90 && uidResponse.data.length >= 4) {
        this.uid = bytesToHex(uidResponse.data);

        // Try to determine card type from SAK or ATR
        this.cardType = this.determineCardType(atrUpper, uidResponse.data);

        return {
          detected: true,
          confidence: 85,
          cardType: this.cardType,
          metadata: {
            uid: this.uid,
            uidLength: uidResponse.data.length,
          },
        };
      }
    } catch {
      // UID read failed
    }

    // Check ATR for MIFARE Classic specific bytes
    // SAK byte in ATR can indicate card type
    if (atrUpper.includes('0306')) {
      // Contains MIFARE type indicator
      if (atrUpper.includes('030001') || atrUpper.includes('030002')) {
        this.cardType = MIFARE_TYPE.CLASSIC_1K;
        return {
          detected: true,
          confidence: 80,
          cardType: this.cardType,
        };
      }
      if (atrUpper.includes('030003')) {
        this.cardType = MIFARE_TYPE.CLASSIC_4K;
        return {
          detected: true,
          confidence: 80,
          cardType: this.cardType,
        };
      }
    }

    if (isMifareAtr) {
      return {
        detected: true,
        confidence: 50,
        cardType: MIFARE_TYPE.UNKNOWN,
      };
    }

    return { detected: false, confidence: 0 };
  }

  getCommands(_metadata?: Record<string, unknown>): CardCommand[] {
    return MIFARE_COMMANDS;
  }

  async executeCommand(commandId: string, context: CommandContext): Promise<Response> {
    const { sendCommand, parameters } = context;

    switch (commandId) {
      case 'get-uid':
        return sendCommand([0xff, 0xca, 0x00, 0x00, 0x00]);

      case 'get-ats':
        // Get ATS (Answer To Select) - some readers support this
        return sendCommand([0xff, 0xca, 0x01, 0x00, 0x00]);

      case 'read-manufacturer':
        // Read block 0 - often readable without authentication
        return this.readBlock(sendCommand, 0);

      case 'read-mad':
        return this.readMad(sendCommand);

      case 'load-key': {
        const keyType = parameters.keyType as string;
        const key = parameters.key as string;
        const keySlot = (parameters.keySlot as number) || 0;
        return this.loadKey(sendCommand, keyType, key, keySlot);
      }

      case 'authenticate': {
        const sector = parameters.sector as number;
        const keyType = parameters.keyType as string;
        const keySlot = (parameters.keySlot as number) || 0;
        return this.authenticate(sendCommand, sector, keyType, keySlot);
      }

      case 'read-block': {
        const block = parameters.block as number;
        return this.readBlock(sendCommand, block);
      }

      case 'read-sector': {
        const sector = parameters.sector as number;
        return this.readSector(sendCommand, sector);
      }

      case 'dump-card':
        return this.dumpCard(sendCommand);

      case 'read-value': {
        const block = parameters.block as number;
        return this.readValueBlock(sendCommand, block);
      }

      case 'check-keys':
        return this.checkDefaultKeys(sendCommand);

      default:
        throw new Error(`Unknown command: ${commandId}`);
    }
  }

  async interrogate(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<InterrogationResult> {
    const applications: ApplicationInfo[] = [];

    try {
      // Step 1: Get UID
      const uidResponse = await sendCommand([0xff, 0xca, 0x00, 0x00, 0x00]);
      if (uidResponse.sw1 === 0x90) {
        this.uid = bytesToHex(uidResponse.data);
        applications.push({
          aid: this.uid,
          name: 'Card UID',
          label: `${uidResponse.data.length * 8}-bit UID`,
        });
      }

      // Step 2: Try to read block 0 (manufacturer block)
      const block0Response = await this.readBlock(sendCommand, 0);
      if (block0Response.sw1 === 0x90 && block0Response.data.length === 16) {
        applications.push({
          aid: 'BLOCK0',
          name: 'Manufacturer Block',
          label: this.parseManufacturerBlock(block0Response.data),
        });
      }

      // Step 3: Check for MAD (MIFARE Application Directory)
      try {
        // Load transport key and try to authenticate sector 0
        await this.loadKey(sendCommand, 'A', DEFAULT_KEYS.TRANSPORT, 0);
        const authResult = await this.authenticate(sendCommand, 0, 'A', 0);
        if (authResult.sw1 === 0x90) {
          // Read sector trailer to check for MAD
          const trailerResponse = await this.readBlock(sendCommand, 3);
          if (trailerResponse.sw1 === 0x90) {
            applications.push({
              aid: 'SECTOR0',
              name: 'Sector 0',
              label: 'Authenticated with transport key',
            });
          }
        }
      } catch {
        // Authentication failed
      }

      return {
        success: true,
        applications,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Command implementations

  private async loadKey(
    sendCommand: (apdu: number[]) => Promise<Response>,
    keyType: string,
    key: string,
    keySlot: number
  ): Promise<Response> {
    const keyBytes = hexToBytes(key);
    if (keyBytes.length !== 6) {
      return this.createErrorResponse(0x6a, 0x80);
    }

    // LOAD KEY: FF 82 [key structure] [key slot] 06 [key]
    // Key structure: 0x00 = volatile, 0x20 = non-volatile
    const apdu = [0xff, PCSC_MIFARE.LOAD_KEY, 0x00, keySlot, 0x06, ...keyBytes];
    return sendCommand(apdu);
  }

  private async authenticate(
    sendCommand: (apdu: number[]) => Promise<Response>,
    sector: number,
    keyType: string,
    keySlot: number
  ): Promise<Response> {
    // Calculate first block of sector
    const block = this.sectorToBlock(sector);

    // General Authenticate: FF 86 00 00 05 [auth data]
    // Auth data: 01 00 [block] [key type] [key slot]
    const keyTypeByte = keyType === 'A' ? KEY_TYPE.KEY_A : KEY_TYPE.KEY_B;
    const authData = [0x01, 0x00, block, keyTypeByte, keySlot];
    const apdu = [0xff, PCSC_MIFARE.AUTHENTICATE, 0x00, 0x00, 0x05, ...authData];
    return sendCommand(apdu);
  }

  private async readBlock(
    sendCommand: (apdu: number[]) => Promise<Response>,
    block: number
  ): Promise<Response> {
    // READ BINARY: FF B0 00 [block] 10
    const apdu = [0xff, PCSC_MIFARE.READ_BLOCK, 0x00, block, 0x10];
    return sendCommand(apdu);
  }

  private async readSector(
    sendCommand: (apdu: number[]) => Promise<Response>,
    sector: number
  ): Promise<Response> {
    const firstBlock = this.sectorToBlock(sector);
    const blocksInSector = sector < 32 ? 4 : 16;
    const allData: number[] = [];

    for (let i = 0; i < blocksInSector; i++) {
      const response = await this.readBlock(sendCommand, firstBlock + i);
      if (response.sw1 === 0x90) {
        allData.push(...response.data);
      } else {
        // Return partial data with error status
        return {
          id: `sector-read-${Date.now()}`,
          timestamp: Date.now(),
          data: allData,
          sw1: response.sw1,
          sw2: response.sw2,
          hex: bytesToHex(allData),
        };
      }
    }

    return {
      id: `sector-read-${Date.now()}`,
      timestamp: Date.now(),
      data: allData,
      sw1: 0x90,
      sw2: 0x00,
      hex: bytesToHex(allData),
    };
  }

  private async readMad(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    // MAD is in sector 0, blocks 1-2 (block 0 is manufacturer, block 3 is trailer)
    // First try with MAD key
    await this.loadKey(sendCommand, 'A', DEFAULT_KEYS.MAD, 0);
    let authResult = await this.authenticate(sendCommand, 0, 'A', 0);

    if (authResult.sw1 !== 0x90) {
      // Try transport key
      await this.loadKey(sendCommand, 'A', DEFAULT_KEYS.TRANSPORT, 0);
      authResult = await this.authenticate(sendCommand, 0, 'A', 0);
    }

    if (authResult.sw1 !== 0x90) {
      return authResult;
    }

    // Read blocks 1 and 2
    const allData: number[] = [];
    for (const block of [1, 2]) {
      const response = await this.readBlock(sendCommand, block);
      if (response.sw1 === 0x90) {
        allData.push(...response.data);
      }
    }

    return {
      id: `mad-read-${Date.now()}`,
      timestamp: Date.now(),
      data: allData,
      sw1: 0x90,
      sw2: 0x00,
      hex: bytesToHex(allData),
    };
  }

  private async dumpCard(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    const allData: number[] = [];
    const defaultKeys = [
      DEFAULT_KEYS.TRANSPORT,
      DEFAULT_KEYS.MAD,
      DEFAULT_KEYS.NDEF,
      '000000000000',
      'A0B0C0D0E0F0',
      'AABBCCDDEEFF',
    ];

    const sectors = this.cardType === MIFARE_TYPE.CLASSIC_4K ? 40 : 16;

    for (let sector = 0; sector < sectors; sector++) {
      let authenticated = false;

      // Try each default key
      for (const key of defaultKeys) {
        if (authenticated) break;

        for (const keyType of ['A', 'B']) {
          await this.loadKey(sendCommand, keyType, key, 0);
          const authResult = await this.authenticate(sendCommand, sector, keyType, 0);
          if (authResult.sw1 === 0x90) {
            authenticated = true;
            break;
          }
        }
      }

      if (authenticated) {
        // Read all blocks in sector
        const firstBlock = this.sectorToBlock(sector);
        const blocksInSector = sector < 32 ? 4 : 16;

        for (let i = 0; i < blocksInSector; i++) {
          const response = await this.readBlock(sendCommand, firstBlock + i);
          if (response.sw1 === 0x90) {
            allData.push(...response.data);
          } else {
            // Pad with zeros for failed reads
            allData.push(...new Array(16).fill(0));
          }
        }
      } else {
        // Pad entire sector with zeros
        const blocksInSector = sector < 32 ? 4 : 16;
        allData.push(...new Array(blocksInSector * 16).fill(0));
      }
    }

    return {
      id: `dump-${Date.now()}`,
      timestamp: Date.now(),
      data: allData,
      sw1: 0x90,
      sw2: 0x00,
      hex: bytesToHex(allData),
    };
  }

  private async readValueBlock(
    sendCommand: (apdu: number[]) => Promise<Response>,
    block: number
  ): Promise<Response> {
    const response = await this.readBlock(sendCommand, block);
    if (response.sw1 !== 0x90 || response.data.length !== 16) {
      return response;
    }

    // Value block format: value (4 bytes) + ~value (4 bytes) + value (4 bytes) + addr (1 byte) + ~addr (1 byte) + addr (1 byte) + ~addr (1 byte)
    const value = this.parseValueBlock(response.data);
    if (value !== null) {
      response.meaning = `Value: ${value}`;
    }

    return response;
  }

  private async checkDefaultKeys(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    const results: number[] = [];
    const defaultKeys = [
      { name: 'Transport', key: DEFAULT_KEYS.TRANSPORT },
      { name: 'MAD', key: DEFAULT_KEYS.MAD },
      { name: 'NDEF', key: DEFAULT_KEYS.NDEF },
      { name: 'Zeros', key: '000000000000' },
    ];

    for (const { name, key } of defaultKeys) {
      await this.loadKey(sendCommand, 'A', key, 0);
      const authResult = await this.authenticate(sendCommand, 0, 'A', 0);

      // Encode result: key index + success byte
      results.push(defaultKeys.findIndex((k) => k.key === key));
      results.push(authResult.sw1 === 0x90 ? 1 : 0);
    }

    return {
      id: `key-check-${Date.now()}`,
      timestamp: Date.now(),
      data: results,
      sw1: 0x90,
      sw2: 0x00,
      hex: bytesToHex(results),
      meaning: this.formatKeyCheckResults(defaultKeys, results),
    };
  }

  // Helper methods

  private determineCardType(atr: string, uid: number[]): string {
    // Check ATR for card type indicators
    if (atr.includes('030001') || atr.includes('000801')) {
      return MIFARE_TYPE.CLASSIC_1K;
    }
    if (atr.includes('030002') || atr.includes('001801')) {
      return MIFARE_TYPE.CLASSIC_4K;
    }
    if (atr.includes('030003')) {
      return MIFARE_TYPE.CLASSIC_4K;
    }

    // Check UID length
    if (uid.length === 4) {
      return MIFARE_TYPE.CLASSIC_1K; // 4-byte UID is typically 1K
    }
    if (uid.length === 7) {
      return MIFARE_TYPE.CLASSIC_4K; // 7-byte UID is typically 4K
    }

    return MIFARE_TYPE.UNKNOWN;
  }

  private sectorToBlock(sector: number): number {
    // For sectors 0-31: 4 blocks per sector
    // For sectors 32-39: 16 blocks per sector (4K only)
    if (sector < 32) {
      return sector * 4;
    }
    return 128 + (sector - 32) * 16;
  }

  private parseManufacturerBlock(data: number[]): string {
    if (data.length < 5) return 'Invalid block';

    // First 4 bytes are UID (or first part of 7-byte UID)
    const uid = bytesToHex(data.slice(0, 4));

    // Byte 4 is BCC (Block Check Character) for 4-byte UID
    // For 7-byte UID, bytes 4-6 are part of UID, byte 7 is BCC

    // Byte 5 (or later) contains SAK
    const sak = data.length >= 6 ? data[5] : 0;

    // Bytes after SAK contain manufacturer info
    const nxpManufacturerId = 0x04;
    const isNxp = data.length > 0 && data[0] === nxpManufacturerId;

    return `UID: ${uid}, SAK: ${sak.toString(16).padStart(2, '0')}${isNxp ? ', NXP' : ''}`;
  }

  private parseValueBlock(data: number[]): number | null {
    if (data.length !== 16) return null;

    // Check value block format
    const value1 =
      data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
    const value2 =
      ~(data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24));
    const value3 =
      data[8] | (data[9] << 8) | (data[10] << 16) | (data[11] << 24);

    // Value should be the same in all three locations
    if (value1 === value2 && value2 === value3) {
      return value1;
    }

    return null;
  }

  private formatKeyCheckResults(
    keys: { name: string; key: string }[],
    results: number[]
  ): string {
    const lines: string[] = [];
    for (let i = 0; i < results.length; i += 2) {
      const keyIndex = results[i];
      const success = results[i + 1] === 1;
      if (keyIndex < keys.length) {
        lines.push(`${keys[keyIndex].name}: ${success ? 'OK' : 'FAIL'}`);
      }
    }
    return lines.join(', ');
  }

  private createErrorResponse(sw1: number, sw2: number): Response {
    return {
      id: `error-${Date.now()}`,
      timestamp: Date.now(),
      data: [],
      sw1,
      sw2,
      hex: bytesToHex([sw1, sw2]),
    };
  }
}
