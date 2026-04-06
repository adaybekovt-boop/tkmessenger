import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function normalizeNick(input) {
  return String(input || '').trim();
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fileToDataUrl(file) {
  if (!file) return null;
  const bmp = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bmp.close();
    return null;
  }
  const sc = Math.max(size / bmp.width, size / bmp.height);
  const w = bmp.width * sc;
  const h = bmp.height * sc;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
  bmp.close();
  return canvas.toDataURL('image/jpeg', 0.86);
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function makePeerIdFromNick(nickname) {
  const base = normalizeNick(nickname)
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 20);
  return `${base || 'ORBIT'}-${randomSuffix()}`.slice(0, 64);
}

const STORAGE = {
  users: 'orbits_users_v1',
  session: 'orbits_session_v1'
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authState, setAuthState] = useState('loading');

  useEffect(() => {
    const users = safeJsonParse(localStorage.getItem(STORAGE.users), {});
    const sessionNick = normalizeNick(localStorage.getItem(STORAGE.session));
    const record = sessionNick ? users[sessionNick] : null;
    if (record) {
      setUser(record);
      setAuthState('authed');
    } else {
      setUser(null);
      setAuthState('guest');
    }
  }, []);

  const persistUser = useCallback((record) => {
    const users = safeJsonParse(localStorage.getItem(STORAGE.users), {});
    users[record.nickname] = record;
    localStorage.setItem(STORAGE.users, JSON.stringify(users));
  }, []);

  const login = useCallback(async ({ nickname, password }) => {
    const nick = normalizeNick(nickname);
    if (!nick) throw new Error('Введите ник');
    const users = safeJsonParse(localStorage.getItem(STORAGE.users), {});
    const record = users[nick];
    if (!record) throw new Error('Пользователь не найден');
    const passHash = await sha256Hex(`${nick}:${password}:ORBITS_P2P`);
    if (passHash !== record.passHash) throw new Error('Неверный пароль');
    localStorage.setItem(STORAGE.session, nick);
    setUser(record);
    setAuthState('authed');
    return record;
  }, []);

  const register = useCallback(async ({ nickname, password, displayName, bio, avatarFile }) => {
    const nick = normalizeNick(nickname);
    if (!nick) throw new Error('Введите ник');
    if (!password || String(password).length < 4) throw new Error('Пароль минимум 4 символа');
    const users = safeJsonParse(localStorage.getItem(STORAGE.users), {});
    if (users[nick]) throw new Error('Такой ник уже занят на этом устройстве');

    const passHash = await sha256Hex(`${nick}:${password}:ORBITS_P2P`);
    const peerId = makePeerIdFromNick(nick);
    const avatarDataUrl = await fileToDataUrl(avatarFile);

    const record = {
      nickname: nick,
      passHash,
      peerId,
      displayName: normalizeNick(displayName) || nick,
      bio: String(bio || '').slice(0, 220),
      avatarDataUrl: avatarDataUrl || null
    };
    users[nick] = record;
    localStorage.setItem(STORAGE.users, JSON.stringify(users));
    localStorage.setItem(STORAGE.session, nick);
    setUser(record);
    setAuthState('authed');
    return record;
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE.session);
    } catch (_) {
    }
    setUser(null);
    setAuthState('guest');
  }, []);

  const updateProfile = useCallback(async ({ displayName, bio, avatarFile }) => {
    if (!user) return;
    const next = {
      ...user,
      displayName: normalizeNick(displayName) || user.displayName,
      bio: String(bio ?? user.bio ?? '').slice(0, 220)
    };
    if (avatarFile) {
      const avatarDataUrl = await fileToDataUrl(avatarFile);
      if (avatarDataUrl) next.avatarDataUrl = avatarDataUrl;
    }
    persistUser(next);
    setUser(next);
    return next;
  }, [persistUser, user]);

  const value = useMemo(() => {
    return {
      authState,
      user,
      login,
      register,
      logout,
      updateProfile
    };
  }, [authState, login, logout, register, updateProfile, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('AuthContext is missing');
  return v;
}

