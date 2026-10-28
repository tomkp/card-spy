import { normalizeHex } from '../hex';

/**
 * A virtual card is plain JSON so it can be recorded from a real card, edited by hand and kept in git.
 *
 * Two models:
 * - `apdu`: an ordered list of command -> response rules, with an optional state machine so the same
 *   command can answer differently depending on which application was selected.
 * - `memory`: an NFC Forum Type 2 tag (NTAG / MIFARE Ultralight) behind a PC/SC contactless reader,
 *   answering the reader's pseudo-APDUs (GET UID, READ BINARY, UPDATE BINARY) from a byte image.
 */
export interface VirtualCardDefinition {
  format: 'card-spy/virtual-card';
  version: 1;
  name: string;
  description?: string;
  /** Hex. */
  atr: string;
  interface?: 'contact' | 'contactless';
  model: ApduModel | MemoryModel;
}

export interface ApduRule {
  /**
   * Hex pattern. `??` matches any single byte; a trailing `*` matches any remaining bytes (including none).
   * Whitespace is ignored, so "00 A4 04 00 *" is fine.
   */
  command: string;
  /** Hex, status word included. */
  response: string;
  /** Only match when the card is in this state. Omit to match in any state. */
  state?: string;
  /** State to move to after answering. */
  next?: string;
  note?: string;
}

export interface ApduModel {
  kind: 'apdu';
  rules: ApduRule[];
  /** Answer when no rule matches. Defaults to 6D00 (instruction not supported). */
  fallback?: string;
}

export interface MemoryModel {
  kind: 'memory';
  /** Hex, as returned by GET UID. */
  uid: string;
  /** Bytes per page/block: 4 for Type 2 tags. */
  pageSize: number;
  /** Whole memory image, hex. */
  memory: string;
  /** First page that UPDATE BINARY may write (4 on Type 2 tags: pages 0-3 are UID, lock and CC). */
  firstWritablePage?: number;
  readOnly?: boolean;
}

export const INITIAL_STATE = '';

/** Validates untrusted JSON (a file from the workspace) and returns it typed, or throws a readable error. */
export function parseVirtualCard(json: unknown): VirtualCardDefinition {
  const fail = (message: string): never => {
    throw new Error(`Invalid virtual card: ${message}`);
  };
  if (!isObject(json)) return fail('expected a JSON object');
  if (json.format !== 'card-spy/virtual-card')
    return fail(`format must be "card-spy/virtual-card"`);
  if (json.version !== 1) return fail(`unsupported version ${String(json.version)}`);
  if (typeof json.name !== 'string' || !json.name.trim()) return fail('name is required');
  checkHex(json.atr, 'atr', fail);
  if (
    json.interface !== undefined &&
    json.interface !== 'contact' &&
    json.interface !== 'contactless'
  ) {
    fail('interface must be "contact" or "contactless"');
  }
  const model = json.model;
  if (!isObject(model)) return fail('model is required');
  if (model.kind === 'apdu') {
    if (!Array.isArray(model.rules)) return fail('model.rules must be an array');
    model.rules.forEach((rule: unknown, i: number) => {
      if (!isObject(rule)) return fail(`rule ${i + 1} must be an object`);
      checkPattern(rule.command, `rule ${i + 1} command`, fail);
      checkHex(rule.response, `rule ${i + 1} response`, fail);
      if (normalizeHex(rule.response as string).length < 4) {
        fail(`rule ${i + 1} response needs at least a status word`);
      }
      for (const key of ['state', 'next', 'note'] as const) {
        if (rule[key] !== undefined && typeof rule[key] !== 'string')
          fail(`rule ${i + 1} ${key} must be a string`);
      }
    });
    if (model.fallback !== undefined) checkHex(model.fallback, 'model.fallback', fail);
  } else if (model.kind === 'memory') {
    checkHex(model.uid, 'model.uid', fail);
    checkHex(model.memory, 'model.memory', fail);
    if (typeof model.pageSize !== 'number' || model.pageSize < 1)
      fail('model.pageSize must be a positive number');
  } else {
    fail('model.kind must be "apdu" or "memory"');
  }
  return json as unknown as VirtualCardDefinition;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkHex(value: unknown, field: string, fail: (m: string) => never): void {
  if (typeof value !== 'string') fail(`${field} must be a hex string`);
  try {
    if (normalizeHex(value as string).length % 2 !== 0)
      fail(`${field} has an odd number of hex digits`);
  } catch (e) {
    fail(`${field}: ${(e as Error).message}`);
  }
}

function checkPattern(value: unknown, field: string, fail: (m: string) => never): void {
  if (typeof value !== 'string') return fail(`${field} must be a hex pattern`);
  try {
    compilePattern(value);
  } catch (e) {
    fail(`${field}: ${(e as Error).message}`);
  }
}

/** A compiled rule pattern: one entry per byte, `undefined` for a `??` wildcard. */
export interface CommandPattern {
  bytes: Array<number | undefined>;
  open: boolean;
}

export function compilePattern(pattern: string): CommandPattern {
  let text = pattern.replace(/\s+/g, '').toUpperCase();
  const open = text.endsWith('*');
  if (open) text = text.slice(0, -1);
  if (text.includes('*')) throw new Error(`'*' is only allowed at the end`);
  if (text.length % 2 !== 0) throw new Error('odd number of hex digits');
  const bytes: Array<number | undefined> = [];
  for (let i = 0; i < text.length; i += 2) {
    const pair = text.slice(i, i + 2);
    if (pair === '??') bytes.push(undefined);
    else if (/^[0-9A-F]{2}$/.test(pair)) bytes.push(parseInt(pair, 16));
    else throw new Error(`'${pair}' is not a hex byte or ??`);
  }
  return { bytes, open };
}

export function matchesPattern(pattern: CommandPattern, command: Uint8Array): boolean {
  if (
    pattern.open ? command.length < pattern.bytes.length : command.length !== pattern.bytes.length
  ) {
    return false;
  }
  return pattern.bytes.every((b, i) => b === undefined || b === command[i]);
}
