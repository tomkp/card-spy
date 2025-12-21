/**
 * EMV Tag Dictionary
 * Maps EMV tag hex values to human-readable descriptions
 */

export const emvTags: Record<string, string> = {
  '4F': 'AID',
  '50': 'APP LABEL',
  '57': 'TRACK 2',
  '5A': 'PAN',
  '5F20': 'CARDHOLDER NAME',
  '5F24': 'APP EXPIRY',
  '5F25': 'APP EFFECTIVE',
  '5F28': 'ISSUER COUNTRY CODE',
  '5F2A': 'TRANSACTION CURRENCY CODE',
  '5F2D': 'LANGUAGE PREFERENCE',
  '5F30': 'SERVICE CODE',
  '5F34': 'PAN SEQUENCE NUMBER',
  '5F36': 'TRANSACTION CURRENCY EXPONENT',
  '5F50': 'ISSUER URL',
  '61': 'APPLICATION TEMPLATE',
  '6F': 'FCI TEMPLATE',
  '70': 'EMV PROPRIETARY TEMPLATE',
  '71': 'ISSUER SCRIPT TEMPLATE 1',
  '72': 'ISSUER SCRIPT TEMPLATE 2',
  '73': 'DIRECTORY DISCRETIONARY TEMPLATE',
  '77': 'RESPONSE TEMPLATE 2',
  '80': 'RESPONSE TEMPLATE 1',
  '81': 'AUTH AMOUNT BIN',
  '82': 'AIP',
  '83': 'COMMAND TEMPLATE',
  '84': 'DF NAME',
  '86': 'ISSUER SCRIPT CMD',
  '87': 'APP PRIORITY',
  '88': 'SFI',
  '89': 'AUTH IDENTIFICATION RESPONSE',
  '8A': 'AUTH RESPONSE CODE',
  '8C': 'CDOL 1',
  '8D': 'CDOL 2',
  '8E': 'CVM LIST',
  '8F': 'CA PK INDEX',
  '90': 'ISSUER PK CERTIFICATE',
  '91': 'ISSUER AUTH DATA',
  '92': 'ISSUER PK REMAINDER',
  '93': 'SIGNED STATIC APP DATA',
  '94': 'AFL',
  '95': 'TVR',
  '98': 'TC HASH VALUE',
  '99': 'TRANSACTION PIN DATA',
  '9A': 'TRANSACTION DATE',
  '9B': 'TSI',
  '9C': 'TRANSACTION TYPE',
  '9D': 'DDF NAME',
  '9F01': 'ACQUIRER ID',
  '9F02': 'AUTH AMOUNT NUM',
  '9F03': 'OTHER AMOUNT NUM',
  '9F04': 'OTHER AMOUNT BIN',
  '9F05': 'APP DISCRETIONARY DATA',
  '9F06': 'AID TERMINAL',
  '9F07': 'AUC',
  '9F08': 'APP VERSION NUMBER',
  '9F09': 'APP VERSION NUMBER TERMINAL',
  '9F0D': 'IAC DEFAULT',
  '9F0E': 'IAC DENIAL',
  '9F0F': 'IAC ONLINE',
  '9F10': 'IAD',
  '9F11': 'ISSUER CODE TABLE IDX',
  '9F12': 'APP PREFERRED NAME',
  '9F13': 'LAST ONLINE ATC',
  '9F14': 'LOWER OFFLINE LIMIT',
  '9F15': 'MERCHANT CATEGORY CODE',
  '9F16': 'MERCHANT ID',
  '9F17': 'PIN TRY COUNT',
  '9F18': 'ISSUER SCRIPT ID',
  '9F1A': 'TERMINAL COUNTRY CODE',
  '9F1B': 'TERMINAL FLOOR LIMIT',
  '9F1C': 'TERMINAL ID',
  '9F1D': 'TRM DATA',
  '9F1E': 'IFD SERIAL NUM',
  '9F1F': 'TRACK 1 DD',
  '9F21': 'TRANSACTION TIME',
  '9F22': 'CA PK INDEX TERM',
  '9F23': 'UPPER OFFLINE LIMIT',
  '9F26': 'AC',
  '9F27': 'CID',
  '9F2D': 'ICC PIN ENCIPHERMENT PK CERT',
  '9F32': 'ISSUER PK EXPONENT',
  '9F33': 'TERMINAL CAPABILITIES',
  '9F34': 'CVM RESULTS',
  '9F35': 'TERMINAL TYPE',
  '9F36': 'ATC',
  '9F37': 'UNPREDICTABLE NUMBER',
  '9F38': 'PDOL',
  '9F39': 'POS ENTRY MODE',
  '9F3A': 'AMOUNT REF CURRENCY',
  '9F3B': 'APP REF CURRENCY',
  '9F3C': 'TRANSACTION REF CURRENCY CODE',
  '9F3D': 'TRANSACTION REF CURRENCY EXPONENT',
  '9F40': 'ADDITIONAL TERMINAL CAPABILITIES',
  '9F41': 'TRANSACTION SEQUENCE COUNTER',
  '9F42': 'APP CURRENCY CODE',
  '9F43': 'APP REF CURRENCY EXPONENT',
  '9F44': 'APP CURRENCY EXPONENT',
  '9F45': 'DATA AUTH CODE',
  '9F46': 'ICC PK CERTIFICATE',
  '9F47': 'ICC PK EXPONENT',
  '9F48': 'ICC PK REMAINDER',
  '9F49': 'DDOL',
  '9F4A': 'SDA TAG LIST',
  '9F4C': 'ICC DYNAMIC NUMBER',
  'A5': 'FCI PROPRIETARY TEMPLATE',
  'BF0C': 'FCI ISSUER DD',
};

/**
 * Look up the description for an EMV tag
 * @param tag - Tag as hex string (e.g., "9F26") or number
 * @returns Description string or undefined if not found
 */
export function getTagDescription(tag: string | number): string | undefined {
  const tagHex = typeof tag === 'number'
    ? tag.toString(16).toUpperCase()
    : tag.toUpperCase();
  return emvTags[tagHex];
}

/**
 * Check if a tag is a constructed tag (contains other TLV objects)
 * Constructed tags have bit 6 of the first byte set
 */
export function isConstructedTag(tagByte: number): boolean {
  return (tagByte & 0x20) !== 0;
}

/**
 * Check if tag has multiple bytes
 * Multi-byte tags have bits 1-5 of first byte all set (0x1F)
 */
export function isMultiByteTag(tagByte: number): boolean {
  return (tagByte & 0x1F) === 0x1F;
}
