import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Bell, ChevronLeft, ClipboardCopy, Cpu, Flower2, Layers, Lock, LogOut, MessageSquare, Mic2, Moon, Palette, PlugZap, RefreshCw, Shield, SlidersHorizontal, Sparkles, Trash2, UserRound, Zap } from 'lucide-react';
import { useOrbitsWorker } from '../hooks/useOrbitsWorker.js';
import { usePeerContext } from '../context/PeerContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { clearAllData as dbClearAll } from '../core/db.js';
import { getNotifSettings, saveNotifSettings } from '../core/notifications.js';
import { useTheme } from '../themes/ThemeProvider.jsx';
import ChatSettings from '../components/ChatSettings.jsx';
import { cx, formatTimestamp } from '../utils/common.js';
import { getLocalIdentityFingerprint, shortFingerprint } from '../core/identityKey.js';

// Display metadata for the theme picker. Kept as a static table (instead of
// read from the manifest) so the picker renders instantly without waiting on
// the lazy-loaded manifest module for each entry. When a new theme ships,
// register its label + icon here alongside its registry entry.
const THEME_PICKER_META = {
  'classic-graphite': { label: 'Graphite',    icon: Layers },
  'classic-light':    { label: 'Paper',       icon: Sparkles },
  'classic-matrix':   { label: 'Matrix',      icon: PlugZap },
  'sakura-zen':       { label: 'Sakura Zen',  icon: Flower2 }
};

function getDeviceInfo() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const platform = typeof navigator !== 'undefined' ? navigator.platform || '' : '';
  const mem = typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined;
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
  const standalone = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(display-mode: standalone)').matches
    : false;
  return {
    platform: platform || '—',
    userAgent: ua ? ua.slice(0, 140) : '—',
    memoryGb: typeof mem === 'number' ? mem : null,
    cores: typeof cores === 'number' ? cores : null,
    standalone
  };
}

function hexToRgbTuple(hex) {
  const v = String(hex || '').trim();
  const m = /^#?([0-9a-fA-F]{6})$/.exec(v);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return [r, g, b];
}

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <section className="rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/55 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/55 ring-1 ring-[rgb(var(--orb-border-rgb))]">
          <Icon className="h-4 w-4 text-[rgb(var(--orb-muted-rgb))]" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">{title}</div>
          {subtitle ? <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">{subtitle}</div> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-3 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
      aria-pressed={checked}
    >
      <span className={cx('h-5 w-9 rounded-full ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out', checked ? 'bg-[rgb(var(--orb-accent-rgb))]/60' : 'bg-[rgb(var(--orb-surface-rgb))]/60')}>
        <span className={cx('block h-4 w-4 translate-y-0.5 rounded-full bg-white transition-all duration-300 ease-in-out', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function NavHeader({ title, subtitle, onBack }) {
  return (
    <div className="orb-blur flex items-center justify-between gap-3 border-b border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/70 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
            aria-label="Назад"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">{title}</div>
          {subtitle ? <div className="truncate text-xs text-[rgb(var(--orb-muted-rgb))]">{subtitle}</div> : null}
        </div>
      </div>
    </div>
  );
}

function ActionCard({ icon: Icon, title, subtitle, onClick, tone }) {
  const toneCls =
    tone === 'danger'
      ? 'text-[rgb(var(--orb-danger-rgb))]'
      : tone === 'accent'
        ? 'text-[rgb(var(--orb-text-rgb))]'
        : 'text-[rgb(var(--orb-text-rgb))]';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/30 px-4 py-4 ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/55 ring-1 ring-[rgb(var(--orb-border-rgb))]">
          <Icon className={cx('h-4 w-4', toneCls)} />
        </div>
        <div className="text-left">
          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">{title}</div>
          <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">{subtitle}</div>
        </div>
      </div>
      <ChevronLeft className="h-4 w-4 rotate-180 text-[rgb(var(--orb-muted-rgb))]" />
    </button>
  );
}

export default function Settings({ swState, onCheckUpdate, onReloadNow, powerSaver, setPowerSaver, notifPermission, requestNotifPermission }) {
  const worker = useOrbitsWorker();
  const peer = usePeerContext();
  const auth = useAuth();
  const { themeId, setTheme, availableIds } = useTheme();
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const [screen, setScreen] = useState('home');

  const [copied, setCopied] = useState(false);
  const peerIdLabel = peer.peerId || '…';
  const [storageEstimate, setStorageEstimate] = useState(null);

  const [soundEnabled, setSoundEnabled] = useState(() => getNotifSettings().sound !== false);
  const [accentHex, setAccentHex] = useState(() => localStorage.getItem('orbits_accent_hex') || '');
  const appVersion = typeof __ORBITS_VERSION__ !== 'undefined' ? __ORBITS_VERSION__ : 'dev';
  const device = useMemo(() => getDeviceInfo(), []);

  useEffect(() => {
    if (!navigator?.storage?.estimate) return;
    navigator.storage.estimate().then((est) => {
      setStorageEstimate(est || null);
    }).catch(() => {
    });
  }, [screen]);

  // ── Security: Auto-lock, Wipe-on-Close & Duress Password ──
  const [autoLockEnabled, setAutoLockEnabled] = useState(() => localStorage.getItem('orbits_auto_lock') !== '0');
  const [wipeOnClose, setWipeOnClose] = useState(() => localStorage.getItem('orbits_wipe_on_close') === '1');
  const [relayOnlyEnabled, setRelayOnlyEnabled] = useState(() => localStorage.getItem('orbits_relay_only') === '1');
  const [duressPassword, setDuressPassword] = useState(() => {
    try { return JSON.parse(localStorage.getItem('orbit_settings') || '{}').duressPassword || ''; } catch (_) { return ''; }
  });
  const [duressSaved, setDuressSaved] = useState('');
  const [localFingerprint, setLocalFingerprint] = useState('');
  const [fingerprintCopied, setFingerprintCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLocalIdentityFingerprint().then((fp) => {
      if (!cancelled) setLocalFingerprint(fp || '');
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    localStorage.setItem('orbits_wipe_on_close', wipeOnClose ? '1' : '0');
  }, [wipeOnClose]);

  useEffect(() => {
    if (!wipeOnClose) return;
    const handler = () => {
      try { indexedDB.deleteDatabase('orbits-titan-db'); } catch (_) {}
      try { indexedDB.deleteDatabase('orbits_idb_v1'); } catch (_) {}
    };
    window.addEventListener('pagehide', handler);
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('pagehide', handler);
      window.removeEventListener('beforeunload', handler);
    };
  }, [wipeOnClose]);

  const [chatPrefs, setChatPrefs] = useState(() => {
    try {
      const raw = localStorage.getItem('orbits_chat_prefs_v1');
      if (raw == null) return { showSeconds: false };
      const parsed = JSON.parse(raw);
      if (parsed == null || typeof parsed !== 'object') return { showSeconds: false };
      return parsed;
    } catch (_) {
      return { showSeconds: false };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('orbits_chat_prefs_v1', JSON.stringify(chatPrefs));
    } catch (_) {
    }
  }, [chatPrefs]);

  const [profileDisplayName, setProfileDisplayName] = useState(() => auth.user?.displayName || '');
  const [profileBio, setProfileBio] = useState(() => auth.user?.bio || '');
  const [profileAvatar, setProfileAvatar] = useState(null);
  const [profileSaved, setProfileSaved] = useState('');
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    setProfileDisplayName(auth.user?.displayName || '');
    setProfileBio(auth.user?.bio || '');
  }, [auth.user?.displayName, auth.user?.bio]);

  useEffect(() => {
    const rgb = hexToRgbTuple(accentHex);
    if (!rgb) {
      document.documentElement.style.removeProperty('--orb-accent-rgb');
      try {
        localStorage.removeItem('orbits_accent_hex');
      } catch (_) {
      }
      return;
    }
    document.documentElement.style.setProperty('--orb-accent-rgb', `${rgb[0]} ${rgb[1]} ${rgb[2]}`);
    try {
      localStorage.setItem('orbits_accent_hex', `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`);
    } catch (_) {
    }
  }, [accentHex]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 900);
    return () => clearTimeout(t);
  }, [copied]);

  const canClipboard = typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function';

  const statusText = useMemo(() => {
    if (peer.error) return `ошибка: ${peer.error}`;
    const statusLabels = {
      initializing: 'инициализация',
      connecting: 'подключение…',
      connected: 'подключено',
      disconnected: 'нет сети',
      disabled: 'выключено',
      multitab: 'другая вкладка',
      unsupported: 'не поддерживается'
    };
    return statusLabels[peer.status] || peer.status;
  }, [peer.error, peer.status]);

  const mic = useMemo(() => {
    try {
      const stored = localStorage.getItem('orbits_mic_settings_v1');
      if (stored == null) return {};
      const parsed = JSON.parse(stored);
      if (parsed == null || typeof parsed !== 'object') return {};
      return parsed;
    } catch (_) {
      return {};
    }
  }, []);

  const [micDevices, setMicDevices] = useState([]);
  const [micDeviceId, setMicDeviceId] = useState(() => mic.deviceId || '');
  const [echoCancellation, setEchoCancellation] = useState(mic.echoCancellation !== false);
  const [noiseSuppression, setNoiseSuppression] = useState(mic.noiseSuppression !== false);
  const [autoGainControl, setAutoGainControl] = useState(mic.autoGainControl !== false);
  const [micGranted, setMicGranted] = useState(false);
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const micStreamRef = useRef(null);
  const rafRef = useRef(0);

  const saveMicSettings = useMemo(() => {
    return (next) => {
      try {
        localStorage.setItem('orbits_mic_settings_v1', JSON.stringify(next));
      } catch (_) {
      }
    };
  }, []);

  useEffect(() => {
    saveMicSettings({ deviceId: micDeviceId, echoCancellation, noiseSuppression, autoGainControl });
  }, [autoGainControl, echoCancellation, micDeviceId, noiseSuppression, saveMicSettings]);

  async function refreshMicDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const list = await navigator.mediaDevices.enumerateDevices();
    const mics = list.filter((d) => d.kind === 'audioinput');
    setMicDevices(mics);
    if (!micDeviceId && mics[0]?.deviceId) setMicDeviceId(mics[0].deviceId);
  }

  async function requestMicPermission() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setMicGranted(true);
      for (const t of s.getTracks()) t.stop();
      await refreshMicDevices();
    } catch (_) {
      setMicGranted(false);
    }
  }

  useEffect(() => {
    if (screen !== 'mic') return;
    void refreshMicDevices();
  }, [screen]);

  useEffect(() => {
    if (!micTesting) return;
    let active = true;
    let ctx = null;
    let analyser = null;
    let source = null;

    const start = async () => {
      try {
        const constraints = {
          audio: {
            deviceId: micDeviceId ? { exact: micDeviceId } : undefined,
            echoCancellation,
            noiseSuppression,
            autoGainControl
          },
          video: false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        // Component unmounted while getUserMedia was pending — stop the stream
        // immediately and bail out to prevent state updates on unmounted component.
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStreamRef.current = stream;
        setMicGranted(true);
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = sum / data.length;
          setMicLevel(Math.min(1, avg / 140));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (_) {
        setMicTesting(false);
      }
    };

    void start();

    return () => {
      active = false;
      try {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      } catch (_) {
      }
      rafRef.current = 0;
      setMicLevel(0);
      try {
        if (micStreamRef.current) {
          for (const t of micStreamRef.current.getTracks()) t.stop();
        }
      } catch (_) {
      }
      micStreamRef.current = null;
      try {
        source?.disconnect();
      } catch (_) {
      }
      try {
        analyser?.disconnect();
      } catch (_) {
      }
      try {
        ctx?.close();
      } catch (_) {
      }
      ctx = null;
      analyser = null;
      source = null;
    };
  }, [autoGainControl, echoCancellation, micDeviceId, micTesting, noiseSuppression]);

  const title =
    screen === 'home'
      ? 'Настройки'
      : screen === 'profile'
        ? 'Профиль и сеть'
        : screen === 'security'
          ? 'Безопасность'
        : screen === 'chats'
          ? 'Чаты'
        : screen === 'appearance'
          ? 'Внешний вид'
          : screen === 'mic'
            ? 'Микрофон'
            : screen === 'notifications'
              ? 'Уведомления'
              : screen === 'power'
                ? 'Энергосбережение'
                : 'Диагностика';

  const subtitle =
    screen === 'home'
      ? 'Разделы настроек'
      : screen === 'profile'
        ? 'Твой ID и сетевой статус'
        : screen === 'security'
          ? 'Шифрование и защита данных'
        : screen === 'chats'
          ? 'Настройка чатов и история'
        : screen === 'appearance'
          ? 'Темы и акцент'
          : screen === 'mic'
            ? 'Устройство и тест уровня'
            : screen === 'notifications'
              ? 'Разрешения и предпочтения'
              : screen === 'power'
                ? 'Blur и анимации'
                : 'PWA и Web Worker';

  const back = screen === 'home' ? null : () => setScreen('home');

  return (
    <div className="orb-page-bg flex h-full w-full flex-col overflow-hidden bg-[rgb(var(--orb-bg-rgb))]">
      <NavHeader title={title} subtitle={subtitle} onBack={back} />

      <div className="orb-scroll flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto w-full max-w-4xl">
          <div className="relative">
            <motion.div
              key={screen}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="grid gap-4"
            >
              {screen === 'home' ? (
                <>
                  <div className="grid gap-3">
                    <ActionCard icon={Shield} title="Профиль и сеть" subtitle={`Твой ID и статус (${online ? 'онлайн' : 'оффлайн'})`} onClick={() => setScreen('profile')} />
                    <ActionCard icon={Lock} title="Безопасность" subtitle="Wipe-on-Close, Duress-пароль, шифрование" onClick={() => setScreen('security')} />
                    <ActionCard icon={MessageSquare} title="Чаты" subtitle="Настройка чатов, синхронизация, очистка" onClick={() => setScreen('chats')} />
                    <ActionCard icon={Bell} title="Уведомления" subtitle={notifPermission === 'granted' ? 'Разрешены' : 'Настройка разрешений'} onClick={() => setScreen('notifications')} />
                    <ActionCard icon={Palette} title="Внешний вид" subtitle="Темы и цвет акцента" onClick={() => setScreen('appearance')} />
                    <ActionCard icon={Mic2} title="Микрофон" subtitle="Устройство, эффекты и тест" onClick={() => setScreen('mic')} />
                    <ActionCard icon={Zap} title="Энергосбережение" subtitle="Уменьшить blur и анимации" onClick={() => setScreen('power')} />
                    <ActionCard icon={Cpu} title="Диагностика" subtitle="PWA и Web Worker" onClick={() => setScreen('diagnostics')} />
                  </div>
                </>
              ) : null}

              {screen === 'profile' ? (
                <Section icon={Shield} title="Профиль и сеть" subtitle="Твой уникальный ID для друзей">
                  <Row label="Профиль">
                    <div className="flex items-center gap-3">
                      {auth.user?.avatarDataUrl ? (
                        <img
                          alt=""
                          src={auth.user.avatarDataUrl}
                          className="h-12 w-12 rounded-2xl object-cover ring-1 ring-[rgb(var(--orb-border-rgb))]"
                        />
                      ) : (
                        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 text-sm font-semibold text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">
                          {(auth.user?.displayName || auth.user?.username || 'O').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">{auth.user?.displayName || auth.user?.username}</div>
                        <div className="truncate text-xs text-[rgb(var(--orb-muted-rgb))]">@{auth.user?.username}</div>
                      </div>
                    </div>
                  </Row>

                  <Row label="Отображаемое имя">
                    <input
                      value={profileDisplayName}
                      onChange={(e) => { setProfileError(''); setProfileDisplayName(e.target.value); }}
                      maxLength={32}
                      className="h-11 w-[260px] max-w-full rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                      placeholder="Имя"
                    />
                  </Row>

                  <Row label="Описание">
                    <textarea
                      value={profileBio}
                      onChange={(e) => setProfileBio(e.target.value)}
                      maxLength={200}
                      rows={3}
                      className="w-[320px] max-w-full rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                      placeholder="Пара строк о себе"
                    />
                  </Row>

                  <Row label="Аватар">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/45 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setProfileAvatar(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                        {profileAvatar ? profileAvatar.name : 'Выбрать файл'}
                      </label>
                      {auth.user?.avatarDataUrl || profileAvatar ? (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm('Удалить аватар?')) return;
                            try {
                              setProfileAvatar(null);
                              await auth.updateProfile({
                                displayName: profileDisplayName.trim() || auth.user?.displayName,
                                bio: profileBio.slice(0, 200),
                                removeAvatar: true
                              });
                              setProfileError('');
                              setProfileSaved('Аватар удалён');
                              setTimeout(() => setProfileSaved(''), 1200);
                            } catch (_) {
                              setProfileError('Не удалось удалить аватар');
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-2xl bg-red-500/15 px-3 py-2 text-xs text-red-400 ring-1 ring-red-500/30 transition-all duration-300 ease-in-out active:scale-95"
                          title="Удалить аватар"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Удалить
                        </button>
                      ) : null}
                    </div>
                  </Row>

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const name = profileDisplayName.trim();
                        if (!name) {
                          setProfileSaved('');
                          setProfileError('Имя не может быть пустым');
                          return;
                        }
                        if (name.length > 32) {
                          setProfileSaved('');
                          setProfileError('Имя слишком длинное (макс. 32)');
                          return;
                        }
                        try {
                          await auth.updateProfile({ displayName: name, bio: profileBio.slice(0, 200), avatarFile: profileAvatar });
                          setProfileAvatar(null);
                          setProfileError('');
                          setProfileSaved('Сохранено');
                          setTimeout(() => setProfileSaved(''), 1200);
                        } catch (_) {
                          setProfileSaved('');
                          setProfileError('Не удалось сохранить');
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-3 py-2 text-xs font-semibold text-white ring-1 ring-[rgb(var(--orb-accent-rgb))]/40 transition-all duration-300 ease-in-out active:scale-95"
                    >
                      <UserRound className="h-4 w-4" />
                      <span className="hidden sm:inline">Сохранить профиль</span>
                    </button>

                    <button
                      type="button"
                      onClick={auth.logout}
                      className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                    >
                      <LogOut className="h-4 w-4" />
                      Выйти
                    </button>
                    {profileSaved ? <div className="text-xs text-[rgb(var(--orb-success-rgb))]">{profileSaved}</div> : null}
                    {profileError ? <div className="text-xs font-semibold text-[rgb(var(--orb-danger-rgb))]">{profileError}</div> : null}
                  </div>

                  <Row label="Твой ID (поделись с друзьями)">
                    <div className="flex items-center gap-2">
                      <div className="max-w-[220px] truncate rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 py-2 font-mono text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] sm:max-w-[420px]">
                        {peerIdLabel}
                      </div>
                      <button
                        type="button"
                        disabled={!canClipboard || !peer.peerId}
                        onClick={async () => {
                          if (!peer.peerId) return;
                          try {
                            await navigator.clipboard.writeText(peer.peerId);
                            setCopied(true);
                          } catch (_) {
                          }
                        }}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60"
                        aria-label="Копировать"
                        title={copied ? 'Скопировано' : 'Копировать'}
                      >
                        <ClipboardCopy className="h-4 w-4" />
                      </button>
                    </div>
                  </Row>
                  <Row label="ID">
                    <div className="rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 py-2 text-[11px] text-[rgb(var(--orb-muted-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      ID присвоен навсегда и не может быть сброшен
                    </div>
                  </Row>
                  <Row label="Статус">
                    <div className="rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">{statusText}</div>
                  </Row>

                  <Row label="Сигналинг">
                    <div className="rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">{peer.signalingHost || 'default'}</div>
                  </Row>
                  <div className="mt-2 text-xs text-[rgb(var(--orb-muted-rgb))]">
                    Сообщения передаются напрямую к другу. Если он оффлайн, сообщения дойдут, когда он появится в сети.
                  </div>
                </Section>
              ) : null}

              {screen === 'security' ? (
                <Section icon={Lock} title="Безопасность" subtitle="Шифрование и защита данных">
                  <div className="grid gap-3">
                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">ШИФРОВАНИЕ</div>
                      <div className="mt-3 grid gap-2">
                        <div className="flex items-center justify-between gap-3 py-1">
                          <div>
                            <div className="text-sm text-[rgb(var(--orb-text-rgb))]">AES-256-GCM</div>
                            <div className="text-[11px] text-[rgb(var(--orb-muted-rgb))]">Все сообщения зашифрованы, ключи неэкспортируемые</div>
                          </div>
                          <span className="rounded-full bg-[rgb(var(--orb-surface-rgb))]/60 px-2 py-0.5 text-[10px] text-[rgb(var(--orb-muted-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">встроено</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 py-1">
                          <div>
                            <div className="text-sm text-[rgb(var(--orb-text-rgb))]">PBKDF2-SHA256</div>
                            <div className="text-[11px] text-[rgb(var(--orb-muted-rgb))]">310 000 итераций, мастер-ключ из пароля</div>
                          </div>
                          <span className="rounded-full bg-[rgb(var(--orb-surface-rgb))]/60 px-2 py-0.5 text-[10px] text-[rgb(var(--orb-muted-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">встроено</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 py-1">
                          <div>
                            <div className="text-sm text-[rgb(var(--orb-text-rgb))]">E2E (ECDH P-256 + HKDF)</div>
                            <div className="text-[11px] text-[rgb(var(--orb-muted-rgb))]">Сессионные ключи для каждого чата</div>
                          </div>
                          <span className="rounded-full bg-[rgb(var(--orb-surface-rgb))]/60 px-2 py-0.5 text-[10px] text-[rgb(var(--orb-muted-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">встроено</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">ОТПЕЧАТОК КЛЮЧА</div>
                      <div className="mt-2 text-[11px] text-[rgb(var(--orb-muted-rgb))]">
                        SHA-256 от публичного ключа подписи. Сверь короткий отпечаток с другом по другому каналу (голос, QR), чтобы убедиться, что между вами нет MITM.
                      </div>
                      <div className="mt-3 grid gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/55 px-3 py-2 font-mono text-sm tracking-wider text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">
                            {localFingerprint ? shortFingerprint(localFingerprint) : '…'}
                          </div>
                          <button
                            type="button"
                            disabled={!localFingerprint || typeof navigator === 'undefined' || !navigator.clipboard}
                            onClick={async () => {
                              if (!localFingerprint) return;
                              try {
                                await navigator.clipboard.writeText(localFingerprint);
                                setFingerprintCopied(true);
                                setTimeout(() => setFingerprintCopied(false), 1500);
                              } catch (_) {}
                            }}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60"
                            aria-label="Копировать отпечаток"
                            title={fingerprintCopied ? 'Скопировано' : 'Копировать полный отпечаток'}
                          >
                            <ClipboardCopy className="h-4 w-4" />
                          </button>
                        </div>
                        {localFingerprint ? (
                          <div className="break-all rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 px-3 py-2 font-mono text-[10px] leading-relaxed text-[rgb(var(--orb-muted-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">
                            {localFingerprint}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">WIPE-ON-CLOSE</div>
                      <div className="mt-2 text-[11px] text-[rgb(var(--orb-muted-rgb))]">При закрытии вкладки полностью уничтожить базу данных. Режим «инкогнито на максималках».</div>
                      <div className="mt-3">
                        <Toggle
                          checked={wipeOnClose}
                          onChange={(v) => {
                            if (v && !window.confirm('При включении Wipe-on-Close вся история чатов будет удалена при закрытии вкладки. Включить?')) return;
                            setWipeOnClose(v);
                          }}
                          label={wipeOnClose ? 'включено' : 'выключено'}
                        />
                      </div>
                    </div>

                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">DURESS-ПАРОЛЬ</div>
                      <div className="mt-2 text-[11px] text-[rgb(var(--orb-muted-rgb))]">«Тревожный» пароль: при вводе мессенджер откроется, но мгновенно очистит все данные и список друзей.</div>
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="password"
                          value={duressPassword}
                          onChange={(e) => setDuressPassword(e.target.value)}
                          placeholder="Оставь пустым для отключения"
                          className="flex-1 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/55 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] placeholder:text-[rgb(var(--orb-muted-rgb))]/50 focus:outline-none focus:ring-[rgb(var(--orb-accent-rgb))]/50"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              const settings = JSON.parse(localStorage.getItem('orbit_settings') || '{}');
                              settings.duressPassword = duressPassword;
                              localStorage.setItem('orbit_settings', JSON.stringify(settings));
                              setDuressSaved('ok');
                              setTimeout(() => setDuressSaved(''), 1500);
                            } catch (_) {}
                          }}
                          className="inline-flex items-center gap-1 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                        >
                          {duressSaved === 'ok' ? '✓ Сохранено' : 'Сохранить'}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">АВТОБЛОКИРОВКА</div>
                      <div className="mt-2 text-[11px] text-[rgb(var(--orb-muted-rgb))]">Vault блокируется через 5 минут неактивности. Ключ шифрования удаляется из памяти — требуется повторный ввод пароля.</div>
                      <div className="mt-3">
                        <Toggle
                          checked={autoLockEnabled}
                          onChange={(v) => {
                            setAutoLockEnabled(v);
                            localStorage.setItem('orbits_auto_lock', v ? '1' : '0');
                          }}
                          label={autoLockEnabled ? 'включено (5 мин)' : 'выключено'}
                        />
                      </div>
                    </div>
                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">АВТОВХОД</div>
                      <div className="mt-2 text-[11px] text-[rgb(var(--orb-muted-rgb))]">Пропустить ввод пароля при открытии мессенджера. Удобно, но менее безопасно — любой с доступом к устройству сможет войти.</div>
                      <div className="mt-3">
                        <Toggle
                          checked={localStorage.getItem('orbits_auto_login') === '1'}
                          onChange={(v) => {
                            localStorage.setItem('orbits_auto_login', v ? '1' : '0');
                            // Force re-render
                            setAutoLockEnabled((prev) => prev);
                          }}
                          label={localStorage.getItem('orbits_auto_login') === '1' ? 'включено' : 'выключено'}
                        />
                      </div>
                    </div>

                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">TURN-ONLY (СКРЫТЬ IP)</div>
                      <div className="mt-2 text-[11px] text-[rgb(var(--orb-muted-rgb))]">Пускать звонки и файлы только через TURN-сервер — собеседник никогда не узнает ваш публичный IP. Требуется настроенный TURN в билде; иначе соединение не установится. Применяется к новым сессиям.</div>
                      <div className="mt-3">
                        <Toggle
                          checked={relayOnlyEnabled}
                          onChange={(v) => {
                            setRelayOnlyEnabled(v);
                            localStorage.setItem('orbits_relay_only', v ? '1' : '0');
                          }}
                          label={relayOnlyEnabled ? 'включено (только relay)' : 'выключено'}
                        />
                      </div>
                    </div>

                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">ЗАБЛОКИРОВАННЫЕ</div>
                      <div className="mt-2 text-[11px] text-[rgb(var(--orb-muted-rgb))]">Заблокированные пользователи не могут отправлять вам сообщения и звонки.</div>
                      <div className="mt-3 grid gap-2">
                        {peer.blockedPeers && peer.blockedPeers.length > 0 ? (
                          peer.blockedPeers.map((bid) => (
                            <div key={bid} className="flex items-center justify-between gap-2 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 py-2 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                              <span className="truncate text-xs text-[rgb(var(--orb-text-rgb))]">{bid}</span>
                              <button
                                type="button"
                                onClick={() => peer.unblockPeer?.(bid)}
                                className="shrink-0 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 px-3 py-1.5 text-[11px] text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                              >
                                Разблокировать
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="text-[11px] text-[rgb(var(--orb-muted-rgb))]">Нет заблокированных</div>
                        )}
                      </div>
                    </div>
                  </div>
                </Section>
              ) : null}

              {screen === 'chats' ? (
                <Section icon={MessageSquare} title="Чаты" subtitle="Оформление, поведение и история">
                  <div className="grid gap-3">
                    <ChatSettings chatPrefs={chatPrefs} onChange={setChatPrefs} />

                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Синхронизация сообщений</div>
                            <span className="rounded-full bg-[rgb(var(--orb-danger-rgb))]/15 px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--orb-danger-rgb))] ring-1 ring-[rgb(var(--orb-danger-rgb))]/25">BETA</span>
                          </div>
                          <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">Отправит очередь при наличии соединения. Функция экспериментальная — возможны сбои.</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => peer.flushAllOutbox()}
                          className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Запустить
                        </button>
                      </div>
                    </div>

                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Очистить очередь</div>
                          <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">Удалит все сообщения со статусом «ожидание»</div>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = window.confirm('Очистить очередь исходящих сообщений на этом устройстве?');
                            if (!ok) return;
                            await peer.clearOutbox?.();
                          }}
                          className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                        >
                          <Trash2 className="h-4 w-4 text-[rgb(var(--orb-danger-rgb))]" />
                          Очистить
                        </button>
                      </div>
                    </div>

                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Очистить старые сообщения</div>
                          <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">Удалит сообщения старше 30 дней</div>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = window.confirm('Удалить сообщения старше 30 дней на этом устройстве?');
                            if (!ok) return;
                            await peer.pruneOldMessages?.(30);
                          }}
                          className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                        >
                          <Trash2 className="h-4 w-4 text-[rgb(var(--orb-danger-rgb))]" />
                          Очистить
                        </button>
                      </div>
                    </div>

                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Хранилище</div>
                          <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">
                            {storageEstimate?.usage && storageEstimate?.quota
                              ? `Использовано ~${Math.round(storageEstimate.usage / 1024 / 1024)} MB из ~${Math.round(storageEstimate.quota / 1024 / 1024)} MB`
                              : 'Оценка недоступна в этом браузере'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (!navigator?.storage?.estimate) return;
                            navigator.storage.estimate().then((est) => setStorageEstimate(est || null)).catch(() => {});
                          }}
                          className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Обновить
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const ok = window.confirm('Удалить всю историю чатов на этом устройстве?');
                        if (!ok) return;
                        peer.clearAllHistory();
                      }}
                      className="flex items-center justify-between rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 px-4 py-4 ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                    >
                      <div className="flex items-start gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/35 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                          <Trash2 className="h-4 w-4 text-[rgb(var(--orb-danger-rgb))]" />
                        </div>
                        <div className="text-left">
                          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Удалить всю историю</div>
                          <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">Очистит сообщения и очередь</div>
                        </div>
                      </div>
                      <ChevronLeft className="h-4 w-4 rotate-180 text-[rgb(var(--orb-muted-rgb))]" />
                    </button>
                  </div>
                </Section>
              ) : null}

              {screen === 'notifications' ? (
                <Section icon={Bell} title="Уведомления" subtitle="Разрешения и предпочтения">
                  <div className="grid gap-3">
                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">РАЗРЕШЕНИЕ БРАУЗЕРА</div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm text-[rgb(var(--orb-text-rgb))]">Статус</div>
                          <div className="text-[11px] text-[rgb(var(--orb-muted-rgb))]">
                            {notifPermission === 'granted'
                              ? 'Уведомления разрешены'
                              : notifPermission === 'denied'
                                ? 'Заблокировано в настройках браузера'
                                : 'Не запрашивались'}
                          </div>
                        </div>
                        <span className={cx(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1',
                          notifPermission === 'granted'
                            ? 'bg-green-500/15 text-green-400 ring-green-500/25'
                            : notifPermission === 'denied'
                              ? 'bg-[rgb(var(--orb-danger-rgb))]/15 text-[rgb(var(--orb-danger-rgb))] ring-[rgb(var(--orb-danger-rgb))]/25'
                              : 'bg-[rgb(var(--orb-accent-rgb))]/15 text-[rgb(var(--orb-accent-rgb))] ring-[rgb(var(--orb-accent-rgb))]/25'
                        )}>
                          {notifPermission === 'granted' ? 'ACTIVE' : notifPermission === 'denied' ? 'BLOCKED' : 'DEFAULT'}
                        </span>
                      </div>
                      {notifPermission !== 'granted' && notifPermission !== 'denied' ? (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => { if (requestNotifPermission) requestNotifPermission(); }}
                            className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-3 py-2 text-xs font-semibold text-white ring-1 ring-[rgb(var(--orb-accent-rgb))]/40 transition-all duration-300 ease-in-out active:scale-95"
                          >
                            <Bell className="h-4 w-4" />
                            Разрешить уведомления
                          </button>
                        </div>
                      ) : null}
                      {notifPermission === 'denied' ? (
                        <div className="mt-2 text-[11px] text-[rgb(var(--orb-muted-rgb))]">
                          Чтобы включить, откройте настройки сайта в браузере и разрешите уведомления.
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">НАСТРОЙКИ</div>
                      <div className="mt-3 text-[11px] text-[rgb(var(--orb-muted-rgb))]">
                        Уведомления показываются только когда вкладка не в фокусе. Без push-сервера — всё локально.
                      </div>
                      <div className="mt-4">
                        <Toggle
                          checked={soundEnabled}
                          onChange={(v) => {
                            setSoundEnabled(v);
                            const s = getNotifSettings();
                            saveNotifSettings({ ...s, sound: v });
                          }}
                          label="Звуки уведомлений"
                        />
                      </div>
                    </div>
                  </div>
                </Section>
              ) : null}

              {screen === 'appearance' ? (
                <Section icon={Palette} title="Внешний вид" subtitle="Темы и акцент">
                  <Row label="Тема">
                    <div className="flex flex-wrap items-center gap-2">
                      {availableIds.map((id) => {
                        const meta = THEME_PICKER_META[id] || { label: id, icon: Palette };
                        const Icon = meta.icon;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setTheme(id)}
                            className={cx(
                              'inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs ring-1 transition-all duration-300 ease-in-out active:scale-95',
                              themeId === id
                                ? 'bg-[rgb(var(--orb-surface-rgb))]/70 text-[rgb(var(--orb-text-rgb))] ring-[rgb(var(--orb-border-rgb))]'
                                : 'bg-[rgb(var(--orb-bg-rgb))]/35 text-[rgb(var(--orb-muted-rgb))] ring-[rgb(var(--orb-border-rgb))] hover:bg-[rgb(var(--orb-surface-rgb))]/40 hover:text-[rgb(var(--orb-text-rgb))]'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {meta.label}
                          </button>
                        );
                      })}
                    </div>
                  </Row>

                  <Row label="Цвет акцента">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {[
                          { id: 'neon', label: 'Неон', hex: '#3b82f6' },
                          { id: 'uv', label: 'Ультрафиолет', hex: '#8b5cf6' },
                          { id: 'emerald', label: 'Изумруд', hex: '#22c55e' }
                        ].map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setAccentHex(p.hex)}
                            className={cx(
                              'inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs ring-1 transition-all duration-300 ease-in-out active:scale-95',
                              accentHex.toLowerCase() === p.hex.toLowerCase()
                                ? 'bg-[rgb(var(--orb-surface-rgb))]/70 text-[rgb(var(--orb-text-rgb))] ring-[rgb(var(--orb-border-rgb))]'
                                : 'bg-[rgb(var(--orb-bg-rgb))]/35 text-[rgb(var(--orb-muted-rgb))] ring-[rgb(var(--orb-border-rgb))] hover:bg-[rgb(var(--orb-surface-rgb))]/40 hover:text-[rgb(var(--orb-text-rgb))]'
                            )}
                          >
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.hex }} />
                            {p.label}
                          </button>
                        ))}

                        <label className="inline-flex flex-col items-center gap-1">
                          <input
                            type="color"
                            value={hexToRgbTuple(accentHex) ? accentHex : '#3b82f6'}
                            onChange={(e) => setAccentHex(e.target.value)}
                            className="h-10 w-14 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 ring-1 ring-[rgb(var(--orb-border-rgb))] cursor-pointer"
                            aria-label="Выбор цвета"
                            title="Кастомный цвет"
                          />
                          <span className="text-[10px] text-[rgb(var(--orb-muted-rgb))]">Свой цвет</span>
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAccentHex('')}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                        Сбросить
                      </button>
                    </div>
                  </Row>

                  <div className="mt-2 text-xs text-[rgb(var(--orb-muted-rgb))]">
                    Акцент влияет на кнопки, индикаторы и подсветки. Цвет сохраняется локально.
                  </div>
                </Section>
              ) : null}

              {screen === 'mic' ? (
                <Section icon={Mic2} title="Микрофон" subtitle="Выбор устройства и тест">
                  <div className="grid gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={requestMicPermission}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                      >
                        Разрешить микрофон
                      </button>
                      <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">{micGranted ? 'доступ есть' : 'нет доступа'}</div>
                    </div>

                    <Row label="Устройство">
                      <select
                        value={micDeviceId}
                        onChange={(e) => setMicDeviceId(e.target.value)}
                        className="h-11 max-w-[260px] rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                      >
                        {micDevices.length ? (
                          micDevices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label || 'Микрофон'}
                            </option>
                          ))
                        ) : (
                          <option value="">Нет устройств</option>
                        )}
                      </select>
                    </Row>

                    <fieldset disabled={!micGranted} className={!micGranted ? 'opacity-50' : ''}>
                    <Row label="Эхо">
                      <Toggle checked={echoCancellation} onChange={setEchoCancellation} label={echoCancellation ? 'вкл' : 'выкл'} />
                    </Row>
                    <Row label="Шумоподавление">
                      <Toggle checked={noiseSuppression} onChange={setNoiseSuppression} label={noiseSuppression ? 'вкл' : 'выкл'} />
                    </Row>
                    <Row label="Авто-усиление">
                      <Toggle checked={autoGainControl} onChange={setAutoGainControl} label={autoGainControl ? 'вкл' : 'выкл'} />
                    </Row>
                    </fieldset>
                    {!micGranted && <div className="text-[11px] text-[rgb(var(--orb-muted-rgb))]">Сначала разрешите доступ к микрофону</div>}

                    <div className="rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 p-3 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Тест уровня</div>
                          <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">Проверь, что звук идёт</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMicTesting((v) => !v)}
                          className={cx(
                            'inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs ring-1 transition-all duration-300 ease-in-out active:scale-95',
                            micTesting
                              ? 'bg-[rgb(var(--orb-danger-rgb))]/15 text-[rgb(var(--orb-danger-rgb))] ring-[rgb(var(--orb-danger-rgb))]/25'
                              : 'bg-[rgb(var(--orb-accent-rgb))] text-white ring-[rgb(var(--orb-accent-rgb))]/40'
                          )}
                        >
                          {micTesting ? 'Стоп' : 'Старт'}
                        </button>
                      </div>
                      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--orb-surface-rgb))]/70 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                        <div
                          className="h-full rounded-full bg-[rgb(var(--orb-accent-rgb))] transition-all duration-300 ease-in-out"
                          style={{ width: `${Math.round(micLevel * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Section>
              ) : null}

              {screen === 'power' ? (
                <Section icon={Zap} title="Энергосбережение" subtitle="Меньше blur и анимаций">
                  <Row label="Лёгкий режим">
                    <Toggle checked={powerSaver} onChange={setPowerSaver} label={powerSaver ? 'включён' : 'выключен'} />
                  </Row>
                  <div className="mt-2 text-xs text-[rgb(var(--orb-muted-rgb))]">
                    Этот режим отключает blur и снижает нагрузку анимаций. Полезно на слабых телефонах.
                  </div>
                </Section>
              ) : null}

              {screen === 'diagnostics' ? (
                <Section icon={Cpu} title="Диагностика" subtitle="PWA и Web Worker">
                  <div className="grid gap-3">
                    <div className="rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 p-3 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">PWA</div>
                          <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">Сервис-воркер: {swState.status}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={onCheckUpdate}
                            className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                          >
                            <RefreshCw className="h-4 w-4" />
                            Проверить
                          </button>
                          <button
                            type="button"
                            onClick={onReloadNow}
                            disabled={!swState.needRefresh}
                            className={cx(
                              'inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs ring-1 transition-all duration-300 ease-in-out active:scale-95',
                              swState.needRefresh
                                ? 'bg-[rgb(var(--orb-accent-rgb))] text-white ring-[rgb(var(--orb-accent-rgb))]/40'
                                : 'bg-[rgb(var(--orb-surface-rgb))]/60 text-[rgb(var(--orb-muted-rgb))] ring-[rgb(var(--orb-border-rgb))] opacity-60'
                            )}
                          >
                            <Zap className="h-4 w-4" />
                            Обновить
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-[rgb(var(--orb-muted-rgb))]">
                        <div>Обновление доступно: {swState.needRefresh ? 'да' : 'нет'}</div>
                        <div>Готово для оффлайна: {swState.offlineReady ? 'да' : 'нет'}</div>
                        <div>Версия приложения: <span className="font-mono text-[rgb(var(--orb-text-rgb))]">{appVersion}</span></div>
                        <div>Режим: {device.standalone ? 'установлено (standalone)' : 'в браузере'}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 p-3 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Устройство</div>
                      <div className="mt-2 grid gap-1 text-xs text-[rgb(var(--orb-muted-rgb))]">
                        <div>Платформа: <span className="text-[rgb(var(--orb-text-rgb))]">{device.platform}</span></div>
                        <div>Память: <span className="text-[rgb(var(--orb-text-rgb))]">{device.memoryGb == null ? '—' : `${device.memoryGb} GB`}</span></div>
                        <div>CPU: <span className="text-[rgb(var(--orb-text-rgb))]">{device.cores == null ? '—' : `${device.cores} потоков`}</span></div>
                        <details className="cursor-pointer">
                          <summary className="text-[rgb(var(--orb-muted-rgb))]">User-Agent (нажми для показа)</summary>
                          <div className="mt-1 break-all font-mono text-[11px] text-[rgb(var(--orb-muted-rgb))]">{device.userAgent}</div>
                        </details>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 p-3 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Веб-воркер</div>
                          <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">Статус: {worker.status}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={worker.ping}
                            className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                          >
                            <Activity className="h-4 w-4" />
                            Пинг
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              worker.stop();
                              setTimeout(() => worker.start(), 50);
                            }}
                            className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                          >
                            <Cpu className="h-4 w-4" />
                            Перезапуск
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-[rgb(var(--orb-muted-rgb))]">
                        <div>Последний heartbeat: {formatTimestamp(worker.lastHeartbeatTs, true)}</div>
                        <div>Последнее сообщение: {worker.lastMessage?.type || '—'}</div>
                        {worker.lastError ? <div className="text-[rgb(var(--orb-danger-rgb))]">Ошибка: {worker.lastError}</div> : null}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={worker.runDemo}
                          className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-3 py-2 text-xs font-semibold text-white ring-1 ring-[rgb(var(--orb-accent-rgb))]/40 transition-all duration-300 ease-in-out active:scale-95"
                        >
                          <Cpu className="h-4 w-4" />
                          Демо-нагрузка
                        </button>
                        <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">{worker.progress == null ? 'Прогресс: —' : `Прогресс: ${worker.progress}%`}</div>
                        <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">Результат: {worker.result == null ? '—' : `${Number(worker.result).toLocaleString('ru-RU')} ops`}</div>
                      </div>
                    </div>

                    <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">
                      Веб-воркер нужен, чтобы тяжёлые задачи (криптография, сжатие, синхронизация) не тормозили интерфейс.
                    </div>
                  </div>
                </Section>
              ) : null}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
