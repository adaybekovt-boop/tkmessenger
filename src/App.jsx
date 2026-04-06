import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { registerSW } from 'virtual:pwa-register';
import { MessageSquare, Radar, Settings2 } from 'lucide-react';
import OrbitsLogo from './components/OrbitsLogo.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import Chats from './pages/Chats.jsx';
import RadarView from './pages/Radar.jsx';
import Settings from './pages/Settings.jsx';
import { PeerProvider } from './context/PeerContext.jsx';
import { useAuth } from './context/AuthContext.jsx';

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

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-[rgb(var(--orb-bg-rgb))]">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-softPulse">
          <OrbitsLogo />
        </div>
        <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">Запуск ядра…</div>
      </div>
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const [tab, setTab] = useState('chats');
  const [booting, setBooting] = useState(true);
  const [swState, setSwState] = useState({ status: 'инициализация', needRefresh: false, offlineReady: false });
  const [reloadNowFn, setReloadNowFn] = useState(() => () => {});
  const [checkUpdateFn, setCheckUpdateFn] = useState(() => () => {});

  const [theme, setTheme] = useState(() => localStorage.getItem('orbits_theme') || 'obsidian');
  const [powerSaver, setPowerSaver] = useState(() => localStorage.getItem('orbits_power_saver') === '1');

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 520);
    return () => clearTimeout(t);
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

  const view = useMemo(() => {
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
        />
      );
    }
    return <Chats />;
  }, [tab, swState, checkUpdateFn, reloadNowFn, theme, powerSaver]);

  if (auth.authState === 'loading' || booting) {
    return (
      <div
        className="relative h-[100dvh] w-full overflow-hidden bg-[rgb(var(--orb-bg-rgb))]"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      >
        <LoadingOverlay />
      </div>
    );
  }

  if (auth.authState !== 'authed') {
    return <AuthScreen />;
  }

  return (
    <PeerProvider>
      <div
        className="relative h-[100dvh] w-full overflow-hidden bg-[rgb(var(--orb-bg-rgb))]"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      >
        <header className="orb-blur flex h-14 items-center justify-between border-b border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/70 px-4">
          <OrbitsLogo />
          <div className="hidden sm:flex items-center gap-2 text-xs text-[rgb(var(--orb-muted-rgb))]">
            <span>PWA:</span>
            <span className="text-[rgb(var(--orb-text-rgb))]">{swState.offlineReady ? 'оффлайн готов' : 'активен'}</span>
          </div>
        </header>

        <main className="h-[calc(100dvh-56px-78px)] w-full overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              className="h-full w-full"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {view}
            </motion.div>
          </AnimatePresence>
        </main>

        <nav
          className="orb-blur flex h-[78px] items-center gap-2 border-t border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/70 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3"
          role="navigation"
          aria-label="Навигация"
        >
          <TabButton active={tab === 'chats'} icon={MessageSquare} label="Чаты" onClick={() => setTab('chats')} />
          <TabButton active={tab === 'radar'} icon={Radar} label="Радар" onClick={() => setTab('radar')} />
          <TabButton active={tab === 'settings'} icon={Settings2} label="Настройки" onClick={() => setTab('settings')} />
        </nav>
      </div>
    </PeerProvider>
  );
}
