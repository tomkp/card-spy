import { fromHex, toHex } from '../hex';
import { INITIAL_STATE, type ApduRule, type VirtualCardDefinition } from './definition';

export interface RecordedExchange {
  command: string;
  response: string;
}

export interface RecordOptions {
  name: string;
  atr: string;
  exchanges: RecordedExchange[];
  description?: string;
  interface?: 'contact' | 'contactless';
}

/**
 * Instructions whose command data comes from the terminal (amounts, unpredictable numbers, challenges),
 * so a replay should answer them whatever the data is.
 */
const TERMINAL_DATA_INS = new Set([0x2a, 0x82, 0x86, 0x87, 0x88, 0xa8, 0xae]);

/**
 * Turns a trace into an `apdu` virtual card that replays it.
 *
 * States follow the selected application, so READ RECORD 1 can answer differently under two AIDs.
 * SELECT and reader pseudo-APDUs (CLA FF) are recorded without a state so they work from anywhere.
 * A 61xx answer moves to a one-off state that only the following GET RESPONSE matches.
 * When the same command was sent twice in the same state, the first answer wins.
 */
export function recordVirtualCard(options: RecordOptions): VirtualCardDefinition {
  const rules: ApduRule[] = [];
  const seen = new Set<string>();
  let state = INITIAL_STATE;
  let pending = 0;

  for (const exchange of options.exchanges) {
    const command = fromHex(exchange.command);
    const response = fromHex(exchange.response);
    if (command.length < 4 || response.length < 2) continue;

    const [cla, ins, p1] = command as unknown as [number, number, number];
    const sw1 = response[response.length - 2]!;
    const pseudo = cla === 0xff;
    const select = !pseudo && ins === 0xa4;
    const succeeded = sw1 === 0x90 || sw1 === 0x61;

    let target = baseState(state);
    if (select && succeeded) {
      const lc = command[4] ?? 0;
      target = `select:${toHex([p1])}:${toHex(command.subarray(5, 5 + lc))}`;
    }
    const after = sw1 === 0x61 ? `${target}~${++pending}` : target;

    const pattern =
      !pseudo && TERMINAL_DATA_INS.has(ins) ? `${toHex(command.subarray(0, 4))}*` : toHex(command);
    const ruleState = pseudo || select ? undefined : state;
    const key = `${ruleState ?? '*'}|${pattern}`;

    if (!seen.has(key)) {
      seen.add(key);
      const rule: ApduRule = { command: pattern, response: toHex(response) };
      if (ruleState !== undefined) rule.state = ruleState;
      // A failed SELECT leaves the current selection alone, so it must not move the state.
      if (!pseudo && (select ? succeeded : after !== state)) rule.next = after;
      rules.push(rule);
    }
    if (!pseudo) state = after;
  }

  return {
    format: 'card-spy/virtual-card',
    version: 1,
    name: options.name,
    ...(options.description ? { description: options.description } : {}),
    atr: options.atr,
    ...(options.interface ? { interface: options.interface } : {}),
    model: { kind: 'apdu', rules },
  };
}

function baseState(state: string): string {
  const i = state.indexOf('~');
  return i === -1 ? state : state.slice(0, i);
}
