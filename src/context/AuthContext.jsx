import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { deriveScryptRecord, verifyScryptRecord } from '../core/scryptKdf.js';
import { validatePassword, validatePasswordConfirm, validateUsername } from '../core/authValidation.js';
import { getOrCreateIdentity, resetIdentity as resetLocalIdentity, setDisplayName as setIdentityDisplayName } from '../core/identity.js';
import { reserveName } from '../core/registry.js';
import { clearAllData as clearAllIdb } from '../core/db.js';

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function normalizeName(input) {
  return String(input || '').trim().slice(0, 64);
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

const STORAGE = {
  profile: 'orbits_local_profile_v1'
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authState, setAuthState] = useState('loading');
  const lockedProfileRef = useRef(null);

  useEffect(() => {
    const identity = getOrCreateIdentity();
    const profile = safeJsonParse(localStorage.getItem(STORAGE.profile), null);
    const displayName = normalizeName(profile?.displayName || identity.displayName || '');
    const bio = String(profile?.bio || '').slice(0, 220);
    const avatarDataUrl = typeof profile?.avatarDataUrl === 'string' ? profile.avatarDataUrl : null;

    if (displayName) {
      setIdentityDisplayName(displayName);
      const passRecord = profile?.passRecord || null;
      if (passRecord) {
        // Auto-login: skip password prompt if the user opted in
        const autoLogin = localStorage.getItem('orbits_auto_login') === '1';
        if (autoLogin) {
          setUser({ username: displayName, peerId: identity.peerId, displayName, bio, avatarDataUrl });
          setAuthState('authed');
          return;
        }
        lockedProfileRef.current = { displayName, bio, avatarDataUrl, passRecord };
        setUser(null);
        setAuthState('locked');
        return;
      }
      setUser({ username: displayName, peerId: identity.peerId, displayName, bio, avatarDataUrl });
      setAuthState('authed');
      return;
    }
    setUser(null);
    setAuthState('guest');
  }, []);

  const completeOnboarding = useCallback(async ({ displayName, password, confirm, avatarDataUrl = null }) => {
    const vU = validateUsername(displayName);
    const vP = validatePassword(password);
    const vC = validatePasswordConfirm(password, confirm);
    if (!vU.ok) throw new Error('Ник: проверь формат');
    if (!vP.ok) throw new Error('Пароль: минимум 8 символов');
    if (!vC.ok) throw new Error('Пароли не совпадают');

    const name = vU.value;
    if (!reserveName(name)) throw new Error('Ник уже занят на этом устройстве');
    const identity = getOrCreateIdentity();
    setIdentityDisplayName(name);
    const passRecord = await deriveScryptRecord({ username: name, password, params: { N: 16384, r: 8, p: 1, dkLen: 32 } });
    const profile = { displayName: name, bio: '', avatarDataUrl: typeof avatarDataUrl === 'string' ? avatarDataUrl : null, passRecord, onboardedAt: Date.now() };
    try {
      localStorage.setItem(STORAGE.profile, JSON.stringify(profile));
    } catch (_) {
    }
    const record = { username: name, peerId: identity.peerId, displayName: name, bio: '', avatarDataUrl: profile.avatarDataUrl };
    setUser(record);
    setAuthState('authed');
    return record;
  }, []);

  const unlock = useCallback(async ({ password }) => {
    const locked = lockedProfileRef.current;
    if (!locked) throw new Error('Нет профиля');
    const ok = await verifyScryptRecord({ username: locked.displayName, password, record: locked.passRecord });
    if (!ok) throw new Error('Неверный пароль');
    const identity = getOrCreateIdentity();
    const record = { username: locked.displayName, peerId: identity.peerId, displayName: locked.displayName, bio: locked.bio || '', avatarDataUrl: locked.avatarDataUrl || null };
    setUser(record);
    setAuthState('authed');
    return record;
  }, []);

  const wipeLocal = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE.profile);
    } catch (_) {
    }
    lockedProfileRef.current = null;
    setIdentityDisplayName('');
    resetLocalIdentity();
    // Clear all IndexedDB data (messages, avatars, keys, etc.)
    void clearAllIdb().catch(() => {});
    // Clear peer-related localStorage keys
    try {
      localStorage.removeItem('orbits_known_peers');
      localStorage.removeItem('orbits_profiles_v1');
      localStorage.removeItem('orbits_blocked_peers');
      localStorage.removeItem('orbits_messages_v1');
    } catch (_) {}
    setUser(null);
    setAuthState('guest');
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE.profile);
    } catch (_) {
    }
    lockedProfileRef.current = null;
    // Clear IndexedDB so next account doesn't see previous messages
    void clearAllIdb().catch(() => {});
    // Clear peer-related localStorage keys
    try {
      localStorage.removeItem('orbits_known_peers');
      localStorage.removeItem('orbits_profiles_v1');
      localStorage.removeItem('orbits_blocked_peers');
      localStorage.removeItem('orbits_messages_v1');
    } catch (_) {}
    setUser(null);
    setAuthState('guest');
  }, []);

  const updateProfile = useCallback(async ({ displayName, bio, avatarFile }) => {
    if (!user) return null;
    const avatarDataUrl = avatarFile ? await fileToDataUrl(avatarFile) : user.avatarDataUrl;
    const name = normalizeName(displayName) || user.displayName;
    setIdentityDisplayName(name);
    const existing = safeJsonParse(localStorage.getItem(STORAGE.profile), {});
    const profile = { ...existing, displayName: name, bio: String(bio ?? user.bio ?? '').slice(0, 220), avatarDataUrl: avatarDataUrl || null };
    try {
      localStorage.setItem(STORAGE.profile, JSON.stringify(profile));
    } catch (_) {
    }
    const nextUser = { ...user, username: name, displayName: name, bio: profile.bio, avatarDataUrl: profile.avatarDataUrl };
    setUser(nextUser);
    return nextUser;
  }, [user]);

  const value = useMemo(() => {
    return {
      authState,
      user,
      completeOnboarding,
      unlock,
      wipeLocal,
      logout,
      updateProfile
    };
  }, [authState, completeOnboarding, logout, unlock, updateProfile, user, wipeLocal]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('AuthContext is missing');
  return v;
}
