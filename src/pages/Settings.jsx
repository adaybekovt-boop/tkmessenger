import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, ChevronLeft, ClipboardCopy, Cpu, LogOut, MessageSquare, Mic2, Moon, Palette, PlugZap, RefreshCw, Shield, SlidersHorizontal, Sparkles, Trash2, UserRound, Zap } from 'lucide-react';
import { useOrbitsWorker } from '../hooks/useOrbitsWorker.js';
import { usePeerContext } from '../context/PeerContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function cx(...v) {
  return v.filter(Boolean).join(' ');
}

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
    <section className="rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/30 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
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
      <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">Orbits</div>
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

export default function Settings({ swState, onCheckUpdate, onReloadNow, theme, setTheme, powerSaver, setPowerSaver }) {
  const worker = useOrbitsWorker();
  const peer = usePeerContext();
  const auth = useAuth();
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const [screen, setScreen] = useState('home');

  const [copied, setCopied] = useState(false);
  const peerIdLabel = peer.peerId || '…';

  const [accentHex, setAccentHex] = useState(() => localStorage.getItem('orbits_accent_hex') || '');

  const [chatPrefs, setChatPrefs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('orbits_chat_prefs_v1') || '{"showSeconds":false}');
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
    return peer.status;
  }, [peer.error, peer.status]);

  const mic = useMemo(() => {
    const stored = localStorage.getItem('orbits_mic_settings_v1');
    try {
      return stored ? JSON.parse(stored) : {};
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
        : screen === 'chats'
          ? 'Чаты'
        : screen === 'appearance'
          ? 'Внешний вид'
          : screen === 'mic'
            ? 'Микрофон'
            : screen === 'power'
              ? 'Энергосбережение'
              : 'Диагностика';

  const subtitle =
    screen === 'home'
      ? 'Разделы настроек'
      : screen === 'profile'
        ? 'PeerJS ID и статус соединения'
        : screen === 'chats'
          ? 'Настройка чатов и история'
        : screen === 'appearance'
          ? 'Темы и акцент'
          : screen === 'mic'
            ? 'Устройство и тест уровня'
            : screen === 'power'
              ? 'Blur и анимации'
              : 'PWA и Web Worker';

  const back = screen === 'home' ? null : () => setScreen('home');

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[rgb(var(--orb-bg-rgb))]">
      <NavHeader title={title} subtitle={subtitle} onBack={back} />

      <div className="orb-scroll flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto w-full max-w-3xl">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={screen}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="grid gap-4"
            >
              {screen === 'home' ? (
                <>
                  <div className="grid gap-3">
                    <ActionCard icon={Shield} title="Профиль и сеть" subtitle={`Твой ID и статус (${online ? 'онлайн' : 'оффлайн'})`} onClick={() => setScreen('profile')} />
                    <ActionCard icon={MessageSquare} title="Чаты" subtitle="Настройка чатов, синхронизация, очистка" onClick={() => setScreen('chats')} />
                    <ActionCard icon={Palette} title="Внешний вид" subtitle="Темы и цвет акцента" onClick={() => setScreen('appearance')} />
                    <ActionCard icon={Mic2} title="Микрофон" subtitle="Устройство, эффекты и тест" onClick={() => setScreen('mic')} />
                    <ActionCard icon={Zap} title="Энергосбережение" subtitle="Уменьшить blur и анимации" onClick={() => setScreen('power')} />
                    <ActionCard icon={Cpu} title="Диагностика" subtitle="PWA и Web Worker" onClick={() => setScreen('diagnostics')} />
                  </div>
                </>
              ) : null}

              {screen === 'profile' ? (
                <Section icon={Shield} title="Профиль и сеть" subtitle="PeerJS ID и состояние">
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
                      onChange={(e) => setProfileDisplayName(e.target.value)}
                      className="h-11 w-[260px] max-w-full rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                      placeholder="Имя"
                    />
                  </Row>

                  <Row label="Описание">
                    <textarea
                      value={profileBio}
                      onChange={(e) => setProfileBio(e.target.value)}
                      rows={3}
                      className="w-[320px] max-w-full rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                      placeholder="Пара строк о себе"
                    />
                  </Row>

                  <Row label="Аватар">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setProfileAvatar(e.target.files?.[0] || null)}
                      className="text-xs text-[rgb(var(--orb-muted-rgb))]"
                    />
                  </Row>

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await auth.updateProfile({ displayName: profileDisplayName, bio: profileBio, avatarFile: profileAvatar });
                          setProfileAvatar(null);
                          setProfileSaved('Сохранено');
                          setTimeout(() => setProfileSaved(''), 1200);
                        } catch (_) {
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-3 py-2 text-xs font-semibold text-white ring-1 ring-[rgb(var(--orb-accent-rgb))]/40 transition-all duration-300 ease-in-out active:scale-95"
                    >
                      <UserRound className="h-4 w-4" />
                      Сохранить профиль
                    </button>

                    <button
                      type="button"
                      onClick={() => auth.setAutoLogin(!auth.autoLoginEnabled)}
                      className={cx(
                        'inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs ring-1 transition-all duration-300 ease-in-out active:scale-95',
                        auth.autoLoginEnabled
                          ? 'bg-[rgb(var(--orb-accent-rgb))] text-white ring-[rgb(var(--orb-accent-rgb))]/40'
                          : 'bg-[rgb(var(--orb-bg-rgb))]/45 text-[rgb(var(--orb-text-rgb))] ring-[rgb(var(--orb-border-rgb))]'
                      )}
                      aria-pressed={auth.autoLoginEnabled}
                    >
                      <Shield className="h-4 w-4" />
                      Автовход: {auth.autoLoginEnabled ? 'вкл' : 'выкл'}
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
                  </div>

                  <Row label="Твой Peer ID">
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
                  <Row label="Статус">
                    <div className="rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">{statusText}</div>
                  </Row>
                  <div className="mt-2 text-xs text-[rgb(var(--orb-muted-rgb))]">
                    Важно: PeerJS — это P2P. Если собеседник оффлайн, сообщение уйдёт в очередь и доставится при появлении связи.
                  </div>
                </Section>
              ) : null}

              {screen === 'chats' ? (
                <Section icon={MessageSquare} title="Чаты" subtitle="Настройка и история">
                  <div className="grid gap-3">
                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">ПРИМЕР ЧАТА</div>
                      <div className="mt-3 grid gap-2">
                        <div className="flex justify-start">
                          <div className="max-w-[92%] rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/70 px-4 py-3 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">
                            <div>Привет! Это пример оформления.</div>
                            <div className="mt-1 text-[11px] text-[rgb(var(--orb-muted-rgb))]">{new Date().toLocaleTimeString('ru-RU', chatPrefs.showSeconds ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <div className="max-w-[92%] rounded-3xl bg-[rgb(var(--orb-accent-rgb))]/18 px-4 py-3 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-accent-rgb))]/30">
                            <div>Здесь можно настроить удобство под себя.</div>
                            <div className="mt-1 text-[11px] text-[rgb(var(--orb-muted-rgb))]">{new Date().toLocaleTimeString('ru-RU', chatPrefs.showSeconds ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Row label="Показывать секунды">
                      <Toggle
                        checked={!!chatPrefs.showSeconds}
                        onChange={(v) => setChatPrefs((p) => ({ ...p, showSeconds: v }))}
                        label={chatPrefs.showSeconds ? 'включено' : 'выключено'}
                      />
                    </Row>

                    <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Синхронизация сообщений</div>
                            <span className="rounded-full bg-[rgb(var(--orb-danger-rgb))]/15 px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--orb-danger-rgb))] ring-1 ring-[rgb(var(--orb-danger-rgb))]/25">BETA</span>
                          </div>
                          <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">Отправит очередь при наличии соединения</div>
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

              {screen === 'appearance' ? (
                <Section icon={Palette} title="Внешний вид" subtitle="Темы и акцент">
                  <Row label="Тема">
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { id: 'obsidian', label: 'Obsidian', icon: Moon },
                        { id: 'sakura', label: 'Sakura', icon: Sparkles },
                        { id: 'matrix', label: 'Matrix', icon: PlugZap }
                      ].map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setTheme(id)}
                          className={cx(
                            'inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs ring-1 transition-all duration-300 ease-in-out active:scale-95',
                            theme === id
                              ? 'bg-[rgb(var(--orb-surface-rgb))]/70 text-[rgb(var(--orb-text-rgb))] ring-[rgb(var(--orb-border-rgb))]'
                              : 'bg-[rgb(var(--orb-bg-rgb))]/35 text-[rgb(var(--orb-muted-rgb))] ring-[rgb(var(--orb-border-rgb))] hover:bg-[rgb(var(--orb-surface-rgb))]/40 hover:text-[rgb(var(--orb-text-rgb))]'
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </Row>

                  <Row label="Цвет акцента">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={hexToRgbTuple(accentHex) ? accentHex : '#3b82f6'}
                        onChange={(e) => setAccentHex(e.target.value)}
                        className="h-10 w-14 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 ring-1 ring-[rgb(var(--orb-border-rgb))]"
                        aria-label="Выбор цвета"
                      />
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

                    <Row label="Эхо">
                      <Toggle checked={echoCancellation} onChange={setEchoCancellation} label={echoCancellation ? 'вкл' : 'выкл'} />
                    </Row>
                    <Row label="Шумоподавление">
                      <Toggle checked={noiseSuppression} onChange={setNoiseSuppression} label={noiseSuppression ? 'вкл' : 'выкл'} />
                    </Row>
                    <Row label="Авто-усиление">
                      <Toggle checked={autoGainControl} onChange={setAutoGainControl} label={autoGainControl ? 'вкл' : 'выкл'} />
                    </Row>

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
                        <div>Последний heartbeat: {formatTime(worker.lastHeartbeatTs)}</div>
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
                        <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">Результат: {worker.result == null ? '—' : String(worker.result)}</div>
                      </div>
                    </div>

                    <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">
                      Веб-воркер нужен, чтобы тяжёлые задачи (криптография, сжатие, синхронизация) не тормозили интерфейс.
                    </div>
                  </div>
                </Section>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
