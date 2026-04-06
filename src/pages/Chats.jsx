import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, MessageSquare, Send, UserPlus2, X } from 'lucide-react';
import { usePeerContext } from '../context/PeerContext.jsx';

function cx(...v) {
  return v.filter(Boolean).join(' ');
}

function formatTime(ts, showSeconds) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('ru-RU', showSeconds ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
}

function safeJsonParse(value, fallback) {
  if (value == null) return fallback;
  try {
    const parsed = JSON.parse(value);
    if (parsed == null || typeof parsed !== 'object') return fallback;
    return parsed;
  } catch (_) {
    return fallback;
  }
}

function Avatar({ profile, fallback }) {
  if (profile?.avatarDataUrl) {
    return <img alt="" src={profile.avatarDataUrl} className="h-10 w-10 rounded-2xl object-cover ring-1 ring-[rgb(var(--orb-border-rgb))]" />;
  }
  const letter = String(fallback || '?').trim().charAt(0).toUpperCase() || 'O';
  return (
    <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 text-sm font-semibold text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">
      {letter}
    </div>
  );

}

function StatusDot({ status }) {
  const cls =
    status === 'online'
      ? 'bg-[rgb(var(--orb-success-rgb))]'
      : status === 'connecting'
        ? 'bg-[rgb(var(--orb-accent-rgb))]'
        : 'bg-[rgb(var(--orb-border-rgb))]';
  return <div className={cx('h-2.5 w-2.5 rounded-full', cls)} />;
}

function PeerRow({ peer, active, onClick }) {
  const peerCtx = usePeerContext();
  const prof = peerCtx.profilesByPeer?.[peer.id] || null;
  const display = prof?.displayName || peer.id;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'w-full rounded-2xl px-3 py-3 text-left transition-all duration-300 ease-in-out active:scale-95',
        active
          ? 'bg-[rgb(var(--orb-surface-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]'
          : 'hover:bg-[rgb(var(--orb-surface-rgb))]/50'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar profile={prof} fallback={display} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">{display}</div>
          <div className="truncate text-xs text-[rgb(var(--orb-muted-rgb))]">
            {peer.status === 'online' ? 'в сети' : peer.status === 'connecting' ? 'подключение…' : 'не в сети'}
          </div>
        </div>
        </div>
        <StatusDot status={peer.status} />
      </div>
    </button>
  );
}

function ConnectBar({ onConnect }) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');

  const submit = async () => {
    const id = value.trim();
    if (!id) return;
    setErr('');
    try {
      await onConnect(id);
      setValue('');
    } catch (e) {
      setErr(e?.message ? String(e.message) : 'Не удалось подключиться');
    }
  };

  return (
    <div className="rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 p-3 ring-1 ring-[rgb(var(--orb-border-rgb))]">
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Введите ID друга"
          className="h-11 flex-1 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] placeholder:text-[rgb(var(--orb-muted-rgb))] focus:ring-[rgb(var(--orb-accent-rgb))]/50 transition-all duration-300 ease-in-out"
        />
        <button
          type="button"
          onClick={submit}
          className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-4 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_28px_rgba(59,130,246,0.18)] transition-all duration-300 ease-in-out active:scale-95"
        >
          <UserPlus2 className="h-4 w-4" />
          Подключить
        </button>
      </div>
      {err ? <div className="mt-2 text-xs text-[rgb(var(--orb-danger-rgb))]">{err}</div> : null}
    </div>
  );
}

function MessageBubble({ msg, mine, showSeconds }) {
  const bubble = mine
    ? 'bg-[rgb(var(--orb-accent-rgb))]/18 ring-1 ring-[rgb(var(--orb-accent-rgb))]/30'
    : 'bg-[rgb(var(--orb-surface-rgb))]/70 ring-1 ring-[rgb(var(--orb-border-rgb))]';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cx('flex', mine ? 'justify-end' : 'justify-start')}
    >
      <div className={cx('max-w-[92%] rounded-3xl px-4 py-3 text-sm text-[rgb(var(--orb-text-rgb))]', bubble)}>
        <div className="whitespace-pre-wrap break-words">{msg.text}</div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[rgb(var(--orb-muted-rgb))]">
          <span>{formatTime(msg.ts, showSeconds)}</span>
          {mine && msg.delivery === 'queued' ? <span className="text-[rgb(var(--orb-danger-rgb))]">в очереди</span> : null}
        </div>
      </div>
    </motion.div>
  );
}

export default function Chats() {
  const peer = usePeerContext();
  const [draft, setDraft] = useState('');
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [chatPrefs, setChatPrefs] = useState(() => safeJsonParse(localStorage.getItem('orbits_chat_prefs_v1'), { showSeconds: false }));
  const list = useMemo(() => {
    const sorted = peer.peers.slice().sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
    if (peer.selectedPeerId && !sorted.some((p) => p.id === peer.selectedPeerId)) {
      sorted.unshift({ id: peer.selectedPeerId, status: 'offline', lastSeenAt: 0 });
    }
    return sorted;
  }, [peer.peers, peer.selectedPeerId]);

  const activeId = peer.selectedPeerId || list[0]?.id || '';
  const messages = peer.messagesByPeer[activeId] || [];
  const activeProfile = activeId ? peer.profilesByPeer?.[activeId] : null;
  const headerName = activeProfile?.displayName || activeId || 'Чаты';
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('orbits_chat_prefs_v1', JSON.stringify(chatPrefs));
    } catch (_) {
    }
  }, [chatPrefs]);

  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [activeId, messages.length]);

  const send = () => {
    if (!activeId) return;
    const text = draft.trim();
    if (!text) return;
    peer.sendText(activeId, text);
    setDraft('');
  };


  const Sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4">
        <ConnectBar onConnect={peer.connect} />
      </div>
      <div className="px-4 pt-4 pb-2">
        <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">КОНТАКТЫ</div>
      </div>
      <div className="orb-scroll flex-1 overflow-y-auto px-2 pb-3">
        {list.length ? (
          list.map((p) => (
            <PeerRow
              key={p.id}
              peer={p}
              active={p.id === activeId}
              onClick={() => {
                peer.setSelectedPeerId(p.id);
                setMobileListOpen(false);
              }}
            />
          ))
        ) : (
          <div className="px-4 py-6 text-sm text-[rgb(var(--orb-muted-rgb))]">Контактов нет.<br/>Введи ID друга выше, чтобы начать чат!</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside className="hidden w-[340px] shrink-0 border-r border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))] md:block">
        {Sidebar}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-[rgb(var(--orb-bg-rgb))]">
        <div className="orb-blur flex items-center justify-between gap-3 border-b border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/70 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileListOpen(true)}
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
              aria-label="Открыть список"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!activeId) return;
                setProfileOpen(true);
              }}
              className="flex min-w-0 items-center gap-3 rounded-2xl px-2 py-1 transition-all duration-300 ease-in-out active:scale-95 hover:bg-[rgb(var(--orb-surface-rgb))]/30"
              aria-label="Открыть профиль"
            >
              <Avatar profile={activeProfile} fallback={headerName} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">{headerName}</div>
                <div className="text-xs text-[rgb(var(--orb-muted-rgb))]">{peer.connectionStatusByPeer.get(activeId) || '—'}</div>
              </div>
            </button>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-[rgb(var(--orb-muted-rgb))]">
            <span>Твой ID:</span>
            <span className="font-mono text-[rgb(var(--orb-text-rgb))]">{peer.peerId || '…'}</span>
          </div>
        </div>

        <div ref={scrollRef} className="orb-scroll flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} mine={m.from === peer.peerId} showSeconds={!!chatPrefs.showSeconds} />
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="orb-blur border-t border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/70 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={1}
              placeholder={activeId ? 'Сообщение…' : 'Выберите контакт для общения…'}
              disabled={!activeId}
              className="max-h-32 min-h-[46px] flex-1 resize-none rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/55 px-4 py-3 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] placeholder:text-[rgb(var(--orb-muted-rgb))] transition-all duration-300 ease-in-out disabled:opacity-60"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={!activeId}
              className="inline-flex h-11 items-center gap-2 rounded-3xl bg-[rgb(var(--orb-accent-rgb))] px-4 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_28px_rgba(59,130,246,0.18)] transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              Отправить
            </button>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {mobileListOpen ? (
          <motion.div
            className="fixed inset-0 z-50 bg-black/55 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileListOpen(false)}
          >
            <motion.div
              className="absolute inset-y-0 left-0 w-[92%] max-w-[380px] bg-[rgb(var(--orb-bg-rgb))]"
              initial={{ x: -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -40, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="orb-blur flex items-center justify-between border-b border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/70 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setMobileListOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                  aria-label="Назад"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Контакты</div>
                <button
                  type="button"
                  onClick={() => setMobileListOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                  aria-label="Закрыть"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {Sidebar}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {profileOpen && activeId ? (
          <motion.div
            className="fixed inset-0 z-50 bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setProfileOpen(false)}
          >
            <motion.div
              className="orb-blur absolute inset-x-0 bottom-0 rounded-t-[28px] border-t border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/80"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Профиль</div>
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                  aria-label="Закрыть"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="orb-scroll max-h-[78dvh] overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
                <div className="mx-auto w-full max-w-3xl pb-4">
                  <div className="rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/30 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                    <div className="flex items-center gap-3">
                      <Avatar profile={activeProfile} fallback={headerName} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">{headerName}</div>
                        <div className="truncate font-mono text-xs text-[rgb(var(--orb-muted-rgb))]">{activeId}</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-[rgb(var(--orb-text-rgb))]">
                      {activeProfile?.bio ? activeProfile.bio : 'Описание не задано.'}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          peer.requestRemoteProfile(activeId);
                        }}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                      >
                        Обновить профиль
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

    </div>
  );

}
