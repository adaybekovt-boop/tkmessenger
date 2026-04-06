import { useEffect, useMemo, useRef, useState } from 'react';

export function useOrbitsWorker() {
  const workerRef = useRef(null);
  const [status, setStatus] = useState('init');
  const [lastHeartbeatTs, setLastHeartbeatTs] = useState(0);
  const [lastMessage, setLastMessage] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [cryptoReady, setCryptoReady] = useState(false);
  const [cryptoBackend, setCryptoBackend] = useState(null);
  const [publicKey, setPublicKey] = useState(null);

  const api = useMemo(() => {
    function send(type, payload = {}) {
      const w = workerRef.current;
      if (!w) return;
      w.postMessage({ type, ...payload });
    }

    return {
      start() {
        if (workerRef.current) return;
        setLastError(null);
        setStatus('starting');
        const w = new Worker(new URL('../workers/orbits.worker.js', import.meta.url), { type: 'module' });
        workerRef.current = w;
        w.onmessage = (e) => {
          const m = e?.data;
          if (!m || typeof m.type !== 'string') return;
          setLastMessage(m);

          if (m.type === 'ready') {
            setStatus('ready');
            setCryptoBackend(m.cryptoBackend || null);
          }
          if (m.type === 'heartbeat') {
            setLastHeartbeatTs(m.ts || Date.now());
            if (m.cryptoReady) setCryptoReady(true);
          }
          if (m.type === 'progress') setProgress(Number(m.percent));
          if (m.type === 'result') {
            setResult(m.result);
            setProgress(null);
          }
          if (m.type === 'CRYPTO_READY') {
            setCryptoReady(true);
            setPublicKey(m.publicKey || null);
          }
          if (m.type === 'PUBLIC_KEY') {
            setPublicKey(m.publicKey || null);
          }
          if (m.type === 'STATUS') {
            setCryptoReady(m.cryptoReady);
            setCryptoBackend(m.cryptoBackend || null);
          }
          if (m.type === 'CLEARED') {
            setCryptoReady(false);
            setPublicKey(null);
          }
          if (m.type === 'error') {
            setLastError(m.message || 'Ошибка воркера');
          }
        };
        w.onerror = () => {
          setLastError('Сбой воркера');
          setStatus('error');
        };
        w.postMessage({ type: 'init', intervalMs: 1500 });
      },
      stop() {
        const w = workerRef.current;
        workerRef.current = null;
        if (!w) return;
        try { w.postMessage({ type: 'stop' }); } catch (_) {}
        try { w.terminate(); } catch (_) {}
        setStatus('stopped');
        setProgress(null);
      },
      runDemo() {
        setResult(null);
        setProgress(0);
        send('runDemo');
      },
      ping() {
        send('ping', { id: Date.now() });
      },
      // Phase 1: Криптографические команды
      initCrypto(force = false) {
        send('INIT_CRYPTO', { force });
      },
      encryptAndSave(peerId, plaintext) {
        send('ENCRYPT_AND_SAVE', { peerId, plaintext, direction: 'out' });
      },
      decryptAndSave(peerId, encryptedPayload) {
        send('DECRYPT_AND_SAVE', { peerId, encryptedPayload, direction: 'in' });
      },
      getPublicKey() {
        send('GET_PUBLIC_KEY');
      },
      setSessionKey(peerId, symmetricKey) {
        send('SET_SESSION_KEY', { peerId, symmetricKey });
      },
      getMessages(peerId, limit = 50, beforeTimestamp) {
        send('GET_MESSAGES', { peerId, limit, beforeTimestamp });
      },
      getPeers() {
        send('GET_PEERS');
      },
      addPeer(peer) {
        send('ADD_PEER', { peer });
      },
      clearAll() {
        send('CLEAR_ALL');
      },
      getStatus() {
        send('GET_STATUS');
      }
    };
  }, []);

  useEffect(() => {
    api.start();
    return () => api.stop();
  }, [api]);

  return {
    status,
    lastHeartbeatTs,
    lastMessage,
    lastError,
    progress,
    result,
    cryptoReady,
    cryptoBackend,
    publicKey,
    start: api.start,
    stop: api.stop,
    runDemo: api.runDemo,
    ping: api.ping,
    initCrypto: api.initCrypto,
    encryptAndSave: api.encryptAndSave,
    decryptAndSave: api.decryptAndSave,
    getPublicKey: api.getPublicKey,
    setSessionKey: api.setSessionKey,
    getMessages: api.getMessages,
    getPeers: api.getPeers,
    addPeer: api.addPeer,
    clearAll: api.clearAll,
    getStatus: api.getStatus
  };
}
