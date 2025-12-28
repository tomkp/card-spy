/**
 * Card handlers module.
 * Export all handlers and types.
 */

// Types
export type {
  CardHandler,
  CardCommand,
  CommandParameter,
  CommandContext,
  DetectionResult,
  InterrogationResult,
  ApplicationInfo,
  HandlerRegistration,
} from './types';

// Registry
export { HandlerRegistry, globalRegistry } from './registry';
export type { DetectedHandler } from './registry';

// Handlers
export { EmvHandler } from './emv-handler';
export { PivHandler } from './piv-handler';
export { OpenPgpHandler } from './openpgp-handler';
export { FidoHandler } from './fido-handler';
export { TransportHandler } from './transport-handler';
export { SimHandler } from './sim-handler';
export { JavaCardHandler } from './javacard-handler';
export { MifareClassicHandler } from './mifare-classic-handler';
export { CalypsoHandler } from './calypso-handler';
export { EidHandler } from './eid-handler';
export { HealthCardHandler } from './health-handler';
export { PkiHandler } from './pki-handler';

// Setup function to register all built-in handlers
import { globalRegistry } from './registry';
import { EmvHandler } from './emv-handler';
import { PivHandler } from './piv-handler';
import { OpenPgpHandler } from './openpgp-handler';
import { FidoHandler } from './fido-handler';
import { TransportHandler } from './transport-handler';
import { SimHandler } from './sim-handler';
import { JavaCardHandler } from './javacard-handler';
import { MifareClassicHandler } from './mifare-classic-handler';
import { CalypsoHandler } from './calypso-handler';
import { EidHandler } from './eid-handler';
import { HealthCardHandler } from './health-handler';
import { PkiHandler } from './pki-handler';

/**
 * Register all built-in handlers with the global registry.
 */
export function registerBuiltinHandlers(): void {
  globalRegistry.register(new EmvHandler(), 50);
  globalRegistry.register(new PivHandler(), 60);
  globalRegistry.register(new OpenPgpHandler(), 55);
  globalRegistry.register(new FidoHandler(), 45);
  globalRegistry.register(new TransportHandler(), 48);
  globalRegistry.register(new SimHandler(), 52);
  globalRegistry.register(new JavaCardHandler(), 46);
  globalRegistry.register(new MifareClassicHandler(), 47);
  globalRegistry.register(new CalypsoHandler(), 49);
  globalRegistry.register(new EidHandler(), 54);
  globalRegistry.register(new HealthCardHandler(), 53);
  globalRegistry.register(new PkiHandler(), 44);
}
