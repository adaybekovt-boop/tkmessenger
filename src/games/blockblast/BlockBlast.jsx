import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { createEngine, GRID_SIZE } from './engine.js';
import { COLORS } from './shapes.js';
import { sfx, setSoundEnabled } from './sound.js';
import { hapticTap, vibrate } from '../../core/haptics.js';
import { cx } from '../../utils/common.js';

const BEST_KEY = 'orbits_blockblast_best';
const SOUND_KEY = 'orbits_blockblast_sound';
// The dragged shape floats above the finger on touch so the player can see
// where it lands. For mouse the offset is small — cursors are precise.
const DRAG_OFFSET_TOUCH = -72;
const DRAG_OFFSET_MOUSE = -8;

function readBest() {
  const raw = Number(localStorage.getItem(BEST_KEY) || 0);
  return Number.isFinite(raw) ? raw : 0;
}

function shapeBounds(shape) {
  let maxR = 0, maxC = 0;
  for (const [r, c] of shape) {
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  return { h: maxR + 1, w: maxC + 1 };
}

function FilledCell({ color, r, c }) {
  const rgb = COLORS[color];
  return (
    <motion.div
      className="p-[2px]"
      style={{ gridRow: r + 1, gridColumn: c + 1 }}
      initial={{ scale: 0.3, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 1.45, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 22, mass: 0.6 }}
    >
      <div
        className="h-full w-full rounded-[4px]"
        style={{
          background: `linear-gradient(145deg, rgb(${rgb} / 1) 0%, rgb(${rgb} / 0.7) 100%)`,
          boxShadow: `inset 0 0 0 1px rgb(${rgb} / 0.9), inset 0 1px 0 rgba(255,255,255,0.28)`,
        }}
      />
    </motion.div>
  );
}

// Short-lived radial flash overlay emitted at every cleared cell.
function BurstCell({ color, r, c }) {
  const rgb = COLORS[color];
  return (
    <motion.div
      className="pointer-events-none"
      style={{ gridRow: r + 1, gridColumn: c + 1, padding: 2, zIndex: 15 }}
      initial={{ scale: 0.6, opacity: 1 }}
      animate={{ scale: 2, opacity: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="h-full w-full rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 50%, rgb(${rgb} / 0.95) 0%, rgb(${rgb} / 0) 70%)`,
          boxShadow: `0 0 18px rgb(${rgb} / 0.9)`,
        }}
      />
    </motion.div>
  );
}

function GhostCell({ color, r, c, valid }) {
  // For the invalid state we want a theme-aware "error" tint — hardcoding a
  // specific red would clash on themes whose danger token is different (e.g.
  // Sakura's muted terracotta).
  const validRgb = COLORS[color];
  const invalidRgb = 'var(--orb-danger-rgb)';
  const bg = valid ? `rgb(${validRgb} / 0.35)` : `rgb(${invalidRgb} / 0.35)`;
  const ring = valid ? `rgb(${validRgb} / 0.7)` : `rgb(${invalidRgb} / 0.85)`;
  return (
    <motion.div
      className="p-[2px]"
      style={{ gridRow: r + 1, gridColumn: c + 1 }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        scale: valid ? [1, 1.05, 1] : 1,
      }}
      transition={{
        opacity: { duration: 0.1 },
        scale: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
      }}
    >
      <div
        className="h-full w-full rounded-[4px]"
        style={{
          background: bg,
          boxShadow: `inset 0 0 0 2px ${ring}`,
        }}
      />
    </motion.div>
  );
}

// Used by the slot tray and the floating drag preview. `cellSize` in px,
// `dimmed` drops the opacity while a slot is being dragged out.
function ShapePreview({ shape, color, cellSize, gap = 2, dimmed = false }) {
  const { h, w } = shapeBounds(shape);
  const grid = Array.from({ length: h }, () => new Array(w).fill(false));
  for (const [r, c] of shape) grid[r][c] = true;
  const rgb = COLORS[color];
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${w}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${h}, ${cellSize}px)`,
        gap,
        opacity: dimmed ? 0.2 : 1,
      }}
    >
      {grid.flat().map((on, i) => (
        <div key={i} style={{ width: cellSize, height: cellSize }}>
          {on ? (
            <div
              className="h-full w-full rounded-[4px]"
              style={{
                background: `linear-gradient(145deg, rgb(${rgb} / 1) 0%, rgb(${rgb} / 0.7) 100%)`,
                boxShadow: `inset 0 0 0 1px rgb(${rgb} / 0.9), inset 0 1px 0 rgba(255,255,255,0.28)`,
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function BlockBlast({ onExit }) {
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = createEngine();

  const [snap, setSnap] = useState(() => engineRef.current.snapshot());
  const [best, setBest] = useState(readBest);
  const [sound, setSound] = useState(() => localStorage.getItem(SOUND_KEY) !== '0');
  // Drag is both read by pointermove/pointerup handlers (which may fire before
  // React commits a prior setDrag) and rendered (for the ghost preview and
  // floating piece). We keep both a ref (sync reads) and state (renders).
  const [drag, setDragState] = useState(null);
  const dragRef = useRef(null);
  const setDrag = useCallback((nextOrFn) => {
    const next = typeof nextOrFn === 'function' ? nextOrFn(dragRef.current) : nextOrFn;
    dragRef.current = next;
    setDragState(next);
  }, []);
  const [banner, setBanner] = useState(null);   // { label, sub, id } — combo / multi-line flash
  const [levelUp, setLevelUp] = useState(null); // { level, id }
  const [bursts, setBursts] = useState([]);     // [{ id, cells: [{ r, c, color }] }] — radial flashes
  const [shake, setShake] = useState(0);        // bumped on invalid drop to trigger tray shake
  const [cellSize, setCellSize] = useState(40);
  const gridRef = useRef(null);

  useEffect(() => {
    setSoundEnabled(sound);
    localStorage.setItem(SOUND_KEY, sound ? '1' : '0');
  }, [sound]);

  // Measure the grid on mount and on resize so the floating drag piece
  // scales to the same cell size as the grid — without this the piece looks
  // mis-sized relative to the board on portrait / landscape switches.
  useLayoutEffect(() => {
    if (!gridRef.current) return;
    const update = () => {
      if (!gridRef.current) return;
      const rect = gridRef.current.getBoundingClientRect();
      if (rect.width > 0) setCellSize(rect.width / GRID_SIZE);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(gridRef.current);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  const start = useCallback(() => {
    engineRef.current.start();
    setSnap(engineRef.current.snapshot());
    engineRef.current.drainEvents();
    sfx.start();
    hapticTap();
  }, []);

  // Sync React state to engine and handle side-effect events (sound, haptics,
  // banners). Called after every successful placement.
  const commit = useCallback(() => {
    const s = engineRef.current.snapshot();
    setSnap(s);
    const events = engineRef.current.drainEvents();
    for (const ev of events) {
      if (ev.type === 'place') { sfx.place(); vibrate(10); }
      else if (ev.type === 'clear') {
        const n = ev.lineCount;
        if (n >= 3) sfx.clearBig();
        else if (n === 2) sfx.clear2();
        else sfx.clear1();
        vibrate(n >= 2 ? [18, 30, 18] : 14);
        // Spawn a burst overlay — it auto-clears after the motion finishes.
        const burstId = Math.random().toString(36).slice(2);
        const burstCells = ev.cells.map((idx) => ({
          r: Math.floor(idx / GRID_SIZE),
          c: idx % GRID_SIZE,
          color: ev.colors?.[idx] ?? 0,
        }));
        setBursts((b) => [...b, { id: burstId, cells: burstCells }]);
        setTimeout(() => setBursts((b) => b.filter((x) => x.id !== burstId)), 650);
        if (ev.combo >= 2 || n >= 2) {
          const label = n >= 2 ? (n >= 3 ? `${n} LINES` : 'DOUBLE') : 'LINE';
          const sub = ev.combo >= 2 ? `COMBO ×${ev.combo}` : '';
          setBanner({ label, sub, id: Math.random().toString(36).slice(2) });
          if (ev.combo >= 2) sfx.combo();
          setTimeout(() => setBanner((b) => (b && Date.now() - b.at > 900 ? null : null)), 1100);
        }
      }
      else if (ev.type === 'levelUp') {
        sfx.levelUp();
        vibrate([18, 40, 22]);
        setLevelUp({ level: ev.level, id: Math.random().toString(36).slice(2) });
        setTimeout(() => setLevelUp(null), 1400);
      }
      else if (ev.type === 'gameOver') {
        sfx.gameOver();
        vibrate([30, 60, 30, 60]);
      }
    }
    if (s.status === 'over' && s.score > best) {
      localStorage.setItem(BEST_KEY, String(s.score));
      setBest(s.score);
    }
  }, [best]);

  // Convert pointer position to a snap target on the grid. The shape is
  // rendered with its geometric centre following the pointer+offset, so the
  // target cell is derived from the top-left of the shape (center − size/2).
  // When the shape's reference point lands inside the grid bounds (plus a
  // small tolerance), we clamp the target to [0, GRID_SIZE - dim] so the
  // preview always shows the entire shape and the floating piece can snap
  // flush to the grid edges instead of leaking into the slots tray.
  const computeTarget = useCallback((clientX, clientY, shape, offsetY) => {
    const gridBox = gridRef.current?.getBoundingClientRect();
    if (!gridBox) return { targetRow: null, targetCol: null, overGrid: false, gridBox: null };
    const size = gridBox.width / GRID_SIZE;
    const { h, w } = shapeBounds(shape);
    const refX = clientX;
    const refY = clientY + offsetY;
    const topLeftX = refX - (w * size) / 2;
    const topLeftY = refY - (h * size) / 2;
    const rawRow = Math.round((topLeftY - gridBox.top) / size);
    const rawCol = Math.round((topLeftX - gridBox.left) / size);
    // Treat the shape as "engaged with the grid" once its reference centre is
    // inside the board — a bit of slack outside lets the user pull up from
    // the tray without the piece popping between snapped/free modes.
    const tol = size;
    const overGrid =
      refX >= gridBox.left - tol && refX <= gridBox.right + tol &&
      refY >= gridBox.top - tol && refY <= gridBox.bottom + tol;
    const maxRow = GRID_SIZE - h;
    const maxCol = GRID_SIZE - w;
    const targetRow = overGrid ? Math.max(0, Math.min(maxRow, rawRow)) : rawRow;
    const targetCol = overGrid ? Math.max(0, Math.min(maxCol, rawCol)) : rawCol;
    return { targetRow, targetCol, overGrid, gridBox };
  }, []);

  const beginDrag = useCallback((slotIndex) => (e) => {
    if (snap.status !== 'playing') return;
    const slot = snap.slots[slotIndex];
    if (!slot) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    hapticTap();
    sfx.pickUp();
    const offsetY = e.pointerType === 'touch' ? DRAG_OFFSET_TOUCH : DRAG_OFFSET_MOUSE;
    const { targetRow, targetCol, overGrid } = computeTarget(e.clientX, e.clientY, slot.shape, offsetY);
    setDrag({
      slotIndex,
      pointerId: e.pointerId,
      shape: slot.shape,
      color: slot.color,
      pointerX: e.clientX,
      pointerY: e.clientY,
      offsetY,
      targetRow,
      targetCol,
      overGrid,
      valid: false,
    });
  }, [snap, computeTarget]);

  const updateDrag = useCallback((e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const { targetRow, targetCol, overGrid } = computeTarget(e.clientX, e.clientY, d.shape, d.offsetY);
    // Because computeTarget clamps when overGrid, the shape always fits —
    // validity depends purely on whether the engine lets us place there.
    const valid = overGrid && engineRef.current.canPlace(d.slotIndex, targetRow, targetCol);
    setDrag({ ...d, pointerX: e.clientX, pointerY: e.clientY, targetRow, targetCol, overGrid, valid });
  }, [computeTarget, setDrag]);

  const endDrag = useCallback((e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    let placed = false;
    if (d.valid && d.targetRow != null && d.targetCol != null) {
      placed = engineRef.current.place(d.slotIndex, d.targetRow, d.targetCol);
    }
    setDrag(null);
    if (placed) {
      commit();
    } else {
      sfx.invalid();
      // Nudge the slot tray so the "nope" feedback is visible, not just audio.
      setShake((n) => n + 1);
    }
  }, [commit, setDrag]);

  // Which cells would be filled by the drag's current snap target — used by
  // GhostCell overlay to show a preview on the board. Only rendered while the
  // shape is engaged with the grid; target is already clamped in that case so
  // every cell is guaranteed in-bounds.
  const ghostCells = useMemo(() => {
    if (!drag || !drag.overGrid || drag.targetRow == null || drag.targetCol == null) return null;
    const cells = [];
    for (const [dr, dc] of drag.shape) {
      cells.push({ r: drag.targetRow + dr, c: drag.targetCol + dc });
    }
    return cells;
  }, [drag]);

  const isIdle = snap.status === 'idle';
  const isOver = snap.status === 'over';

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[rgb(var(--orb-bg-rgb))]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[rgb(var(--orb-border-rgb))] px-2 py-1.5">
        <button
          type="button"
          onClick={() => { hapticTap(); onExit?.(); }}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--orb-muted-rgb))] hover:text-[rgb(var(--orb-text-rgb))] active:scale-95"
          aria-label="Назад"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-sm font-semibold text-[rgb(var(--orb-text-rgb))]">Block Blast</div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => { hapticTap(); setSound((v) => !v); }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--orb-muted-rgb))] hover:text-[rgb(var(--orb-text-rgb))] active:scale-95"
            aria-label={sound ? 'Выключить звук' : 'Включить звук'}
          >
            {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={start}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--orb-muted-rgb))] hover:text-[rgb(var(--orb-text-rgb))] active:scale-95"
            aria-label="Новая игра"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stats strip: score | best | level | lines */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[rgb(var(--orb-border-rgb))] px-3 py-2">
        <StatCell label="SCORE" value={snap.score.toLocaleString('ru-RU')} size="lg" />
        <StatCell label="BEST"  value={best.toLocaleString('ru-RU')}       color="accent" />
        <StatCell label="LEVEL" value={String(snap.level)}                  color="accent2" />
        <StatCell label="LINES" value={String(snap.lines)}                  align="end" />
      </div>

      {/* Grid */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 py-2">
        <div
          ref={gridRef}
          className="relative grid aspect-square overflow-hidden rounded-xl bg-[rgb(var(--orb-surface-rgb))]/60 ring-1 ring-[rgb(var(--orb-border-rgb))]"
          style={{
            gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
            // Use the visible viewport height (synced by useVisualViewport)
            // rather than raw `100vh` so the grid sizes correctly on iOS
            // Safari when the URL bar / keyboard resize the viewport.
            width: 'min(100%, calc(var(--orb-vvh, 1vh) * 100 - 360px))',
            maxHeight: '100%',
            // Use the text token with low opacity so gridlines stay visible on
            // both cream and near-black backgrounds — a hardcoded white would
            // vanish on the Light / Sakura themes.
            backgroundImage:
              'linear-gradient(rgb(var(--orb-text-rgb) / 0.08) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--orb-text-rgb) / 0.08) 1px, transparent 1px)',
            backgroundSize: `calc(100%/${GRID_SIZE}) calc(100%/${GRID_SIZE})`,
          }}
        >
          {/* Filled cells — AnimatePresence lets cleared cells exit-animate. */}
          <AnimatePresence initial={false}>
            {snap.grid.flatMap((row, r) => row.map((color, c) => (
              color != null ? <FilledCell key={`f-${r}-${c}`} color={color} r={r} c={c} /> : null
            )))}
          </AnimatePresence>

          {/* Ghost preview while dragging */}
          {ghostCells && drag ? ghostCells.map(({ r, c }) => (
            <GhostCell key={`g-${r}-${c}`} r={r} c={c} color={drag.color} valid={drag.valid} />
          )) : null}

          {/* Line-clear bursts — radial flashes at each cleared cell. */}
          {bursts.flatMap((b) => b.cells.map((cell) => (
            <BurstCell
              key={`b-${b.id}-${cell.r}-${cell.c}`}
              r={cell.r}
              c={cell.c}
              color={cell.color}
            />
          )))}

          {/* Level-up banner */}
          <AnimatePresence>
            {levelUp ? (
              <motion.div
                key={levelUp.id}
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.1 }}
                transition={{ duration: 0.3 }}
                className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
              >
                <div className="text-center">
                  <div className="text-[11px] font-bold tracking-widest text-[rgb(var(--orb-muted-rgb))]">LEVEL UP</div>
                  <div className="mt-1 text-4xl font-black tracking-widest text-[rgb(var(--orb-accent-rgb))] drop-shadow-[0_0_22px_rgb(var(--orb-accent-rgb)/0.7)]">
                    {levelUp.level}
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Combo / multi-line banner */}
          <AnimatePresence>
            {banner ? (
              <motion.div
                key={banner.id}
                initial={{ opacity: 0, y: 24, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                transition={{ duration: 0.22 }}
                className="pointer-events-none absolute left-1/2 top-1/3 z-20 -translate-x-1/2 -translate-y-1/2 text-center"
              >
                <div className="text-xl font-black tracking-wider text-[rgb(var(--orb-success-rgb))] drop-shadow-[0_0_14px_rgb(var(--orb-success-rgb)/0.55)]">
                  {banner.label}
                </div>
                {banner.sub ? (
                  <div className="mt-1 text-[11px] font-bold tracking-widest text-[rgb(var(--orb-accent-rgb))]">{banner.sub}</div>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Idle / game-over overlays. initial={false} so the idle panel
              doesn't fade in over an empty grid on first mount — that was
              reading as a screen flash when the user first entered the
              game. The transition is still animated on status changes. */}
          <AnimatePresence initial={false}>
            {isIdle ? (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-[rgb(var(--orb-bg-rgb))]/85 p-6 text-center backdrop-blur-md"
              >
                <div className="text-2xl font-black tracking-widest text-[rgb(var(--orb-text-rgb))]">BLOCK BLAST</div>
                <div className="text-[11px] text-[rgb(var(--orb-muted-rgb))]">Перетаскивай блоки, очищай ряды и столбцы</div>
                <BigButton onClick={start}>Играть</BigButton>
              </motion.div>
            ) : null}
            {isOver ? (
              <motion.div
                key="over"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1.5 bg-[rgb(var(--orb-bg-rgb))]/85 p-6 text-center backdrop-blur-md"
              >
                <div className="text-lg font-bold text-[rgb(var(--orb-danger-rgb))]">Игра окончена</div>
                <div className="font-mono text-sm text-[rgb(var(--orb-text-rgb))] tabular-nums">{snap.score.toLocaleString('ru-RU')} очков</div>
                <div className="text-[10px] text-[rgb(var(--orb-muted-rgb))]">Уровень {snap.level} · линий {snap.lines}</div>
                <BigButton onClick={start}>Ещё раз</BigButton>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Slots tray */}
      <SlotTray
        slots={snap.slots}
        dragSlotIdx={drag?.slotIndex ?? -1}
        disabled={snap.status !== 'playing'}
        shakeKey={shake}
        onBegin={beginDrag}
        onMove={updateDrag}
        onEnd={endDrag}
      />

      {/* Floating drag preview */}
      {drag ? (
        <FloatingPiece drag={drag} cellSize={cellSize} gridRef={gridRef} />
      ) : null}
    </div>
  );
}

function StatCell({ label, value, color = 'text', size = 'sm', align = 'start' }) {
  const colorCls = color === 'accent'
    ? 'text-[rgb(var(--orb-accent-rgb))]'
    : color === 'accent2'
      ? 'text-[rgb(var(--orb-accent2-rgb))]'
      : 'text-[rgb(var(--orb-text-rgb))]';
  const sizeCls = size === 'lg' ? 'text-base' : 'text-sm';
  const alignCls = align === 'end' ? 'items-end' : align === 'center' ? 'items-center' : 'items-start';
  return (
    <div className={cx('flex flex-col', alignCls)}>
      <span className="font-mono text-[9px] tracking-wider text-[rgb(var(--orb-muted-rgb))]">{label}</span>
      <span className={cx('font-mono font-bold tabular-nums', sizeCls, colorCls)}>{value}</span>
    </div>
  );
}

function BigButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 rounded-full bg-[rgb(var(--orb-accent-rgb))] px-6 py-2.5 text-sm font-semibold text-[rgb(var(--orb-bg-rgb))] shadow-lg shadow-[rgb(var(--orb-accent-rgb))]/20 transition-all duration-150 hover:brightness-110 active:scale-95"
    >
      {children}
    </button>
  );
}

function SlotTray({ slots, dragSlotIdx, disabled, shakeKey, onBegin, onMove, onEnd }) {
  return (
    <motion.div
      // Re-run the shake whenever shakeKey bumps (invalid drop).
      animate={shakeKey > 0 ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
      transition={{ duration: 0.35 }}
      key={`tray-${shakeKey}`}
      className={cx(
        'grid shrink-0 grid-cols-3 gap-2 border-t border-[rgb(var(--orb-border-rgb))] bg-[rgb(var(--orb-bg-rgb))]/80 px-3 pt-3 backdrop-blur-sm',
        'pb-[max(12px,env(safe-area-inset-bottom))]',
      )}
    >
      {slots.map((slot, idx) => {
        const isActive = !!slot && !disabled && dragSlotIdx !== idx;
        const dragging = dragSlotIdx === idx;
        return (
          <div
            key={slot?.id ?? `empty-${idx}`}
            onPointerDown={isActive ? onBegin(idx) : undefined}
            onPointerMove={onMove}
            onPointerUp={onEnd}
            onPointerCancel={onEnd}
            className={cx(
              'flex h-[86px] items-center justify-center rounded-xl bg-[rgb(var(--orb-surface-rgb))]/40 ring-1 ring-[rgb(var(--orb-border-rgb))] touch-none select-none transition-opacity',
              isActive ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
              dragging ? 'opacity-25' : 'opacity-100',
            )}
          >
            <AnimatePresence mode="wait">
              {slot ? (
                <motion.div
                  key={slot.id}
                  initial={{ scale: 0.6, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.7, opacity: 0, y: -6 }}
                  transition={{ type: 'spring', stiffness: 480, damping: 24 }}
                >
                  <ShapePreview shape={slot.shape} color={slot.color} cellSize={16} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </motion.div>
  );
}

function FloatingPiece({ drag, cellSize, gridRef }) {
  const { h, w } = shapeBounds(drag.shape);
  // When the shape is engaged with the grid, lock its top-left to the snapped
  // target cell so the floating piece and the ghost preview are always the
  // same shape in the same place — no more "finger in slots, preview up on
  // the board" feeling. Free-follow only while picking the piece up from
  // the tray (pointer not yet over the grid).
  let left, top;
  if (drag.overGrid && gridRef?.current && drag.targetRow != null && drag.targetCol != null) {
    const gridBox = gridRef.current.getBoundingClientRect();
    left = gridBox.left + drag.targetCol * cellSize;
    top = gridBox.top + drag.targetRow * cellSize;
  } else {
    left = drag.pointerX - (w * cellSize) / 2;
    top = drag.pointerY + drag.offsetY - (h * cellSize) / 2;
  }
  const rgb = COLORS[drag.color];
  // Render cells matching the grid's FilledCell (cellSize-wide square with a
  // 2px internal padding for the inset look). This keeps the floating piece
  // pixel-aligned with both the ghost preview and the placed blocks.
  const cells = [];
  for (const [dr, dc] of drag.shape) cells.push({ dr, dc });
  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-50"
      style={{
        transform: `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`,
        filter: `drop-shadow(0 8px 18px rgb(${rgb} / 0.4))`,
      }}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${w}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${h}, ${cellSize}px)`,
        }}
      >
        {cells.map(({ dr, dc }, i) => (
          <div
            key={i}
            className="p-[2px]"
            style={{ gridRow: dr + 1, gridColumn: dc + 1 }}
          >
            <div
              className="h-full w-full rounded-[4px]"
              style={{
                background: `linear-gradient(145deg, rgb(${rgb} / 1) 0%, rgb(${rgb} / 0.7) 100%)`,
                boxShadow: `inset 0 0 0 1px rgb(${rgb} / 0.9), inset 0 1px 0 rgba(255,255,255,0.28)`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
