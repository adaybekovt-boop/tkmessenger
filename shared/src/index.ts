// shared/src/index.ts

// Types
export * from './types/user';
export * from './types/chat';
export * from './types/message';
export * from './types/auth';

// Validators (export schema only, types are already exported from /types/)
export { registerSchema, loginSchema } from './validators/auth';
export { createChatSchema, sendMessageSchema, editMessageSchema } from './validators/chat';