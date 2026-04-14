import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ClipboardCopy, ChevronLeft, Eye, EyeOff, ImagePlus, LogIn, ShieldCheck } from 'lucide-react';
import OrbitsLogo from './OrbitsLogo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getOrCreateIdentity } from '../core/identity.js';
import { hapticTap } from '../core/haptics.js';
import { passwordStrength, validatePassword, validatePasswordConfirm, validateUsername } from '../core/authValidation.js';

function cx(...v) {
  return v.filter(Boolean).join(' ');
}

export default function Onboarding() {
  const auth = useAuth();
  const identity = useMemo(() => getOrCreateIdentity(), []);
  const locked = auth.authState === 'locked';
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(locked ? (identity.displayName || '') : '');
  const [avatarDataUrl, setAvatarDataUrl] = useState(null);
  const [revealId, setRevealId] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canClipboard = typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function';

  useEffect(() => {
    setError('');
  }, [step]);

  const maskedPeerId = useMemo(() => {
    const id = String(identity.peerId || '');
    if (!id) return '—';
    if (revealId) return id;
    return id.replace(/[0-9A-F]/g, '•');
  }, [identity.peerId, revealId]);

  const readFileAsDataUrl = async (file) => {
    if (!file) return null;
    const maxBytes = 3 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error('Аватар слишком большой (макс 3MB)');
    if (!String(file.type || '').startsWith('image/')) throw new Error('Нужна картинка');

    const src = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(r.error || new Error('Ошибка чтения файла'));
      r.readAsDataURL(file);
    });

    const img = new Image();
    img.decoding = 'async';
    img.src = src;

    await new Promise((resolve, reject) => {
      img.onload = () => resolve(true);
      img.onerror = () => reject(new Error('Не удалось обработать изображение'));
    });

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas недоступен');
    const sc = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * sc;
    const h = img.naturalHeight * sc;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL('image/jpeg', 0.86);
  };

  const goNext = async () => {
    if (step === 1) {
      const vU = validateUsername(displayName);
      const vP = validatePassword(password);
      const vC = validatePasswordConfirm(password, confirm);
      if (!vU.ok) {
        setError('Ник: 3–30 символов, буквы/цифры/подчёркивание');
        return;
      }
      if (!vP.ok) {
        setError('Пароль: минимум 8 символов');
        return;
      }
      if (!vC.ok) {
        setError('Пароли не совпадают');
        return;
      }
    }
    setStep((s) => Math.min(2, s + 1));
  };

  const submit = async () => {
    setError('');
    const vU = validateUsername(displayName);
    const vP = validatePassword(password);
    const vC = validatePasswordConfirm(password, confirm);
    if (!vU.ok) {
      setError('Ник: 3–30 символов, буквы/цифры/подчёркивание');
      return;
    }
    if (!vP.ok) {
      setError('Пароль: минимум 8 символов');
      return;
    }
    if (!vC.ok) {
      setError('Пароли не совпадают');
      return;
    }
    const name = vU.value;
    setBusy(true);
    try {
      await auth.completeOnboarding({ displayName: name, password, confirm, avatarDataUrl });
    } catch (e) {
      setError(String(e?.message || 'Ошибка'));
    } finally {
      setBusy(false);
    }
  };

  if (locked) {
    return (
      <div
        className="orb-page-bg flex w-full items-center justify-center bg-[rgb(var(--orb-bg-rgb))] px-4"
        style={{ height: 'calc(var(--orb-vvh, 1vh) * 100)', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="w-full max-w-[440px]">
          <div className="orb-blur rounded-[28px] bg-[rgb(var(--orb-surface-rgb))]/30 p-5 ring-1 ring-[rgb(var(--orb-border-rgb))]">
            <div className="flex items-center gap-3">
              <OrbitsLogo />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Вход</div>
                <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">Введите пароль, чтобы открыть приложение</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs text-[rgb(var(--orb-muted-rgb))]">Пароль</span>
                <input
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] placeholder:text-[rgb(var(--orb-muted-rgb))] transition-all duration-300 ease-in-out focus:ring-[rgb(var(--orb-accent-rgb))]/50"
                />
              </label>

              {error ? <div className="text-xs text-[rgb(var(--orb-danger-rgb))]">{error}</div> : null}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    hapticTap();
                    setShowPass((v) => !v);
                  }}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                  aria-label={showPass ? 'Скрыть пароль' : 'Показать пароль'}
                  title={showPass ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setError('');
                    setBusy(true);
                    try {
                      await auth.unlock({ password: unlockPassword });
                    } catch (e) {
                      setError(String(e?.message || 'Ошибка'));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className={cx(
                    'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-4 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_28px_rgba(59,130,246,0.18)] transition-all duration-300 ease-in-out active:scale-95',
                    busy ? 'opacity-70' : ''
                  )}
                >
                  <LogIn className="h-4 w-4" />
                  Войти
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const ok = window.confirm('Сбросить профиль? Это удалит имя/пароль на этом устройстве.');
                  if (!ok) return;
                  auth.wipeLocal?.();
                }}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[rgb(var(--orb-danger-rgb))]/10 px-4 text-sm font-semibold text-[rgb(var(--orb-danger-rgb))] ring-1 ring-[rgb(var(--orb-danger-rgb))]/20 transition-all duration-300 ease-in-out active:scale-95"
              >
                Сбросить профиль
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="orb-page-bg flex w-full items-center justify-center bg-[rgb(var(--orb-bg-rgb))] px-4"
      style={{ height: 'calc(var(--orb-vvh, 1vh) * 100)', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="w-full max-w-[440px]">
        <div className="orb-blur rounded-[28px] bg-[rgb(var(--orb-surface-rgb))]/30 p-5 ring-1 ring-[rgb(var(--orb-border-rgb))]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <OrbitsLogo showText={false} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">ORBITS P2P</div>
                <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">Регистрация (3 шага)</div>
              </div>
            </div>
            {step > 0 ? (
              <button
                type="button"
                onClick={() => {
                  hapticTap();
                  setStep((s) => Math.max(0, s - 1));
                }}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                aria-label="Назад"
                title="Назад"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="mt-4 flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={cx(
                  'h-1.5 flex-1 rounded-full ring-1 ring-[rgb(var(--orb-border-rgb))]',
                  i <= step ? 'bg-[rgb(var(--orb-accent-rgb))]/55' : 'bg-[rgb(var(--orb-bg-rgb))]/25'
                )}
              />
            ))}
          </div>

          <div className="mt-4">
            <AnimatePresence mode="wait" initial={false}>
              {step === 0 ? (
                <motion.div
                  key="s0"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="grid gap-3"
                >
                  <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/30 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/45 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                        <ShieldCheck className="h-4 w-4 text-[rgb(var(--orb-text-rgb))]" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Добро пожаловать</div>
                        <div className="mt-1 text-xs text-[rgb(var(--orb-muted-rgb))]">Чаты и звонки работают напрямую между устройствами. Мы не просим телефон и не храним сообщения на сервере.</div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      hapticTap();
                      void goNext();
                    }}
                    className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-4 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_28px_rgba(59,130,246,0.18)] transition-all duration-300 ease-in-out active:scale-95"
                  >
                    Начать
                  </button>
                </motion.div>
              ) : null}

              {step === 1 ? (
                <motion.form
                  key="s1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    hapticTap();
                    void goNext();
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="grid gap-3"
                >
                  <label className="grid gap-1">
                    <span className="text-xs text-[rgb(var(--orb-muted-rgb))]">Ник</span>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Например: Alex_77"
                      className="h-11 w-full rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] placeholder:text-[rgb(var(--orb-muted-rgb))] transition-all duration-300 ease-in-out focus:ring-[rgb(var(--orb-accent-rgb))]/50"
                    />
                  </label>

                  <div className="grid gap-2 rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/30 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                    <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Пароль</div>
                    <div className="grid gap-2">
                      <input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        type={showPass ? 'text' : 'password'}
                        placeholder="Минимум 8 символов"
                        className="h-11 w-full rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] placeholder:text-[rgb(var(--orb-muted-rgb))] transition-all duration-300 ease-in-out focus:ring-[rgb(var(--orb-accent-rgb))]/50"
                      />
                      <input
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        type={showPass ? 'text' : 'password'}
                        placeholder="Повтори пароль"
                        className="h-11 w-full rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] placeholder:text-[rgb(var(--orb-muted-rgb))] transition-all duration-300 ease-in-out focus:ring-[rgb(var(--orb-accent-rgb))]/50"
                      />
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] text-[rgb(var(--orb-muted-rgb))]">Сила: {passwordStrength(password)}/5</div>
                        <button
                          type="button"
                          onClick={() => {
                            hapticTap();
                            setShowPass((v) => !v);
                          }}
                          className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                        >
                          {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          {showPass ? 'Скрыть' : 'Показать'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/30 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/45 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                        {avatarDataUrl ? <img alt="" src={avatarDataUrl} className="h-full w-full object-cover" /> : <ImagePlus className="h-4 w-4 text-[rgb(var(--orb-muted-rgb))]" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Аватар (необязательно)</div>
                        <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">Можно пропустить и добавить позже в настройках.</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/45 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            try {
                              const file = e.target.files?.[0] || null;
                              if (!file) return;
                              const url = await readFileAsDataUrl(file);
                              setAvatarDataUrl(url);
                            } catch (err) {
                              setError(String(err?.message || err || 'Ошибка'));
                            }
                          }}
                        />
                        <ImagePlus className="h-4 w-4" />
                        Выбрать
                      </label>
                      {avatarDataUrl ? (
                        <button
                          type="button"
                          onClick={() => {
                            hapticTap();
                            setAvatarDataUrl(null);
                          }}
                          className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                        >
                          Убрать
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <AnimatePresence>
                    {error ? (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="rounded-2xl bg-[rgb(var(--orb-danger-rgb))]/10 px-4 py-3 text-xs font-medium text-[rgb(var(--orb-danger-rgb))] ring-1 ring-[rgb(var(--orb-danger-rgb))]/20"
                      >
                        {error}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <button
                    type="submit"
                    className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-4 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_28px_rgba(59,130,246,0.18)] transition-all duration-300 ease-in-out active:scale-95"
                  >
                    Далее
                  </button>
                </motion.form>
              ) : null}

              {step === 2 ? (
                <motion.form
                  key="s2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!busy) {
                      hapticTap();
                      void submit();
                    }
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="grid gap-3"
                >
                  <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/30 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                    <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Твой Peer ID</div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate font-mono text-xs text-[rgb(var(--orb-text-rgb))]">{maskedPeerId}</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            hapticTap();
                            setRevealId((v) => !v);
                          }}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
                          aria-label={revealId ? 'Скрыть Peer ID' : 'Показать Peer ID'}
                          title={revealId ? 'Скрыть' : 'Показать'}
                        >
                          {revealId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          disabled={!canClipboard || !revealId}
                          onClick={async () => {
                            hapticTap();
                            if (!canClipboard || !revealId) return;
                            try {
                              await navigator.clipboard.writeText(identity.peerId);
                            } catch (_) {
                            }
                          }}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/50 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60"
                          aria-label="Копировать Peer ID"
                          title={revealId ? 'Копировать' : 'Сначала нажми Показать'}
                        >
                          <ClipboardCopy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-[rgb(var(--orb-muted-rgb))]">ID скрыт по умолчанию. Показывай и отправляй его только тем, кому доверяешь.</div>
                  </div>

                  {error ? <div className="text-xs text-[rgb(var(--orb-danger-rgb))]">{error}</div> : null}

                  <button
                    type="submit"
                    disabled={busy}
                    className={cx(
                      'inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[rgb(var(--orb-accent-rgb))] px-4 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_28px_rgba(59,130,246,0.18)] transition-all duration-300 ease-in-out active:scale-95',
                      busy ? 'opacity-70' : ''
                    )}
                  >
                    <LogIn className="h-4 w-4" />
                    Завершить
                  </button>
                </motion.form>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
