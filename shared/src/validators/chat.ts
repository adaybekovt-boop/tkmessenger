// shared/src/validators/chat.ts

import { z } from 'zod';

export const createChatSchema = z.object({
  name: z.string().optional(),
  isGroup: z.boolean(),
  memberIds: z.array(z.string()).min(1, 'At least one member required')
});

export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty'),
  type: z.enum(['text', 'image', 'file']).default('text'),
  fileUrl: z.string().url().optional()
});

export const editMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty')
});

export type CreateChatInput = z.infer<typeof createChatSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;