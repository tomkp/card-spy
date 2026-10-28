/** Well-known application identifiers (AIDs). */

export interface KnownAid {
  aid: string;
  name: string;
  category: 'payment' | 'identity' | 'security-key' | 'transport' | 'telecom' | 'health' | 'other';
}

/** Payment system directory names, as hex for SELECT by DF name. */
export const PAYMENT_SYSTEM_ENVIRONMENTS = {
  /** "2PAY.SYS.DDF01", the Proximity Payment System Environment (contactless). */
  PPSE: '325041592E5359532E4444463031',
  /** "1PAY.SYS.DDF01", the Payment System Environment (contact). */
  PSE: '315041592E5359532E4444463031',
} as const;

/** Entries that are only a RID (5 bytes) act as fallbacks for unlisted PIXs. */
export const KNOWN_AIDS: KnownAid[] = [
  // Payment
  { aid: 'A000000003', name: 'Visa', category: 'payment' },
  { aid: 'A0000000031010', name: 'Visa Credit/Debit', category: 'payment' },
  { aid: 'A0000000032010', name: 'Visa Electron', category: 'payment' },
  { aid: 'A0000000032020', name: 'V PAY', category: 'payment' },
  { aid: 'A0000000033010', name: 'Visa Interlink', category: 'payment' },
  { aid: 'A0000000038002', name: 'Visa Dynamic Passcode Authentication', category: 'payment' },
  { aid: 'A0000000038010', name: 'Visa Plus', category: 'payment' },
  { aid: 'A0000000980840', name: 'Visa US Common Debit', category: 'payment' },
  { aid: 'A000000004', name: 'Mastercard', category: 'payment' },
  { aid: 'A0000000041010', name: 'Mastercard Credit/Debit', category: 'payment' },
  { aid: 'A0000000042203', name: 'Mastercard US Maestro', category: 'payment' },
  { aid: 'A0000000043060', name: 'Maestro', category: 'payment' },
  { aid: 'A0000000046000', name: 'Cirrus', category: 'payment' },
  { aid: 'A0000000048002', name: 'Mastercard Chip Authentication Program', category: 'payment' },
  { aid: 'A000000025', name: 'American Express', category: 'payment' },
  { aid: 'A00000002501', name: 'American Express', category: 'payment' },
  { aid: 'A000000152', name: 'Discover', category: 'payment' },
  { aid: 'A0000001523010', name: 'Discover', category: 'payment' },
  { aid: 'A0000001524010', name: 'Discover US Common Debit', category: 'payment' },
  { aid: 'A0000003241010', name: 'Discover ZIP', category: 'payment' },
  { aid: 'A000000065', name: 'JCB', category: 'payment' },
  { aid: 'A0000000651010', name: 'JCB', category: 'payment' },
  { aid: 'A000000333', name: 'UnionPay', category: 'payment' },
  { aid: 'A000000333010101', name: 'UnionPay Debit', category: 'payment' },
  { aid: 'A000000333010102', name: 'UnionPay Credit', category: 'payment' },
  { aid: 'A000000333010103', name: 'UnionPay Quasi-credit', category: 'payment' },
  { aid: 'A0000002771010', name: 'Interac', category: 'payment' },
  { aid: 'A000000359', name: 'girocard', category: 'payment' },
  { aid: 'A0000003591010028001', name: 'girocard', category: 'payment' },
  { aid: 'A000000042', name: 'CB (Cartes Bancaires)', category: 'payment' },
  { aid: 'A0000000421010', name: 'CB (Cartes Bancaires)', category: 'payment' },
  { aid: 'A0000005241010', name: 'RuPay', category: 'payment' },
  { aid: 'A0000006581010', name: 'Mir', category: 'payment' },
  { aid: 'A0000000291010', name: 'LINK (UK ATM network)', category: 'payment' },
  { aid: 'A000000384', name: 'eftpos (Australia)', category: 'payment' },
  { aid: 'A0000001410001', name: 'PagoBANCOMAT', category: 'payment' },

  // Identity
  { aid: 'A000000308', name: 'PIV (NIST SP 800-73)', category: 'identity' },
  { aid: 'A0000003080000100001', name: 'PIV Card Application', category: 'identity' },
  { aid: 'A0000002471001', name: 'ICAO eMRTD (passport)', category: 'identity' },
  { aid: 'E80704007F00070302', name: 'German eID (nPA)', category: 'identity' },
  { aid: 'A000000063504B43532D3135', name: 'PKCS#15', category: 'identity' },
  { aid: 'A000000177504B43532D3135', name: 'Belgian eID (PKCS#15)', category: 'identity' },

  // Security keys
  { aid: 'D27600012401', name: 'OpenPGP card', category: 'security-key' },
  { aid: 'A0000006472F0001', name: 'FIDO U2F / CTAP', category: 'security-key' },
  { aid: 'A0000005272001', name: 'YubiKey OTP', category: 'security-key' },
  { aid: 'A0000005272101', name: 'Yubico OATH', category: 'security-key' },
  { aid: 'A000000527471117', name: 'YubiKey Management', category: 'security-key' },

  // Platform
  { aid: 'A000000003000000', name: 'GlobalPlatform Issuer Security Domain', category: 'other' },
  { aid: 'A000000151000000', name: 'GlobalPlatform Issuer Security Domain', category: 'other' },
  { aid: 'D2760000850100', name: 'NFC Forum NDEF Tag Application (v1)', category: 'other' },
  { aid: 'D2760000850101', name: 'NFC Forum Type 4 Tag (NDEF)', category: 'other' },

  // Transport
  { aid: '315449432E494341', name: 'Calypso (1TIC.ICA)', category: 'transport' },

  // Telecom
  { aid: 'A000000087', name: '3GPP', category: 'telecom' },
  { aid: 'A0000000871002', name: 'USIM (3GPP)', category: 'telecom' },
  { aid: 'A0000000871004', name: 'ISIM (3GPP)', category: 'telecom' },
];

const BY_AID = new Map(KNOWN_AIDS.map((a) => [a.aid, a]));

/** Exact match, else the longest known AID that prefixes the given one. */
export function lookupAid(aidHex: string): KnownAid | undefined {
  const aid = aidHex.replace(/\s/g, '').toUpperCase();
  const exact = BY_AID.get(aid);
  if (exact) return exact;
  let best: KnownAid | undefined;
  for (const known of KNOWN_AIDS) {
    if (aid.startsWith(known.aid) && (!best || known.aid.length > best.aid.length)) best = known;
  }
  return best;
}
