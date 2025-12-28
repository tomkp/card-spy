/**
 * Health Card handler.
 * Supports reading data from health insurance cards.
 *
 * Supported cards:
 * - European Health Insurance Card (EHIC)
 * - German eGK (elektronische Gesundheitskarte)
 * - French Carte Vitale
 * - Austrian e-card
 *
 * References:
 * - ISO 21549 (Patient healthcare data)
 * - EN 1867 (Health informatics cards)
 * - Country-specific health card specifications
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
 * Health Card Application Identifiers.
 */
const HEALTH_AIDS = {
  // German eGK (Gesundheitskarte)
  EGK_HCA: 'D27600000102', // Health Care Application
  EGK_ESIGN: 'A000000167455349474E', // eSign
  EGK_MF: 'D276000001020000', // Master File

  // French Carte Vitale
  VITALE: 'D250000004',
  VITALE_2: 'D2500000040001',

  // Austrian e-card
  ECARD: 'D040000001',
  ECARD_SVA: 'D04000000101',

  // EHIC (European Health Insurance Card)
  EHIC: 'A0000000770106',

  // Generic Health
  HEALTH_ISO: 'D276000001',
};

/**
 * German eGK file structure.
 */
const EGK_FILES = {
  // Under MF
  EF_GDO: '2F02', // Global Data Objects
  EF_ATR: '2F01', // ATR file

  // Under HCA (Health Care Application)
  EF_VD: 'D001', // Versichertendaten (insured person data)
  EF_PD: 'D002', // Prüfungsdaten (verification data)
  EF_GVD: 'D003', // Geschützte Versichertendaten
  EF_NFD: 'D006', // Notfalldaten (emergency data)
  EF_DPE: 'D007', // Persönliche Erklärungen

  // Access rights
  DF_HCA: 'D276000001020001', // Health Care Application DF
};

/**
 * French Carte Vitale file structure.
 */
const VITALE_FILES = {
  // Main data files
  EF_BENEF: '0002', // Beneficiary
  EF_DROITS: '0003', // Rights
  EF_MEDIC: '0004', // Medical info
};

/**
 * Health card command definitions.
 */
const HEALTH_COMMANDS: CardCommand[] = [
  {
    id: 'select-app',
    name: 'Select Health Application',
    description: 'Select the health care application',
    category: 'Selection',
  },
  {
    id: 'read-patient-data',
    name: 'Read Patient Data',
    description: 'Read insured person/patient data',
    category: 'Read',
  },
  {
    id: 'read-insurance-data',
    name: 'Read Insurance Data',
    description: 'Read health insurance information',
    category: 'Read',
  },
  {
    id: 'read-emergency-data',
    name: 'Read Emergency Data',
    description: 'Read emergency/medical data (if available)',
    category: 'Read',
  },
  {
    id: 'read-ehic-data',
    name: 'Read EHIC Data',
    description: 'Read European Health Insurance Card data',
    category: 'Read',
  },
  {
    id: 'get-card-info',
    name: 'Get Card Info',
    description: 'Read card metadata and version',
    category: 'Information',
  },
  {
    id: 'read-gdo',
    name: 'Read GDO',
    description: 'Read Global Data Objects',
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
        description: 'File ID to select',
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
    id: 'read-record',
    name: 'Read Record',
    description: 'Read a record from a linear file',
    category: 'Advanced',
    parameters: [
      {
        id: 'record',
        name: 'Record Number',
        type: 'number',
        required: true,
        defaultValue: 1,
        description: 'Record number',
      },
      {
        id: 'length',
        name: 'Length',
        type: 'number',
        required: true,
        defaultValue: 64,
        description: 'Record length',
      },
    ],
  },
];

/**
 * Detected health card type.
 */
type HealthCardType = 'egk' | 'vitale' | 'ecard' | 'ehic' | 'unknown';

export class HealthCardHandler implements CardHandler {
  readonly id = 'health';
  readonly name = 'Health Card';
  readonly description = 'Health insurance and medical cards';

  private cardType: HealthCardType = 'unknown';
  private selectedAid: string = '';

  async detect(
    atr: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<DetectionResult> {
    const atrUpper = atr.toUpperCase().replace(/\s/g, '');

    // Check ATR patterns for known health cards
    // German eGK
    if (atrUpper.includes('D27600000102') || atrUpper.includes('6567')) {
      this.cardType = 'egk';
      return {
        detected: true,
        confidence: 90,
        cardType: 'German eGK',
        metadata: { cardType: 'egk' },
      };
    }

    // French Carte Vitale
    if (atrUpper.includes('D250000004')) {
      this.cardType = 'vitale';
      return {
        detected: true,
        confidence: 90,
        cardType: 'French Carte Vitale',
        metadata: { cardType: 'vitale' },
      };
    }

    // Austrian e-card
    if (atrUpper.includes('D040000001')) {
      this.cardType = 'ecard';
      return {
        detected: true,
        confidence: 90,
        cardType: 'Austrian e-card',
        metadata: { cardType: 'ecard' },
      };
    }

    // Try to select known health applications
    const aidsToTry: Array<{ aid: string; type: HealthCardType; name: string }> = [
      { aid: HEALTH_AIDS.EGK_HCA, type: 'egk', name: 'German eGK' },
      { aid: HEALTH_AIDS.VITALE, type: 'vitale', name: 'French Carte Vitale' },
      { aid: HEALTH_AIDS.VITALE_2, type: 'vitale', name: 'French Carte Vitale 2' },
      { aid: HEALTH_AIDS.ECARD, type: 'ecard', name: 'Austrian e-card' },
      { aid: HEALTH_AIDS.EHIC, type: 'ehic', name: 'EHIC' },
    ];

    for (const { aid, type, name } of aidsToTry) {
      try {
        const response = await this.selectApplication(sendCommand, aid);
        if (this.isSuccess(response)) {
          this.cardType = type;
          this.selectedAid = aid;
          return {
            detected: true,
            confidence: 95,
            cardType: name,
            metadata: { cardType: type, aid },
          };
        }
      } catch {
        // Try next
      }
    }

    // Check for generic health card patterns
    if (atrUpper.includes('D276') || atrUpper.includes('D250') || atrUpper.includes('D040')) {
      return {
        detected: true,
        confidence: 50,
        cardType: 'Possible Health Card',
      };
    }

    return { detected: false, confidence: 0 };
  }

  getCommands(_metadata?: Record<string, unknown>): CardCommand[] {
    return HEALTH_COMMANDS;
  }

  async executeCommand(commandId: string, context: CommandContext): Promise<Response> {
    const { sendCommand, parameters } = context;

    switch (commandId) {
      case 'select-app':
        return this.selectHealthApplication(sendCommand);

      case 'read-patient-data':
        return this.readPatientData(sendCommand);

      case 'read-insurance-data':
        return this.readInsuranceData(sendCommand);

      case 'read-emergency-data':
        return this.readEmergencyData(sendCommand);

      case 'read-ehic-data':
        return this.readEhicData(sendCommand);

      case 'get-card-info':
        return this.getCardInfo(sendCommand);

      case 'read-gdo':
        return this.readGdo(sendCommand);

      case 'select-file': {
        const fileId = parameters.fileId as string;
        return this.selectFile(sendCommand, fileId);
      }

      case 'read-binary': {
        const offset = (parameters.offset as number) || 0;
        const length = parameters.length as number;
        return this.readBinary(sendCommand, offset, length);
      }

      case 'read-record': {
        const record = parameters.record as number;
        const length = parameters.length as number;
        return this.readRecord(sendCommand, record, length);
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
      // Step 1: Select health application
      const selectResult = await this.selectHealthApplication(sendCommand);
      if (this.isSuccess(selectResult)) {
        applications.push({
          aid: this.selectedAid || 'HEALTH',
          name: `${this.getCardTypeName()} Application`,
          label: 'Selected',
        });
      }

      // Step 2: Try to read GDO
      const gdoResult = await this.readGdo(sendCommand);
      if (this.isSuccess(gdoResult) && gdoResult.data.length > 0) {
        applications.push({
          aid: 'GDO',
          name: 'Global Data Objects',
          label: `${gdoResult.data.length} bytes`,
        });
      }

      // Step 3: Based on card type, probe for files
      if (this.cardType === 'egk') {
        // German eGK files
        const filesToCheck = [
          { id: EGK_FILES.EF_VD, name: 'Versichertendaten' },
          { id: EGK_FILES.EF_PD, name: 'Prüfungsdaten' },
          { id: EGK_FILES.EF_NFD, name: 'Notfalldaten' },
        ];

        for (const { id, name } of filesToCheck) {
          const selectResult = await this.selectFile(sendCommand, id);
          if (this.isSuccess(selectResult)) {
            applications.push({
              aid: id,
              name,
              label: 'Available',
            });
          }
        }
      } else if (this.cardType === 'vitale') {
        // French Vitale files
        const filesToCheck = [
          { id: VITALE_FILES.EF_BENEF, name: 'Beneficiary' },
          { id: VITALE_FILES.EF_DROITS, name: 'Rights' },
        ];

        for (const { id, name } of filesToCheck) {
          const selectResult = await this.selectFile(sendCommand, id);
          if (this.isSuccess(selectResult)) {
            applications.push({
              aid: id,
              name,
              label: 'Available',
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

  private async selectHealthApplication(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    if (this.selectedAid) {
      return this.selectApplication(sendCommand, this.selectedAid);
    }

    // Try different health AIDs based on likely card type
    const aidsToTry = [
      HEALTH_AIDS.EGK_HCA,
      HEALTH_AIDS.VITALE,
      HEALTH_AIDS.ECARD,
      HEALTH_AIDS.EHIC,
    ];

    for (const aid of aidsToTry) {
      const response = await this.selectApplication(sendCommand, aid);
      if (this.isSuccess(response)) {
        this.selectedAid = aid;
        return response;
      }
    }

    return this.createErrorResponse(0x6a, 0x82);
  }

  private async selectApplication(
    sendCommand: (apdu: number[]) => Promise<Response>,
    aid: string
  ): Promise<Response> {
    const aidBytes = hexToBytes(aid);
    const apdu = [0x00, 0xa4, 0x04, 0x00, aidBytes.length, ...aidBytes, 0x00];
    return sendCommand(apdu);
  }

  private async selectFile(
    sendCommand: (apdu: number[]) => Promise<Response>,
    fileId: string
  ): Promise<Response> {
    const fileBytes = hexToBytes(fileId);
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

  private async readRecord(
    sendCommand: (apdu: number[]) => Promise<Response>,
    recordNumber: number,
    length: number
  ): Promise<Response> {
    const apdu = [0x00, 0xb2, recordNumber, 0x04, length];
    const response = await sendCommand(apdu);
    return this.handleGetResponse(sendCommand, response);
  }

  private async readPatientData(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    if (this.cardType === 'egk') {
      await this.selectFile(sendCommand, EGK_FILES.EF_VD);
      return this.readEntireFile(sendCommand);
    }
    if (this.cardType === 'vitale') {
      await this.selectFile(sendCommand, VITALE_FILES.EF_BENEF);
      return this.readEntireFile(sendCommand);
    }
    // Generic: try common patient data file
    await this.selectFile(sendCommand, '0001');
    return this.readBinary(sendCommand, 0, 256);
  }

  private async readInsuranceData(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    if (this.cardType === 'egk') {
      await this.selectFile(sendCommand, EGK_FILES.EF_PD);
      return this.readEntireFile(sendCommand);
    }
    if (this.cardType === 'vitale') {
      await this.selectFile(sendCommand, VITALE_FILES.EF_DROITS);
      return this.readEntireFile(sendCommand);
    }
    // Generic
    await this.selectFile(sendCommand, '0002');
    return this.readBinary(sendCommand, 0, 256);
  }

  private async readEmergencyData(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    if (this.cardType === 'egk') {
      await this.selectFile(sendCommand, EGK_FILES.EF_NFD);
      return this.readEntireFile(sendCommand);
    }
    return this.createErrorResponse(0x6a, 0x82); // Not available
  }

  private async readEhicData(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    // EHIC data is typically on the back of the card optically
    // But some cards store it electronically
    const response = await this.selectApplication(sendCommand, HEALTH_AIDS.EHIC);
    if (!this.isSuccess(response)) {
      return response;
    }
    // Try to read from common EHIC files
    await this.selectFile(sendCommand, '0001');
    return this.readBinary(sendCommand, 0, 128);
  }

  private async getCardInfo(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    // Read ATR file if available
    const atrResult = await this.selectFile(sendCommand, EGK_FILES.EF_ATR);
    if (this.isSuccess(atrResult)) {
      return this.readBinary(sendCommand, 0, 64);
    }

    // Try to get data using GET DATA
    const apdu = [0x00, 0xca, 0x9f, 0x7f, 0x00];
    return sendCommand(apdu);
  }

  private async readGdo(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    // Select MF first
    await sendCommand([0x00, 0xa4, 0x00, 0x0c, 0x02, 0x3f, 0x00]);

    // Select GDO file
    const selectResult = await this.selectFile(sendCommand, EGK_FILES.EF_GDO);
    if (!this.isSuccess(selectResult)) {
      return selectResult;
    }

    return this.readBinary(sendCommand, 0, 64);
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
      hex: bytesToHex(allData),
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

  private getCardTypeName(): string {
    switch (this.cardType) {
      case 'egk':
        return 'German eGK';
      case 'vitale':
        return 'French Carte Vitale';
      case 'ecard':
        return 'Austrian e-card';
      case 'ehic':
        return 'EHIC';
      default:
        return 'Health Card';
    }
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
      hex: bytesToHex([sw1, sw2]),
    };
  }
}
