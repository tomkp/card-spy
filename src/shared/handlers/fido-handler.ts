/**
 * FIDO/U2F card handler.
 * Supports FIDO U2F and FIDO2/WebAuthn authenticators.
 */

import type { Response } from '../types';
import { hexToBytes } from '../tlv';
import type {
  CardHandler,
  CardCommand,
  CommandContext,
  DetectionResult,
  InterrogationResult,
} from './types';

/**
 * FIDO Application IDs.
 */
const FIDO_U2F_AID = 'A0000006472F0001';
const FIDO2_AID = 'A0000006472F0001'; // Same AID, different commands

/**
 * FIDO U2F/CTAP command constants.
 */
const FIDO_INS = {
  U2F_REGISTER: 0x01,
  U2F_AUTHENTICATE: 0x02,
  U2F_VERSION: 0x03,
  CTAP2_MSG: 0x10,
  CTAP2_CBOR: 0x11,
};

/**
 * FIDO command definitions.
 */
const FIDO_COMMANDS: CardCommand[] = [
  {
    id: 'select-fido',
    name: 'Select FIDO Application',
    description: 'Select the FIDO U2F/CTAP application',
    category: 'Discovery',
  },
  {
    id: 'get-version',
    name: 'Get U2F Version',
    description: 'Get U2F protocol version string',
    category: 'Read',
  },
  {
    id: 'ctap2-get-info',
    name: 'CTAP2 Get Info',
    description: 'Get authenticator information (FIDO2)',
    category: 'Read',
  },
  {
    id: 'u2f-register',
    name: 'U2F Register',
    description: 'Register a new credential (requires user presence)',
    category: 'Operations',
    requiresConfirmation: true,
    parameters: [
      {
        id: 'challenge',
        name: 'Challenge',
        type: 'hex',
        required: true,
        defaultValue: '0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F20',
        description: 'Challenge hash (32 bytes)',
      },
      {
        id: 'appId',
        name: 'Application ID',
        type: 'hex',
        required: true,
        defaultValue: '0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F20',
        description: 'Application ID hash (32 bytes)',
      },
    ],
  },
  {
    id: 'u2f-authenticate-check',
    name: 'U2F Check Credential',
    description: 'Check if a credential exists (no user interaction)',
    category: 'Operations',
    parameters: [
      {
        id: 'challenge',
        name: 'Challenge',
        type: 'hex',
        required: true,
        defaultValue: '0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F20',
        description: 'Challenge hash (32 bytes)',
      },
      {
        id: 'appId',
        name: 'Application ID',
        type: 'hex',
        required: true,
        defaultValue: '0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F20',
        description: 'Application ID hash (32 bytes)',
      },
      {
        id: 'keyHandle',
        name: 'Key Handle',
        type: 'hex',
        required: true,
        description: 'Credential key handle',
      },
    ],
  },
  {
    id: 'u2f-authenticate',
    name: 'U2F Authenticate',
    description: 'Authenticate with a credential (requires user presence)',
    category: 'Operations',
    requiresConfirmation: true,
    parameters: [
      {
        id: 'challenge',
        name: 'Challenge',
        type: 'hex',
        required: true,
        defaultValue: '0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F20',
        description: 'Challenge hash (32 bytes)',
      },
      {
        id: 'appId',
        name: 'Application ID',
        type: 'hex',
        required: true,
        defaultValue: '0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F20',
        description: 'Application ID hash (32 bytes)',
      },
      {
        id: 'keyHandle',
        name: 'Key Handle',
        type: 'hex',
        required: true,
        description: 'Credential key handle from registration',
      },
    ],
  },
  {
    id: 'ctap2-make-credential',
    name: 'CTAP2 Make Credential',
    description: 'Create a new WebAuthn credential (FIDO2)',
    category: 'Operations',
    requiresConfirmation: true,
    parameters: [
      {
        id: 'clientDataHash',
        name: 'Client Data Hash',
        type: 'hex',
        required: true,
        defaultValue: '0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F20',
        description: 'SHA-256 of client data (32 bytes)',
      },
      {
        id: 'rpId',
        name: 'Relying Party ID',
        type: 'string',
        required: true,
        defaultValue: 'example.com',
        description: 'Relying party identifier (domain)',
      },
      {
        id: 'userName',
        name: 'User Name',
        type: 'string',
        required: true,
        defaultValue: 'user@example.com',
        description: 'User display name',
      },
    ],
  },
  {
    id: 'ctap2-get-assertion',
    name: 'CTAP2 Get Assertion',
    description: 'Get an assertion for authentication (FIDO2)',
    category: 'Operations',
    requiresConfirmation: true,
    parameters: [
      {
        id: 'clientDataHash',
        name: 'Client Data Hash',
        type: 'hex',
        required: true,
        defaultValue: '0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F20',
        description: 'SHA-256 of client data (32 bytes)',
      },
      {
        id: 'rpId',
        name: 'Relying Party ID',
        type: 'string',
        required: true,
        defaultValue: 'example.com',
        description: 'Relying party identifier (domain)',
      },
    ],
  },
  {
    id: 'ctap2-client-pin',
    name: 'CTAP2 Get PIN Token',
    description: 'Get PIN information or authenticate with PIN',
    category: 'Security',
    parameters: [
      {
        id: 'subCommand',
        name: 'Sub-Command',
        type: 'select',
        required: true,
        options: [
          { value: '01', label: 'Get Retries' },
          { value: '02', label: 'Get Key Agreement' },
        ],
        description: 'PIN sub-command',
      },
    ],
  },
  {
    id: 'ctap2-reset',
    name: 'CTAP2 Reset',
    description: 'Factory reset the authenticator (destructive!)',
    category: 'Management',
    isDestructive: true,
    requiresConfirmation: true,
  },
];

export class FidoHandler implements CardHandler {
  readonly id = 'fido';
  readonly name = 'FIDO/U2F Authenticator';
  readonly description = 'FIDO U2F and FIDO2/WebAuthn security keys';

  async detect(
    _atr: string,
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<DetectionResult> {
    try {
      // Try to select FIDO application
      const selectCmd = this.buildSelectCommand(FIDO_U2F_AID);
      const response = await sendCommand(selectCmd);

      if (response.sw1 === 0x90 || response.sw1 === 0x61) {
        // Try to get version to confirm it's a FIDO device
        try {
          const versionCmd = [0x00, FIDO_INS.U2F_VERSION, 0x00, 0x00, 0x00];
          const versionResponse = await sendCommand(versionCmd);
          if (versionResponse.sw1 === 0x90) {
            const version = String.fromCharCode(...versionResponse.data);
            return {
              detected: true,
              confidence: 95,
              cardType: `FIDO ${version}`,
              metadata: { version },
            };
          }
        } catch {
          // Version command failed but select succeeded
        }

        return {
          detected: true,
          confidence: 85,
          cardType: 'FIDO Authenticator',
          metadata: {},
        };
      }
    } catch {
      // Selection failed
    }

    return { detected: false, confidence: 0 };
  }

  getCommands(_metadata?: Record<string, unknown>): CardCommand[] {
    return FIDO_COMMANDS;
  }

  async executeCommand(commandId: string, context: CommandContext): Promise<Response> {
    const { sendCommand, parameters } = context;

    switch (commandId) {
      case 'select-fido':
        return sendCommand(this.buildSelectCommand(FIDO_U2F_AID));

      case 'get-version':
        return sendCommand([0x00, FIDO_INS.U2F_VERSION, 0x00, 0x00, 0x00]);

      case 'ctap2-get-info': {
        // CTAP2 authenticatorGetInfo: 04 (in CBOR)
        const cbor = [0x04];
        return sendCommand([0x80, FIDO_INS.CTAP2_CBOR, 0x00, 0x00, cbor.length, ...cbor, 0x00]);
      }

      case 'u2f-register': {
        const challenge = hexToBytes(parameters.challenge as string);
        const appId = hexToBytes(parameters.appId as string);
        const data = [...challenge, ...appId];
        return sendCommand([0x00, FIDO_INS.U2F_REGISTER, 0x00, 0x00, data.length, ...data, 0x00]);
      }

      case 'u2f-authenticate-check': {
        const challenge = hexToBytes(parameters.challenge as string);
        const appId = hexToBytes(parameters.appId as string);
        const keyHandle = hexToBytes(parameters.keyHandle as string);
        const data = [...challenge, ...appId, keyHandle.length, ...keyHandle];
        // P1 = 0x07 = check-only (don't require user presence)
        return sendCommand([
          0x00,
          FIDO_INS.U2F_AUTHENTICATE,
          0x07,
          0x00,
          data.length,
          ...data,
          0x00,
        ]);
      }

      case 'u2f-authenticate': {
        const challenge = hexToBytes(parameters.challenge as string);
        const appId = hexToBytes(parameters.appId as string);
        const keyHandle = hexToBytes(parameters.keyHandle as string);
        const data = [...challenge, ...appId, keyHandle.length, ...keyHandle];
        // P1 = 0x03 = enforce-user-presence-and-sign
        return sendCommand([
          0x00,
          FIDO_INS.U2F_AUTHENTICATE,
          0x03,
          0x00,
          data.length,
          ...data,
          0x00,
        ]);
      }

      case 'ctap2-make-credential': {
        // Build CBOR for authenticatorMakeCredential
        const clientDataHash = hexToBytes(parameters.clientDataHash as string);
        const rpId = parameters.rpId as string;
        const userName = parameters.userName as string;

        // Simplified CBOR encoding (would need proper CBOR library for production)
        const cbor = this.buildMakeCredentialCbor(clientDataHash, rpId, userName);
        return sendCommand([0x80, FIDO_INS.CTAP2_CBOR, 0x00, 0x00, cbor.length, ...cbor, 0x00]);
      }

      case 'ctap2-get-assertion': {
        const clientDataHash = hexToBytes(parameters.clientDataHash as string);
        const rpId = parameters.rpId as string;

        // Simplified CBOR encoding
        const cbor = this.buildGetAssertionCbor(clientDataHash, rpId);
        return sendCommand([0x80, FIDO_INS.CTAP2_CBOR, 0x00, 0x00, cbor.length, ...cbor, 0x00]);
      }

      case 'ctap2-client-pin': {
        const subCommand = parseInt(parameters.subCommand as string, 16);
        // authenticatorClientPIN with subCommand
        const cbor = [0x06, 0xa1, 0x01, subCommand]; // {1: subCommand}
        return sendCommand([0x80, FIDO_INS.CTAP2_CBOR, 0x00, 0x00, cbor.length, ...cbor, 0x00]);
      }

      case 'ctap2-reset': {
        // authenticatorReset
        const cbor = [0x07];
        return sendCommand([0x80, FIDO_INS.CTAP2_CBOR, 0x00, 0x00, cbor.length, ...cbor, 0x00]);
      }

      default:
        throw new Error(`Unknown command: ${commandId}`);
    }
  }

  async interrogate(
    sendCommand: (apdu: number[]) => Promise<Response>
  ): Promise<InterrogationResult> {
    try {
      // Select FIDO application
      const selectResponse = await sendCommand(this.buildSelectCommand(FIDO_U2F_AID));
      if (selectResponse.sw1 !== 0x90 && selectResponse.sw1 !== 0x61) {
        return { success: false, error: 'Failed to select FIDO application' };
      }

      // Get U2F version
      try {
        await sendCommand([0x00, FIDO_INS.U2F_VERSION, 0x00, 0x00, 0x00]);
      } catch {
        // Version not supported
      }

      // Try CTAP2 GetInfo
      try {
        const cbor = [0x04];
        await sendCommand([0x80, FIDO_INS.CTAP2_CBOR, 0x00, 0x00, cbor.length, ...cbor, 0x00]);
      } catch {
        // CTAP2 not supported
      }

      return {
        success: true,
        applications: [{ aid: FIDO_U2F_AID, name: 'FIDO Application' }],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private buildSelectCommand(aid: string): number[] {
    const aidBytes = hexToBytes(aid);
    return [0x00, 0xa4, 0x04, 0x00, aidBytes.length, ...aidBytes];
  }

  // Simplified CBOR builders - would use a proper CBOR library in production
  private buildMakeCredentialCbor(
    clientDataHash: number[],
    rpId: string,
    userName: string
  ): number[] {
    // Command: 0x01 (authenticatorMakeCredential)
    // This is a simplified implementation - real CBOR encoding is more complex
    const rpIdBytes = Array.from(rpId).map((c) => c.charCodeAt(0));
    const userNameBytes = Array.from(userName).map((c) => c.charCodeAt(0));

    // Very simplified - just send command byte for now
    // Full implementation would need proper CBOR encoding
    return [
      0x01, // authenticatorMakeCredential
      0xa4, // map of 4 items
      0x01,
      0x58,
      0x20,
      ...clientDataHash, // 1: clientDataHash
      0x02,
      0xa1,
      0x62,
      0x69,
      0x64,
      0x78,
      rpIdBytes.length,
      ...rpIdBytes, // 2: rp {id: ...}
      0x03,
      0xa2,
      0x62,
      0x69,
      0x64,
      0x41,
      0x01,
      0x64,
      0x6e,
      0x61,
      0x6d,
      0x65,
      0x78,
      userNameBytes.length,
      ...userNameBytes, // 3: user
      0x04,
      0x81,
      0xa2,
      0x63,
      0x61,
      0x6c,
      0x67,
      0x26,
      0x64,
      0x74,
      0x79,
      0x70,
      0x65,
      0x6a,
      0x70,
      0x75,
      0x62,
      0x6c,
      0x69,
      0x63,
      0x2d,
      0x6b,
      0x65,
      0x79, // 4: pubKeyCredParams
    ];
  }

  private buildGetAssertionCbor(clientDataHash: number[], rpId: string): number[] {
    const rpIdBytes = Array.from(rpId).map((c) => c.charCodeAt(0));

    return [
      0x02, // authenticatorGetAssertion
      0xa2, // map of 2 items
      0x01,
      0x78,
      rpIdBytes.length,
      ...rpIdBytes, // 1: rpId
      0x02,
      0x58,
      0x20,
      ...clientDataHash, // 2: clientDataHash
    ];
  }
}
