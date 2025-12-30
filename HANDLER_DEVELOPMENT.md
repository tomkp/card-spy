# Handler Development Guide

This guide covers how to create card handlers for Card Spy. Handlers are plugins that provide support for different smart card types.

## Overview

A card handler implements the `CardHandler` interface and provides:

1. **Detection** - Identify if a card matches this handler
2. **Commands** - Define available commands for the card
3. **Execution** - Execute commands and return responses
4. **Interrogation** - Automatically discover card contents

## Handler Interface

```typescript
interface CardHandler {
  readonly id: string;          // Unique identifier (e.g., 'emv', 'piv')
  readonly name: string;        // Display name (e.g., 'EMV Payment Card')
  readonly description: string; // Brief description

  detect(atr: string, sendCommand: SendCommand): Promise<DetectionResult>;
  getCommands(metadata?: Record<string, unknown>): CardCommand[];
  executeCommand(commandId: string, context: CommandContext): Promise<Response>;
  interrogate(sendCommand: SendCommand): Promise<InterrogationResult>;
}
```

## Creating a Handler

### 1. Basic Structure

```typescript
import type { Response } from '../types';
import type {
  CardHandler,
  CardCommand,
  CommandContext,
  DetectionResult,
  InterrogationResult,
} from './types';
import { HandlerLogger } from './handler-logger';

const MY_COMMANDS: CardCommand[] = [
  {
    id: 'read-data',
    name: 'Read Data',
    description: 'Read data from the card',
    category: 'Read',
  },
];

export class MyHandler implements CardHandler {
  readonly id = 'my-card';
  readonly name = 'My Card Type';
  readonly description = 'Support for My Card Type cards';

  private readonly logger = new HandlerLogger('my-card');

  // ... implement methods
}
```

### 2. Detection

Detection determines if your handler can handle a card. Return a confidence level (0-100).

```typescript
async detect(
  atr: string,
  sendCommand: (apdu: number[]) => Promise<Response>
): Promise<DetectionResult> {
  // Check ATR patterns first (fast)
  const atrUpper = atr.toUpperCase();
  if (!atrUpper.startsWith('3B')) {
    return { detected: false, confidence: 0 };
  }

  // Try to select application (more reliable)
  try {
    const selectCmd = [0x00, 0xA4, 0x04, 0x00, /* AID bytes */];
    const response = await sendCommand(selectCmd);

    if (response.sw1 === 0x90) {
      return {
        detected: true,
        confidence: 95,
        cardType: 'My Card Type',
        metadata: { /* any discovered data */ },
      };
    }
  } catch (error) {
    this.logger.warn('Selection failed', 'detect', error);
  }

  return { detected: false, confidence: 0 };
}
```

#### Confidence Levels

| Level | When to Use |
|-------|-------------|
| 90-100 | Application selected successfully, verified with additional commands |
| 70-89 | Application selected, or strong ATR match |
| 50-69 | ATR pattern matches, but couldn't verify with commands |
| 30-49 | Weak indication, might be this card type |
| 0-29 | Not this card type |

### 3. Commands

Define commands users can execute on the card.

```typescript
const COMMANDS: CardCommand[] = [
  {
    id: 'read-file',
    name: 'Read File',
    description: 'Read a file from the card',
    category: 'Read',
    parameters: [
      {
        id: 'fileId',
        name: 'File ID',
        type: 'hex',
        required: true,
        description: 'File identifier (e.g., 2FE2)',
      },
    ],
  },
  {
    id: 'verify-pin',
    name: 'Verify PIN',
    description: 'Verify the user PIN',
    category: 'Security',
    requiresConfirmation: true,  // Ask user before executing
    parameters: [
      {
        id: 'pin',
        name: 'PIN',
        type: 'string',
        required: true,
        validation: '^[0-9]{4,8}$',
        description: 'PIN (4-8 digits)',
      },
    ],
  },
  {
    id: 'factory-reset',
    name: 'Factory Reset',
    description: 'Reset card to factory state',
    category: 'Management',
    isDestructive: true,        // Warn about data loss
    requiresConfirmation: true,
  },
];

getCommands(metadata?: Record<string, unknown>): CardCommand[] {
  // Can filter commands based on metadata from detection
  return COMMANDS;
}
```

### 4. Command Execution

Execute commands based on their ID.

```typescript
async executeCommand(
  commandId: string,
  context: CommandContext
): Promise<Response> {
  const { sendCommand, parameters } = context;

  switch (commandId) {
    case 'read-file': {
      const fileId = parameters.fileId as string;
      return sendCommand([0x00, 0xB0, /* file params */]);
    }

    case 'verify-pin': {
      const pin = parameters.pin as string;
      const pinBytes = buildPinApdu(pin);
      return sendCommand(pinBytes);
    }

    default:
      throw new Error(`Unknown command: ${commandId}`);
  }
}
```

### 5. Interrogation

Automatically discover card contents for the command log.

```typescript
async interrogate(
  sendCommand: (apdu: number[]) => Promise<Response>
): Promise<InterrogationResult> {
  const applications: ApplicationInfo[] = [];

  try {
    // Select application
    const selectResponse = await sendCommand([0x00, 0xA4, 0x04, 0x00, ...]);
    if (selectResponse.sw1 !== 0x90) {
      return { success: false, error: 'Failed to select application' };
    }

    // Read various files/data objects
    for (const fileId of FILE_IDS) {
      try {
        await sendCommand([0x00, 0xB0, /* file params */]);
      } catch (error) {
        this.logger.warn(`Failed to read file ${fileId}`, 'interrogate', error);
      }
    }

    return { success: true, applications };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

## Shared Utilities

### Command Utilities

Use `command-utils.ts` for common APDU patterns:

```typescript
import {
  buildVerifyPinApdu,
  buildGetDataApdu,
  buildSelectFileApdu,
  buildReadBinaryApdu,
  PinEncoding
} from './command-utils';

// Build VERIFY PIN command
const verifyCmd = buildVerifyPinApdu('1234', {
  encoding: PinEncoding.ASCII,  // or PinEncoding.BCD
  p2: 0x80,                     // PIN reference
  padByte: 0xFF,                // Padding byte
  padLength: 8,                 // Pad to 8 bytes
});

// Build GET DATA command (PIV style)
const getDataCmd = buildGetDataApdu('5FC102', { style: 'piv' });

// Build GET DATA command (OpenPGP style)
const getDataCmd2 = buildGetDataApdu('5F50', { style: 'openpgp' });

// Build SELECT FILE command
const selectCmd = buildSelectFileApdu('3F00');

// Build READ BINARY command
const readCmd = buildReadBinaryApdu(0, 16);  // offset, length
```

### Handler Logger

Use `HandlerLogger` for consistent error logging:

```typescript
import { HandlerLogger } from './handler-logger';

class MyHandler implements CardHandler {
  private readonly logger = new HandlerLogger('my-card');

  async detect(atr: string, sendCommand: SendCommand) {
    try {
      // ...
    } catch (error) {
      // Logs: [Handler:my-card:detect] Selection failed Error: ...
      this.logger.warn('Selection failed', 'detect', error);
    }
  }

  async interrogate(sendCommand: SendCommand) {
    // Debug logging (only when log level is DEBUG)
    this.logger.debug('Reading file 0x2FE2', 'interrogate');
  }
}
```

## Testing Handlers

Use Vitest with mock responses:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyHandler } from './my-handler';
import type { Response } from '../types';

function createMockResponse(sw1: number, sw2: number, data: number[] = []): Response {
  return {
    id: 'test',
    timestamp: Date.now(),
    data,
    sw1,
    sw2,
    hex: [...data, sw1, sw2].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase(),
  };
}

describe('MyHandler', () => {
  let handler: MyHandler;

  beforeEach(() => {
    handler = new MyHandler();
  });

  describe('detect', () => {
    it('should detect card when selection succeeds', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00));

      const result = await handler.detect('3B...', mockSendCommand);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(90);
    });

    it('should not detect when selection fails', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x6A, 0x82));

      const result = await handler.detect('3B...', mockSendCommand);

      expect(result.detected).toBe(false);
    });
  });

  describe('executeCommand', () => {
    it('should execute read command', async () => {
      const mockSendCommand = vi.fn()
        .mockResolvedValueOnce(createMockResponse(0x90, 0x00, [0x01, 0x02, 0x03]));

      const context = {
        sendCommand: mockSendCommand,
        atr: '3B...',
        protocol: 0,
        parameters: { fileId: '2FE2' },
      };

      const result = await handler.executeCommand('read-file', context);

      expect(result.sw1).toBe(0x90);
      expect(result.data).toEqual([0x01, 0x02, 0x03]);
    });
  });
});
```

## Registering Handlers

Add your handler to `src/shared/handlers/index.ts`:

```typescript
import { MyHandler } from './my-handler';

export const allHandlers = [
  // Higher priority handlers first
  new EmvHandler(),
  new PivHandler(),
  new MyHandler(),  // Add your handler
  // ...
];
```

## Best Practices

1. **Graceful Degradation**: Always handle errors gracefully. Cards may not support all commands.

2. **Confidence Levels**: Use appropriate confidence levels. Don't claim 100% unless you're certain.

3. **Logging**: Use `HandlerLogger` instead of silent catch blocks for easier debugging.

4. **Shared Utilities**: Use `command-utils.ts` for common APDU patterns to reduce duplication.

5. **Testing**: Write tests with mock responses covering success, failure, and edge cases.

6. **Security**: Mark commands that require confirmation (`requiresConfirmation`) or are destructive (`isDestructive`).

7. **Documentation**: Add JSDoc comments to your handler and commands.

## Example Handlers

Study these handlers for reference:

- **EmvHandler** (`emv-handler.ts`) - Complex handler with PSE/PPSE discovery, record reading
- **PivHandler** (`piv-handler.ts`) - Government ID card with certificate reading
- **FidoHandler** (`fido-handler.ts`) - U2F/CTAP2 authentication with multi-protocol support
- **SimHandler** (`sim-handler.ts`) - SIM/USIM with file selection and binary reads

## Response Status Codes

Common ISO 7816 status words:

| SW1 SW2 | Meaning |
|---------|---------|
| 90 00 | Success |
| 61 XX | Success, XX more bytes available (use GET RESPONSE) |
| 6A 82 | File/application not found |
| 6A 86 | Incorrect P1/P2 |
| 69 82 | Security status not satisfied |
| 69 85 | Conditions of use not satisfied |
| 6C XX | Wrong Le, correct is XX |
| 6E 00 | Class not supported |
| 6D 00 | Instruction not supported |
