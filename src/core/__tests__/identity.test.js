import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stub localStorage before importing modules that use it at load time.
const store = new Map();
const localStorageMock = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, val) => store.set(key, String(val)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (i) => [...store.keys()][i] ?? null,
};
vi.stubGlobal('localStorage', localStorageMock);

const { generatePeerId, getIdentity, setIdentity, getOrCreateIdentity, setDisplayName, resetIdentity, exportIdentity } = await import('../identity.js');

beforeEach(() => {
  store.clear();
});

describe('generatePeerId', () => {
  it('returns ORBIT-XXXXXX format', () => {
    const id = generatePeerId();
    expect(id).toMatch(/^ORBIT-[0-9A-F]{6}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 20; i++) ids.add(generatePeerId());
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe('getIdentity / setIdentity', () => {
  it('returns null when nothing stored', () => {
    expect(getIdentity()).toBeNull();
  });

  it('round-trips identity through localStorage', () => {
    const stored = setIdentity({ peerId: 'ORBIT-AABBCC', displayName: 'Alice' });
    expect(stored.peerId).toBe('ORBIT-AABBCC');
    expect(stored.displayName).toBe('Alice');

    const loaded = getIdentity();
    expect(loaded.peerId).toBe('ORBIT-AABBCC');
    expect(loaded.displayName).toBe('Alice');
  });

  it('throws on invalid peerId', () => {
    expect(() => setIdentity({ peerId: 'bad', displayName: '' })).toThrow();
  });

  it('truncates displayName to 64 chars', () => {
    const long = 'A'.repeat(100);
    const stored = setIdentity({ peerId: 'ORBIT-112233', displayName: long });
    expect(stored.displayName.length).toBe(64);
  });

  it('reads legacy orbits_peer_id key', () => {
    localStorage.setItem('orbits_peer_id', 'ORBIT-DEADBE');
    const id = getIdentity();
    expect(id.peerId).toBe('ORBIT-DEADBE');
    expect(id.displayName).toBe('');
  });
});

describe('getOrCreateIdentity', () => {
  it('creates a new identity when none exists', () => {
    const id = getOrCreateIdentity();
    expect(id.peerId).toMatch(/^ORBIT-[0-9A-F]{6}$/);
    expect(typeof id.displayName).toBe('string');
  });

  it('returns existing identity on second call', () => {
    const first = getOrCreateIdentity();
    const second = getOrCreateIdentity();
    expect(second.peerId).toBe(first.peerId);
  });
});

describe('setDisplayName', () => {
  it('updates displayName preserving peerId', () => {
    const id = getOrCreateIdentity();
    setDisplayName('Bob');
    const updated = getIdentity();
    expect(updated.peerId).toBe(id.peerId);
    expect(updated.displayName).toBe('Bob');
  });
});

describe('resetIdentity', () => {
  it('generates a new peerId', () => {
    const old = getOrCreateIdentity();
    const fresh = resetIdentity();
    expect(fresh.peerId).toMatch(/^ORBIT-[0-9A-F]{6}$/);
    expect(fresh.displayName).toBe('');
  });
});

describe('exportIdentity', () => {
  it('returns versioned identity object', () => {
    getOrCreateIdentity();
    const exp = exportIdentity();
    expect(exp.version).toBe(1);
    expect(exp.peerId).toMatch(/^ORBIT-[0-9A-F]{6}$/);
    expect(typeof exp.exportedAt).toBe('number');
  });
});
