import { encodeCommand, splitResponse, tryParseCommand, type ResponseApdu } from './apdu';
import { getResponse } from './commands';
import { concatBytes } from './hex';

/** Sends one raw APDU and returns the raw response. Every call is one entry in the trace. */
export type Transmit = (command: Uint8Array) => Promise<Uint8Array>;

const MAX_GET_RESPONSE = 64;

/**
 * Sends a command the way T=0 needs: on 6Cxx resend with Le = xx, on 61xx keep issuing
 * GET RESPONSE and join the data. Each step is a separate APDU, so all of them show in the trace.
 */
export async function sendWithResponses(
  transmit: Transmit,
  command: Uint8Array,
): Promise<ResponseApdu> {
  let response = splitResponse(await transmit(command));

  if (response.sw1 === 0x6c) {
    const parsed = tryParseCommand(command);
    if (parsed) {
      const retry = encodeCommand({ ...parsed, le: response.sw2 || 256 });
      response = splitResponse(await transmit(retry));
    }
  }

  let data = response.data;
  for (let i = 0; response.sw1 === 0x61 && i < MAX_GET_RESPONSE; i++) {
    response = splitResponse(await transmit(getResponse(response.sw2)));
    data = concatBytes(data, response.data);
  }
  return { ...response, data };
}
