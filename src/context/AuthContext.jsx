import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearAuthToken, issueAuthToken, readAuthToken, verifyAuthToken } from '../core/authToken.js';
import { apiCheckUsername, apiGetUser, apiLogin, apiRegisterCommit, apiUpdateProfile } from '../core/authApi.js';

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
  session: 'orbits_session_v2',
  autoLogin: 'orbits_autologin_enabled',
  regDraft: 'orbits_reg_draft_v1'
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
      const enabled = localStorage.getItem(STORAGE.autoLogin) === 'true';
      setAutoLoginEnabled(enabled);

      if (enabled) {
        try {
          const token = await readAuthToken();
          if (token) {
            const body = await verifyAuthToken(token);
            const username = body?.username ? normalizeNick(body.username) : '';
            const peerId = body?.peerId ? String(body.peerId) : '';
            if (username && peerId) {
              const record = { username, peerId, displayName: body.displayName || username, bio: body.bio || '', avatarDataUrl: body.avatarDataUrl || null };
              localStorage.setItem(STORAGE.session, username);
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

      const sessionUsername = normalizeNick(localStorage.getItem(STORAGE.session));
      if (sessionUsername) {
        try {
          const record = await apiGetUser(sessionUsername);
          setUser(record);
          setAuthState('authed');
          return;
        } catch (_) {
          try {
            localStorage.removeItem(STORAGE.session);
          } catch (_) {
          }
        }
      }
      setUser(null);
      setAuthState('guest');
    };
    void boot();
  }, []);

  const login = useCallback(async ({ username, password }) => {
    const u = normalizeNick(username);
    if (!u) throw new Error('Введите ник');
    const record = await apiLogin({ username: u, password });

    localStorage.setItem(STORAGE.session, record.username);
    setUser(record);
    setAuthState('authed');

    if (localStorage.getItem(STORAGE.autoLogin) === 'true') {
      try {
        await issueAuthToken(
          { username: record.username, peerId: record.peerId, displayName: record.displayName, bio: record.bio, avatarDataUrl: record.avatarDataUrl },
          14 * 24 * 60 * 60 * 1000
        );
      } catch (_) {
      }
    }
    return record;
  }, []);

  const registerCommit = useCallback(async ({ username, password, confirm, displayName, bio, avatarFile }) => {
    const u = normalizeNick(username);
    const avatarDataUrl = await fileToDataUrl(avatarFile);
    const record = await apiRegisterCommit({
      username: u,
      password,
      confirm,
      profile: { displayName, bio, avatarDataUrl }
    });

    localStorage.setItem(STORAGE.session, record.username);
    try {
      localStorage.removeItem(STORAGE.regDraft);
    } catch (_) {
    }

    setUser(record);
    setAuthState('authed');

    if (localStorage.getItem(STORAGE.autoLogin) === 'true') {
      try {
        await issueAuthToken(
          { username: record.username, peerId: record.peerId, displayName: record.displayName, bio: record.bio, avatarDataUrl: record.avatarDataUrl },
          14 * 24 * 60 * 60 * 1000
        );
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
    const avatarDataUrl = avatarFile ? await fileToDataUrl(avatarFile) : null;
    const next = await apiUpdateProfile({
      username: user.username,
      displayName: normalizeNick(displayName) || user.displayName,
      bio: String(bio ?? user.bio ?? '').slice(0, 220),
      avatarDataUrl
    });
    if (avatarFile) {
      
    }
    setUser(next);
    return next;
  }, [user]);

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
      await issueAuthToken(
        { username: user.username, peerId: user.peerId, displayName: user.displayName, bio: user.bio, avatarDataUrl: user.avatarDataUrl },
        14 * 24 * 60 * 60 * 1000
      );
    } catch (_) {
    }
  }, [user]);

  const checkUsername = useCallback(async (username) => {
    return apiCheckUsername(username);
  }, []);

  const value = useMemo(() => {
    return {
      authState,
      user,
      autoLoginEnabled,
      login,
      registerCommit,
      logout,
      updateProfile,
      setAutoLogin,
      checkUsername
    };
  }, [authState, autoLoginEnabled, checkUsername, login, logout, registerCommit, setAutoLogin, updateProfile, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('AuthContext is missing');
  return v;
}
