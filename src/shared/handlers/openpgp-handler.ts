/**
 * OpenPGP card handler.
 * Supports OpenPGP smart cards (YubiKey, Nitrokey, etc.)
 */

import type { Response } from '../types';
import { hexToBytes } from '../tlv';
import { buildSelectCommand } from '../emv';
import type {
  CardHandler,
  CardCommand,
  CommandContext,
  DetectionResult,
  InterrogationResult,
} from './types';

/**
 * OpenPGP Application ID.
 */
const OPENPGP_AID = 'D27600012401';

/**
 * OpenPGP Data Objects.
 */
const OPENPGP_OBJECTS = {
  // DO tags for GET DATA
  AID: '4F',
  LOGIN_DATA: '5E',
  URL: '5F50',
  HISTORICAL_BYTES: '5F52',
  CARDHOLDER_RELATED_DATA: '65',
  APPLICATION_RELATED_DATA: '6E',
  SECURITY_SUPPORT_TEMPLATE: '7A',
  CARDHOLDER_CERTIFICATE: '7F21',
  ALGORITHM_ATTRIBUTES_SIG: 'C1',
  ALGORITHM_ATTRIBUTES_DEC: 'C2',
  ALGORITHM_ATTRIBUTES_AUTH: 'C3',
  PW_STATUS_BYTES: 'C4',
  FINGERPRINTS: 'C5',
  CA_FINGERPRINTS: 'C6',
  GENERATION_TIMES: 'CD',
  KEY_INFORMATION: 'DE',
};

/**
 * OpenPGP command definitions.
 */
const OPENPGP_COMMANDS: CardCommand[] = [
  {
    id: 'select-openpgp',
    name: 'Select OpenPGP',
    description: 'Select the OpenPGP application',
    category: 'Discovery',
  },
  {
    id: 'get-aid',
    name: 'Get Application ID',
    description: 'Get OpenPGP application identifier',
    category: 'Read',
  },
  {
    id: 'get-cardholder-data',
    name: 'Get Cardholder Data',
    description: 'Get cardholder related data (name, language, sex)',
    category: 'Read',
  },
  {
    id: 'get-application-data',
    name: 'Get Application Data',
    description: 'Get application related data (capabilities, features)',
    category: 'Read',
  },
  {
    id: 'get-url',
    name: 'Get Public Key URL',
    description: 'Get URL where public key is stored',
    category: 'Read',
  },
  {
    id: 'get-login-data',
    name: 'Get Login Data',
    description: 'Get login/account name data',
    category: 'Read',
  },
  {
    id: 'get-fingerprints',
    name: 'Get Key Fingerprints',
    description: 'Get fingerprints of signature, decryption, and authentication keys',
    category: 'Read',
  },
  {
    id: 'get-pw-status',
    name: 'Get PIN Status',
    description: 'Get PIN retry counters and status',
    category: 'Security',
  },
  {
    id: 'get-algorithm-attributes',
    name: 'Get Algorithm Attributes',
    description: 'Get key algorithm attributes',
    category: 'Read',
    parameters: [
      {
        id: 'key',
        name: 'Key Type',
        type: 'select',
        required: true,
        options: [
          { value: 'C1', label: 'Signature Key' },
          { value: 'C2', label: 'Decryption Key' },
          { value: 'C3', label: 'Authentication Key' },
        ],
        description: 'Which key to query',
      },
    ],
  },
  {
    id: 'get-security-template',
    name: 'Get Security Support Template',
    description: 'Get digital signature counter',
    category: 'Read',
  },
  {
    id: 'get-certificate',
    name: 'Get Certificate',
    description: 'Get cardholder certificate',
    category: 'Certificates',
  },
  {
    id: 'verify-pw1-sign',
    name: 'Verify PIN (Signing)',
    description: 'Verify user PIN for signing operations',
    category: 'Security',
    requiresConfirmation: true,
    parameters: [
      {
        id: 'pin',
        name: 'User PIN',
        type: 'string',
        required: true,
        validation: '^.{6,127}$',
        description: 'User PIN (6-127 characters)',
      },
    ],
  },
  {
    id: 'verify-pw1-decrypt',
    name: 'Verify PIN (Decrypt/Auth)',
    description: 'Verify user PIN for decryption and authentication',
    category: 'Security',
    requiresConfirmation: true,
    parameters: [
      {
        id: 'pin',
        name: 'User PIN',
        type: 'string',
        required: true,
        validation: '^.{6,127}$',
        description: 'User PIN (6-127 characters)',
      },
    ],
  },
  {
    id: 'verify-pw3',
    name: 'Verify Admin PIN',
    description: 'Verify admin PIN for management operations',
    category: 'Security',
    requiresConfirmation: true,
    parameters: [
      {
        id: 'pin',
        name: 'Admin PIN',
        type: 'string',
        required: true,
        validation: '^.{8,127}$',
        description: 'Admin PIN (8-127 characters)',
      },
    ],
  },
  {
    id: 'internal-authenticate',
    name: 'Internal Authenticate',
    description: 'Perform authentication with auth key',
    category: 'Security',
    parameters: [
      {
        id: 'data',
        name: 'Challenge Data',
        type: 'hex',
        required: true,
        defaultValue: '0102030405060708090A0B0C0D0E0F10',
        description: 'Data to sign (hash of challenge)',
      },
    ],
  },
  {
    id: 'get-challenge',
    name: 'Get Challenge',
    description: 'Get random bytes from card',
    category: 'Security',
    parameters: [
      {
        id: 'length',
        name: 'Length',
        type: 'number',
        required: true,
        defaultValue: 8,
        description: 'Number of random bytes (1-255)',
      },
    ],
  },
];

export class OpenPgpHandler implements CardHandler {
  readonly id = 'openpgp';
  readonly name = 'OpenPGP Card';
  readonly description = 'OpenPGP smart cards (YubiKey, Nitrokey, etc.)';

  async detect(
    _atr: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<DetectionResult> {
    try {
      // Try to select OpenPGP application
      const selectCmd = buildSelectCommand(OPENPGP_AID);
      const response = await sendCommand(selectCmd);

      if (response.sw1 === 0x90 || response.sw1 === 0x61) {
        return {
          detected: true,
          confidence: 95,
          cardType: 'OpenPGP Card',
          metadata: { aid: OPENPGP_AID },
        };
      }
    } catch {
      // Selection failed
    }

    return { detected: false, confidence: 0 };
  }

  getCommands(_metadata?: Record<string, unknown>): CardCommand[] {
    return OPENPGP_COMMANDS;
  }

  async executeCommand(commandId: string, context: CommandContext): Promise<Response> {
    const { sendCommand, parameters } = context;

    switch (commandId) {
      case 'select-openpgp':
        return sendCommand(buildSelectCommand(OPENPGP_AID));

      case 'get-aid':
        return sendCommand(this.buildGetDataCommand(OPENPGP_OBJECTS.AID));

      case 'get-cardholder-data':
        return sendCommand(this.buildGetDataCommand(OPENPGP_OBJECTS.CARDHOLDER_RELATED_DATA));

      case 'get-application-data':
        return sendCommand(this.buildGetDataCommand(OPENPGP_OBJECTS.APPLICATION_RELATED_DATA));

      case 'get-url':
        return sendCommand(this.buildGetDataCommand(OPENPGP_OBJECTS.URL));

      case 'get-login-data':
        return sendCommand(this.buildGetDataCommand(OPENPGP_OBJECTS.LOGIN_DATA));

      case 'get-fingerprints':
        return sendCommand(this.buildGetDataCommand(OPENPGP_OBJECTS.FINGERPRINTS));

      case 'get-pw-status':
        return sendCommand(this.buildGetDataCommand(OPENPGP_OBJECTS.PW_STATUS_BYTES));

      case 'get-algorithm-attributes': {
        const key = parameters.key as string;
        return sendCommand(this.buildGetDataCommand(key));
      }

      case 'get-security-template':
        return sendCommand(this.buildGetDataCommand(OPENPGP_OBJECTS.SECURITY_SUPPORT_TEMPLATE));

      case 'get-certificate':
        return sendCommand(this.buildGetDataCommand(OPENPGP_OBJECTS.CARDHOLDER_CERTIFICATE));

      case 'verify-pw1-sign': {
        const pin = parameters.pin as string;
        return sendCommand(this.buildVerifyCommand(0x81, pin));
      }

      case 'verify-pw1-decrypt': {
        const pin = parameters.pin as string;
        return sendCommand(this.buildVerifyCommand(0x82, pin));
      }

      case 'verify-pw3': {
        const pin = parameters.pin as string;
        return sendCommand(this.buildVerifyCommand(0x83, pin));
      }

      case 'internal-authenticate': {
        const data = hexToBytes(parameters.data as string);
        // INTERNAL AUTHENTICATE: 00 88 00 00 Lc [data] Le
        return sendCommand([0x00, 0x88, 0x00, 0x00, data.length, ...data, 0x00]);
      }

      case 'get-challenge': {
        const length = parameters.length as number;
        // GET CHALLENGE: 00 84 00 00 Le
        return sendCommand([0x00, 0x84, 0x00, 0x00, length]);
      }

      default:
        throw new Error(`Unknown command: ${commandId}`);
    }
  }

  async interrogate(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<InterrogationResult> {
    try {
      // Select OpenPGP application
      const selectResponse = await sendCommand(buildSelectCommand(OPENPGP_AID));
      if (selectResponse.sw1 !== 0x90 && selectResponse.sw1 !== 0x61) {
        return { success: false, error: 'Failed to select OpenPGP application' };
      }

      // Read public data objects
      const objects = [
        OPENPGP_OBJECTS.AID,
        OPENPGP_OBJECTS.CARDHOLDER_RELATED_DATA,
        OPENPGP_OBJECTS.APPLICATION_RELATED_DATA,
        OPENPGP_OBJECTS.URL,
        OPENPGP_OBJECTS.FINGERPRINTS,
        OPENPGP_OBJECTS.PW_STATUS_BYTES,
        OPENPGP_OBJECTS.SECURITY_SUPPORT_TEMPLATE,
        OPENPGP_OBJECTS.ALGORITHM_ATTRIBUTES_SIG,
        OPENPGP_OBJECTS.ALGORITHM_ATTRIBUTES_DEC,
        OPENPGP_OBJECTS.ALGORITHM_ATTRIBUTES_AUTH,
      ];

      for (const obj of objects) {
        try {
          await sendCommand(this.buildGetDataCommand(obj));
        } catch {
          // Object not available
        }
      }

      return {
        success: true,
        applications: [{ aid: OPENPGP_AID, name: 'OpenPGP Application' }],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private buildGetDataCommand(tag: string): number[] {
    const tagBytes = hexToBytes(tag);
    // GET DATA: 00 CA [P1 P2] Le
    // For OpenPGP, tag is split into P1 and P2
    const p1 = tagBytes.length > 1 ? tagBytes[0] : 0x00;
    const p2 = tagBytes.length > 1 ? tagBytes[1] : tagBytes[0];
    return [0x00, 0xca, p1, p2, 0x00];
  }

  private buildVerifyCommand(pwRef: number, pin: string): number[] {
    const pinBytes = Array.from(pin).map((c) => c.charCodeAt(0));
    // VERIFY: 00 20 00 [PW ref] Lc [PIN]
    return [0x00, 0x20, 0x00, pwRef, pinBytes.length, ...pinBytes];
  }
}
