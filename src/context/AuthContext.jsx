import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearAuthToken, issueAuthToken, readAuthToken, verifyAuthToken } from '../core/authToken.js';
import { derivePasswordRecord, verifyPasswordRecord } from '../core/passwordKdf.js';

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

async function fileToDataUrl(file) {
  if (!file) return null;
  const maxBytes = 3 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error('Аватар слишком большой (макс 3MB)');
  if (!String(file.type || '').startsWith('image/')) throw new Error('Нужна картинка');

  const readAsDataUrl = () =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(r.error || new Error('Ошибка чтения файла'));
      r.readAsDataURL(file);
    });

  const src = await readAsDataUrl();
  const img = new Image();
  img.decoding = 'async';
  img.src = src;

  await new Promise((resolve, reject) => {
    img.onload = () => resolve(true);
    img.onerror = () => reject(new Error('Не удалось обработать изображение'));
  });

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен');
  const sc = Math.max(size / img.naturalWidth, size / img.naturalHeight);
  const w = img.naturalWidth * sc;
  const h = img.naturalHeight * sc;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
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
  session: 'orbits_session_v1',
  autoLogin: 'orbits_autologin_enabled'
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authState, setAuthState] = useState('loading');
  const [autoLoginEnabled, setAutoLoginEnabled] = useState(() => {
    const v = localStorage.getItem(STORAGE.autoLogin);
    return v === 'true';
  });

  useEffect(() => {
    const boot = async () => {
      const users = safeJsonParse(localStorage.getItem(STORAGE.users), {});
      const enabled = localStorage.getItem(STORAGE.autoLogin) === 'true';
      setAutoLoginEnabled(enabled);

      if (enabled) {
        try {
          const token = await readAuthToken();
          if (token) {
            const body = await verifyAuthToken(token);
            const nick = body?.nickname ? normalizeNick(body.nickname) : '';
            const record = nick ? users[nick] : null;
            if (record) {
              localStorage.setItem(STORAGE.session, nick);
              setUser(record);
              setAuthState('authed');
              return;
            }
          }
        } catch (_) {
        }
        try {
          await clearAuthToken();
        } catch (_) {
        }
      }

      const sessionNick = normalizeNick(localStorage.getItem(STORAGE.session));
      const record = sessionNick ? users[sessionNick] : null;
      if (record) {
        setUser(record);
        setAuthState('authed');
      } else {
        setUser(null);
        setAuthState('guest');
      }
    };
    void boot();
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

    const ok = await verifyPasswordRecord({ nickname: nick, password, record: record.pass || record });
    if (!ok) throw new Error('Неверный пароль');

    if (!record.pass || record.pass.passHash) {
      try {
        const pass = await derivePasswordRecord({ nickname: nick, password });
        record.pass = pass;
        delete record.passHash;
        persistUser(record);
      } catch (_) {
      }
    }

    localStorage.setItem(STORAGE.session, nick);
    setUser(record);
    setAuthState('authed');

    if (localStorage.getItem(STORAGE.autoLogin) === 'true') {
      try {
        await issueAuthToken({ nickname: record.nickname, peerId: record.peerId }, 14 * 24 * 60 * 60 * 1000);
      } catch (_) {
      }
    }
    return record;
  }, [persistUser]);

  const register = useCallback(async ({ nickname, password, displayName, bio, avatarFile }) => {
    const nick = normalizeNick(nickname);
    if (!nick) throw new Error('Введите ник');
    if (!password || String(password).length < 4) throw new Error('Пароль минимум 4 символа');
    const users = safeJsonParse(localStorage.getItem(STORAGE.users), {});
    if (users[nick]) throw new Error('Такой ник уже занят на этом устройстве');

    const pass = await derivePasswordRecord({ nickname: nick, password });
    const peerId = makePeerIdFromNick(nick);
    const avatarDataUrl = await fileToDataUrl(avatarFile);

    const record = {
      nickname: nick,
      pass,
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

    if (localStorage.getItem(STORAGE.autoLogin) === 'true') {
      try {
        await issueAuthToken({ nickname: record.nickname, peerId: record.peerId }, 14 * 24 * 60 * 60 * 1000);
      } catch (_) {
      }
    }
    return record;
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE.session);
    } catch (_) {
    }
    try {
      void clearAuthToken();
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

  const setAutoLogin = useCallback(async (enabled) => {
    const next = !!enabled;
    setAutoLoginEnabled(next);
    try {
      localStorage.setItem(STORAGE.autoLogin, next ? 'true' : 'false');
    } catch (_) {
    }
    if (!next) {
      try {
        await clearAuthToken();
      } catch (_) {
      }
      return;
    }
    if (!user) return;
    try {
      await issueAuthToken({ nickname: user.nickname, peerId: user.peerId }, 14 * 24 * 60 * 60 * 1000);
    } catch (_) {
    }
  }, [user]);

  const value = useMemo(() => {
    return {
      authState,
      user,
      autoLoginEnabled,
      login,
      register,
      logout,
      updateProfile,
      setAutoLogin
    };
  }, [authState, autoLoginEnabled, login, logout, register, setAutoLogin, updateProfile, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('AuthContext is missing');
  return v;
}
