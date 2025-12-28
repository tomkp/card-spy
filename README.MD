# Card Spy

A desktop application for analyzing, testing, and interacting with smart cards. Card Spy provides an interactive debugging environment with APDU command execution, TLV parsing, and support for multiple card standards.

![Card Spy Screenshot](https://user-images.githubusercontent.com/171331/142161105-16952df5-0423-437f-a826-9b6259282e67.png)

## Features

- **Interactive REPL** - Send raw APDU commands with flexible hex input formats
- **Card Detection** - Automatic handler detection based on ATR and card probing
- **TLV Parsing** - Automatic parsing and display of BER-TLV encoded responses
- **Command Log** - Full history with search, filtering, and copy support
- **Keyboard Shortcuts** - Efficient navigation (Cmd/Ctrl+I interrogate, Cmd/Ctrl+K focus, etc.)
- **Multiple Card Types** - Extensible handler system for various card standards

## Supported Card Types

- **EMV** - Payment cards (Visa, Mastercard, Amex, etc.)
- **PIV** - US Government Personal Identity Verification cards
- **OpenPGP** - OpenPGP smart cards
- **FIDO** - Security keys (U2F/FIDO2)
- **SIM/USIM** - Mobile phone SIM cards
- **eID** - European electronic identity cards
- **Calypso** - Transport cards (Navigo, MOBIB, etc.)
- **MIFARE** - Classic and DESFire cards
- **Health Cards** - European health insurance cards
- **JavaCard** - Generic JavaCard applications
- **PKI** - Certificate-based smart cards

## Prerequisites

- **Node.js** 18+
- **Smart card reader** - PC/SC compatible USB reader
- **macOS** or **Windows** (Linux may work but is untested)
- **PC/SC service** running (usually automatic on macOS/Windows)

## Installation

```bash
# Clone the repository
git clone https://github.com/tomkp/card-spy.git
cd card-spy

# Install dependencies
npm install

# Start the application
npm start
```

## Usage

1. **Connect a smart card reader** to your computer
2. **Insert a smart card** - Card Spy will detect it automatically
3. **Explore the card**:
   - Click **Interrogate** (or Cmd/Ctrl+I) to discover card contents
   - Use the **Command Panel** to execute predefined commands
   - Enter raw APDU commands in the **REPL** (e.g., `00 A4 04 00 07 A0 00 00 00 04 10 10`)

### REPL Input Formats

The REPL accepts hex input in multiple formats:
- Continuous: `00A4040007A0000000041010`
- Spaced: `00 A4 04 00 07 A0 00 00 00 04 10 10`
- With prefixes: `0x00, 0xA4, 0x04, 0x00`

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl + I | Interrogate card |
| Cmd/Ctrl + K | Focus command input |
| Cmd/Ctrl + L | Clear log |
| Cmd/Ctrl + / | Show shortcuts help |
| Up/Down | Navigate command history |

## Development

```bash
# Run in development mode with hot reload
npm start

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run type checking
npm run typecheck

# Run linting
npm run lint

# Format code
npm run format

# Run all checks
npm run checks
```

### Building for Distribution

```bash
# Package for current platform
npm run package

# Create distributable (DMG on macOS, ZIP on Windows)
npm run build
```

## Architecture

```
src/
├── main/           # Electron main process
├── preload/        # Preload script (IPC bridge)
├── renderer/       # React UI
│   ├── components/ # UI components
│   ├── hooks/      # React hooks
│   └── styles/     # CSS
└── shared/         # Shared utilities and types
    ├── handlers/   # Card type handlers
    ├── tlv.ts      # TLV parsing
    ├── apdu.ts     # APDU utilities
    └── emv.ts      # EMV protocol
```

## License

MIT
