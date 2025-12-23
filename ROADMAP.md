# Card Spy - Smartcard IDE Roadmap

## Overview

Transform Card Spy from a basic smartcard explorer into a full-featured Smartcard IDE comparable to tools like Cardpeek, Smart Card ToolSet PRO, and OpenSCDP.

---

## Phase 1: Core UX Fixes

### 1.1 Card Info Header
**Status:** 🟢 Complete
**Priority:** High
**Estimated Complexity:** Medium

**Current State:**
- Only shows raw ATR hex string
- No card type identification displayed
- No parsed ATR information

**Target State:**
- Prominent card identity display showing:
  - Card type name (e.g., "Mastercard Credit/Debit")
  - Detected handler name
  - Application ID (AID) if available
  - Parsed ATR with protocol info
  - Card capabilities

**Tasks:**
- [x] 1.1.1 Create `CardInfoHeader` component
- [x] 1.1.2 Add ATR parser utility (extract protocol, card type hints)
- [x] 1.1.3 Display detected handler info prominently
- [x] 1.1.4 Show discovered applications with friendly names
- [x] 1.1.5 Add card icon/visual indicator based on type

**Implementation Notes:**
- Created `src/shared/atr.ts` with ATR parsing, protocol detection, and card type hints
- Created `src/renderer/components/CardInfoHeader.tsx` with icon, card name, handler info, ATR display
- Moved command panel to left side, card info header at top
- Added copy button for ATR
- Icons change based on card type (CreditCard, KeyRound, Shield, Fingerprint)

---

### 1.2 Command History in REPL
**Status:** 🟢 Complete
**Priority:** High
**Estimated Complexity:** Low

**Current State:**
- Single textarea input
- No command recall
- History lost on clear

**Target State:**
- Up/Down arrows navigate command history
- History persists during session
- Optional: persist across sessions

**Tasks:**
- [x] 1.2.1 Add command history state array
- [x] 1.2.2 Implement up/down arrow key handlers
- [x] 1.2.3 Add history index tracking
- [x] 1.2.4 Preserve history on clear (only clear input)

**Implementation Notes:**
- Changed textarea to single-line input for better UX
- Added `history`, `historyIndex`, and `savedInput` state
- Up arrow navigates to previous commands, down arrow to newer commands
- Current input is saved when navigating history and restored when returning
- Added visual history indicator showing position (e.g., "3/5")
- Added clickable up/down chevron buttons for mouse navigation
- Escape key clears input without losing history
- History avoids consecutive duplicates

---

### 1.3 Keyboard Shortcuts
**Status:** 🟢 Complete
**Priority:** High
**Estimated Complexity:** Medium

**Current State:**
- Enter to send in REPL
- No global shortcuts

**Target State:**
- `Cmd/Ctrl+Enter` - Send command
- `Cmd/Ctrl+I` - Interrogate card
- `Cmd/Ctrl+L` - Clear log
- `Cmd/Ctrl+K` - Focus command input
- `Escape` - Clear input / close dialogs

**Tasks:**
- [x] 1.3.1 Create keyboard shortcut hook/manager
- [x] 1.3.2 Implement global shortcut listeners
- [x] 1.3.3 Add shortcut hints to UI buttons
- [x] 1.3.4 Add keyboard shortcut help overlay (Cmd+/)

**Implementation Notes:**
- Created `src/renderer/hooks/useKeyboardShortcuts.ts` with flexible shortcut hook
- Supports Cmd (Mac) / Ctrl (Win/Linux) detection for cross-platform shortcuts
- Added global shortcuts: Cmd+I (interrogate), Cmd+L (clear), Cmd+K (focus input), Cmd+/ (help)
- Created `src/renderer/components/KeyboardShortcutsHelp.tsx` modal overlay
- Added keyboard button to toolbar with Cmd+/ to open help
- Button tooltips now show platform-appropriate shortcuts (⌘ on Mac, Ctrl+ on Windows)

---

### 1.4 Copy Support
**Status:** 🟢 Complete
**Priority:** Medium
**Estimated Complexity:** Low

**Current State:**
- Manual text selection required
- No click-to-copy

**Target State:**
- Click to copy any hex value
- Copy button on response data
- Copy TLV node value
- Toast notification on copy

**Tasks:**
- [x] 1.4.1 Create `CopyButton` component
- [x] 1.4.2 Add copy buttons to command/response hex
- [x] 1.4.3 Add copy to TLV node values
- [x] 1.4.4 Add toast notification system (inline checkmark feedback)
- [x] 1.4.5 Copy full command+response as formatted text

**Implementation Notes:**
- Created reusable `src/renderer/components/CopyButton.tsx` component
- Added copy buttons next to command, status, and response data in detail panel
- Added "Copy all" button to copy full formatted command+response
- TLV values show copy button on hover for cleaner UI
- Visual feedback via checkmark icon (changes from copy to check for 2 seconds)
- Refactored CardInfoHeader to use shared CopyButton

---

## Phase 2: IDE Features

### 2.1 Session Save/Load
**Status:** 🔴 Not Started
**Priority:** High
**Estimated Complexity:** Medium

**Current State:**
- All data lost on app close
- No export capability

**Target State:**
- Save session to JSON file
- Load previous session
- Auto-save option
- Export log as CSV/JSON

**Tasks:**
- [ ] 2.1.1 Define session file format (JSON schema)
- [ ] 2.1.2 Add "Save Session" menu/button
- [ ] 2.1.3 Add "Load Session" with file picker
- [ ] 2.1.4 Add "Export Log" (CSV format)
- [ ] 2.1.5 Add auto-save to localStorage

---

### 2.2 APDU Builder
**Status:** 🔴 Not Started
**Priority:** Medium
**Estimated Complexity:** High

**Current State:**
- Raw hex input only
- Easy to make mistakes

**Target State:**
- Visual APDU construction
- Separate fields for CLA, INS, P1, P2, Lc, Data, Le
- Auto-calculate Lc from data length
- Validation and error hints
- Quick templates for common commands

**Tasks:**
- [ ] 2.2.1 Create `ApduBuilder` component
- [ ] 2.2.2 Add individual byte input fields
- [ ] 2.2.3 Add data field with length calculation
- [ ] 2.2.4 Add validation (valid hex, correct length)
- [ ] 2.2.5 Add command templates dropdown
- [ ] 2.2.6 Toggle between builder and raw input modes

---

### 2.3 Search and Filter
**Status:** 🔴 Not Started
**Priority:** Medium
**Estimated Complexity:** Medium

**Current State:**
- No search capability
- Must scroll through all logs

**Target State:**
- Search box filters command log
- Filter by status (success/error)
- Search within TLV tree
- Highlight matches

**Tasks:**
- [ ] 2.3.1 Add search input to command log header
- [ ] 2.3.2 Implement log filtering logic
- [ ] 2.3.3 Add status filter buttons (All/Success/Error)
- [ ] 2.3.4 Add search to TLV inspector
- [ ] 2.3.5 Highlight matching text

---

### 2.4 Tag Browser / Reference
**Status:** 🔴 Not Started
**Priority:** Medium
**Estimated Complexity:** Medium

**Current State:**
- Tags shown inline in TLV tree
- No way to browse/search tags

**Target State:**
- Dedicated tag reference panel/modal
- Search by tag number or name
- Filter by category (EMV, PIV, etc.)
- Show tag details (format, meaning, examples)

**Tasks:**
- [ ] 2.4.1 Consolidate all tag dictionaries
- [ ] 2.4.2 Create `TagBrowser` component
- [ ] 2.4.3 Add search functionality
- [ ] 2.4.4 Add category filtering
- [ ] 2.4.5 Add tag detail view with examples
- [ ] 2.4.6 Link from TLV tree to tag reference

---

## Phase 3: Power Features

### 3.1 Script Editor
**Status:** 🔴 Not Started
**Priority:** Low
**Estimated Complexity:** High

**Current State:**
- Single command execution only
- No automation

**Target State:**
- Multi-line script editor
- Execute commands in sequence
- Basic conditionals (check SW)
- Save/load scripts
- Script library

**Tasks:**
- [ ] 3.1.1 Create `ScriptEditor` component with Monaco/CodeMirror
- [ ] 3.1.2 Define script syntax/format
- [ ] 3.1.3 Implement script parser
- [ ] 3.1.4 Implement script executor
- [ ] 3.1.5 Add conditional logic (IF SW=9000)
- [ ] 3.1.6 Add script save/load
- [ ] 3.1.7 Add built-in script library

---

### 3.2 Response Comparison
**Status:** 🔴 Not Started
**Priority:** Low
**Estimated Complexity:** Medium

**Current State:**
- Can only view one response at a time

**Target State:**
- Select two responses to compare
- Side-by-side diff view
- Highlight differences
- Compare TLV structures

**Tasks:**
- [ ] 3.2.1 Add multi-select capability to log
- [ ] 3.2.2 Create `CompareView` component
- [ ] 3.2.3 Implement hex diff algorithm
- [ ] 3.2.4 Implement TLV structure diff
- [ ] 3.2.5 Add visual diff highlighting

---

### 3.3 Card Profiles / History
**Status:** 🔴 Not Started
**Priority:** Low
**Estimated Complexity:** Medium

**Current State:**
- No memory of previously seen cards

**Target State:**
- Remember cards by ATR
- Show last seen date
- Quick recall of previous sessions
- Name/label cards

**Tasks:**
- [ ] 3.3.1 Design card profile data structure
- [ ] 3.3.2 Store profiles in localStorage/file
- [ ] 3.3.3 Auto-detect returning cards
- [ ] 3.3.4 Add card naming/labeling
- [ ] 3.3.5 Show card history list
- [ ] 3.3.6 Link sessions to card profiles

---

### 3.4 Plugin System for User Handlers
**Status:** 🔴 Not Started
**Priority:** Low
**Estimated Complexity:** High

**Current State:**
- Handlers are compiled into app

**Target State:**
- Load handlers from user directory
- Hot-reload handler changes
- Handler marketplace/sharing

**Tasks:**
- [ ] 3.4.1 Define handler plugin API
- [ ] 3.4.2 Create plugin loader
- [ ] 3.4.3 Add user plugin directory
- [ ] 3.4.4 Implement hot-reload
- [ ] 3.4.5 Add plugin management UI

---

## UI/Layout Improvements

### 4.1 Improved Layout Structure
**Status:** 🔴 Not Started
**Priority:** Medium
**Estimated Complexity:** Medium

**Current State:**
```
┌─────────────────────────────────────┐
│ [Toolbar] │ Command Log │ Commands │
├───────────┴─────────────┴──────────┤
│            REPL Input              │
├────────────────────────────────────┤
│         Device Selector            │
└────────────────────────────────────┘
```

**Target State:**
```
┌─────────────────────────────────────┐
│ Card Info Header                    │
├──────────┬──────────────┬──────────┤
│ Commands │ Command Log  │ Inspector│
│          │              │          │
├──────────┴──────────────┴──────────┤
│ REPL with history                  │
├────────────────────────────────────┤
│ Status Bar (reader + card status)  │
└────────────────────────────────────┘
```

**Tasks:**
- [ ] 4.1.1 Move commands panel to left side
- [ ] 4.1.2 Create dedicated Card Info Header
- [ ] 4.1.3 Make panels resizable
- [ ] 4.1.4 Add panel collapse/expand
- [ ] 4.1.5 Improve status bar design

---

## Progress Tracking

| Phase | Total Tasks | Completed | Progress |
|-------|-------------|-----------|----------|
| Phase 1 | 18 | 18 | 100% |
| Phase 2 | 22 | 0 | 0% |
| Phase 3 | 24 | 0 | 0% |
| Layout | 5 | 0 | 0% |
| **Total** | **69** | **18** | **26%** |

---

## Changelog

### [2024-12-23] Phase 1 Complete
- 1.1: Card Info Header - displays card type, handler info, ATR, protocol
- 1.2: Command History - up/down navigation, history indicator, session persistence
- 1.3: Keyboard Shortcuts - global shortcuts with Cmd/Ctrl support, help overlay
- 1.4: Copy Support - reusable CopyButton, copy all, TLV value copy on hover

### [Unreleased]
- Initial roadmap created

