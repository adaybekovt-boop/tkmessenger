import { useEffect, useMemo, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { MessageSquare, Radar, Settings2, Wifi, WifiOff, RefreshCw, Zap, Activity, Shield, Key } from 'lucide-react';
import OrbitsLogo from './components/OrbitsLogo.jsx';
import { useOrbitsWorker } from './hooks/useOrbitsWorker.js';
import { AppProvider } from './context/AppContext.jsx';

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function TabButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors duration-300 ' +
        (active
          ? 'bg-obsidian-surface text-obsidian-text ring-1 ring-obsidian-border'
          : 'text-obsidian-muted hover:bg-obsidian-surface/50 hover:text-obsidian-text')
      }
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Pill({ tone = 'neutral', children }) {
  const cls =
    tone === 'good'
      ? 'bg-obsidian-success/15 text-obsidian-success ring-1 ring-obsidian-success/25'
      : tone === 'bad'
        ? 'bg-obsidian-danger/15 text-obsidian-danger ring-1 ring-obsidian-danger/25'
        : 'bg-obsidian-surface text-obsidian-muted ring-1 ring-obsidian-border';
  return <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${cls}`}>{children}</span>;
}

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-obsidian-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-softPulse">
          <OrbitsLogo />
        </div>
        <div className="text-xs text-obsidian-muted">Подготовка оболочки…</div>
      </div>
    </div>
  );
}

function ChatsView() {
  const peers = useMemo(() => {
    return [
      { id: 'ORBIT-ALPHA', status: 'online', last: 'Готов к рукопожатию' },
      { id: 'ORBIT-BETA', status: 'offline', last: 'Нет сигнала' },
      { id: 'ORBIT-GAMMA', status: 'online', last: 'Отправь тестовое сообщение' }
    ];
  }, []);

  const [selected, setSelected] = useState(peers[0]?.id || '');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState(() => {
    return [
      { from: 'system', text: 'Фаза 0: UI-оболочка готова. Дальше подключим P2P-ядро.', ts: Date.now() - 12_000 },
      { from: 'peer', text: 'Проверим канал сообщений и прокрутку внутри окна.', ts: Date.now() - 7_000 }
    ];
  });

  const activePeer = peers.find((p) => p.id === selected) || peers[0];

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [{ from: 'me', text, ts: Date.now() }, ...m].slice(0, 200));
    setDraft('');
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside className="hidden md:flex w-[320px] shrink-0 flex-col border-r border-obsidian-border bg-obsidian-bg">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-obsidian-text">Чаты</div>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-xs text-obsidian-muted hover:bg-obsidian-surface/50 hover:text-obsidian-text transition-colors duration-300"
            >
              Добавить
            </button>
          </div>
          <div className="mt-3">
            <input
              value={''}
              readOnly
              placeholder="Поиск (Фаза 0)"
              className="w-full rounded-xl bg-obsidian-surface/40 px-3 py-2 text-sm text-obsidian-muted ring-1 ring-obsidian-border"
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto px-2 pb-3">
          {peers.map((p) => {
            const isActive = p.id === selected;
            const online = p.status === 'online';
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className={
                  'w-full rounded-xl px-3 py-3 text-left transition-colors duration-300 ' +
                  (isActive ? 'bg-obsidian-surface ring-1 ring-obsidian-border' : 'hover:bg-obsidian-surface/50')
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-obsidian-text">{p.id}</div>
                    <div className="truncate text-xs text-obsidian-muted">{p.last}</div>
                  </div>
                  <div className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-obsidian-success' : 'bg-obsidian-border'}`} />
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-obsidian-bg">
        <div className="flex items-center justify-between border-b border-obsidian-border px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-obsidian-text">{activePeer?.id || 'Чат'}</div>
            <div className="text-xs text-obsidian-muted">{activePeer?.status === 'online' ? 'в сети' : 'не в сети'}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-xl bg-obsidian-surface px-3 py-2 text-xs text-obsidian-text ring-1 ring-obsidian-border hover:bg-obsidian-surface/80 transition-colors duration-300"
            >
              Вызов
            </button>
            <button
              type="button"
              className="rounded-xl bg-obsidian-surface px-3 py-2 text-xs text-obsidian-text ring-1 ring-obsidian-border hover:bg-obsidian-surface/80 transition-colors duration-300"
            >
              Файлы
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-4">
          <div className="mx-auto flex w-full max-w-3xl flex-col-reverse gap-2">
            {messages.map((m) => {
              const mine = m.from === 'me';
              const bubble = mine
                ? 'bg-obsidian-accent/20 text-obsidian-text ring-1 ring-obsidian-accent/30'
                : m.from === 'system'
                  ? 'bg-obsidian-surface/70 text-obsidian-muted ring-1 ring-obsidian-border'
                  : 'bg-obsidian-surface text-obsidian-text ring-1 ring-obsidian-border';
              return (
                <div key={m.ts} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm ${bubble}`}>
                    <div className="whitespace-pre-wrap break-words">{m.text}</div>
                    <div className="mt-1 text-[11px] text-obsidian-muted">{formatTime(m.ts)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-obsidian-border px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={1}
              placeholder="Сообщение…"
              className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl bg-obsidian-surface/40 px-4 py-3 text-sm text-obsidian-text ring-1 ring-obsidian-border placeholder:text-obsidian-muted focus:bg-obsidian-surface/60 transition-colors duration-300"
            />
            <button
              type="button"
              onClick={send}
              className="h-11 rounded-2xl bg-obsidian-accent px-4 text-sm font-semibold text-white shadow-glow transition-transform duration-300 active:scale-[0.98]"
            >
              Отправить
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function RadarView() {
  const [scanning, setScanning] = useState(true);
  const [found, setFound] = useState([]);

  useEffect(() => {
    if (!scanning) return;
    const ids = ['ORBIT-ALPHA', 'ORBIT-GAMMA', 'ORBIT-DELTA', 'ORBIT-SIGMA'];
    let i = 0;
    const t = setInterval(() => {
      setFound((f) => {
        const next = ids[i % ids.length];
        i++;
        if (f.includes(next)) return f;
        return [next, ...f].slice(0, 8);
      });
    }, 900);
    return () => clearInterval(t);
  }, [scanning]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-obsidian-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-obsidian-text">Радар</div>
          <div className="text-xs text-obsidian-muted">Поиск пиров поблизости (демо-анимация)</div>
        </div>
        <button
          type="button"
          onClick={() => setScanning((s) => !s)}
          className="rounded-xl bg-obsidian-surface px-3 py-2 text-xs text-obsidian-text ring-1 ring-obsidian-border hover:bg-obsidian-surface/80 transition-colors duration-300"
        >
          {scanning ? 'Остановить' : 'Сканировать'}
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
        <div className="relative h-[280px] w-[280px]">
          <div className="absolute inset-0 rounded-full bg-obsidian-surface/40 ring-1 ring-obsidian-border" />
          <div className="absolute inset-6 rounded-full ring-1 ring-obsidian-border/70" />
          <div className="absolute inset-12 rounded-full ring-1 ring-obsidian-border/50" />
          <div className="absolute inset-0 rounded-full">
            <div
              className={
                'absolute left-1/2 top-1/2 h-[130px] w-[130px] -translate-x-1/2 -translate-y-1/2 origin-top-left ' +
                (scanning ? 'animate-radarSweep' : '')
              }
              style={{
                background:
                  'conic-gradient(from 90deg, rgba(59,130,246,0) 0deg, rgba(59,130,246,0.18) 22deg, rgba(59,130,246,0) 60deg)'
              }}
            />
          </div>
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-obsidian-accent shadow-glow" />
        </div>

        <div className="w-full max-w-md rounded-2xl bg-obsidian-surface/30 p-4 ring-1 ring-obsidian-border">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-obsidian-text">Результаты</div>
            <Pill tone={scanning ? 'good' : 'neutral'}>{scanning ? 'Сканирование' : 'Пауза'}</Pill>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {found.length ? (
              found.map((id) => (
                <div key={id} className="rounded-xl bg-obsidian-bg/40 px-3 py-2 text-xs text-obsidian-text ring-1 ring-obsidian-border">
                  {id}
                </div>
              ))
            ) : (
              <div className="col-span-2 text-xs text-obsidian-muted">Пока никого не найдено…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsView({ swState, onCheckUpdate, onReloadNow }) {
  const worker = useOrbitsWorker();
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-obsidian-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-obsidian-text">Настройки</div>
          <div className="text-xs text-obsidian-muted">PWA и диагностика воркера</div>
        </div>
        <Pill tone={online ? 'good' : 'bad'}>
          {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {online ? 'Онлайн' : 'Оффлайн'}
        </Pill>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="mx-auto grid w-full max-w-3xl gap-4">
          <div className="rounded-2xl bg-obsidian-surface/30 p-4 ring-1 ring-obsidian-border">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-obsidian-text">PWA</div>
                <div className="text-xs text-obsidian-muted">Сервис-воркер: {swState.status}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCheckUpdate}
                  className="inline-flex items-center gap-2 rounded-xl bg-obsidian-surface px-3 py-2 text-xs text-obsidian-text ring-1 ring-obsidian-border hover:bg-obsidian-surface/80 transition-colors duration-300"
                >
                  <RefreshCw className="h-4 w-4" />
                  Проверить
                </button>
                <button
                  type="button"
                  onClick={onReloadNow}
                  disabled={!swState.needRefresh}
                  className={
                    'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs ring-1 transition-colors duration-300 ' +
                    (swState.needRefresh
                      ? 'bg-obsidian-accent text-white ring-obsidian-accent/40'
                      : 'bg-obsidian-surface text-obsidian-muted ring-obsidian-border opacity-60')
                  }
                >
                  <Zap className="h-4 w-4" />
                  Обновить
                </button>
              </div>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-obsidian-muted">
              <div>Обновление доступно: {swState.needRefresh ? 'да' : 'нет'}</div>
              <div>Готово для оффлайна: {swState.offlineReady ? 'да' : 'нет'}</div>
            </div>
          </div>

          <div className="rounded-2xl bg-obsidian-surface/30 p-4 ring-1 ring-obsidian-border">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-obsidian-text">Веб-воркер</div>
                <div className="text-xs text-obsidian-muted">Статус: {worker.status}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={worker.ping}
                  className="inline-flex items-center gap-2 rounded-xl bg-obsidian-surface px-3 py-2 text-xs text-obsidian-text ring-1 ring-obsidian-border hover:bg-obsidian-surface/80 transition-colors duration-300"
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
                  className="rounded-xl bg-obsidian-surface px-3 py-2 text-xs text-obsidian-text ring-1 ring-obsidian-border hover:bg-obsidian-surface/80 transition-colors duration-300"
                >
                  Перезапуск
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-2 text-xs text-obsidian-muted">
              <div>Последний heartbeat: {formatTime(worker.lastHeartbeatTs)}</div>
              <div>Последнее сообщение: {worker.lastMessage?.type || '—'}</div>
              {worker.lastError ? <div className="text-obsidian-danger">Ошибка: {worker.lastError}</div> : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={worker.runDemo}
                className="rounded-xl bg-obsidian-accent px-3 py-2 text-xs font-semibold text-white ring-1 ring-obsidian-accent/40 transition-transform duration-300 active:scale-[0.98]"
              >
                Запустить демо-нагрузку
              </button>
              <div className="text-xs text-obsidian-muted">
                {worker.progress == null ? 'Прогресс: —' : `Прогресс: ${worker.progress}%`}
              </div>
              <div className="text-xs text-obsidian-muted">Результат: {worker.result == null ? '—' : String(worker.result)}</div>
            </div>
          </div>

          <div className="rounded-2xl bg-obsidian-surface/30 p-4 ring-1 ring-obsidian-border">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-obsidian-text">
                  <Shield className="h-4 w-4" />
                  Криптография (Phase 1)
                </div>
                <div className="text-xs text-obsidian-muted">
                  Бэкенд: {worker.cryptoBackend || 'не определён'}
                </div>
              </div>
              <Pill tone={worker.cryptoReady ? 'good' : 'neutral'}>
                <Key className="h-3.5 w-3.5" />
                {worker.cryptoReady ? 'Готово' : 'Не инициализировано'}
              </Pill>
            </div>

            <div className="mt-3 grid gap-2 text-xs text-obsidian-muted">
              <div>Статус крипто: {worker.cryptoReady ? 'ключи сгенерированы' : 'ожидание инициализации'}</div>
              <div>Публичный ключ: {worker.publicKey ? worker.publicKey.slice(0, 24) + '…' : '—'}</div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => worker.initCrypto(false)}
                disabled={worker.cryptoReady}
                className={
                  'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ring-1 transition-transform duration-300 active:scale-[0.98] ' +
                  (worker.cryptoReady
                    ? 'bg-obsidian-surface text-obsidian-muted ring-obsidian-border opacity-60'
                    : 'bg-obsidian-success text-white ring-obsidian-success/40')
                }
              >
                <Key className="h-4 w-4" />
                Инициализировать крипто
              </button>
              <button
                type="button"
                onClick={() => worker.initCrypto(true)}
                className="rounded-xl bg-obsidian-danger/80 px-3 py-2 text-xs font-semibold text-white ring-1 ring-obsidian-danger/40 transition-transform duration-300 active:scale-[0.98]"
              >
                Перегенерировать ключи
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('chats');
  const [booting, setBooting] = useState(true);
  const [swState, setSwState] = useState({ status: 'инициализация', needRefresh: false, offlineReady: false });
  const [reloadNowFn, setReloadNowFn] = useState(() => () => {});
  const [checkUpdateFn, setCheckUpdateFn] = useState(() => () => {});

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 650);
    return () => clearTimeout(t);
  }, []);

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

  return (
    <AppProvider>
      <div
        className="relative h-[100dvh] w-full overflow-hidden bg-obsidian-bg text-obsidian-text"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      >
        {booting ? <LoadingOverlay /> : null}

        <header className="flex h-14 items-center justify-between border-b border-obsidian-border bg-obsidian-bg px-4">
          <OrbitsLogo />
          <div className="hidden sm:flex items-center gap-2">
            <Pill tone={swState.offlineReady ? 'good' : 'neutral'}>PWA: {swState.offlineReady ? 'оффлайн готов' : 'активен'}</Pill>
          </div>
        </header>

        <main className="h-[calc(100dvh-56px-76px)] w-full overflow-hidden">
          {tab === 'chats' ? <ChatsView /> : null}
          {tab === 'radar' ? <RadarView /> : null}
          {tab === 'settings' ? (
            <SettingsView swState={swState} onCheckUpdate={checkUpdateFn} onReloadNow={reloadNowFn} />
          ) : null}
        </main>

        <nav
          className="flex h-[76px] items-center gap-2 border-t border-obsidian-border bg-obsidian-bg px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3"
          role="navigation"
          aria-label="Навигация"
        >
          <TabButton active={tab === 'chats'} icon={MessageSquare} label="Чаты" onClick={() => setTab('chats')} />
          <TabButton active={tab === 'radar'} icon={Radar} label="Радар" onClick={() => setTab('radar')} />
          <TabButton active={tab === 'settings'} icon={Settings2} label="Настройки" onClick={() => setTab('settings')} />
        </nav>
      </div>
    </AppProvider>
  );
}
