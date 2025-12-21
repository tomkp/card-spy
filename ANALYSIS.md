# Card Spy - Repository Analysis

## Executive Summary

**Card Spy** is an Electron-based desktop application for analyzing and interacting with smartcards using ISO7816/EMV protocols. It provides a visual REPL interface for sending APDU commands to smartcard readers and parsing TLV-encoded responses.

| Metric | Value |
|--------|-------|
| Total JavaScript | ~815 lines |
| Total Files | ~45 files |
| Dependencies | 28 dev + 12 runtime |
| Test Coverage | 0% |
| Documentation | Minimal |
| Last Activity | 2019 (based on dependencies) |

---

## 1. Project Overview

### Purpose
Card Spy solves the problem of smartcard diagnostic complexity by providing:
- Visual detection of smartcard readers and inserted cards
- REPL interface for sending ISO7816 APDU commands
- Automatic parsing and display of EMV TLV responses
- One-click card interrogation to extract all application data

### Target Users
- Security researchers analyzing payment cards
- Developers building smartcard applications
- Anyone needing to inspect EMV card contents

---

## 2. Technology Stack

### Runtime
| Technology | Version | Status |
|------------|---------|--------|
| Electron | 3.0.6 | Outdated (current: 27+) |
| React | 16.6.0 | Outdated (current: 18+) |
| Node.js | n/a | Defined by Electron |

### Key Dependencies
| Package | Purpose |
|---------|---------|
| `smartcard` | Reader/card detection and communication |
| `tlv` | Binary TLV parsing |
| `emv` | EMV protocol utilities |
| `iso7816` | ISO7816 command building |
| `hexify` | Hex string conversion |
| `react-split-pane` | Split pane UI layout |

### Build Tools
- **Webpack 4.23.1** - Module bundling
- **Babel** - ES6/JSX transpilation (es2015, react presets)
- **PostCSS** - CSS processing with precss and autoprefixer
- **electron-packager** - App distribution packaging

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│                      (card-spy.js)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Smartcard  │  │   Device    │  │   EMV Interrogator  │  │
│  │   Library   │──│   Manager   │──│   (selectPse)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                           │                                  │
│                       IPC Bridge                             │
│                           │                                  │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                           │                                  │
│                    Electron Renderer                         │
│                     (React Application)                      │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   Application.js                      │    │
│  │              (Root State Management)                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│         ┌─────────────────┼─────────────────┐               │
│         │                 │                 │               │
│  ┌──────┴──────┐  ┌───────┴──────┐  ┌──────┴──────┐        │
│  │  Console.js │  │ StatusBar.js │  │   Tlv.js    │        │
│  │  (REPL UI)  │  │(Device Info) │  │(TLV Parser) │        │
│  └─────────────┘  └──────────────┘  └─────────────┘        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Data Flow
1. **Device Events**: Smartcard library emits device/card events
2. **Main Process**: card-spy.js handles events and smartcard I/O
3. **IPC Bridge**: Events forwarded to renderer via ipcMain/ipcRenderer
4. **React State**: Application.js updates state based on IPC messages
5. **UI Render**: Components re-render with new state

---

## 4. Project Structure

```
card-spy/
├── app/                          # Electron application
│   ├── card-spy.js              # Main process (253 lines)
│   ├── package.json             # App dependencies
│   ├── dist/
│   │   └── index.html           # HTML template
│   └── src/
│       ├── Routing.js           # React Router setup
│       ├── EmvTags.js           # EMV tag definitions (191 lines)
│       ├── *.scss               # Global styles
│       └── components/
│           ├── Application.js   # Root component (209 lines)
│           ├── console/         # REPL console UI
│           ├── tlv/             # TLV renderer (192 lines)
│           ├── command/         # Command display
│           ├── response/        # Response display
│           ├── status-bar/      # Status bar
│           ├── device-selector/ # Device dropdown
│           ├── indicator/       # Status badges
│           ├── console-entry/   # Log entry wrapper
│           └── scroll-to-bottom/ # Auto-scroll HOC
├── webpack.config.js            # Webpack configuration
├── .babelrc                     # Babel configuration
├── package.json                 # Root package (dev deps)
├── README.MD                    # Minimal docs
└── tomkp.{icns,ico,png}        # App icons
```

---

## 5. Core Components Analysis

### card-spy.js (Main Process)

**Responsibilities:**
- Window creation and lifecycle management
- Smartcard reader detection and monitoring
- Card insertion/removal handling
- APDU command transmission
- EMV interrogation logic

**Key Function - `selectPse()`:**
```javascript
// Automatically interrogates inserted cards:
// 1. Selects PSE (Payment System Environment)
// 2. Reads all records from card applications
// 3. Extracts AIDs (Application Identifiers)
// 4. Selects and reads each application
```

### Application.js (React Root)

**State Shape:**
```javascript
{
  dx: {},          // Device registry (name -> object)
  devices: [],     // Device list
  device: null,    // Active device
  card: null,      // Inserted card
  log: [],         // Command/response history
  applications: {},// EMV applications found
  repl: ''         // REPL input text
}
```

**IPC Events Handled:**
- `device-activated` / `device-deactivated`
- `card-inserted` / `card-removed`
- `command-issued` / `response-received`

### Tlv.js (TLV Renderer)

Recursive component that renders hierarchical TLV structures:
- Handles constructed (nested) and primitive tags
- Maps hex tags to EMV descriptions
- Displays both hex and ASCII representations
- Colorized output for readability

---

## 6. Strengths

### Clean Architecture
- Clear separation between Electron main and renderer processes
- Component-based React architecture with co-located styles
- Small, focused components (most under 70 lines)

### Domain Knowledge
- Comprehensive EMV tag dictionary (100+ tags)
- Proper TLV recursive parsing
- Smart PSE interrogation flow

### Developer Experience
- Hot reloading via webpack-dev-server
- Source maps for debugging
- Cross-platform build scripts

---

## 7. Issues & Recommendations

### Critical Issues

#### No Test Coverage
- **Problem:** Zero unit or integration tests
- **Risk:** High regression potential for protocol-sensitive code
- **Recommendation:** Add tests for EmvTags.js, TLV parsing, and card-spy.js

#### Memory Leaks
- **Problem:** IPC listeners in Application.js constructor never cleaned up
- **Location:** `app/src/components/Application.js:47-122`
- **Recommendation:** Move listeners to componentDidMount with cleanup in componentWillUnmount

#### Unbounded Log Growth
- **Problem:** Full command log stored in state without limit
- **Location:** `app/src/components/Application.js:32` (log array)
- **Recommendation:** Implement log rotation or virtualized list

### Moderate Issues

#### Outdated Dependencies
| Package | Current | Latest |
|---------|---------|--------|
| Electron | 3.0.6 | 27+ |
| React | 16.6.0 | 18+ |
| Webpack | 4.23.1 | 5+ |

- **Risk:** Security vulnerabilities, missing features
- **Recommendation:** Major version upgrades with testing

#### Redux Installed But Unused
- **Problem:** Redux/react-redux in dependencies but state managed in component
- **Location:** `app/package.json`
- **Recommendation:** Either implement Redux or remove dependency

#### Deprecated React Patterns
- **Problem:** Uses findDOMNode (deprecated)
- **Location:** `app/src/components/scroll-to-bottom/ScrollToBottom.js:16`
- **Recommendation:** Use React refs instead

#### Code Duplication
- **Problem:** EMV tag definitions duplicated
- **Locations:** `EmvTags.js` and `Tlv.js`
- **Recommendation:** Consolidate into single source of truth

### Minor Issues

#### Minimal Documentation
- README is only 6 lines
- No usage instructions, API docs, or architecture guide
- Recommendation: Add comprehensive README with setup/usage

#### Error Handling
- Errors logged to console but not shown in UI
- No error boundary components
- Recommendation: Add user-facing error states

#### Styling
- No responsive design (fixed 640x800 window)
- Some commented-out code in SCSS files
- Recommendation: Clean up and consider responsive layouts

---

## 8. Security Considerations

### Data Sensitivity
The application handles potentially sensitive smartcard data:
- PAN (Primary Account Number) - Credit card numbers
- Track 2 data
- Cardholder name
- Expiry dates

### Current Risks
1. **No Encryption**: Log data stored in memory unencrypted
2. **Dev Tools Access**: Sensitive data visible in Electron dev tools
3. **No Log Clearing on Exit**: Data persists in memory during session

### Recommendations
1. Consider optional log encryption
2. Disable dev tools in production builds
3. Add explicit "clear sensitive data" functionality
4. Document data handling practices

---

## 9. Performance Analysis

### Current Bottlenecks
1. **Full Log Rerenders**: Every new command/response rerenders entire log
2. **Recursive TLV Rendering**: No memoization for repeated renders
3. **No Virtualization**: Long logs cause scroll performance issues

### Recommendations
1. Implement React.memo() for TLV components
2. Use virtualized list (react-window) for log display
3. Add pagination or log rotation

---

## 10. Recommended Improvements

### Priority 1 (Critical)
- [ ] Add unit tests for core parsing logic
- [ ] Fix memory leak in IPC listeners
- [ ] Update Electron to address security issues

### Priority 2 (Important)
- [ ] Implement log size limits
- [ ] Add error boundary and user-facing errors
- [ ] Remove or implement Redux
- [ ] Fix deprecated React patterns

### Priority 3 (Nice to Have)
- [ ] Comprehensive documentation
- [ ] Responsive design
- [ ] Performance optimizations
- [ ] Code deduplication

---

## 11. File Reference

| File | Lines | Complexity | Purpose |
|------|-------|------------|---------|
| `card-spy.js` | 253 | High | Main process, EMV logic |
| `Application.js` | 209 | Medium | State management |
| `Tlv.js` | 192 | Medium | TLV rendering |
| `EmvTags.js` | 191 | Low | Tag definitions |
| `Console.js` | 70 | Low | Main UI view |
| `DeviceSelector.js` | 53 | Low | Device selection |
| `ScrollToBottom.js` | 30 | Low | Auto-scroll |
| `StatusBar.js` | 23 | Low | Status display |
| Other components | ~60 | Low | Supporting UI |

---

## Conclusion

Card Spy is a well-architected but unmaintained EMV diagnostic tool. The core functionality is sound, with clean separation between Electron and React, comprehensive EMV tag support, and proper TLV parsing.

However, significant technical debt has accumulated:
- **No tests** make changes risky
- **Outdated dependencies** pose security and compatibility concerns
- **Memory management issues** could cause problems with heavy use

For active development, priority should be given to adding tests, updating dependencies, and fixing the memory leak issues before adding new features.

---

*Analysis generated: December 2024*
*Repository: card-spy v1.0.0*
