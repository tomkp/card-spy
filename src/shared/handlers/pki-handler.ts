/**
 * PKI / Certificate Card handler.
 * Supports reading certificates from PKCS#15 / PKCS#11 compatible smart cards.
 *
 * Supports:
 * - Generic PKCS#15 cards
 * - Corporate/Enterprise PKI cards
 * - Certificate Authority cards
 * - Code signing tokens
 *
 * References:
 * - ISO 7816-15 (Cryptographic Information Application)
 * - PKCS#15 v1.1
 * - RSA PKCS#11 (Cryptoki)
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
 * PKI Application Identifiers.
 */
const PKI_AIDS = {
  // PKCS#15
  PKCS15: 'A000000063504B43532D3135',
  PKCS15_SHORT: '504B43532D3135', // "PKCS-15" ASCII

  // IAS-ECC (European standard)
  IAS_ECC: 'A0000000770101',

  // Generic cryptographic apps
  CRYPTO: 'A000000079',
  ISO_CRYPTO: 'A000000063',

  // Gemalto/Thales
  GEMALTO: 'A0000000770105',
  GEMALTO_IDX: 'A0000000770109',

  // Oberthur
  OBERTHUR: 'A000000077010510',

  // Giesecke+Devrient
  GD_STARCOS: 'D27600006601',
};

/**
 * PKCS#15 file structure.
 */
const PKCS15_FILES = {
  // PKCS#15 directory files (under MF/DF.CIA)
  EF_ODF: '5031', // Object Directory File
  EF_TOKEN_INFO: '5032', // Token Info
  EF_UNUSED: '5033', // Unused space
  EF_AODF: '5034', // Authentication Object Directory
  EF_PrKDF: '5035', // Private Key Directory
  EF_PuKDF: '5036', // Public Key Directory
  EF_SKDF: '5037', // Secret Key Directory
  EF_CDF: '5038', // Certificate Directory
  EF_DODF: '5039', // Data Object Directory

  // Common paths
  DF_CIA: '5015', // Cryptographic Information Application
  DF_PKCS15: '504B', // PKCS#15 DF

  // Certificate files (typical)
  EF_CERT_1: '5501',
  EF_CERT_2: '5502',
  EF_CERT_3: '5503',
};

/**
 * ASN.1 / DER tags used in PKCS#15.
 */
const ASN1_TAGS = {
  SEQUENCE: 0x30,
  SET: 0x31,
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OID: 0x06,
  UTF8_STRING: 0x0c,
  PRINTABLE_STRING: 0x13,
  IA5_STRING: 0x16,
  UTC_TIME: 0x17,
  GENERALIZED_TIME: 0x18,
  CONTEXT_0: 0xa0,
  CONTEXT_1: 0xa1,
  CONTEXT_2: 0xa2,
};

/**
 * PKI command definitions.
 */
const PKI_COMMANDS: CardCommand[] = [
  {
    id: 'select-app',
    name: 'Select PKI Application',
    description: 'Select the PKCS#15 or PKI application',
    category: 'Selection',
  },
  {
    id: 'read-token-info',
    name: 'Read Token Info',
    description: 'Read card/token information',
    category: 'Information',
  },
  {
    id: 'list-objects',
    name: 'List Objects',
    description: 'List all PKCS#15 objects (certs, keys, etc.)',
    category: 'Discovery',
  },
  {
    id: 'list-certificates',
    name: 'List Certificates',
    description: 'List all certificates on the card',
    category: 'Certificates',
  },
  {
    id: 'read-certificate',
    name: 'Read Certificate',
    description: 'Read a certificate by index',
    category: 'Certificates',
    parameters: [
      {
        id: 'index',
        name: 'Certificate Index',
        type: 'number',
        required: true,
        defaultValue: 1,
        description: 'Certificate index (1-based)',
      },
    ],
  },
  {
    id: 'list-keys',
    name: 'List Keys',
    description: 'List public/private key references',
    category: 'Keys',
  },
  {
    id: 'read-public-key',
    name: 'Read Public Key',
    description: 'Read a public key',
    category: 'Keys',
    parameters: [
      {
        id: 'keyId',
        name: 'Key ID',
        type: 'hex',
        required: true,
        description: 'Key identifier',
      },
    ],
  },
  {
    id: 'get-challenge',
    name: 'Get Challenge',
    description: 'Get random data from card',
    category: 'Crypto',
    parameters: [
      {
        id: 'length',
        name: 'Length',
        type: 'number',
        required: false,
        defaultValue: 8,
        description: 'Number of random bytes',
      },
    ],
  },
  {
    id: 'select-file',
    name: 'Select File',
    description: 'Select a file by path',
    category: 'Advanced',
    parameters: [
      {
        id: 'path',
        name: 'File Path',
        type: 'hex',
        required: true,
        description: 'File path (e.g., 5015 for DF.CIA)',
      },
    ],
  },
  {
    id: 'read-binary',
    name: 'Read Binary',
    description: 'Read binary data from selected file',
    category: 'Advanced',
    parameters: [
      {
        id: 'offset',
        name: 'Offset',
        type: 'number',
        required: false,
        defaultValue: 0,
        description: 'Byte offset',
      },
      {
        id: 'length',
        name: 'Length',
        type: 'number',
        required: true,
        defaultValue: 256,
        description: 'Number of bytes to read',
      },
    ],
  },
  {
    id: 'verify-pin',
    name: 'Verify PIN',
    description: 'Verify user PIN',
    category: 'Security',
    requiresConfirmation: true,
    parameters: [
      {
        id: 'pin',
        name: 'PIN',
        type: 'string',
        required: true,
        description: 'User PIN',
      },
      {
        id: 'pinRef',
        name: 'PIN Reference',
        type: 'number',
        required: false,
        defaultValue: 1,
        description: 'PIN reference (1=user, 2=admin)',
      },
    ],
  },
];

export class PkiHandler implements CardHandler {
  readonly id = 'pki';
  readonly name = 'PKI Card';
  readonly description = 'PKCS#15 / PKI certificate cards';

  private selectedAid: string = '';
  private certificateFiles: string[] = [];

  async detect(
    atr: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<DetectionResult> {
    const atrUpper = atr.toUpperCase().replace(/\s/g, '');

    // Try to select known PKI applications
    const aidsToTry: Array<{ aid: string; name: string }> = [
      { aid: PKI_AIDS.PKCS15, name: 'PKCS#15 Card' },
      { aid: PKI_AIDS.IAS_ECC, name: 'IAS-ECC Card' },
      { aid: PKI_AIDS.GEMALTO, name: 'Gemalto PKI' },
      { aid: PKI_AIDS.GD_STARCOS, name: 'G+D STARCOS' },
    ];

    for (const { aid, name } of aidsToTry) {
      try {
        const response = await this.selectApplication(sendCommand, aid);
        if (this.isSuccess(response)) {
          this.selectedAid = aid;
          return {
            detected: true,
            confidence: 95,
            cardType: name,
            metadata: { aid },
          };
        }
      } catch {
        // Try next
      }
    }

    // Try to select PKCS#15 by DF
    try {
      // Select MF first
      await sendCommand([0x00, 0xa4, 0x00, 0x0c, 0x02, 0x3f, 0x00]);

      // Try to select DF.CIA
      const dfResponse = await this.selectFile(sendCommand, PKCS15_FILES.DF_CIA);
      if (this.isSuccess(dfResponse)) {
        // Try to read Token Info
        const tokenResponse = await this.selectFile(sendCommand, PKCS15_FILES.EF_TOKEN_INFO);
        if (this.isSuccess(tokenResponse)) {
          return {
            detected: true,
            confidence: 90,
            cardType: 'PKCS#15 Card',
          };
        }
      }
    } catch {
      // Not a PKCS#15 card
    }

    // Check ATR for crypto card patterns
    // Many PKI cards have specific patterns
    if (
      atrUpper.includes('504B4353') || // "PKCS" in hex
      atrUpper.includes('49415345') || // "IASE" in hex
      atrUpper.includes('474454') // "GDT" (G+D Token)
    ) {
      return {
        detected: true,
        confidence: 60,
        cardType: 'Possible PKI Card',
      };
    }

    return { detected: false, confidence: 0 };
  }

  getCommands(_metadata?: Record<string, unknown>): CardCommand[] {
    return PKI_COMMANDS;
  }

  async executeCommand(commandId: string, context: CommandContext): Promise<Response> {
    const { sendCommand, parameters } = context;

    switch (commandId) {
      case 'select-app':
        return this.selectPkiApplication(sendCommand);

      case 'read-token-info':
        return this.readTokenInfo(sendCommand);

      case 'list-objects':
        return this.listObjects(sendCommand);

      case 'list-certificates':
        return this.listCertificates(sendCommand);

      case 'read-certificate': {
        const index = parameters.index as number;
        return this.readCertificate(sendCommand, index);
      }

      case 'list-keys':
        return this.listKeys(sendCommand);

      case 'read-public-key': {
        const keyId = parameters.keyId as string;
        return this.readPublicKey(sendCommand, keyId);
      }

      case 'get-challenge': {
        const length = (parameters.length as number) || 8;
        return this.getChallenge(sendCommand, length);
      }

      case 'select-file': {
        const path = parameters.path as string;
        return this.selectFile(sendCommand, path);
      }

      case 'read-binary': {
        const offset = (parameters.offset as number) || 0;
        const length = parameters.length as number;
        return this.readBinary(sendCommand, offset, length);
      }

      case 'verify-pin': {
        const pin = parameters.pin as string;
        const pinRef = (parameters.pinRef as number) || 1;
        return this.verifyPin(sendCommand, pin, pinRef);
      }

      default:
        throw new Error(`Unknown command: ${commandId}`);
    }
  }

  async interrogate(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<InterrogationResult> {
    const applications: ApplicationInfo[] = [];
    this.certificateFiles = [];

    try {
      // Step 1: Select PKI application
      const selectResult = await this.selectPkiApplication(sendCommand);
      if (this.isSuccess(selectResult)) {
        applications.push({
          aid: this.selectedAid || 'PKI',
          name: 'PKI Application',
          label: 'Selected',
        });
      }

      // Step 2: Read Token Info
      const tokenResult = await this.readTokenInfo(sendCommand);
      if (this.isSuccess(tokenResult) && tokenResult.data.length > 0) {
        const tokenInfo = this.parseTokenInfo(tokenResult.data);
        applications.push({
          aid: 'TOKEN',
          name: 'Token Info',
          label: tokenInfo.label || 'Available',
        });
      }

      // Step 3: Read ODF (Object Directory File)
      const odfResult = await this.selectFile(sendCommand, PKCS15_FILES.EF_ODF);
      if (this.isSuccess(odfResult)) {
        const odfData = await this.readBinary(sendCommand, 0, 256);
        if (this.isSuccess(odfData)) {
          applications.push({
            aid: 'ODF',
            name: 'Object Directory',
            label: `${odfData.data.length} bytes`,
          });
        }
      }

      // Step 4: Read Certificate Directory
      const cdfResult = await this.selectFile(sendCommand, PKCS15_FILES.EF_CDF);
      if (this.isSuccess(cdfResult)) {
        const cdfData = await this.readBinary(sendCommand, 0, 512);
        if (this.isSuccess(cdfData) && cdfData.data.length > 0) {
          const certCount = this.countCertificatesInCdf(cdfData.data);
          applications.push({
            aid: 'CDF',
            name: 'Certificates',
            label: `${certCount} certificate(s)`,
          });
        }
      }

      // Step 5: Try to find actual certificate files
      const certFiles = [
        PKCS15_FILES.EF_CERT_1,
        PKCS15_FILES.EF_CERT_2,
        PKCS15_FILES.EF_CERT_3,
      ];

      for (const certFile of certFiles) {
        const selectResult = await this.selectFile(sendCommand, certFile);
        if (this.isSuccess(selectResult)) {
          this.certificateFiles.push(certFile);
        }
      }

      if (this.certificateFiles.length > 0) {
        applications.push({
          aid: 'CERTS',
          name: 'Certificate Files',
          label: `${this.certificateFiles.length} found`,
        });
      }

      // Step 6: Check for private key directory
      const prkdfResult = await this.selectFile(sendCommand, PKCS15_FILES.EF_PrKDF);
      if (this.isSuccess(prkdfResult)) {
        applications.push({
          aid: 'KEYS',
          name: 'Private Keys',
          label: 'Present (protected)',
        });
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

  private async selectPkiApplication(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    if (this.selectedAid) {
      return this.selectApplication(sendCommand, this.selectedAid);
    }

    // Try PKCS#15 AID
    let response = await this.selectApplication(sendCommand, PKI_AIDS.PKCS15);
    if (this.isSuccess(response)) {
      this.selectedAid = PKI_AIDS.PKCS15;
      return response;
    }

    // Try IAS-ECC
    response = await this.selectApplication(sendCommand, PKI_AIDS.IAS_ECC);
    if (this.isSuccess(response)) {
      this.selectedAid = PKI_AIDS.IAS_ECC;
      return response;
    }

    // Try to navigate to PKCS#15 DF
    await sendCommand([0x00, 0xa4, 0x00, 0x0c, 0x02, 0x3f, 0x00]); // Select MF
    return this.selectFile(sendCommand, PKCS15_FILES.DF_CIA);
  }

  private async selectApplication(
    sendCommand: (apdu: number[]) => Promise<Response>,
    aid: string
  ): Promise<Response> {
    const aidBytes = this.hexToBytes(aid);
    const apdu = [0x00, 0xa4, 0x04, 0x00, aidBytes.length, ...aidBytes, 0x00];
    return sendCommand(apdu);
  }

  private async selectFile(
    sendCommand: (apdu: number[]) => Promise<Response>,
    fileId: string
  ): Promise<Response> {
    const fileBytes = this.hexToBytes(fileId);
    const apdu = [0x00, 0xa4, 0x02, 0x0c, fileBytes.length, ...fileBytes];
    return sendCommand(apdu);
  }

  private async readBinary(
    sendCommand: (apdu: number[]) => Promise<Response>,
    offset: number,
    length: number
  ): Promise<Response> {
    const p1 = (offset >> 8) & 0x7f;
    const p2 = offset & 0xff;
    const le = Math.min(length, 256);
    const apdu = [0x00, 0xb0, p1, p2, le === 256 ? 0x00 : le];
    const response = await sendCommand(apdu);
    return this.handleGetResponse(sendCommand, response);
  }

  private async readTokenInfo(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    const selectResult = await this.selectFile(sendCommand, PKCS15_FILES.EF_TOKEN_INFO);
    if (!this.isSuccess(selectResult)) {
      return selectResult;
    }
    return this.readEntireFile(sendCommand, 256);
  }

  private async listObjects(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    const selectResult = await this.selectFile(sendCommand, PKCS15_FILES.EF_ODF);
    if (!this.isSuccess(selectResult)) {
      return selectResult;
    }
    return this.readEntireFile(sendCommand, 512);
  }

  private async listCertificates(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    const selectResult = await this.selectFile(sendCommand, PKCS15_FILES.EF_CDF);
    if (!this.isSuccess(selectResult)) {
      return selectResult;
    }
    return this.readEntireFile(sendCommand, 1024);
  }

  private async readCertificate(
    sendCommand: (apdu: number[]) => Promise<Response>,
    index: number
  ): Promise<Response> {
    // Try known certificate file locations
    const certFiles = [
      PKCS15_FILES.EF_CERT_1,
      PKCS15_FILES.EF_CERT_2,
      PKCS15_FILES.EF_CERT_3,
    ];

    if (index < 1 || index > certFiles.length) {
      return this.createErrorResponse(0x6a, 0x82);
    }

    const selectResult = await this.selectFile(sendCommand, certFiles[index - 1]);
    if (!this.isSuccess(selectResult)) {
      return selectResult;
    }

    // Certificates can be large, read up to 4KB
    return this.readEntireFile(sendCommand, 4096);
  }

  private async listKeys(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    // Try private key directory
    let selectResult = await this.selectFile(sendCommand, PKCS15_FILES.EF_PrKDF);
    if (this.isSuccess(selectResult)) {
      const prkdfData = await this.readEntireFile(sendCommand, 512);
      if (this.isSuccess(prkdfData) && prkdfData.data.length > 0) {
        return prkdfData;
      }
    }

    // Try public key directory
    selectResult = await this.selectFile(sendCommand, PKCS15_FILES.EF_PuKDF);
    if (this.isSuccess(selectResult)) {
      return this.readEntireFile(sendCommand, 512);
    }

    return this.createErrorResponse(0x6a, 0x82);
  }

  private async readPublicKey(
    sendCommand: (apdu: number[]) => Promise<Response>,
    keyId: string
  ): Promise<Response> {
    // Read from public key directory to find key file
    const pukdfResult = await this.selectFile(sendCommand, PKCS15_FILES.EF_PuKDF);
    if (!this.isSuccess(pukdfResult)) {
      // Try reading key directly if keyId is a file ID
      const keyResult = await this.selectFile(sendCommand, keyId);
      if (this.isSuccess(keyResult)) {
        return this.readEntireFile(sendCommand, 1024);
      }
      return pukdfResult;
    }

    return this.readEntireFile(sendCommand, 512);
  }

  private async getChallenge(
    sendCommand: (apdu: number[]) => Promise<Response>,
    length: number
  ): Promise<Response> {
    const apdu = [0x00, 0x84, 0x00, 0x00, Math.min(length, 256)];
    return sendCommand(apdu);
  }

  private async verifyPin(
    sendCommand: (apdu: number[]) => Promise<Response>,
    pin: string,
    pinRef: number
  ): Promise<Response> {
    // Encode PIN (typically ASCII, padded to 8 bytes)
    const pinBytes: number[] = [];
    for (let i = 0; i < 8; i++) {
      if (i < pin.length) {
        pinBytes.push(pin.charCodeAt(i));
      } else {
        pinBytes.push(0xff);
      }
    }

    // VERIFY: 00 20 00 [pin_ref] 08 [pin]
    const apdu = [0x00, 0x20, 0x00, pinRef, 0x08, ...pinBytes];
    return sendCommand(apdu);
  }

  private async readEntireFile(
    sendCommand: (apdu: number[]) => Promise<Response>,
    maxSize: number = 1024
  ): Promise<Response> {
    const allData: number[] = [];
    let offset = 0;
    const chunkSize = 256;

    while (offset < maxSize) {
      const response = await this.readBinary(sendCommand, offset, chunkSize);

      if (!this.isSuccess(response)) {
        if (allData.length > 0) {
          break;
        }
        return response;
      }

      allData.push(...response.data);
      offset += response.data.length;

      if (response.data.length < chunkSize) {
        break;
      }
    }

    return {
      id: `file-read-${Date.now()}`,
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
      const getResponseApdu = [0x00, 0xc0, 0x00, 0x00, response.sw2];
      return sendCommand(getResponseApdu);
    }
    return response;
  }

  private parseTokenInfo(data: number[]): { label?: string; serial?: string } {
    const result: { label?: string; serial?: string } = {};

    // TokenInfo is ASN.1 SEQUENCE
    if (data.length < 4 || data[0] !== ASN1_TAGS.SEQUENCE) {
      return result;
    }

    try {
      // Simple parse for label (typically first UTF8String or PrintableString)
      let offset = 2; // Skip SEQUENCE tag and length
      if (data[1] & 0x80) {
        offset += (data[1] & 0x7f);
      }

      while (offset < data.length - 2) {
        const tag = data[offset];
        const len = data[offset + 1];

        if (
          tag === ASN1_TAGS.UTF8_STRING ||
          tag === ASN1_TAGS.PRINTABLE_STRING ||
          tag === ASN1_TAGS.IA5_STRING
        ) {
          const strBytes = data.slice(offset + 2, offset + 2 + len);
          const str = String.fromCharCode(...strBytes.filter((b) => b >= 0x20 && b <= 0x7e));
          if (!result.label && str.length > 0) {
            result.label = str;
          }
          break;
        }

        offset += 2 + len;
      }
    } catch {
      // Parse error
    }

    return result;
  }

  private countCertificatesInCdf(data: number[]): number {
    // Count SEQUENCE tags at top level (each cert entry is a SEQUENCE)
    let count = 0;
    let offset = 0;

    while (offset < data.length - 2) {
      if (data[offset] === ASN1_TAGS.SEQUENCE) {
        count++;
        // Skip this sequence
        let len = data[offset + 1];
        if (len & 0x80) {
          const lenBytes = len & 0x7f;
          len = 0;
          for (let i = 0; i < lenBytes; i++) {
            len = (len << 8) | data[offset + 2 + i];
          }
          offset += 2 + lenBytes + len;
        } else {
          offset += 2 + len;
        }
      } else {
        offset++;
      }
    }

    return count;
  }

  private isSuccess(response: Response): boolean {
    return (
      (response.sw1 === 0x90 && response.sw2 === 0x00) ||
      response.sw1 === 0x61 ||
      response.sw1 === 0x62
    );
  }

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
