// Typed errors for the call feature. UI layer can do
//   `if (err instanceof PermissionDeniedError) showGuide()`
// instead of string-matching `err.name`.

export class CallError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'CallError';
    if (cause) this.cause = cause;
  }
}

export class PermissionDeniedError extends CallError {
  constructor(kind = 'media', { cause } = {}) {
    super(`Доступ к ${kind} запрещён пользователем`, { cause });
    this.name = 'PermissionDeniedError';
    this.kind = kind; // 'camera' | 'microphone' | 'media' | 'screen'
  }
}

export class DeviceNotFoundError extends CallError {
  constructor(kind = 'media', { cause } = {}) {
    super(`Устройство "${kind}" не найдено`, { cause });
    this.name = 'DeviceNotFoundError';
    this.kind = kind;
  }
}

export class DeviceBusyError extends CallError {
  constructor(kind = 'media', { cause } = {}) {
    super(`Устройство "${kind}" занято другим приложением`, { cause });
    this.name = 'DeviceBusyError';
    this.kind = kind;
  }
}

export class ScreenShareNotSupportedError extends CallError {
  constructor({ cause } = {}) {
    super('Демонстрация экрана не поддерживается', { cause });
    this.name = 'ScreenShareNotSupportedError';
  }
}

export class CallAbortedError extends CallError {
  constructor(reason = 'aborted', { cause } = {}) {
    super(`Звонок прерван: ${reason}`, { cause });
    this.name = 'CallAbortedError';
    this.reason = reason;
  }
}
