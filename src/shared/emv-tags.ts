/**
 * EMV Tag Dictionary
 * Maps EMV tag values to human-readable descriptions
 */

export const emvTags: Record<string, string> = {
  '4F': 'AID',
  '50': 'Application Label',
  '57': 'Track 2 Data',
  '5A': 'PAN',
  '5F20': 'Cardholder Name',
  '5F24': 'Expiration Date',
  '5F25': 'Effective Date',
  '5F28': 'Issuer Country Code',
  '5F2A': 'Currency Code',
  '5F2D': 'Language Preference',
  '5F30': 'Service Code',
  '5F34': 'PAN Sequence Number',
  '5F36': 'Currency Exponent',
  '5F50': 'Issuer URL',
  '61': 'Application Template',
  '6F': 'FCI Template',
  '70': 'EMV Record Template',
  '71': 'Issuer Script 1',
  '72': 'Issuer Script 2',
  '73': 'Directory Template',
  '77': 'Response Template 2',
  '80': 'Response Template 1',
  '81': 'Amount Binary',
  '82': 'AIP',
  '83': 'Command Template',
  '84': 'DF Name',
  '86': 'Issuer Script Command',
  '87': 'Priority Indicator',
  '88': 'SFI',
  '89': 'Auth ID Response',
  '8A': 'Auth Response Code',
  '8C': 'CDOL1',
  '8D': 'CDOL2',
  '8E': 'CVM List',
  '8F': 'CA Public Key Index',
  '90': 'Issuer PK Certificate',
  '91': 'Issuer Auth Data',
  '92': 'Issuer PK Remainder',
  '93': 'Signed Static Data',
  '94': 'AFL',
  '95': 'TVR',
  '98': 'TC Hash',
  '99': 'PIN Data',
  '9A': 'Transaction Date',
  '9B': 'TSI',
  '9C': 'Transaction Type',
  '9D': 'DDF Name',
  '9F01': 'Acquirer ID',
  '9F02': 'Amount Numeric',
  '9F03': 'Amount Other',
  '9F04': 'Amount Other Binary',
  '9F05': 'App Discretionary Data',
  '9F06': 'AID Terminal',
  '9F07': 'AUC',
  '9F08': 'App Version Number',
  '9F09': 'App Version Terminal',
  '9F0D': 'IAC Default',
  '9F0E': 'IAC Denial',
  '9F0F': 'IAC Online',
  '9F10': 'Issuer App Data',
  '9F11': 'Issuer Code Table Index',
  '9F12': 'App Preferred Name',
  '9F13': 'Last Online ATC',
  '9F14': 'Lower Offline Limit',
  '9F15': 'Merchant Category Code',
  '9F16': 'Merchant ID',
  '9F17': 'PIN Try Counter',
  '9F18': 'Issuer Script ID',
  '9F1A': 'Terminal Country Code',
  '9F1B': 'Terminal Floor Limit',
  '9F1C': 'Terminal ID',
  '9F1D': 'Terminal Risk Data',
  '9F1E': 'IFD Serial Number',
  '9F1F': 'Track 1 Data',
  '9F21': 'Transaction Time',
  '9F22': 'CA PK Index Terminal',
  '9F23': 'Upper Offline Limit',
  '9F26': 'Application Cryptogram',
  '9F27': 'CID',
  '9F2D': 'ICC PIN PK Certificate',
  '9F32': 'Issuer PK Exponent',
  '9F33': 'Terminal Capabilities',
  '9F34': 'CVM Results',
  '9F35': 'Terminal Type',
  '9F36': 'ATC',
  '9F37': 'Unpredictable Number',
  '9F38': 'PDOL',
  '9F39': 'POS Entry Mode',
  '9F3A': 'Amount Ref Currency',
  '9F3B': 'App Ref Currency',
  '9F3C': 'Ref Currency Code',
  '9F3D': 'Ref Currency Exponent',
  '9F40': 'Additional Capabilities',
  '9F41': 'Transaction Counter',
  '9F42': 'App Currency Code',
  '9F43': 'App Ref Currency Exp',
  '9F44': 'App Currency Exponent',
  '9F45': 'Data Auth Code',
  '9F46': 'ICC PK Certificate',
  '9F47': 'ICC PK Exponent',
  '9F48': 'ICC PK Remainder',
  '9F49': 'DDOL',
  '9F4A': 'SDA Tag List',
  '9F4C': 'ICC Dynamic Number',
  A5: 'FCI Proprietary Template',
  BF0C: 'FCI Issuer Data',
};

/**
 * Look up the description for an EMV tag
 * @param tag - Tag as hex string (e.g., "9F26") or number
 * @returns Description string or undefined if not found
 */
export function getTagDescription(tag: string | number): string | undefined {
  const tagHex = typeof tag === 'number' ? tag.toString(16).toUpperCase() : tag.toUpperCase();
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
  return (tagByte & 0x1f) === 0x1f;
}
