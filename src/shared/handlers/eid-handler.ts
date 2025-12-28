/**
 * European eID (Electronic Identity) Card handler.
 * Supports reading public data from various national eID cards.
 *
 * Supported cards:
 * - Belgian eID (BELPIC)
 * - German eID (nPA) - limited, PACE required
 * - Estonian eID
 * - Portuguese Citizen Card
 * - Spanish DNIe
 *
 * References:
 * - ICAO Doc 9303 (Machine Readable Travel Documents)
 * - ISO 7816-4, 7816-15 (Card interface)
 * - Country-specific eID specifications
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
 * Known eID Application Identifiers.
 */
const EID_AIDS = {
  // Belgian eID
  BELPIC: 'A000000177504B43532D3135',
  BELPIC_DF: 'DF00',
  BELPIC_ID: 'DF01',
  BELPIC_SIG: 'DF02',

  // German eID (nPA)
  GERMAN_EID: 'E80704007F00070302',
  GERMAN_ESIGN: 'A000000167455349474E',

  // Estonian eID
  ESTONIAN_EID: 'D23300000045737445494420763335',
  ESTONIAN_AUTH: 'A000000077010800070000FE00000100',

  // Portuguese Citizen Card
  PORTUGUESE_CC: 'D2760001354B414E4D31',
  PORTUGUESE_IAS: 'A0000000770101',

  // Spanish DNIe
  SPANISH_DNIE: 'A0000000630310',
  SPANISH_DNIE_AUTH: 'A00000006303100102',

  // Italian CIE
  ITALIAN_CIE: 'A0000000308001',

  // Generic IAS-ECC
  IAS_ECC: 'A0000000770101',
};

/**
 * Belgian eID file structure.
 */
const BELPIC_FILES = {
  // Identity files
  ID_RN: '4031', // National Register Number
  ID_DATA: '4032', // Identity data
  ID_ADDRESS: '4033', // Address
  ID_PHOTO: '4035', // Photo
  ID_CARD: '4034', // Card data

  // Certificates
  CERT_RN: '503C', // National Register cert
  CERT_AUTH: '5038', // Authentication cert
  CERT_SIGN: '5039', // Signature cert
  CERT_CA: '503A', // CA cert
  CERT_ROOT: '503B', // Root cert
};

/**
 * eID command definitions.
 */
const EID_COMMANDS: CardCommand[] = [
  {
    id: 'select-app',
    name: 'Select eID Application',
    description: 'Select the eID application',
    category: 'Selection',
  },
  {
    id: 'read-identity',
    name: 'Read Identity',
    description: 'Read identity data (name, DOB, etc.)',
    category: 'Identity',
  },
  {
    id: 'read-address',
    name: 'Read Address',
    description: 'Read registered address',
    category: 'Identity',
  },
  {
    id: 'read-photo',
    name: 'Read Photo',
    description: 'Read card holder photo',
    category: 'Identity',
  },
  {
    id: 'read-card-data',
    name: 'Read Card Data',
    description: 'Read card metadata (validity, serial)',
    category: 'Identity',
  },
  {
    id: 'read-auth-cert',
    name: 'Read Auth Certificate',
    description: 'Read authentication certificate',
    category: 'Certificates',
  },
  {
    id: 'read-sign-cert',
    name: 'Read Signature Certificate',
    description: 'Read signature certificate',
    category: 'Certificates',
  },
  {
    id: 'read-ca-cert',
    name: 'Read CA Certificate',
    description: 'Read CA certificate',
    category: 'Certificates',
  },
  {
    id: 'get-atr-info',
    name: 'Get ATR Info',
    description: 'Parse ATR for card information',
    category: 'Information',
  },
  {
    id: 'select-file',
    name: 'Select File',
    description: 'Select a file by ID',
    category: 'Advanced',
    parameters: [
      {
        id: 'fileId',
        name: 'File ID',
        type: 'hex',
        required: true,
        description: 'File ID (e.g., 4032 for Belgian ID data)',
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
    description: 'Verify cardholder PIN',
    category: 'Security',
    requiresConfirmation: true,
    parameters: [
      {
        id: 'pin',
        name: 'PIN',
        type: 'string',
        required: true,
        description: 'Cardholder PIN',
      },
    ],
  },
];

/**
 * Detected eID type.
 */
type EidType = 'belgian' | 'german' | 'estonian' | 'portuguese' | 'spanish' | 'italian' | 'unknown';

export class EidHandler implements CardHandler {
  readonly id = 'eid';
  readonly name = 'European eID';
  readonly description = 'European national electronic identity cards';

  private eidType: EidType = 'unknown';
  private selectedAid: string = '';

  async detect(
    atr: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<DetectionResult> {
    const atrUpper = atr.toUpperCase().replace(/\s/g, '');

    // Check ATR patterns for known eID cards
    // Belgian eID
    if (atrUpper.includes('00006563') || atrUpper.includes('42454C5049')) {
      this.eidType = 'belgian';
      return {
        detected: true,
        confidence: 90,
        cardType: 'Belgian eID',
        metadata: { eidType: 'belgian' },
      };
    }

    // German nPA
    if (atrUpper.includes('D276000025') || atrUpper.includes('E80704007F00070302')) {
      this.eidType = 'german';
      return {
        detected: true,
        confidence: 85,
        cardType: 'German eID (nPA)',
        metadata: { eidType: 'german', note: 'PACE authentication required' },
      };
    }

    // Try to select known eID applications
    const aidsToTry: Array<{ aid: string; type: EidType; name: string }> = [
      { aid: EID_AIDS.BELPIC, type: 'belgian', name: 'Belgian eID' },
      { aid: EID_AIDS.ESTONIAN_EID, type: 'estonian', name: 'Estonian eID' },
      { aid: EID_AIDS.PORTUGUESE_IAS, type: 'portuguese', name: 'Portuguese CC' },
      { aid: EID_AIDS.SPANISH_DNIE, type: 'spanish', name: 'Spanish DNIe' },
      { aid: EID_AIDS.ITALIAN_CIE, type: 'italian', name: 'Italian CIE' },
      { aid: EID_AIDS.IAS_ECC, type: 'unknown', name: 'IAS-ECC Card' },
    ];

    for (const { aid, type, name } of aidsToTry) {
      try {
        const response = await this.selectApplication(sendCommand, aid);
        if (this.isSuccess(response)) {
          this.eidType = type;
          this.selectedAid = aid;
          return {
            detected: true,
            confidence: 95,
            cardType: name,
            metadata: { eidType: type, aid },
          };
        }
      } catch {
        // Try next
      }
    }

    // Generic contact card with T=1 might be eID
    if (atrUpper.startsWith('3B') && atrUpper.length >= 10) {
      // Check for T=1 protocol
      const t0 = parseInt(atrUpper.substring(2, 4), 16);
      if ((t0 & 0x80) !== 0) {
        // TD1 present, could be smart card with PIN
        return {
          detected: true,
          confidence: 20,
          cardType: 'Possible eID Card',
        };
      }
    }

    return { detected: false, confidence: 0 };
  }

  getCommands(_metadata?: Record<string, unknown>): CardCommand[] {
    return EID_COMMANDS;
  }

  async executeCommand(commandId: string, context: CommandContext): Promise<Response> {
    const { sendCommand, parameters } = context;

    switch (commandId) {
      case 'select-app':
        return this.selectEidApplication(sendCommand);

      case 'read-identity':
        return this.readIdentity(sendCommand);

      case 'read-address':
        return this.readAddress(sendCommand);

      case 'read-photo':
        return this.readPhoto(sendCommand);

      case 'read-card-data':
        return this.readCardData(sendCommand);

      case 'read-auth-cert':
        return this.readCertificate(sendCommand, 'auth');

      case 'read-sign-cert':
        return this.readCertificate(sendCommand, 'sign');

      case 'read-ca-cert':
        return this.readCertificate(sendCommand, 'ca');

      case 'get-atr-info':
        return this.getAtrInfo(context.atr);

      case 'select-file': {
        const fileId = parameters.fileId as string;
        return this.selectFile(sendCommand, fileId);
      }

      case 'read-binary': {
        const offset = (parameters.offset as number) || 0;
        const length = parameters.length as number;
        return this.readBinary(sendCommand, offset, length);
      }

      case 'verify-pin': {
        const pin = parameters.pin as string;
        return this.verifyPin(sendCommand, pin);
      }

      default:
        throw new Error(`Unknown command: ${commandId}`);
    }
  }

  async interrogate(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<InterrogationResult> {
    const applications: ApplicationInfo[] = [];

    try {
      // Step 1: Select eID application
      const selectResult = await this.selectEidApplication(sendCommand);
      if (this.isSuccess(selectResult)) {
        applications.push({
          aid: this.selectedAid || 'EID',
          name: `${this.getEidTypeName()} Application`,
          label: 'Selected',
        });
      } else {
        return {
          success: false,
          error: 'Could not select eID application',
        };
      }

      // Step 2: Based on card type, read available data
      if (this.eidType === 'belgian') {
        // Belgian eID structure
        // Select ID DF
        await this.selectFile(sendCommand, BELPIC_FILES.ID_RN);
        const idResult = await this.readBinary(sendCommand, 0, 12);
        if (this.isSuccess(idResult)) {
          applications.push({
            aid: 'ID',
            name: 'Identity File',
            label: 'National number present',
          });
        }

        // Check for photo
        await this.selectFile(sendCommand, BELPIC_FILES.ID_PHOTO);
        const photoResult = await this.readBinary(sendCommand, 0, 16);
        if (this.isSuccess(photoResult)) {
          applications.push({
            aid: 'PHOTO',
            name: 'Photo',
            label: 'Photo available',
          });
        }

        // Check for certificates
        await this.selectFile(sendCommand, BELPIC_FILES.CERT_AUTH);
        const certResult = await this.readBinary(sendCommand, 0, 16);
        if (this.isSuccess(certResult)) {
          applications.push({
            aid: 'CERTS',
            name: 'Certificates',
            label: 'Auth/Sign certificates present',
          });
        }
      } else {
        // Generic eID - try common structures
        // Try to read from common file locations
        const commonFiles = ['3F00', '0002', '0003', '5000'];
        for (const fileId of commonFiles) {
          const selectResult = await this.selectFile(sendCommand, fileId);
          if (this.isSuccess(selectResult)) {
            applications.push({
              aid: fileId,
              name: `File ${fileId}`,
              label: 'Present',
            });
          }
        }
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

  private async selectEidApplication(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    if (this.selectedAid) {
      return this.selectApplication(sendCommand, this.selectedAid);
    }

    // Try Belgian eID first
    let response = await this.selectApplication(sendCommand, EID_AIDS.BELPIC);
    if (this.isSuccess(response)) {
      this.eidType = 'belgian';
      this.selectedAid = EID_AIDS.BELPIC;
      return response;
    }

    // Try IAS-ECC
    response = await this.selectApplication(sendCommand, EID_AIDS.IAS_ECC);
    if (this.isSuccess(response)) {
      this.selectedAid = EID_AIDS.IAS_ECC;
      return response;
    }

    return response;
  }

  private async selectApplication(
    sendCommand: (apdu: number[]) => Promise<Response>,
    aid: string
  ): Promise<Response> {
    const aidBytes = hexToBytes(aid);
    const apdu = [0x00, 0xa4, 0x04, 0x0c, aidBytes.length, ...aidBytes];
    return sendCommand(apdu);
  }

  private async selectFile(
    sendCommand: (apdu: number[]) => Promise<Response>,
    fileId: string
  ): Promise<Response> {
    const fileBytes = hexToBytes(fileId);
    // SELECT by file ID
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
    return sendCommand(apdu);
  }

  private async readIdentity(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    if (this.eidType === 'belgian') {
      await this.selectFile(sendCommand, BELPIC_FILES.ID_DATA);
      return this.readEntireFile(sendCommand);
    }
    // Generic: try common identity file
    await this.selectFile(sendCommand, '5000');
    return this.readBinary(sendCommand, 0, 256);
  }

  private async readAddress(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    if (this.eidType === 'belgian') {
      await this.selectFile(sendCommand, BELPIC_FILES.ID_ADDRESS);
      return this.readEntireFile(sendCommand);
    }
    // Generic: try common address file
    await this.selectFile(sendCommand, '5001');
    return this.readBinary(sendCommand, 0, 256);
  }

  private async readPhoto(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    if (this.eidType === 'belgian') {
      await this.selectFile(sendCommand, BELPIC_FILES.ID_PHOTO);
      return this.readEntireFile(sendCommand, 4000); // Photos are larger
    }
    return this.createErrorResponse(0x6a, 0x82); // File not found
  }

  private async readCardData(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    if (this.eidType === 'belgian') {
      await this.selectFile(sendCommand, BELPIC_FILES.ID_CARD);
      return this.readEntireFile(sendCommand);
    }
    // Try to read EF.CardInfo
    await this.selectFile(sendCommand, '5004');
    return this.readBinary(sendCommand, 0, 128);
  }

  private async readCertificate(
    sendCommand: (apdu: number[]) => Promise<Response>,
    type: 'auth' | 'sign' | 'ca'
  ): Promise<Response> {
    if (this.eidType === 'belgian') {
      const fileId =
        type === 'auth'
          ? BELPIC_FILES.CERT_AUTH
          : type === 'sign'
            ? BELPIC_FILES.CERT_SIGN
            : BELPIC_FILES.CERT_CA;

      await this.selectFile(sendCommand, fileId);
      return this.readEntireFile(sendCommand, 2048); // Certs can be large
    }
    return this.createErrorResponse(0x6a, 0x82);
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
          // Return what we have
          break;
        }
        return response;
      }

      allData.push(...response.data);
      offset += response.data.length;

      // If we got less than requested, we're at EOF
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
      hex: bytesToHex(allData),
    };
  }

  private async verifyPin(
    sendCommand: (apdu: number[]) => Promise<Response>,
    pin: string
  ): Promise<Response> {
    // Encode PIN as ASCII, padded with FF
    const pinBytes: number[] = [];
    for (let i = 0; i < 8; i++) {
      if (i < pin.length) {
        pinBytes.push(pin.charCodeAt(i));
      } else {
        pinBytes.push(0xff);
      }
    }

    // VERIFY PIN
    const apdu = [0x00, 0x20, 0x00, 0x01, 0x08, ...pinBytes];
    return sendCommand(apdu);
  }

  private getAtrInfo(atr: string): Response {
    const info: string[] = [];
    const atrUpper = atr.toUpperCase().replace(/\s/g, '');

    // Parse ATR for useful information
    if (atrUpper.includes('42454C5049')) {
      info.push('Belgian BELPIC card');
    }
    if (atrUpper.includes('00006563')) {
      info.push('Belgian eID');
    }
    if (atrUpper.includes('D276000025')) {
      info.push('German nPA');
    }

    // Extract T0
    const t0 = parseInt(atrUpper.substring(2, 4), 16);
    const historicalBytes = t0 & 0x0f;
    info.push(`${historicalBytes} historical bytes`);

    // Protocol info
    if ((t0 & 0x80) !== 0) {
      info.push('T=1 supported');
    } else {
      info.push('T=0 only');
    }

    const infoStr = info.join(', ');
    const infoBytes = infoStr.split('').map((c) => c.charCodeAt(0));

    return {
      id: `atr-info-${Date.now()}`,
      timestamp: Date.now(),
      data: infoBytes,
      sw1: 0x90,
      sw2: 0x00,
      hex: bytesToHex(infoBytes),
      meaning: infoStr,
    };
  }

  // Helper methods

  private getEidTypeName(): string {
    switch (this.eidType) {
      case 'belgian':
        return 'Belgian eID';
      case 'german':
        return 'German nPA';
      case 'estonian':
        return 'Estonian eID';
      case 'portuguese':
        return 'Portuguese CC';
      case 'spanish':
        return 'Spanish DNIe';
      case 'italian':
        return 'Italian CIE';
      default:
        return 'eID';
    }
  }

  private isSuccess(response: Response): boolean {
    return (
      (response.sw1 === 0x90 && response.sw2 === 0x00) ||
      response.sw1 === 0x61 || // More data
      response.sw1 === 0x62 // Warning
    );
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
