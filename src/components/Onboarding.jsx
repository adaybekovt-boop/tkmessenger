import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ClipboardCopy, ChevronLeft, Eye, EyeOff, ImagePlus, LogIn, ShieldCheck, FileText } from 'lucide-react';
import OrbitsLogo from './OrbitsLogo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getOrCreateIdentity } from '../core/identity.js';
import { hapticTap } from '../core/haptics.js';
import { passwordStrength, validatePassword, validatePasswordConfirm, validateUsername } from '../core/authValidation.js';
import { cx } from '../utils/common.js';
import { fileToAvatarDataUrl } from '../core/avatarResize.js';

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
  const [policyAccepted, setPolicyAccepted] = useState(false);
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

  const readFileAsDataUrl = (file) => fileToAvatarDataUrl(file);

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
    setStep((s) => Math.min(3, s + 1));
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
    if (!policyAccepted) {
      setError('Подтвердите согласие с Политикой конфиденциальности');
      return;
    }
    const name = vU.value;
    setBusy(true);
    try {
      try { localStorage.setItem('orbits_policy_accepted_at', String(Date.now())); } catch (_) {}
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
          <div className="orb-blur rounded-[28px] bg-[rgb(var(--orb-surface-rgb))]/30 p-5 ring-1 ring-white/[0.08]">
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
                  className="h-11 w-full rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-white/[0.08] placeholder:text-[rgb(var(--orb-muted-rgb))] transition-all duration-300 ease-in-out focus:ring-[rgb(var(--orb-accent-rgb))]/40 focus:border-[rgb(var(--orb-accent-rgb))]/30"
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
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 text-[rgb(var(--orb-text-rgb))] ring-1 ring-white/[0.08] transition-all duration-300 ease-in-out active:scale-95"
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
                    'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl orb-gradient px-4 text-sm font-semibold text-white shadow-lg shadow-[rgb(var(--orb-accent-rgb))]/25 transition-all duration-300 ease-in-out active:scale-95',
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
        <div className="orb-blur rounded-[28px] bg-[rgb(var(--orb-surface-rgb))]/30 p-5 ring-1 ring-white/[0.08]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <OrbitsLogo showText={false} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">ORBITS P2P</div>
                <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">Регистрация (4 шага)</div>
              </div>
            </div>
            {step > 0 ? (
              <button
                type="button"
                onClick={() => {
                  hapticTap();
                  setStep((s) => Math.max(0, s - 1));
                }}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 text-[rgb(var(--orb-text-rgb))] ring-1 ring-white/[0.08] transition-all duration-300 ease-in-out active:scale-95"
                aria-label="Назад"
                title="Назад"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="mt-4 flex items-center gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cx(
                  'h-1.5 flex-1 rounded-full transition-all duration-300',
                  i <= step ? 'orb-gradient shadow-sm shadow-[rgb(var(--orb-accent-rgb))]/20' : 'bg-white/[0.06] ring-1 ring-white/[0.06]'
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
                  <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/30 p-4 ring-1 ring-white/[0.08]">
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/45 ring-1 ring-white/[0.08]">
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
                    className="inline-flex h-11 w-full items-center justify-center rounded-2xl orb-gradient px-4 text-sm font-semibold text-white shadow-lg shadow-[rgb(var(--orb-accent-rgb))]/25 transition-all duration-300 ease-in-out active:scale-95"
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
                      className="h-11 w-full rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-white/[0.08] placeholder:text-[rgb(var(--orb-muted-rgb))] transition-all duration-300 ease-in-out focus:ring-[rgb(var(--orb-accent-rgb))]/40 focus:border-[rgb(var(--orb-accent-rgb))]/30"
                    />
                  </label>

                  <div className="grid gap-2 rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/30 p-4 ring-1 ring-white/[0.08]">
                    <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Пароль</div>
                    <div className="grid gap-2">
                      <input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        type={showPass ? 'text' : 'password'}
                        placeholder="Минимум 8 символов"
                        className="h-11 w-full rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-white/[0.08] placeholder:text-[rgb(var(--orb-muted-rgb))] transition-all duration-300 ease-in-out focus:ring-[rgb(var(--orb-accent-rgb))]/40 focus:border-[rgb(var(--orb-accent-rgb))]/30"
                      />
                      <input
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        type={showPass ? 'text' : 'password'}
                        placeholder="Повтори пароль"
                        className="h-11 w-full rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-white/[0.08] placeholder:text-[rgb(var(--orb-muted-rgb))] transition-all duration-300 ease-in-out focus:ring-[rgb(var(--orb-accent-rgb))]/40 focus:border-[rgb(var(--orb-accent-rgb))]/30"
                      />
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] text-[rgb(var(--orb-muted-rgb))]">Сила: {passwordStrength(password)}/5</div>
                        <button
                          type="button"
                          onClick={() => {
                            hapticTap();
                            setShowPass((v) => !v);
                          }}
                          className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-white/[0.08] transition-all duration-300 ease-in-out active:scale-95"
                        >
                          {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          {showPass ? 'Скрыть' : 'Показать'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/30 p-4 ring-1 ring-white/[0.08]">
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/45 ring-1 ring-white/[0.08]">
                        {avatarDataUrl ? <img alt="" src={avatarDataUrl} className="h-full w-full object-cover" /> : <ImagePlus className="h-4 w-4 text-[rgb(var(--orb-muted-rgb))]" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Аватар (необязательно)</div>
                        <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">Можно пропустить и добавить позже в настройках.</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/45 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-white/[0.08] transition-all duration-300 ease-in-out active:scale-95">
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
                          className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-white/[0.08] transition-all duration-300 ease-in-out active:scale-95"
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
                    className="inline-flex h-11 w-full items-center justify-center rounded-2xl orb-gradient px-4 text-sm font-semibold text-white shadow-lg shadow-[rgb(var(--orb-accent-rgb))]/25 transition-all duration-300 ease-in-out active:scale-95"
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
                    hapticTap();
                    void goNext();
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="grid gap-3"
                >
                  <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/30 p-4 ring-1 ring-white/[0.08]">
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
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/35 text-[rgb(var(--orb-text-rgb))] ring-1 ring-white/[0.08] transition-all duration-300 ease-in-out active:scale-95"
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
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/50 text-[rgb(var(--orb-text-rgb))] ring-1 ring-white/[0.08] transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60"
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
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl orb-gradient px-4 text-sm font-semibold text-white shadow-lg shadow-[rgb(var(--orb-accent-rgb))]/25 transition-all duration-300 ease-in-out active:scale-95"
                  >
                    Далее
                  </button>
                </motion.form>
              ) : null}

              {step === 3 ? (
                <motion.form
                  key="s3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!busy && policyAccepted) {
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
                  <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/30 p-4 ring-1 ring-white/[0.08]">
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/45 ring-1 ring-white/[0.08]">
                        <FileText className="h-4 w-4 text-[rgb(var(--orb-text-rgb))]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Политика конфиденциальности</div>
                        <div className="mt-0.5 text-xs text-[rgb(var(--orb-muted-rgb))]">Прочтите и подтвердите согласие, чтобы завершить регистрацию.</div>
                      </div>
                    </div>

                    <div className="mt-3 max-h-[40vh] overflow-y-auto rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 p-3 ring-1 ring-white/[0.06] text-[12px] leading-relaxed text-[rgb(var(--orb-text-rgb))]">
                      <div className="space-y-3">
                        <section>
                          <div className="font-semibold">1. Основные понятия</div>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-[rgb(var(--orb-muted-rgb))]">
                            <li><span className="text-[rgb(var(--orb-text-rgb))]">P2P-мессенджер:</span> децентрализованная сеть, где данные передаются напрямую между устройствами пользователей без участия промежуточных серверов Оператора.</li>
                            <li><span className="text-[rgb(var(--orb-text-rgb))]">Сквозное шифрование (E2EE):</span> метод шифрования, при котором данные расшифровываются только на устройстве конечного пользователя.</li>
                            <li><span className="text-[rgb(var(--orb-text-rgb))]">Персональные данные:</span> любая информация, относящаяся к прямо или косвенно определённому физическому лицу.</li>
                          </ul>
                        </section>

                        <section>
                          <div className="font-semibold">2. Сбор и обработка персональных данных</div>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-[rgb(var(--orb-muted-rgb))]">
                            <li><span className="text-[rgb(var(--orb-text-rgb))]">Предоставляемые пользователем:</span> идентификатор учётной записи (например, публичный ключ), никнейм, аватар, контактная информация (если требуется для верификации).</li>
                            <li><span className="text-[rgb(var(--orb-text-rgb))]">Технические данные для функциональности:</span> IP-адрес (временный), информация об устройстве (модель, ОС), версия приложения.</li>
                            <li><span className="text-[rgb(var(--orb-text-rgb))]">Важно!</span> Оператор НЕ обрабатывает и НЕ хранит содержание сообщений, файлов, историю звонков, геолокацию и иные метаданные. Вся коммуникация происходит напрямую между пользователями (P2P) и защищена сквозным шифрованием — ключи хранятся только на устройствах пользователей.</li>
                          </ul>
                        </section>

                        <section>
                          <div className="font-semibold">3. Цели обработки персональных данных</div>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-[rgb(var(--orb-muted-rgb))]">
                            <li>Предоставление функционала мессенджера (доставка сообщений, авторизация).</li>
                            <li>Обеспечение безопасности и предотвращение мошенничества (анализ технических данных).</li>
                            <li>Улучшение и развитие Сервиса (сбор анонимной статистики).</li>
                          </ul>
                        </section>

                        <section>
                          <div className="font-semibold">4. Передача данных третьим лицам</div>
                          <p className="mt-1 text-[rgb(var(--orb-muted-rgb))]">Оператор не передаёт персональные данные третьим лицам, за исключением случаев, предусмотренных законодательством РФ (по запросу суда или иных уполномоченных органов).</p>
                        </section>

                        <section>
                          <div className="font-semibold">5. Меры безопасности</div>
                          <p className="mt-1 text-[rgb(var(--orb-muted-rgb))]">Оператор использует все доступные технические средства для защиты данных от несанкционированного доступа, включая шифрование каналов связи, защиту серверов и регулярное обновление ПО.</p>
                        </section>

                        <section>
                          <div className="font-semibold">6. Права пользователей</div>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-[rgb(var(--orb-muted-rgb))]">
                            <li>Требовать уточнения, блокировки или уничтожения своих персональных данных.</li>
                            <li>Отозвать согласие на обработку персональных данных, направив письменное уведомление Оператору.</li>
                            <li>Получить информацию о своих персональных данных, обратившись к Оператору.</li>
                          </ul>
                        </section>

                        <section>
                          <div className="font-semibold">7. Ответственность пользователей</div>
                          <p className="mt-1 text-[rgb(var(--orb-muted-rgb))]">Пользователь несёт полную ответственность за соответствие передаваемого контента (сообщений, файлов) требованиям действующего законодательства РФ.</p>
                        </section>

                        <section>
                          <div className="font-semibold">8. Отказ от ответственности Оператора</div>
                          <p className="mt-1 text-[rgb(var(--orb-muted-rgb))]">Оператор НЕ НЕСЁТ ОТВЕТСТВЕННОСТИ:</p>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-[rgb(var(--orb-muted-rgb))]">
                            <li>За любые действия пользователей Сервиса, включая мошеннические, клеветнические или иные противоправные действия.</li>
                            <li>За сохранность данных на устройстве пользователя и за последствия компрометации его устройства или учётных данных.</li>
                            <li>За содержание сообщений, файлов и иной информации, передаваемой с помощью Сервиса. Обеспечение конфиденциальности и безопасности переписки на своём устройстве — прямая обязанность пользователя.</li>
                            <li>За убытки любого рода (включая косвенные), возникшие в результате использования или невозможности использования Сервиса.</li>
                          </ul>
                        </section>

                        <section>
                          <div className="font-semibold">9. Изменение Политики</div>
                          <p className="mt-1 text-[rgb(var(--orb-muted-rgb))]">Оператор имеет право вносить изменения в настоящую Политику. Все изменения публикуются в этом разделе. Продолжение использования Сервиса после публикации изменений означает автоматическое согласие пользователя с ними.</p>
                        </section>

                        <section>
                          <div className="font-semibold">10. Контактная информация</div>
                          <p className="mt-1 text-[rgb(var(--orb-muted-rgb))]">По всем вопросам, связанным с Политикой, пользователь может обратиться к Оператору по адресу электронной почты, указанному в разделе поддержки приложения.</p>
                        </section>
                      </div>
                    </div>

                    <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/40 p-3 ring-1 ring-white/[0.08]">
                      <input
                        type="checkbox"
                        checked={policyAccepted}
                        onChange={(e) => {
                          hapticTap();
                          setPolicyAccepted(e.target.checked);
                        }}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--orb-accent-rgb))]"
                      />
                      <span className="text-xs text-[rgb(var(--orb-text-rgb))]">Я прочитал(а) и согласен(а) с Политикой конфиденциальности.</span>
                    </label>
                  </div>

                  {error ? <div className="text-xs text-[rgb(var(--orb-danger-rgb))]">{error}</div> : null}

                  <button
                    type="submit"
                    disabled={busy || !policyAccepted}
                    className={cx(
                      'inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl orb-gradient px-4 text-sm font-semibold text-white shadow-lg shadow-[rgb(var(--orb-accent-rgb))]/25 transition-all duration-300 ease-in-out active:scale-95',
                      (busy || !policyAccepted) ? 'opacity-60' : ''
                    )}
                  >
                    <LogIn className="h-4 w-4" />
                    Принять и завершить
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
