import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

interface SocketState {
  socket: Socket | null;
  connect: (userId: string) => void;
  disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  socket: null,
  connect: (userId) => {
    const socket = io('/', {
      query: { userId },
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    set({ socket });
  },
  disconnect: () => {
    set((state) => {
      state.socket?.disconnect();
      return { socket: null };
    });
  }
}));
