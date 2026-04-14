import { useState } from 'react';
import { getNotifSettings, saveNotifSettings } from '../core/notifications.js';
import { playSound } from '../core/sounds.js';

function cx(...v) {
  return v.filter(Boolean).join(' ');
}

// ─── Bubble style presets ────────────────────────────────────────────────────

const BUBBLE_STYLES = [
  { id: 'rounded',  label: 'Округлый',     radius: 'rounded-3xl' },
  { id: 'soft',     label: 'Мягкий',       radius: 'rounded-2xl' },
  { id: 'square',   label: 'Квадратный',   radius: 'rounded-lg' },
  { id: 'bubble',   label: 'Пузырь',       radius: 'rounded-[1.75rem]' },
];

// ─── Color presets ───────────────────────────────────────────────────────────

const MY_COLOR_PRESETS = [
  { id: 'accent',  label: 'Акцент',   bg: 'bg-[#1e2a38]', ring: 'ring-[#2a3a4a]' },
  { id: 'blue',    label: 'Синий',    bg: 'bg-blue-500/15',    ring: 'ring-blue-500/25' },
  { id: 'violet',  label: 'Фиолет',  bg: 'bg-violet-500/15',  ring: 'ring-violet-500/25' },
  { id: 'emerald', label: 'Изумруд', bg: 'bg-emerald-500/15', ring: 'ring-emerald-500/25' },
  { id: 'rose',    label: 'Роза',     bg: 'bg-rose-500/15',    ring: 'ring-rose-500/25' },
  { id: 'amber',   label: 'Янтарь',  bg: 'bg-amber-500/15',   ring: 'ring-amber-500/25' },
];

const PEER_COLOR_PRESETS = [
  { id: 'default', label: 'По умолч.', bg: 'bg-[#1a1a1a]', ring: 'ring-[#2a2a2e]' },
  { id: 'slate',   label: 'Сланец',   bg: 'bg-slate-500/12',   ring: 'ring-slate-500/20' },
  { id: 'zinc',    label: 'Цинк',     bg: 'bg-zinc-500/12',    ring: 'ring-zinc-500/20' },
  { id: 'stone',   label: 'Камень',   bg: 'bg-stone-500/12',   ring: 'ring-stone-500/20' },
  { id: 'sky',     label: 'Небо',     bg: 'bg-sky-500/10',     ring: 'ring-sky-500/20' },
];

const FONT_SIZES = [
  { id: 'xs',   label: 'XS',  cls: 'text-xs' },
  { id: 'sm',   label: 'S',   cls: 'text-sm' },
  { id: 'base', label: 'M',   cls: 'text-base' },
  { id: 'lg',   label: 'L',   cls: 'text-lg' },
  { id: 'xl',   label: 'XL',  cls: 'text-xl' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getBubbleRadius(prefs) {
  const style = BUBBLE_STYLES.find((s) => s.id === prefs?.bubbleStyle);
  return style?.radius || 'rounded-3xl';
}

export function getMyBubbleColors(prefs) {
  const preset = MY_COLOR_PRESETS.find((p) => p.id === prefs?.myColor);
  if (preset) return `${preset.bg} ring-1 ${preset.ring}`;
  return 'bg-[#1e2a38] ring-1 ring-[#2a3a4a]';
}

export function getPeerBubbleColors(prefs) {
  const preset = PEER_COLOR_PRESETS.find((p) => p.id === prefs?.peerColor);
  if (preset) return `${preset.bg} ring-1 ${preset.ring}`;
  return 'bg-[#1a1a1a] ring-1 ring-[#2a2a2e]';
}

export function getFontSizeClass(prefs) {
  const size = FONT_SIZES.find((s) => s.id === prefs?.fontSize);
  return size?.cls || 'text-sm';
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-3 rounded-2xl bg-[rgb(var(--orb-bg-rgb))]/45 px-3 py-2 text-xs text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out active:scale-95"
      aria-pressed={checked}
    >
      <span className={cx('h-5 w-9 rounded-full ring-1 ring-[rgb(var(--orb-border-rgb))] transition-all duration-300 ease-in-out', checked ? 'bg-[rgb(var(--orb-accent-rgb))]/60' : 'bg-[rgb(var(--orb-surface-rgb))]/60')}>
        <span className={cx('block h-4 w-4 translate-y-0.5 rounded-full bg-white transition-all duration-300 ease-in-out', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChatSettings({ chatPrefs, onChange }) {
  const [soundOn, setSoundOn] = useState(() => getNotifSettings().sound !== false);

  const update = (patch) => onChange({ ...chatPrefs, ...patch });

  const currentBubble = chatPrefs.bubbleStyle || 'rounded';
  const currentMyColor = chatPrefs.myColor || 'accent';
  const currentPeerColor = chatPrefs.peerColor || 'default';
  const currentFontSize = chatPrefs.fontSize || 'sm';

  const bubbleRadius = getBubbleRadius(chatPrefs);
  const myColors = getMyBubbleColors(chatPrefs);
  const peerColors = getPeerBubbleColors(chatPrefs);
  const fontCls = getFontSizeClass(chatPrefs);

  const timeStr = new Date().toLocaleTimeString('ru-RU',
    chatPrefs.showSeconds
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' }
  );

  return (
    <div className="grid gap-4">
      {/* ── Live preview ─────────────────────────────────────────────────── */}
      <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
        <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">ПРЕДПРОСМОТР</div>
        <div className="mt-3 grid gap-2">
          <div className="flex justify-start">
            <div className={cx('max-w-[92%] px-4 py-3 text-[rgb(var(--orb-text-rgb))]', bubbleRadius, peerColors, fontCls)}>
              <div>Привет! Как дела?</div>
              <div className="mt-1 text-[11px] text-[rgb(var(--orb-muted-rgb))]">{timeStr}</div>
            </div>
          </div>
          <div className="flex justify-end">
            <div className={cx('max-w-[92%] px-4 py-3 text-[rgb(var(--orb-text-rgb))]', bubbleRadius, myColors, fontCls)}>
              <div>Отлично, работаю над проектом!</div>
              <div className="mt-1 text-[11px] text-[rgb(var(--orb-muted-rgb))]">{timeStr}</div>
            </div>
          </div>
          <div className="flex justify-start">
            <div className={cx('max-w-[92%] px-4 py-3 text-[rgb(var(--orb-text-rgb))]', bubbleRadius, peerColors, fontCls)}>
              <div>Звучит здорово!</div>
              <div className="mt-1 text-[11px] text-[rgb(var(--orb-muted-rgb))]">{timeStr}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bubble style ─────────────────────────────────────────────────── */}
      <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
        <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">СТИЛЬ ПУЗЫРЕЙ</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {BUBBLE_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => update({ bubbleStyle: s.id })}
              className={cx(
                'px-3 py-2 text-xs font-medium transition-all duration-200 active:scale-95',
                s.radius,
                currentBubble === s.id
                  ? 'bg-[rgb(var(--orb-accent-rgb))]/20 text-[rgb(var(--orb-text-rgb))] ring-1 ring-[rgb(var(--orb-accent-rgb))]/40'
                  : 'bg-[rgb(var(--orb-surface-rgb))]/50 text-[rgb(var(--orb-muted-rgb))] ring-1 ring-[rgb(var(--orb-border-rgb))] hover:text-[rgb(var(--orb-text-rgb))]'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── My message color ─────────────────────────────────────────────── */}
      <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
        <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">ЦВЕТ МОИХ СООБЩЕНИЙ</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {MY_COLOR_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => update({ myColor: p.id })}
              className={cx(
                'rounded-2xl px-3 py-2 text-xs font-medium ring-1 transition-all duration-200 active:scale-95',
                p.bg, p.ring,
                currentMyColor === p.id
                  ? 'text-[rgb(var(--orb-text-rgb))] shadow-[0_0_8px_rgba(var(--orb-accent-rgb),0.2)]'
                  : 'text-[rgb(var(--orb-muted-rgb))]'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Peer message color ───────────────────────────────────────────── */}
      <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
        <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">ЦВЕТ ЧУЖИХ СООБЩЕНИЙ</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PEER_COLOR_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => update({ peerColor: p.id })}
              className={cx(
                'rounded-2xl px-3 py-2 text-xs font-medium ring-1 transition-all duration-200 active:scale-95',
                p.bg, p.ring,
                currentPeerColor === p.id
                  ? 'text-[rgb(var(--orb-text-rgb))] shadow-[0_0_8px_rgba(var(--orb-accent-rgb),0.2)]'
                  : 'text-[rgb(var(--orb-muted-rgb))]'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Font size ────────────────────────────────────────────────────── */}
      <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
        <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">РАЗМЕР ШРИФТА</div>
        <div className="mt-3 flex items-center gap-2">
          {FONT_SIZES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => update({ fontSize: s.id })}
              className={cx(
                'grid h-10 w-10 place-items-center rounded-2xl text-xs font-semibold ring-1 transition-all duration-200 active:scale-95',
                currentFontSize === s.id
                  ? 'bg-[rgb(var(--orb-accent-rgb))]/20 text-[rgb(var(--orb-text-rgb))] ring-[rgb(var(--orb-accent-rgb))]/40'
                  : 'bg-[rgb(var(--orb-surface-rgb))]/50 text-[rgb(var(--orb-muted-rgb))] ring-[rgb(var(--orb-border-rgb))] hover:text-[rgb(var(--orb-text-rgb))]'
              )}
            >
              {s.label}
            </button>
          ))}
          <span className="ml-2 text-[11px] text-[rgb(var(--orb-muted-rgb))]">
            {FONT_SIZES.find((s) => s.id === currentFontSize)?.label || 'S'}
          </span>
        </div>
      </div>

      {/* ── Toggles ──────────────────────────────────────────────────────── */}
      <div className="rounded-3xl bg-[rgb(var(--orb-bg-rgb))]/35 p-4 ring-1 ring-[rgb(var(--orb-border-rgb))]">
        <div className="text-xs font-semibold tracking-wide text-[rgb(var(--orb-muted-rgb))]">ПОВЕДЕНИЕ</div>
        <div className="mt-3 grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-[rgb(var(--orb-text-rgb))]">Показывать секунды</div>
              <div className="text-[11px] text-[rgb(var(--orb-muted-rgb))]">Время в формате ЧЧ:ММ:СС</div>
            </div>
            <Toggle
              checked={!!chatPrefs.showSeconds}
              onChange={(v) => update({ showSeconds: v })}
              label={chatPrefs.showSeconds ? 'вкл' : 'выкл'}
            />
          </div>

          <div className="h-px bg-[rgb(var(--orb-border-rgb))]/40" />

          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-[rgb(var(--orb-text-rgb))]">Авто-прочтение</div>
              <div className="text-[11px] text-[rgb(var(--orb-muted-rgb))]">Отмечать сообщения прочитанными автоматически</div>
            </div>
            <Toggle
              checked={chatPrefs.autoRead !== false}
              onChange={(v) => update({ autoRead: v })}
              label={chatPrefs.autoRead !== false ? 'вкл' : 'выкл'}
            />
          </div>

          <div className="h-px bg-[rgb(var(--orb-border-rgb))]/40" />

          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-[rgb(var(--orb-text-rgb))]">Вибрация</div>
              <div className="text-[11px] text-[rgb(var(--orb-muted-rgb))]">Вибрация при новом сообщении</div>
            </div>
            <Toggle
              checked={chatPrefs.vibration !== false}
              onChange={(v) => update({ vibration: v })}
              label={chatPrefs.vibration !== false ? 'вкл' : 'выкл'}
            />
          </div>

          <div className="h-px bg-[rgb(var(--orb-border-rgb))]/40" />

          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-[rgb(var(--orb-text-rgb))]">Звуки сообщений</div>
              <div className="text-[11px] text-[rgb(var(--orb-muted-rgb))]">Звук при отправке и получении</div>
            </div>
            <Toggle
              checked={soundOn}
              onChange={(v) => {
                setSoundOn(v);
                const s = getNotifSettings();
                saveNotifSettings({ ...s, sound: v });
                if (v) playSound('send');
              }}
              label={soundOn ? 'вкл' : 'выкл'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
