# Card Spy

A smartcard and NFC IDE for the desktop.

- **APDU workbench**: send APDUs from a console, and see every exchange in a trace with the command named, the status word explained and the response decoded as TLV.
- **Card explorer**: one click reads what Card Spy understands from a card: the ATR byte by byte, EMV payment applications (PSE/PPSE, FCI, GET PROCESSING OPTIONS, every AFL record, GET DATA, the transaction log), NFC Forum Type 2 tag memory and NDEF, and well-known applications such as PIV, OpenPGP and FIDO.
- **Scripts**: TypeScript with completions for the card API, run against the selected reader. You can step APDU by APDU, with the current line highlighted.
- **Virtual cards**: simulated cards in a virtual reader, so you can work without hardware. Record any session with a real card and replay it later.
- **NFC**: contactless readers (ACR122U, ACR1252U and others) work through PC/SC. Contactless smart cards take ordinary APDUs, and memory tags (NTAG, MIFARE Ultralight) take the reader's `FF` pseudo-APDUs.

## Run it

```bash
npm install
npm run dev        # development, with hot reload
npm run build      # production build into out/
npm start          # run the production build
npm run checks     # typecheck, format check, tests
```

PC/SC readers are found through [`smartcard`](https://github.com/tomkp/smartcard). On Linux, install `pcscd` and `libpcsclite-dev` first.

Scripts and virtual cards live in a workspace folder, by default `~/Documents/Card Spy`. Override it with `CARDSPY_WORKSPACE=/some/path`. The folder holds:

```
scripts/*.ts      your scripts (the examples are copied here on first run)
cards/*.json      virtual cards you've recorded or written
```

## Layout

```
src/shared/        pure TypeScript, no Node or DOM: runs in main, renderer and the script worker
  hex, apdu, sw, tlv, dol, atr, ndef, aids, tags/emv   decoders and dictionaries
  commands, exchange, emv-flow                         building and sending common commands
  explorer/                                            card exploration, producing a tree
  virtual/                                             virtual card format, simulator, recorder, demo cards
src/main/          Electron main: readers (PC/SC + virtual), trace, workspace files, IPC
src/preload/       the `window.cardspy` bridge (sandboxed, context-isolated)
src/renderer/      React UI, Monaco editor, script runner (a web worker per run)
examples/          example scripts, type-checked against the script API
```

Every APDU goes through the main process one at a time per reader, and is recorded in the trace with its source (`console`, `explorer` or `script`). 61xx/6Cxx handling happens above the transport, so GET RESPONSE shows up in the trace as an exchange of its own.

## Scripts

Scripts are TypeScript modules with top-level `await`, run in a sandboxed worker. The globals are declared in [`script-globals.d.ts`](src/renderer/src/scripting/script-globals.d.ts), which is also what the editor uses for completions:

```ts
const fci = (await card.select('A0000000031010')).expectOk();
log(fci.tlv()); // printed as a tree, with tag names

const gpo = await card.send({ cla: 0x80, ins: 0xa8, p1: 0, p2: 0,
  data: tlv.encode('83', emv.buildDol(fci.find('9F38')?.value ?? new Uint8Array())), le: 256 });
for (const { sfi, first, last } of emv.parseGpo(gpo.data).afl) { /* card.readRecord(sfi, n) … */ }
```

| Key | Action |
| --- | --- |
| ⌘↩ / Ctrl+Enter | Run the script |
| F10 | Step: pause before each APDU |
| F5 | Run, or continue when paused |
| Shift+F5 | Stop |
| ⌘S | Save |
| ⌘E | Explore the card |
| ⌘K | Focus the APDU console |

## Virtual cards

A virtual card is JSON. An `apdu` card is an ordered list of rules. `??` matches any byte, and a trailing `*` matches the rest. `state` and `next` let the same command answer differently depending on which application is selected:

```json
{
  "format": "card-spy/virtual-card",
  "version": 1,
  "name": "My card",
  "atr": "3B6800000073C84012009000",
  "model": {
    "kind": "apdu",
    "rules": [
      { "command": "00A4040007A000000003101000", "response": "6F…9000", "next": "visa" },
      { "command": "00B2010C00", "state": "visa", "response": "70…9000" },
      { "command": "80A80000*", "state": "visa", "response": "77…9000" }
    ],
    "fallback": "6D00"
  }
}
```

A `memory` card simulates a Type 2 tag behind a contactless reader, built from a memory image (`uid`, `pageSize`, `memory`).

**Save as virtual card** in the trace records the current card's session in this format. Commands whose data comes from the terminal (GET PROCESSING OPTIONS, GENERATE AC, authentication) are recorded as patterns, so a replay still answers them when the amounts or random numbers change.
