import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { registerSW } from 'virtual:pwa-register';
import { Download, Loader2, MessageSquare, Send, Settings2, X } from 'lucide-react';
import OrbitsLogo from './components/OrbitsLogo.jsx';
import Onboarding from './components/Onboarding.jsx';

// Lazy-loaded pages — each gets its own chunk, loaded on first navigation.
const Chats = lazy(() => import('./pages/Chats.jsx'));
const DropView = lazy(() => import('./pages/Drop.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
import { PeerProvider } from './context/PeerContext.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { useVisualViewport } from './hooks/useVisualViewport.js';
import { hapticTap } from './core/haptics.js';
import CallOverlay from './components/CallOverlay.jsx';
import { PageTransition } from './components/PageTransition.jsx';
import { usePeerContext } from './context/PeerContext.jsx';
import { requestPersistentStorage, startStorageMonitor } from './core/storageCheck.js';
import { cx } from './utils/common.js';

function TabButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 transition-all duration-200 active:scale-95',
        active
          ? 'text-indigo-400'
          : 'text-[rgb(var(--orb-muted-rgb))] hover:text-[rgb(var(--orb-text-rgb))]'
      )}
    >
      {active && (
        <motion.div
          layoutId="nav-indicator"
          className="absolute inset-0 rounded-xl bg-indigo-400/10"
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          style={{ zIndex: -1 }}
        />
      )}
      <div className="relative">
        <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.5} />
      </div>
      <span className={cx('mt-0.5 text-[10px] leading-tight', active ? 'font-semibold' : 'font-normal')}>{label}</span>
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
            <OrbitsLogo />
            <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">Загрузка…</div>
          </motion.div>
          <motion.div
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
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
    <div className="inline-flex items-center rounded-full bg-[rgb(var(--orb-danger-rgb))]/10 px-3 py-1 text-[11px] font-semibold text-[rgb(var(--orb-danger-rgb))] ring-1 ring-[rgb(var(--orb-danger-rgb))]/20">
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

  // Theme state now lives in <ThemeProvider> (src/themes/ThemeProvider.jsx).
  // Settings reads it via useTheme() directly — no props drilling here.
  const [powerSaver, setPowerSaver] = useState(() => localStorage.getItem('orbits_power_saver') === '1');

  // Phase 3.3 — Install Prompt
  const installPromptRef = useRef(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installBannerDismissed, setInstallBannerDismissed] = useState(() => localStorage.getItem('orbits_pwa_dismissed') === '1');

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
    if (powerSaver) root.classList.add('orb-reduce');
    else root.classList.remove('orb-reduce');
    localStorage.setItem('orbits_power_saver', powerSaver ? '1' : '0');
  }, [powerSaver]);

  useEffect(() => {
    try {
      const updateSW = registerSW({
        immediate: true,
        onRegistered(registration) {
          setSwState((s) => ({
            ...s,
            status: 'зарегистрирован',
            offlineReady: s.offlineReady || (registration?.active?.state === 'activated')
          }));
        },
        onRegisterError() {
          setSwState((s) => ({ ...s, status: 'ошибка регистрации' }));
        },
        onNeedRefresh() {
          setSwState((s) => ({ ...s, needRefresh: true }));
        },
        onOfflineReady() {
          setSwState((s) => ({ ...s, offlineReady: true, status: 'зарегистрирован' }));
        }
      });
      setReloadNowFn(() => () => updateSW(true));
      setCheckUpdateFn(() => () => updateSW(false));
    } catch (_) {
      setSwState((s) => ({ ...s, status: 'PWA недоступно' }));
    }
    // Fallback: if no callback fires within 5s, check navigator.serviceWorker
    const fallbackTimer = setTimeout(() => {
      setSwState((s) => {
        if (s.status !== 'инициализация') return s;
        const hasController = !!navigator?.serviceWorker?.controller;
        return {
          ...s,
          status: hasController ? 'зарегистрирован' : 'не поддерживается',
          offlineReady: hasController
        };
      });
    }, 5000);
    return () => clearTimeout(fallbackTimer);
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
    if (tab === 'drop') return <DropView />;
    if (tab === 'settings') {
      return (
        <Settings
          swState={swState}
          onCheckUpdate={checkUpdateFn}
          onReloadNow={reloadNowFn}
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
        className="orb-page-bg relative w-full overflow-hidden bg-[rgb(var(--orb-bg-rgb))]"
        style={{
          height: 'calc(var(--orb-vvh, 1vh) * 100)',
          transform: 'translateY(var(--orb-vv-offset-top, 0px))',
          paddingTop: 'env(safe-area-inset-top)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)'
        }}
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
        className="orb-page-bg relative w-full overflow-hidden bg-[rgb(var(--orb-bg-rgb))]"
        style={{
          height: 'calc(var(--orb-vvh, 1vh) * 100)',
          // Re-align the shell with the visible area on iOS Safari versions
          // that scroll the visual viewport instead of resizing layout when
          // the keyboard opens. Zero on modern browsers — no-op.
          transform: 'translateY(var(--orb-vv-offset-top, 0px))',
          paddingTop: 'env(safe-area-inset-top)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)'
        }}
      >
        <CallOverlayMount />

        {/* Floating status pill — only shows when disconnected */}
        <div className="pointer-events-none absolute left-0 right-0 top-[max(4px,env(safe-area-inset-top))] z-30 flex justify-center">
          <div className="pointer-events-auto">
            <PeerStatusPill />
          </div>
        </div>

        <main
          className="w-full overflow-hidden"
          style={{ height: 'calc((var(--orb-vvh, 1vh) * 100) - var(--orb-nav-h, 64px))' }}
        >
          <div className="h-full w-full relative">
            <PageTransition pageKey={tab}>
              <Suspense fallback={
                <div className="flex h-full w-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--orb-muted-rgb))]" />
                </div>
              }>
                {view}
              </Suspense>
            </PageTransition>

            {/* Floating banners overlay */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 px-4 pb-3">
              <AnimatePresence>
                {canInstall && !installBannerDismissed ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    className="pointer-events-auto w-full max-w-md rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/90 px-4 py-3 shadow-xl backdrop-blur-xl ring-1 ring-white/[0.08]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-[rgb(var(--orb-text-rgb))]">
                        <Download className="h-4 w-4 text-indigo-400" />
                        <span>Установить на главный экран?</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { hapticTap(); void handleInstall(); }}
                          className="rounded-full orb-gradient px-4 py-1.5 text-[11px] font-medium text-white shadow-lg shadow-indigo-500/20 transition-all duration-200"
                        >
                          Установить
                        </button>
                        <button
                          type="button"
                          onClick={() => { localStorage.setItem('orbits_pwa_dismissed', '1'); setInstallBannerDismissed(true); }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[rgb(var(--orb-muted-rgb))] hover:text-[rgb(var(--orb-text-rgb))]"
                          aria-label="Закрыть"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <AnimatePresence>
                {swState.needRefresh ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    className="pointer-events-auto w-full max-w-md rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/90 px-4 py-3 shadow-xl backdrop-blur-xl ring-1 ring-white/[0.08]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-[rgb(var(--orb-text-rgb))]">Доступна новая версия</div>
                      <button
                        type="button"
                        onClick={() => { hapticTap(); reloadNowFn(); }}
                        className="rounded-full bg-[rgb(var(--orb-success-rgb))] px-4 py-1.5 text-[11px] font-medium text-white transition-colors duration-200"
                      >
                        Обновить
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <AnimatePresence>
                {storageWarning ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    className="pointer-events-auto w-full max-w-md rounded-2xl bg-[rgb(var(--orb-danger-rgb))]/10 px-4 py-3 shadow-xl backdrop-blur-xl ring-1 ring-[rgb(var(--orb-danger-rgb))]/20"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-[rgb(var(--orb-text-rgb))]">
                        Хранилище: {Math.round((storageWarning.ratio || 0) * 100)}% ({storageWarning.usageMB}MB / {storageWarning.quotaMB}MB)
                      </div>
                      <button
                        type="button"
                        onClick={() => setStorageWarning(null)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[rgb(var(--orb-muted-rgb))] active:scale-95"
                        aria-label="Закрыть"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </main>

        <nav
          className="orb-nav-bar flex h-[64px] items-center gap-1 overflow-hidden border-t border-white/[0.06] bg-[rgb(var(--orb-bg-rgb))]/95 px-6 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl"
          role="navigation"
          aria-label="Навигация"
        >
          <TabButton active={tab === 'chats'} icon={MessageSquare} label="Чаты" onClick={() => { hapticTap(); setTab('chats'); }} />
          <TabButton active={tab === 'drop'} icon={Send} label="Drop" onClick={() => { hapticTap(); setTab('drop'); }} />
          <TabButton active={tab === 'settings'} icon={Settings2} label="Ещё" onClick={() => { hapticTap(); setTab('settings'); }} />
        </nav>
      </div>
    </PeerProvider>
  );
}
