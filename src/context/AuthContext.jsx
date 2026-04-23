import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { deriveScryptRecord, verifyScryptRecord, verifyScryptRecordEx } from '../core/scryptKdf.js';
import { setVaultKek, clearVaultKek } from '../core/vaultKek.js';
import { validatePassword, validatePasswordConfirm, validateUsername } from '../core/authValidation.js';
import { getOrCreateIdentity, resetIdentity as resetLocalIdentity, setDisplayName as setIdentityDisplayName } from '../core/identity.js';
import { reserveName } from '../core/registry.js';
import { clearAllData as clearAllIdb } from '../core/db.js';
import { startPrekeyMaintenance, stopPrekeyMaintenance } from '../core/prekeyMaintenance.js';
import { safeJsonParse } from '../utils/common.js';
import { fileToAvatarDataUrl } from '../core/avatarResize.js';

function normalizeName(input) {
  return String(input || '').trim().slice(0, 64);
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
    // Single scrypt pass — `deriveScryptRecord` now returns `dkBytes`
    // alongside the record, so we can seed the vault KEK without running
    // scrypt a second time. Saves ~400ms on first sign-up.
    //
    // N is read from the record on subsequent verifies — existing users
    // keep their old parameters, new accounts use the scryptKdf default
    // (N=65536 as of 2026-04).
    const derived = await deriveScryptRecord({ username: name, password, params: { r: 8, p: 1, dkLen: 32 } });
    const { dkBytes, ...passRecord } = derived;
    try { if (dkBytes) await setVaultKek(dkBytes); } catch (_) {}
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
    const { ok, dkBytes } = await verifyScryptRecordEx({ username: locked.displayName, password, record: locked.passRecord });
    if (!ok) throw new Error('Неверный пароль');
    // Hold the scrypt-derived key in memory as the vault KEK. Wraps ratchet
    // state at rest — cleared on logout / wipe. Never persisted.
    try { if (dkBytes) await setVaultKek(dkBytes); } catch (_) {}

    // Migrate legacy v1 records (raw scrypt-derived key in localStorage) to
    // v2 (HMAC verifier only). We already know the password is correct, so
    // re-derive and rewrite the profile — the next unlock will read a safe
    // record. Users with no v1 record are no-ops here.
    if (locked.passRecord && locked.passRecord.v !== 2) {
      try {
        const fresh = await deriveScryptRecord({
          username: locked.displayName,
          password,
          params: {
            N: Number(locked.passRecord.N) || 65536,
            r: Number(locked.passRecord.r) || 8,
            p: Number(locked.passRecord.p) || 1,
            dkLen: Number(locked.passRecord.dkLen) || 32
          }
        });
        // Strip ephemeral `dkBytes` before persisting — we never want the
        // raw derived key written to localStorage (that's the v1 hole we're
        // migrating away from).
        const { dkBytes: _drop, ...freshRecord } = fresh;
        const existing = safeJsonParse(localStorage.getItem(STORAGE.profile), {}) || {};
        localStorage.setItem(STORAGE.profile, JSON.stringify({ ...existing, passRecord: freshRecord }));
      } catch (_) {
        // Migration failure is non-fatal — login still succeeds, we'll retry
        // on the next unlock.
      }
    }

    const identity = getOrCreateIdentity();
    const record = { username: locked.displayName, peerId: identity.peerId, displayName: locked.displayName, bio: locked.bio || '', avatarDataUrl: locked.avatarDataUrl || null };
    setUser(record);
    setAuthState('authed');
    // Kick off X3DH prekey rotation + OPK pool top-up once the vault is
    // unlocked (prekey private keys live in IDB; maintenance runs
    // `generateKey`, so we need the vault available). Fire-and-forget — the
    // initial tick self-bootstraps a first SPK if the store is empty, so
    // the next bundle_req has fresh material to serve.
    void startPrekeyMaintenance();
    return record;
  }, []);

  const wipeLocal = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE.profile);
    } catch (_) {
    }
    lockedProfileRef.current = null;
    clearVaultKek();
    stopPrekeyMaintenance();
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
    clearVaultKek();
    stopPrekeyMaintenance();
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

  const updateProfile = useCallback(async ({ displayName, bio, avatarFile, removeAvatar }) => {
    if (!user) return null;
    const avatarDataUrl = removeAvatar
      ? null
      : avatarFile
        ? await fileToAvatarDataUrl(avatarFile)
        : user.avatarDataUrl;
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
