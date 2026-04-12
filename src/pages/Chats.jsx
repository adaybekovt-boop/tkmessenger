import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  CheckCheck,
  ChevronLeft,
  ClipboardCopy,
  Clock,
  CornerUpLeft,
  Copy as CopyIcon,
  Edit3,
  MessageSquare,
  Mic,
  Phone,
  Send,
  Smile,
  Trash2,
  UserPlus2,
  Video,
  X
} from 'lucide-react';
import { usePeerContext } from '../context/PeerContext.jsx';
import { hapticTap } from '../core/haptics.js';
import { playSound, preloadSounds } from '../core/sounds.js';
import { getBubbleRadius, getMyBubbleColors, getPeerBubbleColors, getFontSizeClass } from '../components/ChatSettings.jsx';
import StickerPicker from '../components/StickerPicker.jsx';
import VoiceRecorder, { VoiceButton } from '../components/VoiceRecorder.jsx';
import VoicePlayer from '../components/VoicePlayer.jsx';

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
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-3 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_28px_rgba(59,130,246,0.18)] transition-all duration-300 ease-in-out active:scale-95 sm:px-4"
        >
          <UserPlus2 className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline whitespace-nowrap">Подключить</span>
        </button>
      </div>
      {err ? <div className="mt-2 text-xs text-[rgb(var(--orb-danger-rgb))]">{err}</div> : null}
    </div>
  );
}

function ReplyPreviewInline({ replyTo, mine }) {
  if (!replyTo) return null;
  const preview =
    replyTo.type === 'sticker'
      ? (replyTo.stickerEmoji || '🖼 Стикер')
      : replyTo.type === 'voice'
        ? '🎤 Голосовое сообщение'
        : String(replyTo.text || '').slice(0, 140);
  return (
    <div
      className={cx(
        'mb-2 rounded-2xl px-3 py-2 text-[11px] ring-1',
        mine
          ? 'bg-[rgb(var(--orb-bg-rgb))]/25 ring-[rgb(var(--orb-accent-rgb))]/30'
          : 'bg-[rgb(var(--orb-bg-rgb))]/30 ring-[rgb(var(--orb-border-rgb))]'
      )}
    >
      <div className="font-semibold text-[rgb(var(--orb-accent-rgb))]">{replyTo.fromName || replyTo.from || 'Сообщение'}</div>
      <div className="mt-0.5 truncate text-[rgb(var(--orb-muted-rgb))]">{preview || '…'}</div>
    </div>
  );
}

function MessageBubble({ msg, mine, showSeconds, onContextMenu, chatPrefs }) {
  const isSticker = msg.type === 'sticker' && msg.sticker;
  const isVoice = msg.type === 'voice' && msg.voice;

  const longPressTimerRef = useRef(null);

  const openMenu = (e, clientX, clientY) => {
    onContextMenu?.(msg, { x: clientX, y: clientY }, mine);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    openMenu(e, e.clientX, e.clientY);
  };

  const handlePointerDown = (e) => {
    // Long press (~420ms) для мобильных — открывает меню
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    const cx2 = e.clientX;
    const cy = e.clientY;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      hapticTap();
      openMenu(e, cx2, cy);
    }, 420);
  };
  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const bubbleBase = mine
    ? getMyBubbleColors(chatPrefs)
    : getPeerBubbleColors(chatPrefs);
  const bubbleRadius = getBubbleRadius(chatPrefs);
  const fontCls = getFontSizeClass(chatPrefs);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cx('flex', mine ? 'justify-end' : 'justify-start')}
    >
      {isSticker ? (
        <div
          className="max-w-[60%] select-none"
          onContextMenu={handleContextMenu}
          onPointerDown={handlePointerDown}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onPointerCancel={cancelLongPress}
        >
          {msg.replyTo ? (
            <div className={cx('mb-1', mine ? 'ml-auto max-w-[90%]' : 'mr-auto max-w-[90%]')}>
              <ReplyPreviewInline replyTo={msg.replyTo} mine={mine} />
            </div>
          ) : null}
          <img
            src={msg.sticker.url}
            alt={msg.sticker.emoji || 'sticker'}
            className="h-[140px] w-[140px] object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.25)]"
            draggable={false}
          />
          <div className={cx('mt-1 flex items-center gap-1.5 text-[11px] text-[rgb(var(--orb-muted-rgb))]', mine ? 'justify-end' : 'justify-start')}>
            <span>{formatTime(msg.ts, showSeconds)}</span>
            {mine ? <DeliveryIcon delivery={msg.delivery} /> : null}
          </div>
        </div>
      ) : (
        <div
          className={cx('max-w-[92%] px-4 py-3 text-[rgb(var(--orb-text-rgb))] select-text', bubbleRadius, fontCls, bubbleBase)}
          onContextMenu={handleContextMenu}
          onPointerDown={handlePointerDown}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onPointerCancel={cancelLongPress}
        >
          <ReplyPreviewInline replyTo={msg.replyTo} mine={mine} />
          {isVoice ? (
            <VoicePlayer msgId={msg.id} voice={msg.voice} mine={mine} />
          ) : (
            <div className="whitespace-pre-wrap break-words">{msg.text}</div>
          )}
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[rgb(var(--orb-muted-rgb))]">
            <span>
              {msg.editedAt ? <span className="mr-1 italic">ред.</span> : null}
              {formatTime(msg.ts, showSeconds)}
            </span>
            {mine ? (
              <span className="inline-flex items-center gap-1.5">
                <DeliveryIcon delivery={msg.delivery} />
                {msg.delivery === 'queued' ? <span className="text-[rgb(var(--orb-danger-rgb))]">в очереди</span> : null}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function DeliveryIcon({ delivery }) {
  if (delivery === 'queued') return <Clock className="h-3.5 w-3.5 text-[rgb(var(--orb-muted-rgb))]" />;
  if (delivery === 'sent') return <Check className="h-3.5 w-3.5 text-[rgb(var(--orb-muted-rgb))]" />;
  if (delivery === 'delivered' || delivery === 'read') return <CheckCheck className="h-3.5 w-3.5 text-[rgb(var(--orb-muted-rgb))]" />;
  return null;
}

function MessageContextMenu({ menu, onClose, onReply, onEdit, onCopy, onDeleteMe, onDeleteAll }) {
  useEffect(() => {
    if (!menu) return;
    const onDown = () => onClose?.();
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  const msg = menu.msg;
  const mine = !!menu.mine;
  const canEdit = mine && msg.type === 'text';
  const canCopy = msg.type === 'text' && !!msg.text;

  const x = Math.min(window.innerWidth - 220, Math.max(12, menu.pos.x));
  const y = Math.min(window.innerHeight - 240, Math.max(12, menu.pos.y));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed z-[80] w-[200px] rounded-2xl border border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/95 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem icon={<CornerUpLeft className="h-4 w-4" />} label="Ответить" onClick={() => { onReply?.(msg); onClose?.(); }} />
      {canCopy ? (
        <MenuItem icon={<CopyIcon className="h-4 w-4" />} label="Копировать" onClick={() => { onCopy?.(msg); onClose?.(); }} />
      ) : null}
      {canEdit ? (
        <MenuItem icon={<Edit3 className="h-4 w-4" />} label="Редактировать" onClick={() => { onEdit?.(msg); onClose?.(); }} />
      ) : null}
      <MenuItem icon={<Trash2 className="h-4 w-4" />} label="Удалить у себя" onClick={() => { onDeleteMe?.(msg); onClose?.(); }} />
      {mine ? (
        <MenuItem
          danger
          icon={<Trash2 className="h-4 w-4" />}
          label="Удалить у всех"
          onClick={() => { onDeleteAll?.(msg); onClose?.(); }}
        />
      ) : null}
    </motion.div>
  );
}

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition active:scale-95',
        danger
          ? 'text-[rgb(var(--orb-danger-rgb))] hover:bg-[rgb(var(--orb-danger-rgb))]/10'
          : 'text-[rgb(var(--orb-text-rgb))] hover:bg-[rgb(var(--orb-surface-rgb))]/60'
      )}
    >
      <span className="shrink-0 text-[rgb(var(--orb-muted-rgb))]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export default function Chats() {
  const peer = usePeerContext();
  const peerRef = useRef(peer);
  peerRef.current = peer;
  const [draft, setDraft] = useState('');
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null); // { id, originalText }
  const [menu, setMenu] = useState(null); // { msg, pos, mine }
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

  // Preload audio context on first user interaction so sounds play without delay.
  useEffect(() => {
    const handler = () => { preloadSounds(); window.removeEventListener('pointerdown', handler); };
    window.addEventListener('pointerdown', handler, { once: true });
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

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
    setReplyTo(null);
    setEditing(null);
    setMenu(null);
    setStickerOpen(false);
    setRecording(false);
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
        Promise.resolve(peerRef.current.loadMoreMessages?.(activeId, before))
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
  }, [activeId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!stickToBottomRef.current) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [activeId, messages.length]);

  // Pin the message list to the bottom when the keyboard opens and the
  // layout shrinks. We listen on visualViewport directly because the relevant
  // event (keyboard resize) doesn't bubble through React state.
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const onResize = () => {
      const el = scrollRef.current;
      if (!el) return;
      if (!stickToBottomRef.current) return;
      // Two rAFs: the first waits for layout to settle after the vv event,
      // the second actually scrolls once the new heights are committed.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      });
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // Reveal the latest message the moment the user taps the textarea. The
  // keyboard is still mid-animation at this point, so we also schedule a
  // second scroll once visualViewport has resized (handled by the effect
  // above). This two-phase approach is what Telegram Web uses.
  const handleComposerFocus = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = '0px';
    const next = Math.min(128, Math.max(46, el.scrollHeight));
    el.style.height = `${next}px`;
  }, [draft]);

  const buildReplyPayload = useCallback((msg) => {
    if (!msg) return null;
    const fromName = msg.from === peer.peerId
      ? (peer.peers.find((p) => p.id === activeId)?.id && 'Вы') || 'Вы'
      : (peer.profilesByPeer?.[msg.from]?.displayName || msg.from);
    return {
      id: msg.id,
      from: msg.from,
      fromName,
      type: msg.type || 'text',
      text: msg.type === 'text' ? String(msg.text || '').slice(0, 160) : '',
      stickerEmoji: msg.type === 'sticker' ? (msg.sticker?.emoji || '') : ''
    };
  }, [activeId, peer.peerId, peer.peers, peer.profilesByPeer]);

  const send = () => {
    if (!activeId) return;
    const text = draft.trim();
    if (!text) return;
    hapticTap();
    playSound('send');
    peer.sendTyping?.(activeId, false);

    if (editing) {
      peer.editMessage?.(activeId, editing.id, text);
      setEditing(null);
      setDraft('');
      return;
    }

    peer.sendText(activeId, text, { replyTo: replyTo || null });
    setReplyTo(null);
    setDraft('');
  };

  const handleSticker = (stickerData) => {
    if (!activeId) return;
    hapticTap();
    const stickerPayload = {
      packId: stickerData.packId,
      packName: stickerData.packName,
      stickerId: stickerData.stickerId,
      url: stickerData.url,
      emoji: stickerData.emoji
    };
    peer.sendSticker?.(activeId, stickerPayload, { replyTo: replyTo || null });
    setReplyTo(null);
    setStickerOpen(false);
  };

  const handleVoiceSend = (voiceData) => {
    if (!activeId) {
      setRecording(false);
      return;
    }
    peer.sendVoice?.(activeId, voiceData, { replyTo: replyTo || null });
    setReplyTo(null);
    setRecording(false);
  };

  const handleVoiceCancel = () => setRecording(false);

  const openContextMenu = (msg, pos, mine) => setMenu({ msg, pos, mine });
  const closeMenu = () => setMenu(null);

  const handleReply = (msg) => {
    setEditing(null);
    setReplyTo(buildReplyPayload(msg));
  };
  const handleEditStart = (msg) => {
    setReplyTo(null);
    setEditing({ id: msg.id, originalText: msg.text || '' });
    setDraft(msg.text || '');
  };
  const handleCopy = async (msg) => {
    try {
      await navigator.clipboard?.writeText(msg.text || '');
    } catch (_) {
    }
  };
  const handleDeleteMe = (msg) => {
    if (!activeId) return;
    peer.deleteMessage?.(activeId, msg.id, false);
  };
  const handleDeleteAll = (msg) => {
    if (!activeId) return;
    peer.deleteMessage?.(activeId, msg.id, true);
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
    <div className="orb-page-bg flex h-full w-full overflow-hidden">
      <aside className="orb-page-bg hidden w-[340px] shrink-0 border-r border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))] md:block">
        {Sidebar}
      </aside>

      <section
        className="orb-page-bg flex min-w-0 flex-1 flex-col bg-[rgb(var(--orb-bg-rgb))]"
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
                <MessageBubble
                  key={m.id}
                  msg={m}
                  mine={m.from === peer.peerId}
                  showSeconds={!!chatPrefs.showSeconds}
                  chatPrefs={chatPrefs}
                  onContextMenu={openContextMenu}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="relative orb-blur border-t border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/70 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          {activeId && peer.typingByPeer?.[activeId] ? (
            <div className="mx-auto mb-2 w-full max-w-3xl text-xs text-[rgb(var(--orb-muted-rgb))]">{headerName} печатает…</div>
          ) : null}

          <StickerPicker open={stickerOpen} onClose={() => setStickerOpen(false)} onPick={handleSticker} />

          {replyTo ? (
            <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-3 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/55 px-3 py-2 ring-1 ring-[rgb(var(--orb-border-rgb))]">
              <div className="h-8 w-1 shrink-0 rounded-full bg-[rgb(var(--orb-accent-rgb))]" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-[rgb(var(--orb-accent-rgb))]">
                  Ответ {replyTo.from === peer.peerId ? 'на своё сообщение' : (replyTo.fromName || peer.profilesByPeer?.[replyTo.from]?.displayName || replyTo.from)}
                </div>
                <div className="truncate text-xs text-[rgb(var(--orb-muted-rgb))]">
                  {replyTo.type === 'sticker' ? (replyTo.stickerEmoji || '🖼 Стикер') : replyTo.type === 'voice' ? '🎤 Голосовое' : replyTo.text || '…'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition active:scale-95"
                aria-label="Отменить ответ"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {editing ? (
            <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-3 rounded-2xl bg-[rgb(var(--orb-accent-rgb))]/10 px-3 py-2 ring-1 ring-[rgb(var(--orb-accent-rgb))]/25">
              <Edit3 className="h-4 w-4 text-[rgb(var(--orb-accent-rgb))]" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-[rgb(var(--orb-accent-rgb))]">Редактирование сообщения</div>
                <div className="truncate text-xs text-[rgb(var(--orb-muted-rgb))]">{editing.originalText}</div>
              </div>
              <button
                type="button"
                onClick={() => { setEditing(null); setDraft(''); }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition active:scale-95"
                aria-label="Отменить редактирование"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
            {recording ? (
              <VoiceRecorder onSend={handleVoiceSend} onCancel={handleVoiceCancel} />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (!activeId) return;
                    hapticTap();
                    setStickerOpen((v) => !v);
                  }}
                  disabled={!activeId}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/60 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition active:scale-95 disabled:opacity-60"
                  aria-label="Стикеры"
                  title="Стикеры"
                >
                  <Smile className="h-4 w-4" />
                </button>

                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(e) => updateDraft(e.target.value)}
                  rows={1}
                  placeholder={activeId ? (editing ? 'Изменить сообщение…' : 'Сообщение…') : 'Выберите контакт для общения…'}
                  disabled={!activeId}
                  className="min-h-[46px] flex-1 resize-none overflow-hidden rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/55 px-4 py-3 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] placeholder:text-[rgb(var(--orb-muted-rgb))] transition-all duration-300 ease-in-out disabled:opacity-60"
                  onFocus={handleComposerFocus}
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
                    if (e.key === 'Escape') {
                      if (editing) { setEditing(null); setDraft(''); }
                      else if (replyTo) setReplyTo(null);
                    }
                  }}
                />

                {draft.trim() || editing ? (
                  <button
                    type="button"
                    onClick={send}
                    disabled={!activeId}
                    className="inline-flex h-11 items-center gap-2 rounded-3xl bg-[rgb(var(--orb-accent-rgb))] px-3 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_28px_rgba(59,130,246,0.18)] transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60 sm:px-4"
                  >
                    <Send className="h-4 w-4" />
                    <span className="hidden sm:inline">{editing ? 'Сохранить' : 'Отправить'}</span>
                  </button>
                ) : (
                  <VoiceButton
                    disabled={!activeId}
                    onClick={() => {
                      if (!activeId) return;
                      hapticTap();
                      setRecording(true);
                    }}
                  />
                )}
              </>
            )}
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
              className="orb-page-bg absolute inset-y-0 left-0 w-[92%] max-w-[380px] bg-[rgb(var(--orb-bg-rgb))]"
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
        {menu ? (
          <MessageContextMenu
            menu={menu}
            onClose={closeMenu}
            onReply={handleReply}
            onEdit={handleEditStart}
            onCopy={handleCopy}
            onDeleteMe={handleDeleteMe}
            onDeleteAll={handleDeleteAll}
          />
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
