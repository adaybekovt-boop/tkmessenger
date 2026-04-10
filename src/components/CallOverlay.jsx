import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { hapticTap } from '../core/haptics.js';

function cx(...v) {
  return v.filter(Boolean).join(' ');
}

function TopLabel({ title, subtitle }) {
  return (
    <div className="text-center">
      <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">{title}</div>
      {subtitle ? <div className="mt-1 text-xs text-[rgb(var(--orb-muted-rgb))]">{subtitle}</div> : null}
    </div>
  );
}

export default function CallOverlay({ call }) {
  const open = call?.state?.status && call.state.status !== 'idle';
  const incoming = call?.state?.status === 'ringing';
  const inCall = call?.state?.status === 'in-call';
  const calling = call?.state?.status === 'calling';

  useEffect(() => {
    const el = call?.localVideoRef?.current;
    if (!el) return;
    el.srcObject = call.state.localStream || null;
    el.play?.().catch(() => {});
  }, [call?.localVideoRef, call?.state?.localStream]);

  useEffect(() => {
    const el = call?.remoteVideoRef?.current;
    if (!el) return;
    el.srcObject = call.state.remoteStream || null;
    el.play?.().catch(() => {});
  }, [call?.remoteVideoRef, call?.state?.remoteStream]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/55" />
          <div className="orb-blur absolute inset-0" />

          <motion.div
            className="absolute inset-x-0 bottom-0 rounded-t-[28px] border-t border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/82"
            initial={{ y: 26, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 26, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <div className="mx-auto w-full max-w-3xl px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-4">
              {incoming ? (
                <div className="grid gap-4">
                  <TopLabel title="Входящий звонок" subtitle={call.state.remoteId || '—'} />
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        hapticTap();
                        call.accept();
                      }}
                      className="inline-flex h-12 items-center justify-center rounded-3xl bg-[rgb(var(--orb-success-rgb))] px-5 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(34,197,94,0.25),0_0_28px_rgba(34,197,94,0.12)] transition-all duration-300 ease-in-out active:scale-95"
                    >
                      Принять
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        hapticTap();
                        call.reject();
                      }}
                      className="inline-flex h-12 items-center justify-center rounded-3xl bg-[rgb(var(--orb-danger-rgb))] px-5 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(244,63,94,0.25),0_0_28px_rgba(244,63,94,0.12)] transition-all duration-300 ease-in-out active:scale-95"
                    >
                      Отклонить
                    </button>
                  </div>
                </div>
              ) : null}

              {calling ? (
                <div className="grid gap-4">
                  <TopLabel title="Звоним…" subtitle={call.state.remoteId || '—'} />
                  <button
                    type="button"
                    onClick={() => {
                      hapticTap();
                      call.end();
                    }}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-3xl bg-[rgb(var(--orb-danger-rgb))] px-5 text-sm font-semibold text-white transition-all duration-300 ease-in-out active:scale-95"
                  >
                    <PhoneOff className="h-4 w-4" />
                    Отменить
                  </button>
                </div>
              ) : null}

              {inCall ? (
                <div className="grid gap-3">
                  <TopLabel title="Звонок" subtitle={call.state.remoteId || '—'} />
                  <div className="relative overflow-hidden rounded-3xl bg-black/30 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                    <video ref={call.remoteVideoRef} autoPlay playsInline className="h-[280px] w-full object-cover sm:h-[320px]" />
                    <div className="absolute bottom-3 right-3 overflow-hidden rounded-2xl bg-black/30 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                      <video ref={call.localVideoRef} autoPlay muted playsInline className="h-[96px] w-[128px] object-cover" />
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        hapticTap();
                        call.toggleAudio();
                      }}
                      className={cx(
                        'inline-flex h-12 items-center justify-center gap-2 rounded-3xl px-4 text-sm font-semibold ring-1 transition-all duration-300 ease-in-out active:scale-95',
                        call.state.audioEnabled
                          ? 'bg-[rgb(var(--orb-surface-rgb))]/55 text-[rgb(var(--orb-text-rgb))] ring-[rgb(var(--orb-border-rgb))]'
                          : 'bg-[rgb(var(--orb-danger-rgb))]/15 text-[rgb(var(--orb-danger-rgb))] ring-[rgb(var(--orb-danger-rgb))]/25'
                      )}
                    >
                      {call.state.audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                      <span className="hidden sm:inline">Микрофон</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        hapticTap();
                        call.toggleVideo();
                      }}
                      className={cx(
                        'inline-flex h-12 items-center justify-center gap-2 rounded-3xl px-4 text-sm font-semibold ring-1 transition-all duration-300 ease-in-out active:scale-95',
                        call.state.videoEnabled
                          ? 'bg-[rgb(var(--orb-surface-rgb))]/55 text-[rgb(var(--orb-text-rgb))] ring-[rgb(var(--orb-border-rgb))]'
                          : 'bg-[rgb(var(--orb-danger-rgb))]/15 text-[rgb(var(--orb-danger-rgb))] ring-[rgb(var(--orb-danger-rgb))]/25'
                      )}
                    >
                      {call.state.videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                      <span className="hidden sm:inline">Видео</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        hapticTap();
                        call.end();
                      }}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-3xl bg-[rgb(var(--orb-danger-rgb))] px-4 text-sm font-semibold text-white transition-all duration-300 ease-in-out active:scale-95"
                    >
                      <PhoneOff className="h-4 w-4" />
                    <span className="hidden sm:inline">Завершить</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
