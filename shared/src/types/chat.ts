// shared/src/types/chat.ts

import { User } from './user';
import { Message } from './message';

export interface Chat {
  id: string;
  name?: string | null;
  isGroup: boolean;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  members: ChatMember[];
  messages?: Message[];
}

export interface ChatMember {
  id: string;
  role: 'admin' | 'member';
  joinedAt: string;
  userId: string;
  user: User;
  chatId: string;
}

export interface CreateChatInput {
  name?: string;
  isGroup: boolean;
  memberIds: string[];
}