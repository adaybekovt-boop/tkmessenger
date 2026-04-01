// shared/src/types/message.ts

import { User } from './user';

export interface Message {
  id: string;
  content: string;
  type: 'text' | 'image' | 'file';
  fileUrl?: string | null;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
  senderId: string;
  chatId: string;
  sender: Pick<User, 'id' | 'username' | 'avatarUrl'>;
}

export interface SendMessageInput {
  content: string;
  type?: 'text' | 'image' | 'file';
  fileUrl?: string;
}