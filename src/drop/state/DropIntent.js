// DropIntent — who initiated the current session.
//
// Used by UI screens to pick the right copy ("Отправить" vs "Принять") and
// by TransferSession to know which side owns the chunk scheduler.

export const DropIntent = Object.freeze({
  SEND: 'send',
  RECEIVE: 'receive'
});
