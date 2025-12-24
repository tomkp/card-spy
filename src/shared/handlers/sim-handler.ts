/**
 * SIM/USIM Card handler.
 * Supports reading data from GSM SIM and 3G/4G/5G USIM cards.
 *
 * References:
 * - GSM 11.11 / 3GPP TS 51.011 (SIM)
 * - ETSI TS 102 221 / 3GPP TS 31.101, 31.102 (USIM)
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
 * SIM card class byte (GSM 11.11).
 */
const CLA_SIM = 0xa0;

/**
 * USIM/UICC class byte (ETSI TS 102 221).
 */
const CLA_USIM = 0x00;

/**
 * Common file identifiers.
 */
const FILES = {
  // Master File
  MF: 0x3f00,

  // Under MF (2Fxx)
  EF_ICCID: 0x2fe2, // ICCID - always readable without PIN
  EF_DIR: 0x2f00, // Application directory
  EF_PL: 0x2f05, // Preferred languages

  // GSM DF (7F20)
  DF_GSM: 0x7f20,
  EF_IMSI: 0x6f07, // IMSI - usually requires PIN
  EF_KC: 0x6f20, // Ciphering key
  EF_PLMNSEL: 0x6f30, // PLMN selector
  EF_HPLMN: 0x6f31, // HPLMN search period
  EF_ACM_MAX: 0x6f37, // ACM maximum value
  EF_SST: 0x6f38, // SIM service table
  EF_ACM: 0x6f39, // Accumulated call meter
  EF_GID1: 0x6f3e, // Group identifier 1
  EF_GID2: 0x6f3f, // Group identifier 2
  EF_PUCT: 0x6f41, // Price per unit and currency table
  EF_CBMI: 0x6f45, // Cell broadcast message identifier
  EF_SPN: 0x6f46, // Service provider name
  EF_CBMID: 0x6f48, // Cell broadcast message IDs for data download
  EF_PHASE: 0x6fae, // Phase identification
  EF_AD: 0x6fad, // Administrative data
  EF_FPLMN: 0x6f7b, // Forbidden PLMNs
  EF_LOCI: 0x6f7e, // Location information
  EF_MSISDN: 0x6f40, // MSISDN (phone number)
  EF_SMS: 0x6f3c, // Short messages
  EF_SMSP: 0x6f42, // SMS parameters
  EF_SMSS: 0x6f43, // SMS status
  EF_ADN: 0x6f3a, // Abbreviated dialing numbers (phonebook)

  // Telecom DF (7F10)
  DF_TELECOM: 0x7f10,
  EF_ADN_TELECOM: 0x6f3a, // Phonebook under telecom

  // USIM ADF
  AID_USIM: 'A0000000871002', // USIM AID prefix
  EF_UST: 0x6f38, // USIM service table
  EF_EST: 0x6f56, // Enabled services table
  EF_LI: 0x6f05, // Language indication
  EF_ARR: 0x6f06, // Access rule reference
};

/**
 * SIM command definitions.
 */
const SIM_COMMANDS: CardCommand[] = [
  {
    id: 'read-iccid',
    name: 'Read ICCID',
    description: 'Read the card\'s unique identifier (no PIN required)',
    category: 'Identification',
  },
  {
    id: 'read-imsi',
    name: 'Read IMSI',
    description: 'Read the subscriber identity (may require PIN)',
    category: 'Identification',
  },
  {
    id: 'read-spn',
    name: 'Read Service Provider Name',
    description: 'Read the operator/carrier name',
    category: 'Identification',
  },
  {
    id: 'read-msisdn',
    name: 'Read MSISDN',
    description: 'Read phone number(s) stored on the card',
    category: 'Identification',
  },
  {
    id: 'read-phase',
    name: 'Read Phase',
    description: 'Read SIM card phase (1, 2, or 2+)',
    category: 'Information',
  },
  {
    id: 'read-sst',
    name: 'Read Service Table',
    description: 'Read available services on the SIM',
    category: 'Information',
  },
  {
    id: 'read-ad',
    name: 'Read Administrative Data',
    description: 'Read card mode and capabilities',
    category: 'Information',
  },
  {
    id: 'read-plmn',
    name: 'Read PLMN Selector',
    description: 'Read preferred network list',
    category: 'Network',
  },
  {
    id: 'read-fplmn',
    name: 'Read Forbidden PLMNs',
    description: 'Read forbidden network list',
    category: 'Network',
  },
  {
    id: 'read-loci',
    name: 'Read Location Info',
    description: 'Read last registered location (LAI, TMSI)',
    category: 'Network',
  },
  {
    id: 'verify-pin',
    name: 'Verify PIN',
    description: 'Verify PIN to unlock protected files',
    category: 'Security',
    requiresConfirmation: true,
    parameters: [
      {
        id: 'pin',
        name: 'PIN',
        type: 'string',
        required: true,
        validation: '^[0-9]{4,8}$',
        description: 'SIM PIN (4-8 digits)',
      },
    ],
  },
  {
    id: 'get-pin-status',
    name: 'Get PIN Status',
    description: 'Check PIN attempts remaining',
    category: 'Security',
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
        description: 'File ID (e.g., 3F00 for MF, 6F07 for IMSI)',
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
        defaultValue: 16,
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
        description: 'Record number (1-based)',
      },
      {
        id: 'length',
        name: 'Length',
        type: 'number',
        required: true,
        defaultValue: 32,
        description: 'Record length',
      },
    ],
  },
];

/**
 * Detected SIM card type.
 */
type SimType = 'SIM' | 'USIM' | 'ISIM' | 'Unknown';

export class SimHandler implements CardHandler {
  readonly id = 'sim';
  readonly name = 'SIM/USIM Card';
  readonly description = 'GSM SIM and 3G/4G/5G USIM subscriber cards';

  private simType: SimType = 'Unknown';
  private classBytes = CLA_SIM;
  private iccid: string = '';
  private pinVerified = false;

  async detect(
    atr: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<DetectionResult> {
    const atrUpper = atr.toUpperCase().replace(/\s/g, '');

    // Check ATR patterns for SIM cards
    const simPatterns = [
      /^3B3F/, // GSM SIM
      /^3B9F/, // USIM
      /^3B9[0-9A-F]96/, // USIM variant
      /^3B7[BD]/, // SIM/USIM
      /^3B1[EF]/, // Mini SIM
      /^3B6[89]00/, // Older SIM
    ];

    const isSimAtr = simPatterns.some((p) => p.test(atrUpper));

    // Try to select MF and read ICCID to confirm it's a SIM
    try {
      // Select MF (Master File)
      const mfResponse = await this.selectFile(sendCommand, FILES.MF);
      if (!this.isSuccess(mfResponse)) {
        // Try with USIM class byte
        this.classBytes = CLA_USIM;
        const mfResponse2 = await this.selectFile(sendCommand, FILES.MF);
        if (!this.isSuccess(mfResponse2)) {
          if (isSimAtr) {
            return {
              detected: true,
              confidence: 40,
              cardType: 'Possible SIM Card',
            };
          }
          return { detected: false, confidence: 0 };
        }
        this.simType = 'USIM';
      } else {
        this.simType = 'SIM';
      }

      // Try to read ICCID
      const iccidResponse = await this.selectFile(sendCommand, FILES.EF_ICCID);
      if (this.isSuccess(iccidResponse)) {
        const readResponse = await this.readBinary(sendCommand, 0, 10);
        if (this.isSuccess(readResponse) && readResponse.data.length > 0) {
          this.iccid = this.decodeIccid(readResponse.data);
          return {
            detected: true,
            confidence: 95,
            cardType: this.simType === 'USIM' ? 'USIM Card' : 'GSM SIM Card',
            metadata: {
              iccid: this.iccid,
              simType: this.simType,
            },
          };
        }
      }

      // Check for USIM application
      const dirResponse = await this.selectFile(sendCommand, FILES.EF_DIR);
      if (this.isSuccess(dirResponse)) {
        this.simType = 'USIM';
        return {
          detected: true,
          confidence: 85,
          cardType: 'USIM Card',
          metadata: { simType: this.simType },
        };
      }

      if (isSimAtr) {
        return {
          detected: true,
          confidence: 60,
          cardType: 'SIM Card (type unknown)',
        };
      }
    } catch {
      if (isSimAtr) {
        return {
          detected: true,
          confidence: 30,
          cardType: 'Possible SIM Card',
        };
      }
    }

    return { detected: false, confidence: 0 };
  }

  getCommands(_metadata?: Record<string, unknown>): CardCommand[] {
    return SIM_COMMANDS;
  }

  async executeCommand(commandId: string, context: CommandContext): Promise<Response> {
    const { sendCommand, parameters } = context;

    switch (commandId) {
      case 'read-iccid':
        return this.executeReadIccid(sendCommand);

      case 'read-imsi':
        return this.executeReadImsi(sendCommand);

      case 'read-spn':
        return this.executeReadSpn(sendCommand);

      case 'read-msisdn':
        return this.executeReadMsisdn(sendCommand);

      case 'read-phase':
        return this.executeReadPhase(sendCommand);

      case 'read-sst':
        return this.executeReadSst(sendCommand);

      case 'read-ad':
        return this.executeReadAd(sendCommand);

      case 'read-plmn':
        return this.executeReadPlmn(sendCommand);

      case 'read-fplmn':
        return this.executeReadFplmn(sendCommand);

      case 'read-loci':
        return this.executeReadLoci(sendCommand);

      case 'verify-pin': {
        const pin = parameters.pin as string;
        return this.executeVerifyPin(sendCommand, pin);
      }

      case 'get-pin-status':
        return this.executeGetPinStatus(sendCommand);

      case 'select-file': {
        const fileId = parseInt(parameters.fileId as string, 16);
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
      // Select MF
      await this.selectFile(sendCommand, FILES.MF);

      // Read ICCID
      const iccidResult = await this.executeReadIccid(sendCommand);
      if (this.isSuccess(iccidResult)) {
        this.iccid = this.decodeIccid(iccidResult.data);
      }

      // Try to read SPN (often readable without PIN)
      await this.selectFile(sendCommand, FILES.MF);
      await this.selectFile(sendCommand, FILES.DF_GSM);
      const spnResult = await this.selectFile(sendCommand, FILES.EF_SPN);
      if (this.isSuccess(spnResult)) {
        const spnData = await this.readBinary(sendCommand, 0, 17);
        if (this.isSuccess(spnData) && spnData.data.length > 0) {
          const spn = this.decodeSpn(spnData.data);
          if (spn) {
            applications.push({
              aid: 'SPN',
              name: 'Service Provider',
              label: spn,
            });
          }
        }
      }

      // Check for USIM application
      await this.selectFile(sendCommand, FILES.MF);
      const dirResult = await this.selectFile(sendCommand, FILES.EF_DIR);
      if (this.isSuccess(dirResult)) {
        // Read application directory records
        for (let i = 1; i <= 5; i++) {
          try {
            const recordResult = await this.readRecord(sendCommand, i, 32);
            if (this.isSuccess(recordResult) && recordResult.data.length > 0) {
              const appInfo = this.parseApplicationRecord(recordResult.data);
              if (appInfo) {
                applications.push(appInfo);
              }
            }
          } catch {
            break;
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

  private async executeReadIccid(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    await this.selectFile(sendCommand, FILES.MF);
    const selectResult = await this.selectFile(sendCommand, FILES.EF_ICCID);
    if (!this.isSuccess(selectResult)) {
      return selectResult;
    }
    return this.readBinary(sendCommand, 0, 10);
  }

  private async executeReadImsi(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    await this.selectFile(sendCommand, FILES.MF);
    await this.selectFile(sendCommand, FILES.DF_GSM);
    const selectResult = await this.selectFile(sendCommand, FILES.EF_IMSI);
    if (!this.isSuccess(selectResult)) {
      return selectResult;
    }
    return this.readBinary(sendCommand, 0, 9);
  }

  private async executeReadSpn(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    await this.selectFile(sendCommand, FILES.MF);
    await this.selectFile(sendCommand, FILES.DF_GSM);
    const selectResult = await this.selectFile(sendCommand, FILES.EF_SPN);
    if (!this.isSuccess(selectResult)) {
      return selectResult;
    }
    return this.readBinary(sendCommand, 0, 17);
  }

  private async executeReadMsisdn(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    await this.selectFile(sendCommand, FILES.MF);
    await this.selectFile(sendCommand, FILES.DF_GSM);
    const selectResult = await this.selectFile(sendCommand, FILES.EF_MSISDN);
    if (!this.isSuccess(selectResult)) {
      return selectResult;
    }
    // MSISDN is a linear fixed file, read first record
    return this.readRecord(sendCommand, 1, 34);
  }

  private async executeReadPhase(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    await this.selectFile(sendCommand, FILES.MF);
    await this.selectFile(sendCommand, FILES.DF_GSM);
    const selectResult = await this.selectFile(sendCommand, FILES.EF_PHASE);
    if (!this.isSuccess(selectResult)) {
      return selectResult;
    }
    return this.readBinary(sendCommand, 0, 1);
  }

  private async executeReadSst(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    await this.selectFile(sendCommand, FILES.MF);
    await this.selectFile(sendCommand, FILES.DF_GSM);
    const selectResult = await this.selectFile(sendCommand, FILES.EF_SST);
    if (!this.isSuccess(selectResult)) {
      return selectResult;
    }
    return this.readBinary(sendCommand, 0, 16);
  }

  private async executeReadAd(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    await this.selectFile(sendCommand, FILES.MF);
    await this.selectFile(sendCommand, FILES.DF_GSM);
    const selectResult = await this.selectFile(sendCommand, FILES.EF_AD);
    if (!this.isSuccess(selectResult)) {
      return selectResult;
    }
    return this.readBinary(sendCommand, 0, 4);
  }

  private async executeReadPlmn(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    await this.selectFile(sendCommand, FILES.MF);
    await this.selectFile(sendCommand, FILES.DF_GSM);
    const selectResult = await this.selectFile(sendCommand, FILES.EF_PLMNSEL);
    if (!this.isSuccess(selectResult)) {
      return selectResult;
    }
    return this.readBinary(sendCommand, 0, 30);
  }

  private async executeReadFplmn(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    await this.selectFile(sendCommand, FILES.MF);
    await this.selectFile(sendCommand, FILES.DF_GSM);
    const selectResult = await this.selectFile(sendCommand, FILES.EF_FPLMN);
    if (!this.isSuccess(selectResult)) {
      return selectResult;
    }
    return this.readBinary(sendCommand, 0, 12);
  }

  private async executeReadLoci(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    await this.selectFile(sendCommand, FILES.MF);
    await this.selectFile(sendCommand, FILES.DF_GSM);
    const selectResult = await this.selectFile(sendCommand, FILES.EF_LOCI);
    if (!this.isSuccess(selectResult)) {
      return selectResult;
    }
    return this.readBinary(sendCommand, 0, 11);
  }

  private async executeVerifyPin(
    sendCommand: (apdu: number[]) => Promise<Response>,
    pin: string
  ): Promise<Response> {
    // Encode PIN as 8-byte block (padded with FF)
    const pinBytes: number[] = [];
    for (let i = 0; i < 8; i++) {
      if (i < pin.length) {
        pinBytes.push(0x30 + parseInt(pin[i], 10));
      } else {
        pinBytes.push(0xff);
      }
    }

    // VERIFY CHV1 (PIN1)
    const apdu = [this.classBytes, 0x20, 0x00, 0x01, 0x08, ...pinBytes];
    const response = await sendCommand(apdu);

    if (this.isSuccess(response)) {
      this.pinVerified = true;
    }

    return response;
  }

  private async executeGetPinStatus(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<Response> {
    // Try to verify with empty PIN to get status
    // This returns 63 CX where X is remaining attempts
    const apdu = [this.classBytes, 0x20, 0x00, 0x01, 0x00];
    return sendCommand(apdu);
  }

  // Helper methods

  private async selectFile(
    sendCommand: (apdu: number[]) => Promise<Response>,
    fileId: number
  ): Promise<Response> {
    const p1p2Hi = (fileId >> 8) & 0xff;
    const p1p2Lo = fileId & 0xff;
    const apdu = [this.classBytes, 0xa4, 0x00, 0x00, 0x02, p1p2Hi, p1p2Lo];
    const response = await sendCommand(apdu);

    // Handle GET RESPONSE if needed (SW1=9F or SW1=61)
    if (response.sw1 === 0x9f || response.sw1 === 0x61) {
      const getResponseApdu = [this.classBytes, 0xc0, 0x00, 0x00, response.sw2];
      return sendCommand(getResponseApdu);
    }

    return response;
  }

  private async readBinary(
    sendCommand: (apdu: number[]) => Promise<Response>,
    offset: number,
    length: number
  ): Promise<Response> {
    const p1 = (offset >> 8) & 0xff;
    const p2 = offset & 0xff;
    const apdu = [this.classBytes, 0xb0, p1, p2, length];
    const response = await sendCommand(apdu);

    // Handle GET RESPONSE if needed
    if (response.sw1 === 0x9f || response.sw1 === 0x61) {
      const getResponseApdu = [this.classBytes, 0xc0, 0x00, 0x00, response.sw2];
      return sendCommand(getResponseApdu);
    }

    return response;
  }

  private async readRecord(
    sendCommand: (apdu: number[]) => Promise<Response>,
    recordNumber: number,
    length: number
  ): Promise<Response> {
    // P2: 04 = absolute mode
    const apdu = [this.classBytes, 0xb2, recordNumber, 0x04, length];
    const response = await sendCommand(apdu);

    // Handle GET RESPONSE if needed
    if (response.sw1 === 0x9f || response.sw1 === 0x61) {
      const getResponseApdu = [this.classBytes, 0xc0, 0x00, 0x00, response.sw2];
      return sendCommand(getResponseApdu);
    }

    return response;
  }

  private isSuccess(response: Response): boolean {
    return (
      (response.sw1 === 0x90 && response.sw2 === 0x00) ||
      response.sw1 === 0x9f ||
      response.sw1 === 0x61
    );
  }

  private decodeIccid(data: number[]): string {
    // ICCID is BCD encoded with nibbles swapped
    let iccid = '';
    for (const byte of data) {
      const lo = byte & 0x0f;
      const hi = (byte >> 4) & 0x0f;
      if (lo <= 9) iccid += lo.toString();
      if (hi <= 9) iccid += hi.toString();
    }
    return iccid;
  }

  private decodeSpn(data: number[]): string | null {
    if (data.length < 2) return null;
    // First byte is display condition, rest is SPN
    const spnBytes = data.slice(1);
    // Find end of string (0xFF padding)
    const endIndex = spnBytes.indexOf(0xff);
    const actualBytes = endIndex >= 0 ? spnBytes.slice(0, endIndex) : spnBytes;

    // Try to decode as GSM 7-bit or UCS-2
    try {
      // Check if it's printable ASCII
      if (actualBytes.every((b) => b >= 0x20 && b <= 0x7e)) {
        return String.fromCharCode(...actualBytes);
      }
      // Otherwise try UTF-8
      return new TextDecoder('utf-8').decode(new Uint8Array(actualBytes));
    } catch {
      return null;
    }
  }

  private parseApplicationRecord(data: number[]): ApplicationInfo | null {
    // Application template is TLV encoded
    if (data.length < 4 || data[0] !== 0x61) return null;

    const templateLen = data[1];
    if (templateLen < 2) return null;

    // Find AID (tag 4F)
    let offset = 2;
    while (offset < data.length - 2) {
      const tag = data[offset];
      const len = data[offset + 1];

      if (tag === 0x4f && len > 0) {
        const aid = this.bytesToHex(data.slice(offset + 2, offset + 2 + len));
        let label: string | undefined;

        // Look for label (tag 50)
        let labelOffset = offset + 2 + len;
        while (labelOffset < data.length - 2) {
          if (data[labelOffset] === 0x50) {
            const labelLen = data[labelOffset + 1];
            const labelBytes = data.slice(labelOffset + 2, labelOffset + 2 + labelLen);
            label = String.fromCharCode(...labelBytes.filter((b) => b >= 0x20 && b <= 0x7e));
            break;
          }
          labelOffset += 2 + (data[labelOffset + 1] || 0);
        }

        return {
          aid,
          name: this.getApplicationName(aid),
          label,
        };
      }

      offset += 2 + len;
    }

    return null;
  }

  private getApplicationName(aid: string): string {
    const aidUpper = aid.toUpperCase();
    if (aidUpper.startsWith('A0000000871002')) return 'USIM';
    if (aidUpper.startsWith('A0000000871004')) return 'ISIM';
    if (aidUpper.startsWith('A000000087')) return '3GPP Application';
    if (aidUpper.startsWith('A0000000090001')) return 'Visa Payment';
    if (aidUpper.startsWith('A0000000041010')) return 'Mastercard Payment';
    return 'Unknown Application';
  }

  private bytesToHex(bytes: number[]): string {
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
}
