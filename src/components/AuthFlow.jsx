import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, Globe2, LogIn, Shield, UserPlus2 } from 'lucide-react';
import OrbitsLogo from './OrbitsLogo.jsx';
import { passwordStrength, validatePassword, validatePasswordConfirm, validateUsername } from '../core/authValidation.js';
import { useAuth } from '../context/AuthContext.jsx';

function cx(...v) {
  return v.filter(Boolean).join(' ');
}

const LANG_KEY = 'orbits_lang_v2';
const DRAFT_KEY = 'orbits_reg_draft_v1';

const STR = {
  ru: {
    chooseTitle: 'Добро пожаловать',
    chooseSub: 'Войди или зарегистрируйся, чтобы начать',
    login: 'Войти',
    register: 'Зарегистрироваться',
    usernameTitle: 'Придумай ник',
    usernameSub: 'Уникальный, 3–30 символов: латиница, цифры и _',
    passwordTitle: 'Задай пароль',
    passwordSub: 'Минимум 8 символов, рекомендуется смешивать классы',
    profileTitle: 'Профиль',
    profileSub: 'Можно пропустить и заполнить позже в настройках',
    next: 'Далее',
    back: 'Назад',
    skip: 'Пропустить',
    create: 'Создать аккаунт',
    username: 'Никнейм',
    password: 'Пароль',
    confirm: 'Повтори пароль',
    displayName: 'Имя для отображения',
    bio: 'Описание',
    avatar: 'Аватар',
    availabilityChecking: 'Проверяем…',
    availabilityFree: 'Свободно',
    availabilityTaken: 'Уже занято',
    strength: 'Сложность',
    strength0: 'слабый',
    strength1: 'слабый',
    strength2: 'нормальный',
    strength3: 'хороший',
    strength4: 'сильный',
    strength5: 'очень сильный',
    invalidUsername: 'Ник должен быть 3–30 символов: a-z, 0-9, _',
    invalidPassword: 'Пароль минимум 8 символов',
    mismatch: 'Пароли не совпадают'
  },
  en: {
    chooseTitle: 'Welcome',
    chooseSub: 'Log in or sign up to continue',
    login: 'Log in',
    register: 'Sign up',
    usernameTitle: 'Choose a username',
    usernameSub: 'Unique, 3–30 chars: latin, digits and _',
    passwordTitle: 'Set a password',
    passwordSub: 'Minimum 8 chars, mix character classes',
    profileTitle: 'Profile',
    profileSub: 'You can skip and fill it later in settings',
    next: 'Next',
    back: 'Back',
    skip: 'Skip',
    create: 'Create account',
    username: 'Username',
    password: 'Password',
    confirm: 'Confirm password',
    displayName: 'Display name',
    bio: 'Bio',
    avatar: 'Avatar',
    availabilityChecking: 'Checking…',
    availabilityFree: 'Available',
    availabilityTaken: 'Taken',
    strength: 'Strength',
    strength0: 'weak',
    strength1: 'weak',
    strength2: 'ok',
    strength3: 'good',
    strength4: 'strong',
    strength5: 'very strong',
    invalidUsername: '3–30 chars: a-z, 0-9, _',
    invalidPassword: 'Minimum 8 characters',
    mismatch: 'Passwords do not match'
  }
};

function getDefaultLang() {
  const stored = localStorage.getItem(LANG_KEY);
  if (stored === 'ru' || stored === 'en') return stored;
  const nav = (navigator.language || '').toLowerCase();
  return nav.startsWith('ru') ? 'ru' : 'en';
}

function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

function writeDraft(d) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch (_) {
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (_) {
  }
}

function StepCard({ title, subtitle, children }) {
  return (
    <div className="rounded-[28px] bg-[rgb(var(--orb-surface-rgb))]/30 p-5 ring-1 ring-[rgb(var(--orb-border-rgb))]">
      <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">{title}</div>
      <div className="mt-1 text-xs text-[rgb(var(--orb-muted-rgb))]">{subtitle}</div>
      <div className="mt-4 grid gap-3">{children}</div>
    </div>
  );
}

function Field({ label, error, children, hintId }) {
  const errId = error ? `${hintId}-err` : undefined;
  return (
    <label className="grid gap-1">
      <span className="text-xs text-[rgb(var(--orb-muted-rgb))]">{label}</span>
      {children(errId)}
      {error ? (
        <span id={errId} className="text-xs text-[rgb(var(--orb-danger-rgb))]">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export default function AuthFlow() {
  const auth = useAuth();
  const [lang, setLang] = useState(getDefaultLang);
  const t = STR[lang];

  const draft = useMemo(() => readDraft(), []);
  const [screen, setScreen] = useState(draft?.screen || 'choose');
  const [regStep, setRegStep] = useState(draft?.regStep || 1);

  const [username, setUsername] = useState(draft?.username || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [displayName, setDisplayName] = useState(draft?.displayName || '');
  const [bio, setBio] = useState(draft?.bio || '');
  const [avatarFile, setAvatarFile] = useState(null);

  const [busy, setBusy] = useState(false);
  const [globalError, setGlobalError] = useState('');

  const [availability, setAvailability] = useState({ state: 'idle', ok: false });
  const checkTimerRef = useRef(0);

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  useEffect(() => {
    writeDraft({ screen, regStep, username, displayName, bio });
  }, [bio, displayName, regStep, screen, username]);

  useEffect(() => {
    if (screen !== 'register' || regStep !== 1) return;
    const v = validateUsername(username);
    if (!v.ok) {
      setAvailability({ state: 'idle', ok: false });
      return;
    }
    setAvailability({ state: 'checking', ok: false });
    window.clearTimeout(checkTimerRef.current);
    checkTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await auth.checkUsername(v.value);
        setAvailability({ state: 'done', ok: res.available });
      } catch (_) {
        setAvailability({ state: 'done', ok: false });
      }
    }, 250);
    return () => window.clearTimeout(checkTimerRef.current);
  }, [auth, regStep, screen, username]);

  const usernameErr = useMemo(() => {
    if (screen !== 'register' || regStep !== 1) return '';
    const v = validateUsername(username);
    if (!v.ok) return t.invalidUsername;
    if (availability.state === 'done' && !availability.ok) return t.availabilityTaken;
    return '';
  }, [availability.ok, availability.state, regStep, screen, t.invalidUsername, t.availabilityTaken, username]);

  const passErr = useMemo(() => {
    if (screen !== 'register' || regStep !== 2) return '';
    const v = validatePassword(password);
    if (!v.ok) return t.invalidPassword;
    return '';
  }, [password, regStep, screen, t.invalidPassword]);

  const confirmErr = useMemo(() => {
    if (screen !== 'register' || regStep !== 2) return '';
    const v = validatePasswordConfirm(password, confirm);
    if (!v.ok) return t.mismatch;
    return '';
  }, [confirm, password, regStep, screen, t.mismatch]);

  const strength = useMemo(() => passwordStrength(password), [password]);

  const strengthLabel = useMemo(() => {
    return t[`strength${strength}`] || t.strength0;
  }, [strength, t]);

  const canLogin = useMemo(() => {
    return validateUsername(username).ok && password.length > 0;
  }, [password.length, username]);

  const canNextUsername = useMemo(() => {
    const v = validateUsername(username);
    if (!v.ok) return false;
    if (availability.state !== 'done') return false;
    return availability.ok;
  }, [availability.ok, availability.state, username]);

  const canNextPassword = useMemo(() => {
    return validatePassword(password).ok && validatePasswordConfirm(password, confirm).ok;
  }, [confirm, password]);

  const onLogin = async () => {
    setGlobalError('');
    setBusy(true);
    try {
      await auth.login({ username, password });
      clearDraft();
    } catch (e) {
      setGlobalError(String(e?.message || 'Ошибка'));
    } finally {
      setBusy(false);
    }
  };

  const onRegisterCommit = async () => {
    setGlobalError('');
    setBusy(true);
    try {
      await auth.registerCommit({ username, password, confirm, displayName, bio, avatarFile });
      clearDraft();
    } catch (e) {
      setGlobalError(String(e?.message || 'Ошибка'));
    } finally {
      setBusy(false);
    }
  };

  const Header = (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={() => {
          if (screen === 'choose') return;
          if (screen === 'login') {
            setScreen('choose');
            return;
          }
          if (screen === 'register') {
            if (regStep > 1) setRegStep((s) => s - 1);
            else setScreen('choose');
          }
        }}
        className={cx(
          'inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/50 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95',
          screen === 'choose' ? 'opacity-0 pointer-events-none' : ''
        )}
        aria-label={t.back}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setLang((l) => (l === 'ru' ? 'en' : 'ru'))}
        className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--orb-surface-rgb))]/50 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
      >
        <Globe2 className="h-4 w-4" />
        {lang.toUpperCase()}
      </button>
    </div>
  );

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[rgb(var(--orb-bg-rgb))]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute -top-24 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle at 30% 30%, rgba(var(--orb-accent-rgb),0.35), transparent 60%)' }}
        />
      </div>

      <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center px-5">
        <div className="flex items-center justify-center">
          <OrbitsLogo variant="stack" />
        </div>

        <div className="mt-6 grid gap-3">
          {Header}

          {screen === 'choose' ? (
            <StepCard title={t.chooseTitle} subtitle={t.chooseSub}>
              <button
                type="button"
                onClick={() => setScreen('login')}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-3xl bg-[rgb(var(--orb-accent-rgb))] px-5 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_28px_rgba(59,130,246,0.18)] transition-all duration-300 ease-in-out active:scale-95"
              >
                <LogIn className="h-4 w-4" />
                {t.login}
              </button>
              <button
                type="button"
                onClick={() => {
                  setScreen('register');
                  setRegStep(1);
                }}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/40 px-5 text-sm font-semibold text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
              >
                <UserPlus2 className="h-4 w-4" />
                {t.register}
              </button>
            </StepCard>
          ) : null}

          {screen === 'login' ? (
            <StepCard title={t.login} subtitle="">
              <Field label={t.username} error={validateUsername(username).ok ? '' : t.invalidUsername} hintId="login-user">
                {(errId) => (
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-12 rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                    autoComplete="username"
                    aria-invalid={!!errId}
                    aria-describedby={errId}
                  />
                )}
              </Field>

              <Field label={t.password} error={password ? '' : ''} hintId="login-pass">
                {(errId) => (
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                    type="password"
                    autoComplete="current-password"
                    aria-describedby={errId}
                  />
                )}
              </Field>

              {globalError ? <div className="text-xs text-[rgb(var(--orb-danger-rgb))]">{globalError}</div> : null}

              <button
                type="button"
                onClick={onLogin}
                disabled={!canLogin || busy}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-3xl bg-[rgb(var(--orb-accent-rgb))] px-5 text-sm font-semibold text-white transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60"
              >
                <Shield className="h-4 w-4" />
                {t.login}
              </button>
            </StepCard>
          ) : null}

          {screen === 'register' && regStep === 1 ? (
            <StepCard title={t.usernameTitle} subtitle={t.usernameSub}>
              <Field label={t.username} error={usernameErr} hintId="reg-user">
                {(errId) => (
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-12 rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                    autoComplete="username"
                    aria-invalid={!!errId}
                    aria-describedby={errId}
                  />
                )}
              </Field>

              <div className="flex items-center justify-between text-xs text-[rgb(var(--orb-muted-rgb))]">
                <span>
                  {availability.state === 'checking'
                    ? t.availabilityChecking
                    : availability.state === 'done'
                      ? availability.ok
                        ? t.availabilityFree
                        : t.availabilityTaken
                      : '—'}
                </span>
                {availability.state === 'done' && availability.ok ? <Check className="h-4 w-4 text-[rgb(var(--orb-success-rgb))]" /> : null}
              </div>

              <button
                type="button"
                onClick={() => setRegStep(2)}
                disabled={!canNextUsername}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-3xl bg-[rgb(var(--orb-accent-rgb))] px-5 text-sm font-semibold text-white transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60"
              >
                {t.next}
              </button>
            </StepCard>
          ) : null}

          {screen === 'register' && regStep === 2 ? (
            <StepCard title={t.passwordTitle} subtitle={t.passwordSub}>
              <Field label={t.password} error={passErr} hintId="reg-pass">
                {(errId) => (
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={!!errId}
                    aria-describedby={errId}
                  />
                )}
              </Field>

              <Field label={t.confirm} error={confirmErr} hintId="reg-confirm">
                {(errId) => (
                  <input
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="h-12 rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={!!errId}
                    aria-describedby={errId}
                  />
                )}
              </Field>

              <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-3 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                <div className="flex items-center justify-between text-xs text-[rgb(var(--orb-muted-rgb))]">
                  <span>
                    {t.strength}: <span className="text-[rgb(var(--orb-text-rgb))]">{strengthLabel}</span>
                  </span>
                  <span className="font-mono">{strength}/5</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--orb-surface-rgb))]/70 ring-1 ring-[rgb(var(--orb-border-rgb))]">
                  <div
                    className="h-full rounded-full bg-[rgb(var(--orb-accent-rgb))] transition-all duration-300 ease-in-out"
                    style={{ width: `${Math.round((strength / 5) * 100)}%` }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setRegStep(3)}
                disabled={!canNextPassword}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-3xl bg-[rgb(var(--orb-accent-rgb))] px-5 text-sm font-semibold text-white transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60"
              >
                {t.next}
              </button>
            </StepCard>
          ) : null}

          {screen === 'register' && regStep === 3 ? (
            <StepCard title={t.profileTitle} subtitle={t.profileSub}>
              <Field label={t.displayName} error={''} hintId="reg-dn">
                {(errId) => (
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-12 rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                    aria-describedby={errId}
                    placeholder={username}
                  />
                )}
              </Field>

              <Field label={t.bio} error={''} hintId="reg-bio">
                {(errId) => (
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 py-3 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                    aria-describedby={errId}
                  />
                )}
              </Field>

              <label className="grid gap-1">
                <span className="text-xs text-[rgb(var(--orb-muted-rgb))]">{t.avatar}</span>
                <input type="file" accept="image/*" onChange={(e) => setAvatarFile(e.target.files?.[0] || null)} className="text-xs text-[rgb(var(--orb-muted-rgb))]" />
              </label>

              {globalError ? <div className="text-xs text-[rgb(var(--orb-danger-rgb))]">{globalError}</div> : null}

              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={onRegisterCommit}
                  disabled={busy}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-3xl bg-[rgb(var(--orb-accent-rgb))] px-5 text-sm font-semibold text-white transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60"
                >
                  <UserPlus2 className="h-4 w-4" />
                  {t.create}
                </button>
                <button
                  type="button"
                  onClick={onRegisterCommit}
                  disabled={busy}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-3xl bg-[rgb(var(--orb-surface-rgb))]/40 px-5 text-sm font-semibold text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60"
                >
                  {t.skip}
                </button>
              </div>
            </StepCard>
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[rgb(var(--orb-muted-rgb))]">
          <Shield className="h-3.5 w-3.5" />
          {lang === 'ru' ? 'Данные хранятся локально на этом устройстве.' : 'Data is stored locally on this device.'}
        </div>
      </div>
    </div>
  );
}

