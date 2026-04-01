// shared/src/types/user.ts

export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  status: 'online' | 'offline' | 'away';
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile extends User {
  lastLat?: number | null;
  lastLng?: number | null;
  isVisibleNearby?: boolean;
}

export interface NearbyUser {
  id: string;
  username: string;
  avatarUrl: string | null;
  status: string;
  distance?: number | null;
}