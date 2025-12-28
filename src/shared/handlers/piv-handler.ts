/**
 * PIV (Personal Identity Verification) card handler.
 * Supports US Government PIV cards and compatible cards like YubiKey.
 */

import type { Response } from '../types';
import type {
  CardHandler,
  CardCommand,
  CommandContext,
  DetectionResult,
  InterrogationResult,
} from './types';

/**
 * PIV Application ID.
 */
const PIV_AID = 'A000000308000010000100';

/**
 * PIV data object IDs.
 */
const PIV_OBJECTS = {
  CARD_CAPABILITY_CONTAINER: '5FC107',
  CARD_HOLDER_UNIQUE_ID: '5FC102',
  X509_PIV_AUTH: '5FC105',
  CARDHOLDER_FINGERPRINTS: '5FC103',
  SECURITY_OBJECT: '5FC106',
  CARDHOLDER_FACIAL_IMAGE: '5FC108',
  X509_CARD_AUTH: '5FC101',
  X509_DIGITAL_SIGNATURE: '5FC10A',
  X509_KEY_MANAGEMENT: '5FC10B',
  PRINTED_INFORMATION: '5FC109',
  DISCOVERY_OBJECT: '7E',
  KEY_HISTORY_OBJECT: '5FC10C',
  RETIRED_CERT_01: '5FC10D',
};

/**
 * PIV command definitions.
 */
const PIV_COMMANDS: CardCommand[] = [
  {
    id: 'select-piv',
    name: 'Select PIV Application',
    description: 'Select the PIV application on the card',
    category: 'Discovery',
  },
  {
    id: 'get-chuid',
    name: 'Get CHUID',
    description: 'Get Cardholder Unique Identifier',
    category: 'Read',
  },
  {
    id: 'get-ccc',
    name: 'Get CCC',
    description: 'Get Card Capability Container',
    category: 'Read',
  },
  {
    id: 'get-discovery',
    name: 'Get Discovery Object',
    description: 'Get PIV discovery object (supported algorithms)',
    category: 'Read',
  },
  {
    id: 'get-piv-auth-cert',
    name: 'Get PIV Auth Certificate',
    description: 'Get X.509 certificate for PIV authentication',
    category: 'Certificates',
  },
  {
    id: 'get-card-auth-cert',
    name: 'Get Card Auth Certificate',
    description: 'Get X.509 certificate for card authentication',
    category: 'Certificates',
  },
  {
    id: 'get-digital-sig-cert',
    name: 'Get Digital Signature Certificate',
    description: 'Get X.509 certificate for digital signature',
    category: 'Certificates',
  },
  {
    id: 'get-key-mgmt-cert',
    name: 'Get Key Management Certificate',
    description: 'Get X.509 certificate for key management',
    category: 'Certificates',
  },
  {
    id: 'get-printed-info',
    name: 'Get Printed Information',
    description: 'Get printed information (name, employee affiliation)',
    category: 'Read',
  },
  {
    id: 'verify-pin',
    name: 'Verify PIN',
    description: 'Verify PIV card PIN',
    category: 'Security',
    requiresConfirmation: true,
    parameters: [
      {
        id: 'pin',
        name: 'PIN',
        type: 'string',
        required: true,
        validation: '^[0-9]{6,8}$',
        description: 'PIV PIN (6-8 digits)',
      },
    ],
  },
  {
    id: 'get-data',
    name: 'Get Data Object',
    description: 'Get arbitrary PIV data object by tag',
    category: 'Read',
    parameters: [
      {
        id: 'tag',
        name: 'Object Tag',
        type: 'select',
        required: true,
        options: [
          { value: '5FC107', label: 'Card Capability Container' },
          { value: '5FC102', label: 'Cardholder Unique ID' },
          { value: '5FC105', label: 'X.509 PIV Auth Certificate' },
          { value: '5FC101', label: 'X.509 Card Auth Certificate' },
          { value: '5FC10A', label: 'X.509 Digital Signature Certificate' },
          { value: '5FC10B', label: 'X.509 Key Management Certificate' },
          { value: '5FC109', label: 'Printed Information' },
          { value: '7E', label: 'Discovery Object' },
          { value: '5FC10C', label: 'Key History Object' },
        ],
        description: 'PIV data object to retrieve',
      },
    ],
  },
  {
    id: 'general-authenticate',
    name: 'General Authenticate',
    description: 'Perform cryptographic operation (challenge-response)',
    category: 'Security',
    parameters: [
      {
        id: 'key',
        name: 'Key Reference',
        type: 'select',
        required: true,
        options: [
          { value: '9A', label: 'PIV Authentication Key (9A)' },
          { value: '9B', label: 'Card Authentication Key (9B)' },
          { value: '9C', label: 'Digital Signature Key (9C)' },
          { value: '9D', label: 'Key Management Key (9D)' },
          { value: '9E', label: 'Card Auth Key (9E)' },
        ],
        description: 'Key to use for authentication',
      },
      {
        id: 'algorithm',
        name: 'Algorithm',
        type: 'select',
        required: true,
        options: [
          { value: '07', label: 'RSA 2048' },
          { value: '11', label: 'ECC P-256' },
          { value: '14', label: 'ECC P-384' },
        ],
        description: 'Cryptographic algorithm',
      },
    ],
  },
];

export class PivHandler implements CardHandler {
  readonly id = 'piv';
  readonly name = 'PIV Card';
  readonly description = 'Personal Identity Verification (US Government, YubiKey)';

  async detect(
    _atr: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<DetectionResult> {
    try {
      // Try to select PIV application
      const selectCmd = this.buildSelectCommand(PIV_AID);
      const response = await sendCommand(selectCmd);

      if (response.sw1 === 0x90 || response.sw1 === 0x61) {
        return {
          detected: true,
          confidence: 95,
          cardType: 'PIV Card',
          metadata: { aid: PIV_AID },
        };
      }
    } catch {
      // Selection failed
    }

    return { detected: false, confidence: 0 };
  }

  getCommands(_metadata?: Record<string, unknown>): CardCommand[] {
    return PIV_COMMANDS;
  }

  async executeCommand(commandId: string, context: CommandContext): Promise<Response> {
    const { sendCommand, parameters } = context;

    switch (commandId) {
      case 'select-piv':
        return sendCommand(this.buildSelectCommand(PIV_AID));

      case 'get-chuid':
        return sendCommand(this.buildGetDataCommand(PIV_OBJECTS.CARD_HOLDER_UNIQUE_ID));

      case 'get-ccc':
        return sendCommand(this.buildGetDataCommand(PIV_OBJECTS.CARD_CAPABILITY_CONTAINER));

      case 'get-discovery':
        return sendCommand(this.buildGetDataCommand(PIV_OBJECTS.DISCOVERY_OBJECT));

      case 'get-piv-auth-cert':
        return sendCommand(this.buildGetDataCommand(PIV_OBJECTS.X509_PIV_AUTH));

      case 'get-card-auth-cert':
        return sendCommand(this.buildGetDataCommand(PIV_OBJECTS.X509_CARD_AUTH));

      case 'get-digital-sig-cert':
        return sendCommand(this.buildGetDataCommand(PIV_OBJECTS.X509_DIGITAL_SIGNATURE));

      case 'get-key-mgmt-cert':
        return sendCommand(this.buildGetDataCommand(PIV_OBJECTS.X509_KEY_MANAGEMENT));

      case 'get-printed-info':
        return sendCommand(this.buildGetDataCommand(PIV_OBJECTS.PRINTED_INFORMATION));

      case 'verify-pin': {
        const pin = parameters.pin as string;
        return sendCommand(this.buildVerifyPinCommand(pin));
      }

      case 'get-data': {
        const tag = parameters.tag as string;
        return sendCommand(this.buildGetDataCommand(tag));
      }

      case 'general-authenticate': {
        const key = parseInt(parameters.key as string, 16);
        const algorithm = parseInt(parameters.algorithm as string, 16);
        // Build challenge request
        const challenge = [0x7c, 0x02, 0x81, 0x00]; // Empty witness request
        return sendCommand([0x00, 0x87, algorithm, key, challenge.length, ...challenge, 0x00]);
      }

      default:
        throw new Error(`Unknown command: ${commandId}`);
    }
  }

  async interrogate(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<InterrogationResult> {
    try {
      // Select PIV application
      const selectResponse = await sendCommand(this.buildSelectCommand(PIV_AID));
      if (selectResponse.sw1 !== 0x90 && selectResponse.sw1 !== 0x61) {
        return { success: false, error: 'Failed to select PIV application' };
      }

      // Read key data objects
      const objects = [
        PIV_OBJECTS.CARD_CAPABILITY_CONTAINER,
        PIV_OBJECTS.CARD_HOLDER_UNIQUE_ID,
        PIV_OBJECTS.DISCOVERY_OBJECT,
        PIV_OBJECTS.PRINTED_INFORMATION,
      ];

      for (const obj of objects) {
        try {
          await sendCommand(this.buildGetDataCommand(obj));
        } catch {
          // Object not available
        }
      }

      // Try to read certificates (may require PIN)
      const certs = [
        PIV_OBJECTS.X509_PIV_AUTH,
        PIV_OBJECTS.X509_CARD_AUTH,
        PIV_OBJECTS.X509_DIGITAL_SIGNATURE,
        PIV_OBJECTS.X509_KEY_MANAGEMENT,
      ];

      for (const cert of certs) {
        try {
          await sendCommand(this.buildGetDataCommand(cert));
        } catch {
          // Certificate not available or requires PIN
        }
      }

      return {
        success: true,
        applications: [{ aid: PIV_AID, name: 'PIV Application' }],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private buildSelectCommand(aid: string): number[] {
    const aidBytes = this.hexToBytes(aid);
    return [0x00, 0xa4, 0x04, 0x00, aidBytes.length, ...aidBytes];
  }

  private buildGetDataCommand(tag: string): number[] {
    const tagBytes = this.hexToBytes(tag);
    // GET DATA: 00 CB 3F FF Lc [5C len tag] Le
    const data = [0x5c, tagBytes.length, ...tagBytes];
    return [0x00, 0xcb, 0x3f, 0xff, data.length, ...data, 0x00];
  }

  private buildVerifyPinCommand(pin: string): number[] {
    // PIV PIN is padded with 0xFF to 8 bytes
    const pinBytes = Array.from(pin).map((c) => c.charCodeAt(0));
    while (pinBytes.length < 8) {
      pinBytes.push(0xff);
    }
    // VERIFY: 00 20 00 80 08 [PIN]
    return [0x00, 0x20, 0x00, 0x80, 0x08, ...pinBytes];
  }

  private hexToBytes(hex: string): number[] {
    const cleanHex = hex.replace(/\s/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
    }
    return bytes;
  }
}
