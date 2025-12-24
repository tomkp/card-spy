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

// Setup function to register all built-in handlers
import { globalRegistry } from './registry';
import { EmvHandler } from './emv-handler';
import { PivHandler } from './piv-handler';
import { OpenPgpHandler } from './openpgp-handler';
import { FidoHandler } from './fido-handler';
import { TransportHandler } from './transport-handler';

/**
 * Register all built-in handlers with the global registry.
 */
export function registerBuiltinHandlers(): void {
  globalRegistry.register(new EmvHandler(), 50);
  globalRegistry.register(new PivHandler(), 60);
  globalRegistry.register(new OpenPgpHandler(), 55);
  globalRegistry.register(new FidoHandler(), 45);
  globalRegistry.register(new TransportHandler(), 48);
}
