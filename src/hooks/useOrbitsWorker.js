import { useEffect, useMemo, useState } from 'react';

let globalWorker = null;
const globalState = {
  status: 'init',
  lastHeartbeatTs: 0,
  lastMessage: null,
  lastError: null,
  progress: null,
  result: null,
  cryptoReady: false,
  cryptoBackend: null,
  publicKey: null,
};
const listeners = new Set();

function notifyListeners() {
  for (const listener of listeners) {
    listener({ ...globalState });
  }
}

function initGlobalWorker() {
  if (globalWorker) return;
  globalState.status = 'starting';
  globalState.lastError = null;
  
  try {
    globalWorker = new Worker(new URL('../workers/orbits.worker.js', import.meta.url), { type: 'module' });
    
    globalWorker.onmessage = (e) => {
      const m = e?.data;
      if (!m || typeof m.type !== 'string') return;
      globalState.lastMessage = m;

      if (m.type === 'ready') {
        globalState.status = 'ready';
        globalState.cryptoBackend = m.cryptoBackend || null;
      }
      if (m.type === 'heartbeat') {
        globalState.lastHeartbeatTs = m.ts || Date.now();
        if (m.cryptoReady) globalState.cryptoReady = true;
      }
      if (m.type === 'progress') globalState.progress = Number(m.percent);
      if (m.type === 'result') {
        globalState.result = m.result;
        globalState.progress = null;
      }
      if (m.type === 'CRYPTO_READY') {
        globalState.cryptoReady = true;
        globalState.publicKey = m.publicKey || null;
      }
      if (m.type === 'PUBLIC_KEY') {
        globalState.publicKey = m.publicKey || null;
      }
      if (m.type === 'STATUS') {
        globalState.cryptoReady = m.cryptoReady;
        globalState.cryptoBackend = m.cryptoBackend || null;
      }
      if (m.type === 'CLEARED') {
        globalState.cryptoReady = false;
        globalState.publicKey = null;
      }
      if (m.type === 'error') {
        globalState.lastError = m.message || 'Ошибка воркера';
      }
      notifyListeners();
    };
    globalWorker.onerror = () => {
      globalState.lastError = 'Сбой воркера';
      globalState.status = 'error';
      notifyListeners();
    };
    globalWorker.postMessage({ type: 'init', intervalMs: 1500 });
  } catch (err) {
    globalState.lastError = 'Ошибка инициализации воркера';
    globalState.status = 'error';
    notifyListeners();
  }
}

function sendToGlobalWorker(type, payload = {}) {
  if (!globalWorker) return;
  globalWorker.postMessage({ type, ...payload });
}

export function useOrbitsWorker() {
  const [state, setState] = useState(globalState);

  useEffect(() => {
    listeners.add(setState);
    if (!globalWorker) {
      initGlobalWorker();
    }
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const api = useMemo(() => {
    return {
      start() {
        initGlobalWorker();
      },
      stop() {
        if (globalWorker) {
          try { globalWorker.postMessage({ type: 'stop' }); } catch (_) {}
          try { globalWorker.terminate(); } catch (_) {}
          globalWorker = null;
          globalState.status = 'stopped';
          globalState.progress = null;
          notifyListeners();
        }
      },
      runDemo() {
        globalState.result = null;
        globalState.progress = 0;
        notifyListeners();
        sendToGlobalWorker('runDemo');
      },
      ping() {
        sendToGlobalWorker('ping', { id: Date.now() });
      },
      initCrypto(force = false) {
        sendToGlobalWorker('INIT_CRYPTO', { force });
      },
      encryptAndSave(peerId, plaintext) {
        sendToGlobalWorker('ENCRYPT_AND_SAVE', { peerId, plaintext, direction: 'out' });
      },
      decryptAndSave(peerId, encryptedPayload) {
        sendToGlobalWorker('DECRYPT_AND_SAVE', { peerId, encryptedPayload, direction: 'in' });
      },
      getPublicKey() {
        sendToGlobalWorker('GET_PUBLIC_KEY');
      },
      setSessionKey(peerId, symmetricKey) {
        sendToGlobalWorker('SET_SESSION_KEY', { peerId, symmetricKey });
      },
      getMessages(peerId, limit = 50, beforeTimestamp) {
        sendToGlobalWorker('GET_MESSAGES', { peerId, limit, beforeTimestamp });
      },
      getPeers() {
        sendToGlobalWorker('GET_PEERS');
      },
      addPeer(peer) {
        sendToGlobalWorker('ADD_PEER', { peer });
      },
      clearAll() {
        sendToGlobalWorker('CLEAR_ALL');
      },
      getStatus() {
        sendToGlobalWorker('GET_STATUS');
      }
    };
  }, []);

  return {
    ...state,
    ...api
  };
}
