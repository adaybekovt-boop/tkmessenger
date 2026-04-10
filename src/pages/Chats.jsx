import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCheck, ChevronLeft, ClipboardCopy, Clock, MessageSquare, Phone, Send, UserPlus2, Video, X } from 'lucide-react';
import { usePeerContext } from '../context/PeerContext.jsx';
import { hapticTap } from '../core/haptics.js';

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

function PeerRow({ peer, active, meta, onClick }) {
  const peerCtx = usePeerContext();
  const prof = peerCtx.profilesByPeer?.[peer.id] || null;
  const display = prof?.displayName || peer.id;
  const lastText = meta?.lastText || '';
  const lastTs = meta?.lastTs || 0;
  const unread = Number(meta?.unread || 0) || 0;
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
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">{display}</div>
              {unread > 0 ? (
                <div className="shrink-0 rounded-full bg-[rgb(var(--orb-accent-rgb))]/20 px-2 py-0.5 text-[11px] font-semibold text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-accent-rgb))]/30">
                  {unread}
                </div>
              ) : null}
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <div className="min-w-0 truncate text-xs text-[rgb(var(--orb-muted-rgb))]">
                {lastText ? lastText : peer.status === 'online' ? 'в сети' : peer.status === 'connecting' ? 'подключение…' : 'не в сети'}
              </div>
              {lastTs ? <div className="shrink-0 text-[11px] text-[rgb(var(--orb-muted-rgb))]">{formatTime(lastTs, false)}</div> : null}
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
      setValue('');
      await onConnect(id);
    } catch (e) {
      setValue(id);
      setErr(e?.message ? String(e.message) : 'Не удалось подключиться');
    }
  };

  return (
    <div className="rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 p-3 ring-1 ring-[rgb(var(--orb-border-rgb))]">
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          placeholder="Введите ID друга"
          className="h-11 flex-1 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] placeholder:text-[rgb(var(--orb-muted-rgb))] focus:ring-[rgb(var(--orb-accent-rgb))]/50 transition-all duration-300 ease-in-out"
        />
        <button
          type="button"
          onClick={() => {
            hapticTap();
            void submit();
          }}
          className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-3 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_28px_rgba(59,130,246,0.18)] transition-all duration-300 ease-in-out active:scale-95 sm:px-4"
        >
          <UserPlus2 className="h-4 w-4" />
          <span className="hidden sm:inline">Подключить</span>
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
          {mine ? (
            <span className="inline-flex items-center gap-1.5">
              {msg.delivery === 'queued' ? <Clock className="h-3.5 w-3.5 text-[rgb(var(--orb-muted-rgb))]" /> : null}
              {msg.delivery === 'sent' ? <Check className="h-3.5 w-3.5 text-[rgb(var(--orb-muted-rgb))]" /> : null}
              {msg.delivery === 'delivered' ? <CheckCheck className="h-3.5 w-3.5 text-[rgb(var(--orb-muted-rgb))]" /> : null}
              {msg.delivery === 'queued' ? <span className="text-[rgb(var(--orb-danger-rgb))]">в очереди</span> : null}
            </span>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

export default function Chats() {
  const peer = usePeerContext();
  const [draft, setDraft] = useState('');
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [chatPrefs, setChatPrefs] = useState(() => safeJsonParse(localStorage.getItem('orbits_chat_prefs_v1'), { showSeconds: false }));
  const [lastReadByPeer, setLastReadByPeer] = useState(() => safeJsonParse(localStorage.getItem('orbits_last_read_v1'), {}));
  const list = useMemo(() => {
    const blocked = peer.blockedPeers || [];
    const sorted = peer.peers.filter((p) => !blocked.includes(p.id)).sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
    if (peer.selectedPeerId && !blocked.includes(peer.selectedPeerId) && !sorted.some((p) => p.id === peer.selectedPeerId)) {
      sorted.unshift({ id: peer.selectedPeerId, status: 'offline', lastSeenAt: 0 });
    }
    return sorted;
  }, [peer.peers, peer.selectedPeerId, peer.blockedPeers]);

  const activeId = peer.selectedPeerId || list[0]?.id || '';
  const messages = peer.messagesByPeer[activeId] || [];
  const activeProfile = activeId ? peer.profilesByPeer?.[activeId] : null;
  const headerName = activeProfile?.displayName || activeId || 'Чаты';
  const [profileOpen, setProfileOpen] = useState(false);

  const metaByPeer = useMemo(() => {
    const map = new Map();
    for (const p of list) {
      const msgs = peer.messagesByPeer[p.id] || [];
      const last = msgs.length ? msgs[msgs.length - 1] : null;
      const lastText = last?.text ? String(last.text).slice(0, 140) : '';
      const lastTs = Number(last?.ts || 0) || 0;
      const lastRead = Number(lastReadByPeer?.[p.id] || 0) || 0;
      let unread = 0;
      if (lastRead) {
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          if (!m || !m.ts) continue;
          if (m.ts <= lastRead) break;
          if (m.from !== peer.peerId) unread++;
        }
      } else {
        for (const m of msgs) {
          if (m?.from && m.from !== peer.peerId) unread++;
        }
      }
      map.set(p.id, { lastText, lastTs, unread });
    }
    return map;
  }, [lastReadByPeer, list, peer.messagesByPeer, peer.peerId]);

  useEffect(() => {
    if (!activeId) return;
    const msgs = peer.messagesByPeer[activeId] || [];
    const last = msgs.length ? msgs[msgs.length - 1] : null;
    const ts = Number(last?.ts || 0) || 0;
    if (!ts) return;
    setLastReadByPeer((prev) => {
      const prevTs = Number(prev?.[activeId] || 0) || 0;
      if (ts <= prevTs) return prev;
      const next = { ...(prev && typeof prev === 'object' ? prev : {}), [activeId]: ts };
      try {
        localStorage.setItem('orbits_last_read_v1', JSON.stringify(next));
      } catch (_) {
      }
      return next;
    });
  }, [activeId, peer.messagesByPeer]);

  const listScrollRef = useRef(null);
  const pullStartRef = useRef(0);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [pulling, setPulling] = useState(false);

  const doRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      peer.reconnectNow?.();
      peer.flushAllOutbox();
      if (activeId) peer.requestRemoteProfile(activeId);
    } finally {
      setTimeout(() => setRefreshing(false), 700);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem('orbits_chat_prefs_v1', JSON.stringify(chatPrefs));
    } catch (_) {
    }
  }, [chatPrefs]);

  const scrollRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const oldestTsRef = useRef(0);
  const composerRef = useRef(null);

  useEffect(() => {
    oldestTsRef.current = messages[0]?.ts || 0;
  }, [activeId, messages]);

  useEffect(() => {
    setHasMore(true);
    setLoadingMore(false);
    hasMoreRef.current = true;
    loadingMoreRef.current = false;
  }, [activeId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = gap < 140;

      if (el.scrollTop < 140 && hasMoreRef.current && !loadingMoreRef.current && activeId) {
        loadingMoreRef.current = true;
        setLoadingMore(true);
        const before = oldestTsRef.current;
        const prevHeight = el.scrollHeight;
        const prevTop = el.scrollTop;
        Promise.resolve(peer.loadMoreMessages?.(activeId, before))
          .then((added) => {
            requestAnimationFrame(() => {
              const nextHeight = el.scrollHeight;
              el.scrollTop = prevTop + (nextHeight - prevHeight);
            });
            if (!added) {
              hasMoreRef.current = false;
              setHasMore(false);
            }
          })
          .finally(() => {
            loadingMoreRef.current = false;
            setLoadingMore(false);
          });
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [activeId, peer]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!stickToBottomRef.current) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [activeId, messages.length]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = '0px';
    const next = Math.min(128, Math.max(46, el.scrollHeight));
    el.style.height = `${next}px`;
  }, [draft]);

  const send = () => {
    if (!activeId) return;
    const text = draft.trim();
    if (!text) return;
    hapticTap();
    peer.sendTyping?.(activeId, false);
    peer.sendText(activeId, text);
    setDraft('');
  };

  const typingIdleRef = useRef(null);
  const typingActiveRef = useRef(false);

  useEffect(() => {
    typingActiveRef.current = false;
    if (typingIdleRef.current) {
      clearTimeout(typingIdleRef.current);
      typingIdleRef.current = null;
    }
  }, [activeId]);

  const updateDraft = (value) => {
    setDraft(value);
    if (!activeId || !peer.sendTyping) return;
    const has = String(value || '').trim().length > 0;

    if (!has) {
      if (typingIdleRef.current) {
        clearTimeout(typingIdleRef.current);
        typingIdleRef.current = null;
      }
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        peer.sendTyping(activeId, false);
      }
      return;
    }

    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      peer.sendTyping(activeId, true);
    }
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    typingIdleRef.current = setTimeout(() => {
      typingIdleRef.current = null;
      typingActiveRef.current = false;
      peer.sendTyping(activeId, false);
    }, 900);
  };

  // Phase 3.4 — Swipe-back (right) to open contacts sidebar on mobile
  const swipeStartRef = useRef(null);
  const handleSwipeTouchStart = (e) => {
    const touch = e.touches?.[0];
    if (!touch) return;
    // Only trigger from left edge (first 40px)
    if (touch.clientX > 40) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const handleSwipeTouchEnd = (e) => {
    if (!swipeStartRef.current) return;
    const touch = e.changedTouches?.[0];
    if (!touch) { swipeStartRef.current = null; return; }
    const dx = touch.clientX - swipeStartRef.current.x;
    const dy = Math.abs(touch.clientY - swipeStartRef.current.y);
    swipeStartRef.current = null;
    // Swipe right at least 60px with more horizontal than vertical movement
    if (dx > 60 && dx > dy * 1.5) {
      setMobileListOpen(true);
    }
  };


  const Sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4">
        <ConnectBar onConnect={peer.connect} />
      </div>
      <div className="px-4 pt-3">
        <div className="rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/35 p-3 ring-1 ring-[rgb(var(--orb-border-rgb))]">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">YOUR ID</div>
              <div className="mt-1 truncate font-mono text-xs text-[rgb(var(--orb-text-rgb))]">{peer.peerId || '…'}</div>
            </div>
            <button
              type="button"
              disabled={!peer.peerId || !(navigator.clipboard && navigator.clipboard.writeText)}
              onClick={async () => {
                if (!peer.peerId) return;
                hapticTap();
                try {
                  await navigator.clipboard.writeText(peer.peerId);
                } catch (_) {
                }
              }}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60"
              aria-label="Копировать ID"
              title="Копировать ID"
            >
              <ClipboardCopy className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="px-4 pt-4 pb-2">
        <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">КОНТАКТЫ</div>
      </div>
      <div className="relative flex-1 overflow-hidden px-2 pb-3">
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex justify-center"
          style={{ transform: `translateY(${Math.min(pullY, 60) - 48}px)` }}
        >
          <div className="rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/70 px-3 py-2 text-[11px] font-semibold text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]">
            {refreshing ? 'Обновляем…' : pullY > 55 ? 'Отпустить для обновления' : 'Потяни вниз для обновления'}
          </div>
        </div>
        <div
          ref={listScrollRef}
          className="orb-scroll h-full overflow-y-auto"
          style={{ transform: `translateY(${pullY}px)`, transition: pulling ? 'none' : 'transform 180ms ease-out' }}
          onTouchStart={(e) => {
            const el = listScrollRef.current;
            if (!el) return;
            if (el.scrollTop > 0) return;
            setPulling(true);
            pullStartRef.current = e.touches[0]?.clientY || 0;
            setPullY(0);
          }}
          onTouchMove={(e) => {
            const el = listScrollRef.current;
            if (!el) return;
            if (!pulling) return;
            if (el.scrollTop > 0) return;
            const y = e.touches[0]?.clientY || 0;
            const dy = Math.max(0, y - pullStartRef.current);
            if (dy > 0) e.preventDefault();
            setPullY(Math.min(80, dy * 0.55));
          }}
          onTouchEnd={async () => {
            if (!pulling) return;
            setPulling(false);
            const should = pullY > 55;
            setPullY(0);
            if (should) {
              hapticTap();
              await doRefresh();
            }
          }}
        >
        {list.length ? (
          list.map((p) => (
            <PeerRow
              key={p.id}
              peer={p}
              meta={metaByPeer.get(p.id) || null}
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
    </div>
  );

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside className="hidden w-[340px] shrink-0 border-r border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))] md:block">
        {Sidebar}
      </aside>

      <section
        className="flex min-w-0 flex-1 flex-col bg-[rgb(var(--orb-bg-rgb))]"
        onTouchStart={handleSwipeTouchStart}
        onTouchEnd={handleSwipeTouchEnd}
      >
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
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-xs text-[rgb(var(--orb-muted-rgb))]">
              <span>Твой ID:</span>
              <span className="font-mono text-[rgb(var(--orb-text-rgb))]">{peer.peerId || '…'}</span>
            </div>
            <button
              type="button"
              disabled={!activeId}
              onClick={() => {
                hapticTap();
                if (!activeId) return;
                peer.call.startCall(activeId, { videoEnabled: false });
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60"
              aria-label="Аудиозвонок"
              title="Аудиозвонок"
            >
              <Phone className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!activeId}
              onClick={() => {
                hapticTap();
                if (!activeId) return;
                peer.call.startCall(activeId, { videoEnabled: true });
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60"
              aria-label="Видеозвонок"
              title="Видеозвонок"
            >
              <Video className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="orb-scroll flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            {loadingMore ? <div className="py-1 text-center text-xs text-[rgb(var(--orb-muted-rgb))]">Загрузка…</div> : null}
            {!hasMore && messages.length ? <div className="py-1 text-center text-[11px] text-[rgb(var(--orb-muted-rgb))]">Начало истории</div> : null}
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} mine={m.from === peer.peerId} showSeconds={!!chatPrefs.showSeconds} />
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="orb-blur border-t border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/70 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          {activeId && peer.typingByPeer?.[activeId] ? (
            <div className="mx-auto mb-2 w-full max-w-3xl text-xs text-[rgb(var(--orb-muted-rgb))]">{headerName} печатает…</div>
          ) : null}
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => updateDraft(e.target.value)}
              rows={1}
              placeholder={activeId ? 'Сообщение…' : 'Выберите контакт для общения…'}
              disabled={!activeId}
              className="min-h-[46px] flex-1 resize-none overflow-hidden rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/55 px-4 py-3 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] placeholder:text-[rgb(var(--orb-muted-rgb))] transition-all duration-300 ease-in-out disabled:opacity-60"
              onBlur={() => {
                if (!activeId) return;
                peer.sendTyping?.(activeId, false);
                typingActiveRef.current = false;
                if (typingIdleRef.current) {
                  clearTimeout(typingIdleRef.current);
                  typingIdleRef.current = null;
                }
              }}
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
              className="inline-flex h-11 items-center gap-2 rounded-3xl bg-[rgb(var(--orb-accent-rgb))] px-3 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_28px_rgba(59,130,246,0.18)] transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60 sm:px-4"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Отправить</span>
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
