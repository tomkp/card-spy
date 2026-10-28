import { concatBytes, fromHex } from '../hex';
import {
  compilePattern,
  INITIAL_STATE,
  matchesPattern,
  type ApduModel,
  type MemoryModel,
  type VirtualCardDefinition,
} from './definition';

/** A running virtual card. Synchronous and pure apart from its own state, so it is easy to test. */
export interface VirtualCard {
  readonly definition: VirtualCardDefinition;
  readonly atr: Uint8Array;
  transmit(command: Uint8Array): Uint8Array;
  reset(): void;
}

export function createVirtualCard(definition: VirtualCardDefinition): VirtualCard {
  const atr = fromHex(definition.atr);
  const model = definition.model;
  const behaviour = model.kind === 'apdu' ? apduBehaviour(model) : memoryBehaviour(model);
  return {
    definition,
    atr,
    transmit: (command) => behaviour.transmit(command),
    reset: () => behaviour.reset(),
  };
}

interface Behaviour {
  transmit(command: Uint8Array): Uint8Array;
  reset(): void;
}

const SW_OK = [0x90, 0x00];

function apduBehaviour(model: ApduModel): Behaviour {
  const rules = model.rules.map((rule) => ({
    rule,
    pattern: compilePattern(rule.command),
    response: fromHex(rule.response),
  }));
  const fallback = fromHex(model.fallback ?? '6D00');
  let state = INITIAL_STATE;

  const find = (command: Uint8Array, wanted: (s: string | undefined) => boolean) =>
    rules.find(({ rule, pattern }) => wanted(rule.state) && matchesPattern(pattern, command));

  return {
    transmit(command) {
      // Rules for the current state win over state-less rules, so a recording can override a default.
      const hit = find(command, (s) => s === state) ?? find(command, (s) => s === undefined);
      if (!hit) return fallback.slice();
      if (hit.rule.next !== undefined) state = hit.rule.next;
      return hit.response.slice();
    },
    reset() {
      state = INITIAL_STATE;
    },
  };
}

/**
 * PC/SC Part 3 storage-card commands, as a contactless reader exposes an NFC Forum Type 2 tag:
 * FF CA 00 00 Le (GET UID), FF B0 00 page Le (READ BINARY), FF D6 00 page Lc data (UPDATE BINARY).
 */
function memoryBehaviour(model: MemoryModel): Behaviour {
  const uid = fromHex(model.uid);
  const memory = fromHex(model.memory);
  const pageSize = model.pageSize;
  const firstWritablePage = model.firstWritablePage ?? 4;

  const sw = (sw1: number, sw2: number) => Uint8Array.of(sw1, sw2);

  return {
    transmit(command) {
      if (command.length < 4) return sw(0x67, 0x00);
      const [cla, ins, p1, p2] = command as unknown as [number, number, number, number];
      if (cla !== 0xff) return sw(0x6e, 0x00);
      const address = ((p1 << 8) | p2) * pageSize;

      if (ins === 0xca) {
        if (p1 === 0x00) return concatBytes(uid, SW_OK);
        return sw(0x6a, 0x81);
      }
      if (ins === 0xb0) {
        const le = command.length > 4 ? command[4]! || 256 : 16;
        if (address >= memory.length) return sw(0x6b, 0x00);
        const data = memory.subarray(address, Math.min(address + le, memory.length));
        // Short read: PC/SC reports "end of data reached before Le bytes" with what it has.
        return concatBytes(data, data.length < le ? [0x62, 0x82] : SW_OK);
      }
      if (ins === 0xd6) {
        const lc = command[4] ?? 0;
        const data = command.subarray(5, 5 + lc);
        if (data.length !== lc || lc === 0) return sw(0x67, 0x00);
        if (model.readOnly || (p1 << 8) + p2 < firstWritablePage) return sw(0x69, 0x82);
        if (address + lc > memory.length) return sw(0x6b, 0x00);
        memory.set(data, address);
        return sw(0x90, 0x00);
      }
      return sw(0x6a, 0x81);
    },
    reset() {
      // A power cycle keeps what was written, like a real tag. Re-inserting the card restores the image.
    },
  };
}
