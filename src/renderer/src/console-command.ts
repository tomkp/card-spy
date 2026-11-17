import * as commands from '@shared/commands';
import { fromHex } from '@shared/hex';

/** What a line typed in the APDU console asks for. */
export type ConsoleCommand = { kind: 'apdu'; apdu: Uint8Array } | { kind: 'reset'; cold: boolean };

/**
 * Raw hex is sent as is. A few shortcuts save typing:
 *   select <aid | name>   read <sfi> <record>   getdata <tag>   uid   reset   reset cold
 */
export function parseConsoleCommand(input: string): ConsoleCommand {
  const [word = '', ...args] = input.trim().split(/\s+/);
  switch (word.toLowerCase()) {
    case 'select':
      return apdu(commands.selectByName(commands.nameBytes(args.join(''))));
    case 'read':
      return apdu(commands.readRecord(Number(args[0] ?? 1), Number(args[1] ?? 1)));
    case 'getdata':
      return apdu(commands.getData(args.join('')));
    case 'uid':
      return apdu(commands.GET_UID);
    case 'reset':
      return { kind: 'reset', cold: args[0] === 'cold' };
    default: {
      const command = fromHex(input);
      if (command.length < 4) throw new Error('An APDU needs at least CLA INS P1 P2');
      return apdu(command);
    }
  }
}

function apdu(bytes: Uint8Array): ConsoleCommand {
  return { kind: 'apdu', apdu: bytes };
}
