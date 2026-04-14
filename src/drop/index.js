// Public barrel for the `drop` feature module. Importers outside of
// `src/drop/` should only touch these symbols. Everything else is internal.

export { DropManager } from './DropManager.js';
export { useDropSession } from './hooks/useDropSession.js';
export { DropStatus } from './state/DropStatus.js';
export { DropIntent } from './state/DropIntent.js';
export {
  DropError,
  PeerOfflineError,
  RejectedByPeerError,
  TransferAbortedError,
  IntegrityError,
  QuotaExceededError
} from './errors/DropError.js';
