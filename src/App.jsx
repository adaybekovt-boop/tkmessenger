import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { registerSW } from 'virtual:pwa-register';
import { Download, MessageSquare, Radar, Settings2, X } from 'lucide-react';
import OrbitsLogo from './components/OrbitsLogo.jsx';
import Onboarding from './components/Onboarding.jsx';
import Chats from './pages/Chats.jsx';
import RadarView from './pages/Radar.jsx';
import Settings from './pages/Settings.jsx';
import { PeerProvider } from './context/PeerContext.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { useVisualViewport } from './hooks/useVisualViewport.js';
import { hapticTap } from './core/haptics.js';
import CallOverlay from './components/CallOverlay.jsx';
import { usePeerContext } from './context/PeerContext.jsx';
import { requestPersistentStorage, startStorageMonitor } from './core/storageCheck.js';

function cx(...v) {
  return v.filter(Boolean).join(' ');
}

function TabButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm ring-1 transition-all duration-300 ease-in-out active:scale-95',
        active
          ? 'bg-[rgb(var(--orb-surface-rgb))]/65 text-[rgb(var(--orb-text-rgb))] ring-[rgb(var(--orb-border-rgb))]'
          : 'bg-[rgb(var(--orb-bg-rgb))]/35 text-[rgb(var(--orb-muted-rgb))] ring-[rgb(var(--orb-border-rgb))] hover:bg-[rgb(var(--orb-surface-rgb))]/40 hover:text-[rgb(var(--orb-text-rgb))]'
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function IntroOverlay({ open, onDone }) {
  const doneRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    }, 1100);
    return () => clearTimeout(t);
  }, [onDone, open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="absolute inset-0 z-50 grid place-items-center bg-[rgb(var(--orb-bg-rgb))]"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.2, filter: 'blur(18px)' }}
            transition={{ duration: 0.38, ease: 'easeOut' }}
            className="flex flex-col items-center gap-4"
          >
            <motion.div
              initial={{ scale: 1, opacity: 0.9 }}
              animate={{ scale: [1, 1.02, 1], opacity: [0.72, 1, 0.72] }}
              transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
            >
              <OrbitsLogo />
            </motion.div>
            <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">Запуск ядра…</div>
          </motion.div>
          <motion.div
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute -top-24 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-30"
              style={{ background: 'radial-gradient(circle at 30% 30%, rgba(var(--orb-accent-rgb),0.34), transparent 60%)' }}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function CallOverlayMount() {
  const peer = usePeerContext();
  return <CallOverlay call={peer.call} />;
}

function PeerStatusPill() {
  const peer = usePeerContext();
  const labels = {
    initializing: 'инициализация',
    connecting: 'подключение…',
    connected: 'подключено',
    disconnected: 'нет сети',
    disabled: 'выключено',
    multitab: 'другая вкладка',
    unsupported: 'не поддерживается'
  };
  const text = peer.error ? `ошибка: ${peer.error}` : (labels[peer.status] || peer.status);
  if (!text || peer.status === 'connected') return null;
  return (
    <div className="inline-flex items-center rounded-2xl bg-[rgb(var(--orb-danger-rgb))]/10 px-3 py-1 text-[11px] font-semibold text-[rgb(var(--orb-danger-rgb))] ring-1 ring-[rgb(var(--orb-danger-rgb))]/20">
      {text}
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  useVisualViewport();
  const [tab, setTab] = useState('chats');
  const [booting, setBooting] = useState(true);
  const [swState, setSwState] = useState({ status: 'инициализация', needRefresh: false, offlineReady: false });
  const [reloadNowFn, setReloadNowFn] = useState(() => () => {});
  const [checkUpdateFn, setCheckUpdateFn] = useState(() => () => {});

  const [theme, setTheme] = useState(() => localStorage.getItem('orbits_theme') || 'obsidian');
  const [powerSaver, setPowerSaver] = useState(() => localStorage.getItem('orbits_power_saver') === '1');

  // Phase 3.3 — Install Prompt
  const installPromptRef = useRef(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installBannerDismissed, setInstallBannerDismissed] = useState(false);

  // Phase 2.3 — Storage Warning
  const [storageWarning, setStorageWarning] = useState(null);

  // Auto-lock: lock vault after 5 min of hidden tab
  useEffect(() => {
    if (auth.authState !== 'authed') return;
    let lockTimer = null;
    const onVisibility = () => {
      if (document.hidden) {
        const autoLock = localStorage.getItem('orbits_auto_lock') !== '0';
        if (autoLock) {
          lockTimer = setTimeout(() => {
            auth.logout();
          }, 5 * 60 * 1000);
        }
      } else {
        if (lockTimer) {
          clearTimeout(lockTimer);
          lockTimer = null;
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (lockTimer) clearTimeout(lockTimer);
    };
  }, [auth.authState, auth]);

  // Phase 3.5 — Notification Permission
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const finishBoot = useMemo(() => {
    return () => setBooting(false);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    localStorage.setItem('orbits_theme', theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (powerSaver) root.classList.add('orb-reduce');
    else root.classList.remove('orb-reduce');
    localStorage.setItem('orbits_power_saver', powerSaver ? '1' : '0');
  }, [powerSaver]);

  useEffect(() => {
    try {
      const updateSW = registerSW({
        immediate: true,
        onRegistered() {
          setSwState((s) => ({ ...s, status: 'зарегистрирован' }));
        },
        onRegisterError() {
          setSwState((s) => ({ ...s, status: 'ошибка регистрации' }));
        },
        onNeedRefresh() {
          setSwState((s) => ({ ...s, needRefresh: true }));
        },
        onOfflineReady() {
          setSwState((s) => ({ ...s, offlineReady: true }));
        }
      });
      setReloadNowFn(() => () => updateSW(true));
      setCheckUpdateFn(() => () => updateSW(false));
    } catch (_) {
      setSwState((s) => ({ ...s, status: 'PWA недоступно' }));
    }
  }, []);

  // Phase 3.3 — beforeinstallprompt
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      installPromptRef.current = e;
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    // Detect when app is installed
    const onInstalled = () => {
      setCanInstall(false);
      installPromptRef.current = null;
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Phase 2.3 — Storage monitor (iOS Safari limits)
  useEffect(() => {
    const cancel = startStorageMonitor((result) => {
      setStorageWarning(result);
    });
    // Request persistent storage to avoid data eviction
    void requestPersistentStorage();
    return cancel;
  }, []);

  const handleInstall = useCallback(async () => {
    const prompt = installPromptRef.current;
    if (!prompt) return;
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      if (result?.outcome === 'accepted') {
        setCanInstall(false);
        installPromptRef.current = null;
      }
    } catch (_) {
    }
  }, []);

  const requestNotifPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    try {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
    } catch (_) {
    }
  }, []);

  const view = (() => {
    if (tab === 'radar') return <RadarView />;
    if (tab === 'settings') {
      return (
        <Settings
          swState={swState}
          onCheckUpdate={checkUpdateFn}
          onReloadNow={reloadNowFn}
          theme={theme}
          setTheme={setTheme}
          powerSaver={powerSaver}
          setPowerSaver={setPowerSaver}
          notifPermission={notifPermission}
          requestNotifPermission={requestNotifPermission}
        />
      );
    }
    return <Chats />;
  })();

  if (auth.authState === 'loading' || booting) {
    return (
      <div
        className="relative w-full overflow-hidden bg-[rgb(var(--orb-bg-rgb))]"
        style={{ height: 'calc(var(--orb-vvh, 1vh) * 100)', paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      >
        <IntroOverlay open={booting} onDone={finishBoot} />
      </div>
    );
  }

  if (auth.authState !== 'authed') {
    return <Onboarding />;
  }

  return (
    <PeerProvider>
      <div
        className="relative w-full overflow-hidden bg-[rgb(var(--orb-bg-rgb))]"
        style={{ height: 'calc(var(--orb-vvh, 1vh) * 100)', paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      >
        <CallOverlayMount />
        <header className="orb-blur flex h-14 items-center justify-between border-b border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/70 px-4">
          <OrbitsLogo />
          <div className="flex items-center gap-2">
            <PeerStatusPill />
            <div className="hidden sm:flex items-center gap-2 text-xs text-[rgb(var(--orb-muted-rgb))]">
              <span>PWA:</span>
              <span className="text-[rgb(var(--orb-text-rgb))]">{swState.offlineReady ? 'оффлайн готов' : 'активен'}</span>
            </div>
          </div>
        </header>

        {/* Phase 3.3 — Install Banner */}
        <AnimatePresence>
          {canInstall && !installBannerDismissed ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="overflow-hidden border-b border-[rgb(var(--orb-border-rgb))]"
            >
              <div className="flex items-center justify-between gap-3 bg-[rgb(var(--orb-accent-rgb))]/10 px-4 py-2">
                <div className="flex items-center gap-2 text-xs text-[rgb(var(--orb-text-rgb))]">
                  <Download className="h-4 w-4 text-[rgb(var(--orb-accent-rgb))]" />
                  <span>Установить Orbits на главный экран?</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { hapticTap(); void handleInstall(); }}
                    className="inline-flex items-center gap-1 rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-3 py-1.5 text-[11px] font-semibold text-white transition-all duration-300 ease-in-out active:scale-95"
                  >
                    Установить
                  </button>
                  <button
                    type="button"
                    onClick={() => setInstallBannerDismissed(true)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[rgb(var(--orb-muted-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                    aria-label="Закрыть"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* SW Update Banner */}
        <AnimatePresence>
          {swState.needRefresh ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="overflow-hidden border-b border-[rgb(var(--orb-border-rgb))]"
            >
              <div className="flex items-center justify-between gap-3 bg-[rgb(var(--orb-success-rgb))]/10 px-4 py-2">
                <div className="text-xs text-[rgb(var(--orb-text-rgb))]">Доступна новая версия</div>
                <button
                  type="button"
                  onClick={() => { hapticTap(); reloadNowFn(); }}
                  className="inline-flex items-center gap-1 rounded-2xl bg-[rgb(var(--orb-success-rgb))] px-3 py-1.5 text-[11px] font-semibold text-white transition-all duration-300 ease-in-out active:scale-95"
                >
                  Обновить
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Phase 2.3 — Storage Warning */}
        <AnimatePresence>
          {storageWarning ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="overflow-hidden border-b border-[rgb(var(--orb-border-rgb))]"
            >
              <div className="flex items-center justify-between gap-3 bg-[rgb(var(--orb-danger-rgb))]/10 px-4 py-2">
                <div className="text-xs text-[rgb(var(--orb-text-rgb))]">
                  ⚠️ Хранилище заполнено на {Math.round((storageWarning.ratio || 0) * 100)}% ({storageWarning.usageMB}MB / {storageWarning.quotaMB}MB). Очистите старые сообщения в настройках.
                </div>
                <button
                  type="button"
                  onClick={() => setStorageWarning(null)}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[rgb(var(--orb-muted-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                  aria-label="Закрыть"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <main className="w-full overflow-hidden" style={{ height: 'calc((var(--orb-vvh, 1vh) * 100) - 56px - 78px)' }}>
          <div className="h-full w-full relative">
            <motion.div
              key={tab}
              className="h-full w-full absolute inset-0"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {view}
            </motion.div>
          </div>
        </main>

        <nav
          className="orb-blur flex h-[78px] items-center gap-2 border-t border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/70 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3"
          role="navigation"
          aria-label="Навигация"
        >
          <TabButton
            active={tab === 'chats'}
            icon={MessageSquare}
            label="Чаты"
            onClick={() => {
              hapticTap();
              setTab('chats');
            }}
          />
          <TabButton
            active={tab === 'radar'}
            icon={Radar}
            label="Радар"
            onClick={() => {
              hapticTap();
              setTab('radar');
            }}
          />
          <TabButton
            active={tab === 'settings'}
            icon={Settings2}
            label="Настройки"
            onClick={() => {
              hapticTap();
              setTab('settings');
            }}
          />
        </nav>
      </div>
    </PeerProvider>
  );
}
