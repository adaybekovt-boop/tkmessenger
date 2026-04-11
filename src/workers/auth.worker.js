import { idbGet, idbSet } from '../core/idbStore.js';
import { deriveScryptRecord, verifyScryptRecord } from '../core/scryptKdf.js';
import { validatePassword, validatePasswordConfirm, validateUsername } from '../core/authValidation.js';

const USERS_KEY = 'users_v2';

function now() {
  return Date.now();
}

function normalizeUsername(u) {
  return String(u || '').trim();
}

async function loadUsers() {
  const users = await idbGet(USERS_KEY);
  if (users && typeof users === 'object') return users;
  return {};
}

async function saveUsers(users) {
  await idbSet(USERS_KEY, users);
}

function makePeerIdFromUsername(username) {
  const base = String(username || '')
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 20);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base || 'ORBIT'}-${suffix}`.slice(0, 64);
}

function ok(id, payload) {
  self.postMessage({ id, ok: true, ...payload });
}

function fail(id, code, message, fields) {
  self.postMessage({ id, ok: false, error: { code, message, fields } });
}

async function handleCheckUsername(id, username) {
  const v = validateUsername(username);
  if (!v.ok) return fail(id, 'validation', 'Некорректный ник', { username: v.code });
  const users = await loadUsers();
  const taken = !!users[v.value];
  return ok(id, { available: !taken, normalized: v.value });
}

async function handleRegisterDraftCommit(id, payload) {
  const username = normalizeUsername(payload?.username);
  const pass = String(payload?.password || '');
  const confirm = String(payload?.confirm || '');
  const profile = payload?.profile || {};

  const vU = validateUsername(username);
  const vP = validatePassword(pass);
  const vC = validatePasswordConfirm(pass, confirm);
  const fields = {};
  if (!vU.ok) fields.username = vU.code;
  if (!vP.ok) fields.password = vP.code;
  if (!vC.ok) fields.confirm = vC.code;
  if (Object.keys(fields).length) return fail(id, 'validation', 'Проверь поля', fields);

  const users = await loadUsers();
  if (users[vU.value]) return fail(id, 'duplicate', 'Ник уже занят', { username: 'duplicate' });

  const passRecord = await deriveScryptRecord({ username: vU.value, password: pass, params: { N: 16384, r: 8, p: 1, dkLen: 32 } });
  const peerId = makePeerIdFromUsername(vU.value);

  const record = {
    username: vU.value,
    peerId,
    pass: passRecord,
    displayName: String(profile.displayName || vU.value).slice(0, 64),
    bio: String(profile.bio || '').slice(0, 220),
    avatarDataUrl: typeof profile.avatarDataUrl === 'string' ? profile.avatarDataUrl : null,
    createdAt: now(),
    updatedAt: now()
  };
  users[vU.value] = record;
  await saveUsers(users);

  return ok(id, { user: { username: record.username, peerId: record.peerId, displayName: record.displayName, bio: record.bio, avatarDataUrl: record.avatarDataUrl } });
}

async function handleLogin(id, payload) {
  const username = normalizeUsername(payload?.username);
  const password = String(payload?.password || '');
  const vU = validateUsername(username);
  if (!vU.ok) return fail(id, 'validation', 'Некорректный ник', { username: vU.code });
  if (!password) return fail(id, 'validation', 'Введите пароль', { password: 'required' });

  const users = await loadUsers();
  const record = users[vU.value];
  if (!record) return fail(id, 'not_found', 'Пользователь не найден', { username: 'not_found' });

  const okPass = await verifyScryptRecord({ username: vU.value, password, record: record.pass });
  if (!okPass) return fail(id, 'invalid', 'Неверный пароль', { password: 'invalid' });

  return ok(id, { user: { username: record.username, peerId: record.peerId, displayName: record.displayName, bio: record.bio, avatarDataUrl: record.avatarDataUrl } });
}

async function handleGetUser(id, payload) {
  const username = normalizeUsername(payload?.username);
  const vU = validateUsername(username);
  if (!vU.ok) return fail(id, 'validation', 'Некорректный ник', { username: vU.code });
  const users = await loadUsers();
  const record = users[vU.value];
  if (!record) return fail(id, 'not_found', 'Пользователь не найден', { username: 'not_found' });
  return ok(id, { user: { username: record.username, peerId: record.peerId, displayName: record.displayName, bio: record.bio, avatarDataUrl: record.avatarDataUrl } });
}

async function handleUpdateProfile(id, payload) {
  const username = normalizeUsername(payload?.username);
  const vU = validateUsername(username);
  if (!vU.ok) return fail(id, 'validation', 'Некорректный ник', { username: vU.code });
  const users = await loadUsers();
  const record = users[vU.value];
  if (!record) return fail(id, 'not_found', 'Пользователь не найден', { username: 'not_found' });

  const displayName = String(payload?.displayName || record.displayName).slice(0, 64);
  const bio = String(payload?.bio || '').slice(0, 220);
  const avatarDataUrl = typeof payload?.avatarDataUrl === 'string' ? payload.avatarDataUrl : record.avatarDataUrl;

  const next = { ...record, displayName, bio, avatarDataUrl, updatedAt: now() };
  users[vU.value] = next;
  await saveUsers(users);

  return ok(id, { user: { username: next.username, peerId: next.peerId, displayName: next.displayName, bio: next.bio, avatarDataUrl: next.avatarDataUrl } });
}

self.onmessage = async (e) => {
  const msg = e?.data;
  const id = msg?.id;
  const type = msg?.type;
  if (!id || !type) return;
  try {
    if (type === 'checkUsername') return await handleCheckUsername(id, msg.username);
    if (type === 'registerCommit') return await handleRegisterDraftCommit(id, msg.payload);
    if (type === 'login') return await handleLogin(id, msg.payload);
    if (type === 'getUser') return await handleGetUser(id, msg.payload);
    if (type === 'updateProfile') return await handleUpdateProfile(id, msg.payload);
    return fail(id, 'unknown', 'Неизвестная команда');
  } catch (err) {
    return fail(id, 'internal', 'Внутренняя ошибка', { detail: String(err?.message || err) });
  }
};
