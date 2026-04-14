// Public barrel for the `call` feature module. Importers outside of
// `src/call/` should only touch these symbols. Everything else is internal.

export { CallManager } from './CallManager.js';
export { useCallSession } from './hooks/useCallSession.js';
export { CallStatus } from './state/CallStatus.js';
export {
  CallError,
  PermissionDeniedError,
  DeviceNotFoundError,
  DeviceBusyError,
  ScreenShareNotSupportedError,
  CallAbortedError
} from './errors/CallError.js';
