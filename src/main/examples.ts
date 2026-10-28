import aidScan from '../../examples/aid-scan.ts?raw';
import hello from '../../examples/hello.ts?raw';
import readEmv from '../../examples/read-emv.ts?raw';
import readNtag from '../../examples/read-ntag.ts?raw';

/** Seeded into a new workspace's scripts folder. */
export const EXAMPLE_SCRIPTS: Record<string, string> = {
  'hello.ts': hello,
  'read-emv.ts': readEmv,
  'read-ntag.ts': readNtag,
  'aid-scan.ts': aidScan,
};
