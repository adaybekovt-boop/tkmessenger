import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  MonitorX,
  PhoneOff,
  RefreshCw,
  Video,
  VideoOff
} from 'lucide-react';
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

  const containerRef = useRef(null);
  const remoteContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  useEffect(() => {
    const onFsChange = () => {
      const fs = document.fullscreenElement || document.webkitFullscreenElement;
      setIsFullscreen(!!fs);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const toggleFullscreen = () => {
    hapticTap();
    const el = remoteContainerRef.current;
    if (!el) return;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      (el.requestFullscreen?.() || el.webkitRequestFullscreen?.() || Promise.resolve()).catch?.(() => {});
    } else {
      (document.exitFullscreen?.() || document.webkitExitFullscreen?.() || Promise.resolve()).catch?.(() => {});
    }
  };

  const screenSharing = !!call?.state?.screenSharing;
  const videoEnabled = !!call?.state?.videoEnabled;

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
                      onClick={() => { hapticTap(); call.accept(); }}
                      className="inline-flex h-12 items-center justify-center rounded-3xl bg-[rgb(var(--orb-success-rgb))] px-5 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(34,197,94,0.25),0_0_28px_rgba(34,197,94,0.12)] transition-all duration-300 ease-in-out active:scale-95"
                    >
                      Принять
                    </button>
                    <button
                      type="button"
                      onClick={() => { hapticTap(); call.reject(); }}
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
                    onClick={() => { hapticTap(); call.end(); }}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-3xl bg-[rgb(var(--orb-danger-rgb))] px-5 text-sm font-semibold text-white transition-all duration-300 ease-in-out active:scale-95"
                  >
                    <PhoneOff className="h-4 w-4" />
                    Отменить
                  </button>
                </div>
              ) : null}

              {inCall ? (
                <div className="grid gap-3">
                  <TopLabel title={screenSharing ? 'Демонстрация экрана' : 'Звонок'} subtitle={call.state.remoteId || '—'} />

                  <div
                    ref={remoteContainerRef}
                    className="relative overflow-hidden rounded-3xl bg-black/30 ring-1 ring-[rgb(var(--orb-border-rgb))]"
                    onDoubleClick={toggleFullscreen}
                  >
                    <div ref={containerRef} className="relative h-[280px] w-full sm:h-[320px]">
                      <video
                        ref={call.remoteVideoRef}
                        autoPlay
                        playsInline
                        className={cx('h-full w-full bg-black', screenSharing || isFullscreen ? 'object-contain' : 'object-cover')}
                      />

                      {/* Кнопка fullscreen */}
                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-black/45 text-white ring-1 ring-white/10 transition active:scale-95"
                        aria-label={isFullscreen ? 'Свернуть' : 'Развернуть на весь экран'}
                        title={isFullscreen ? 'Свернуть' : 'Развернуть'}
                      >
                        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                      </button>

                      {/* PIP с собственной камерой — draggable */}
                      <motion.div
                        drag
                        dragConstraints={containerRef}
                        dragElastic={0.08}
                        dragMomentum={false}
                        className="absolute bottom-3 right-3 cursor-grab touch-none overflow-hidden rounded-2xl bg-black/40 ring-1 ring-white/10 active:cursor-grabbing"
                        whileDrag={{ scale: 1.04 }}
                      >
                        <video
                          ref={call.localVideoRef}
                          autoPlay
                          muted
                          playsInline
                          className={cx(
                            'h-[96px] w-[128px] object-cover',
                            !screenSharing && call.state.facingMode !== 'environment' ? 'scale-x-[-1]' : ''
                          )}
                        />
                        {!videoEnabled ? (
                          <div className="absolute inset-0 grid place-items-center bg-black/55 text-[10px] font-semibold text-white">
                            Видео выкл.
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            hapticTap();
                            call.switchCamera?.();
                          }}
                          className="absolute top-1 right-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/15 transition active:scale-95"
                          aria-label="Сменить камеру"
                          title="Сменить камеру"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      </motion.div>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => { hapticTap(); call.toggleAudio(); }}
                      className={cx(
                        'inline-flex h-12 items-center justify-center gap-2 rounded-3xl px-3 text-sm font-semibold ring-1 transition-all duration-300 ease-in-out active:scale-95',
                        call.state.audioEnabled
                          ? 'bg-[rgb(var(--orb-surface-rgb))]/55 text-[rgb(var(--orb-text-rgb))] ring-[rgb(var(--orb-border-rgb))]'
                          : 'bg-[rgb(var(--orb-danger-rgb))]/15 text-[rgb(var(--orb-danger-rgb))] ring-[rgb(var(--orb-danger-rgb))]/25'
                      )}
                    >
                      {call.state.audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                      <span className="hidden md:inline">Микро</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { hapticTap(); call.toggleVideo(); }}
                      className={cx(
                        'inline-flex h-12 items-center justify-center gap-2 rounded-3xl px-3 text-sm font-semibold ring-1 transition-all duration-300 ease-in-out active:scale-95',
                        call.state.videoEnabled
                          ? 'bg-[rgb(var(--orb-surface-rgb))]/55 text-[rgb(var(--orb-text-rgb))] ring-[rgb(var(--orb-border-rgb))]'
                          : 'bg-[rgb(var(--orb-danger-rgb))]/15 text-[rgb(var(--orb-danger-rgb))] ring-[rgb(var(--orb-danger-rgb))]/25'
                      )}
                    >
                      {call.state.videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                      <span className="hidden md:inline">Видео</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { hapticTap(); call.toggleScreenShare?.(); }}
                      className={cx(
                        'inline-flex h-12 items-center justify-center gap-2 rounded-3xl px-3 text-sm font-semibold ring-1 transition-all duration-300 ease-in-out active:scale-95',
                        screenSharing
                          ? 'bg-[rgb(var(--orb-accent-rgb))]/20 text-[rgb(var(--orb-accent-rgb))] ring-[rgb(var(--orb-accent-rgb))]/30'
                          : 'bg-[rgb(var(--orb-surface-rgb))]/55 text-[rgb(var(--orb-text-rgb))] ring-[rgb(var(--orb-border-rgb))]'
                      )}
                      title={screenSharing ? 'Остановить демонстрацию' : 'Показать экран'}
                    >
                      {screenSharing ? <MonitorX className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
                      <span className="hidden md:inline">Экран</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { hapticTap(); call.end(); }}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-3xl bg-[rgb(var(--orb-danger-rgb))] px-3 text-sm font-semibold text-white transition-all duration-300 ease-in-out active:scale-95"
                    >
                      <PhoneOff className="h-4 w-4" />
                      <span className="hidden md:inline">Сброс</span>
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
