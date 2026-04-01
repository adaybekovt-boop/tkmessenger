export interface User {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string | null;
  status: 'online' | 'offline' | 'away';
}

export interface Message {
  id: string;
  content: string;
  type: 'text' | 'image' | 'file';
  fileUrl?: string | null;
  isRead: boolean;
  createdAt: string;
  senderId: string;
  chatId: string;
  sender: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  };
}

export interface Chat {
  id: string;
  name?: string | null;
  isGroup: boolean;
  avatarUrl?: string | null;
  members: ChatMember[];
  messages: Message[];
  updatedAt: string;
}

export interface ChatMember {
  id: string;
  role: 'admin' | 'member';
  userId: string;
  user: User;
  chatId: string;
}
