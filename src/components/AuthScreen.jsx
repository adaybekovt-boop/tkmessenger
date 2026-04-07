import { useMemo, useState } from 'react';
import { Lock, LogIn, UserPlus2 } from 'lucide-react';
import OrbitsLogo from './OrbitsLogo.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function cx(...v) {
  return v.filter(Boolean).join(' ');
}

export default function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState('login');

  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [confirmPassword, setConfirmPassword] = useState('');

  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const title = mode === 'login' ? 'Вход' : 'Регистрация';
  const actionLabel = mode === 'login' ? 'Войти' : 'Создать аккаунт';

  const canSubmit = useMemo(() => {
    if (!nickname.trim()) return false;
    if (!password.trim()) return false;
    if (mode === 'register' && password !== confirmPassword) return false;
    return true;
  }, [confirmPassword, mode, nickname, password]);

  const submit = async () => {
    if (!canSubmit || busy) return;
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await auth.login({ username: nickname, password });
      } else {
        if (password !== confirmPassword) throw new Error('Пароли не совпадают');
        await auth.registerCommit({ username: nickname, password, confirm: confirmPassword, displayName, bio, avatarFile });
      }
    } catch (e) {
      const msg = e?.message ? String(e.message) : 'Ошибка';
      if (/null is not an object|evaluating|undefined is not an object/i.test(msg)) {
        setErr('Не удалось обработать аватар. Попробуй другое изображение или без аватара.');
      } else {
        setErr(msg);
      }
    } finally {
      setBusy(false);
    }
  };

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

        <div className="mt-6 rounded-[28px] bg-[rgb(var(--orb-surface-rgb))]/30 p-5 ring-1 ring-[rgb(var(--orb-border-rgb))]">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">{title}</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={cx(
                  'rounded-2xl px-3 py-2 text-xs ring-1 transition-all duration-300 ease-in-out active:scale-95',
                  mode === 'login'
                    ? 'bg-[rgb(var(--orb-bg-rgb))]/45 text-[rgb(var(--orb-text-rgb))] ring-[rgb(var(--orb-border-rgb))]'
                    : 'bg-transparent text-[rgb(var(--orb-muted-rgb))] ring-transparent hover:bg-[rgb(var(--orb-bg-rgb))]/35'
                )}
              >
                Вход
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={cx(
                  'rounded-2xl px-3 py-2 text-xs ring-1 transition-all duration-300 ease-in-out active:scale-95',
                  mode === 'register'
                    ? 'bg-[rgb(var(--orb-bg-rgb))]/45 text-[rgb(var(--orb-text-rgb))] ring-[rgb(var(--orb-border-rgb))]'
                    : 'bg-transparent text-[rgb(var(--orb-muted-rgb))] ring-transparent hover:bg-[rgb(var(--orb-bg-rgb))]/35'
                )}
              >
                Регистрация
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-[rgb(var(--orb-muted-rgb))]">Ник</span>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="h-12 rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                placeholder="Например: orbit"
                autoComplete="username"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-[rgb(var(--orb-muted-rgb))]">Пароль</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                placeholder="Минимум 4 символа"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>

            {mode === 'register' ? (
              <label className="grid gap-1">
                <span className="text-xs text-[rgb(var(--orb-muted-rgb))]">Повтори пароль</span>
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-12 rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                  placeholder="Повтори пароль"
                  type="password"
                  autoComplete="new-password"
                />
              </label>
            ) : null}

            {mode === 'register' ? (
              <>
                <label className="grid gap-1">
                  <span className="text-xs text-[rgb(var(--orb-muted-rgb))]">Отображаемое имя</span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-12 rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                    placeholder="Как тебя будут видеть"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-xs text-[rgb(var(--orb-muted-rgb))]">Описание</span>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/40 px-4 py-3 text-sm text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))]"
                    placeholder="Пара строк о себе"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-xs text-[rgb(var(--orb-muted-rgb))]">Аватар</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                    className="text-xs text-[rgb(var(--orb-muted-rgb))]"
                  />
                </label>

              </>
            ) : null}

            {err ? <div className="text-xs text-[rgb(var(--orb-danger-rgb))]">{err}</div> : null}

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit || busy}
              className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-3xl bg-[rgb(var(--orb-accent-rgb))] px-5 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_0_28px_rgba(59,130,246,0.18)] transition-all duration-300 ease-in-out active:scale-95 disabled:opacity-60"
            >
              {mode === 'login' ? <LogIn className="h-4 w-4" /> : <UserPlus2 className="h-4 w-4" />}
              {actionLabel}
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[rgb(var(--orb-muted-rgb))]">
          <Lock className="h-3.5 w-3.5" />
          Данные хранятся локально на этом устройстве.
        </div>
      </div>
    </div>
  );
}
