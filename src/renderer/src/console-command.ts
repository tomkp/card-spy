import * as commands from '@shared/commands';
import { fromHex, stripComments } from '@shared/hex';

/** What a line typed in the APDU console asks for. */
export type ConsoleCommand = { kind: 'apdu'; apdu: Uint8Array } | { kind: 'reset'; cold: boolean };

/**
 * Reads a console line. The command word can be in any case, and a comment (from # or //) can end
 * the line:
 *
 *   select <aid | name>   read <sfi> <record>   getdata <tag>   uid   reset [cold]   <hex APDU>
 *
 * Throws for a line that doesn't fit one of these, rather than guessing what was meant. The spec
 * is console-command.properties.test.ts.
 */
export function parseConsoleCommand(line: string): ConsoleCommand {
  const text = stripComments(line).trim();
  const [, word = '', rest = ''] = /^(\S*)\s*(.*)$/s.exec(text)!;
  const args = rest ? rest.split(/\s+/) : [];
  switch (word.toLowerCase()) {
    case 'select':
      if (!rest) throw new Error('select needs an AID in hex or an ASCII name');
      return apdu(commands.selectByName(commands.nameBytes(rest)));
    case 'read':
      if (args.length !== 2)
        throw new Error('read needs an SFI and a record number, e.g. read 1 1');
      return apdu(commands.readRecord(wholeNumber(args[0]!), wholeNumber(args[1]!)));
    case 'getdata':
      if (!rest) throw new Error('getdata needs a tag in hex, e.g. getdata 9F36');
      return apdu(commands.getData(rest));
    case 'uid':
      if (rest) throw new Error('uid takes no arguments');
      return apdu(commands.GET_UID);
    case 'reset':
      if (rest && rest.toLowerCase() !== 'cold') throw new Error("reset takes nothing, or 'cold'");
      return { kind: 'reset', cold: rest !== '' };
    default: {
      const command = fromHex(text);
      if (command.length < 4) throw new Error('An APDU needs at least CLA INS P1 P2');
      return apdu(command);
    }
  }
}

function apdu(bytes: Uint8Array): ConsoleCommand {
  return { kind: 'apdu', apdu: bytes };
}

/** A whole number in decimal, or in hex with 0x. */
function wholeNumber(text: string): number {
  if (!/^(\d+|0x[0-9a-f]+)$/i.test(text)) throw new Error(`Not a whole number: '${text}'`);
  return Number(text);
}
