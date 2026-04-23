// Pure Block Blast engine. No React, no DOM. The UI drives it via place()
// and consumes state via snapshot(). Keeping the engine pure makes it
// testable and easy to snapshot for a future multiplayer / daily-seed mode.

import { SHAPES, COLORS } from './shapes.js';

export const GRID_SIZE = 8;
export const SLOT_COUNT = 3;

const LEVEL_THRESHOLD = 2000;
const POINTS_PER_CELL = 1;
const POINTS_PER_CLEARED_CELL = 10;
const COMBO_BONUS_PER_STEP = 50;
const MULTI_LINE_BONUS = 0.5; // each extra line adds 50% on top of base

function emptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(null));
}

function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

function canPlaceOn(grid, shape, r, c) {
  for (const [dr, dc] of shape) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) return false;
    if (grid[nr][nc] !== null) return false;
  }
  return true;
}

// Place a shape and return a new grid + number of lines cleared. Used by the
// slot generator to simulate outcomes; doesn't touch engine state.
function placeAndClear(grid, shape, color, r, c) {
  const g = cloneGrid(grid);
  for (const [dr, dc] of shape) g[r + dr][c + dc] = color;
  const fullRows = [];
  const fullCols = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    if (g[i].every((cell) => cell !== null)) fullRows.push(i);
  }
  for (let j = 0; j < GRID_SIZE; j++) {
    let full = true;
    for (let i = 0; i < GRID_SIZE; i++) {
      if (g[i][j] === null) { full = false; break; }
    }
    if (full) fullCols.push(j);
  }
  for (const rr of fullRows) for (let cc = 0; cc < GRID_SIZE; cc++) g[rr][cc] = null;
  for (const cc of fullCols) for (let rr = 0; rr < GRID_SIZE; rr++) g[rr][cc] = null;
  return { grid: g, cleared: fullRows.length + fullCols.length };
}

// Simulate placing all shapes in the given order, greedily picking each
// placement to maximize line clears. Returns total clears if all fit, else -1.
function simulatePerm(grid, shapes, perm) {
  let g = grid;
  let total = 0;
  for (const idx of perm) {
    const shape = shapes[idx];
    let best = null;
    let bestCleared = -1;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (!canPlaceOn(g, shape, r, c)) continue;
        const res = placeAndClear(g, shape, 0, r, c);
        if (res.cleared > bestCleared) {
          bestCleared = res.cleared;
          best = res.grid;
          if (bestCleared > 0) break;
        }
      }
      if (bestCleared > 0) break;
    }
    if (!best) return -1;
    g = best;
    total += bestCleared;
  }
  return total;
}

const PERMS = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
];

// Pick a triple of shapes that (a) can all be placed on the current grid in
// some order, and (b) permit a line clear with smart play. Falls back to
// anything that at least fits together, then to pure random as a last resort
// so game-over always stays reachable for genuinely stuck boards.
function pickTripleForGrid(grid) {
  const ATTEMPTS = 24;
  let bestTriple = null;
  let bestScore = -1;
  let fallbackTriple = null;

  for (let i = 0; i < ATTEMPTS; i++) {
    const triple = Array.from({ length: SLOT_COUNT }, () => ({
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      color: Math.floor(Math.random() * COLORS.length),
    }));
    const shapes = triple.map((t) => t.shape);

    let clears = -1;
    for (const perm of PERMS) {
      const c = simulatePerm(grid, shapes, perm);
      if (c > clears) clears = c;
      if (clears > 0) break;
    }
    if (clears < 0) continue;
    if (!fallbackTriple) fallbackTriple = triple;
    const score = 1 + clears * 4;
    if (score > bestScore) {
      bestScore = score;
      bestTriple = triple;
      if (clears > 0) break;
    }
  }

  const picked = bestTriple || fallbackTriple || Array.from({ length: SLOT_COUNT }, () => ({
    shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
    color: Math.floor(Math.random() * COLORS.length),
  }));

  return picked.map(({ shape, color }) => ({
    id: Math.random().toString(36).slice(2, 10),
    shape,
    color,
  }));
}

export function createEngine() {
  const state = {
    grid: emptyGrid(),
    slots: [null, null, null],
    score: 0,
    level: 1,
    combo: 0,
    lines: 0,
    status: 'idle', // 'idle' | 'playing' | 'over'
    lastClear: null, // { cells: [idx], lineCount, combo } — for UI flash
    events: [],      // one-shot side-effect events for sound/vfx
  };

  function refillIfEmpty() {
    if (state.slots.every((s) => s === null)) {
      state.slots = pickTripleForGrid(state.grid);
    }
  }

  function canPlaceAt(shape, r, c) {
    for (const [dr, dc] of shape) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) return false;
      if (state.grid[nr][nc] !== null) return false;
    }
    return true;
  }

  function canFitAnywhere(shape) {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (canPlaceAt(shape, r, c)) return true;
      }
    }
    return false;
  }

  function isGameOver() {
    for (const slot of state.slots) {
      if (slot && canFitAnywhere(slot.shape)) return false;
    }
    return true;
  }

  function place(slotIndex, r, c) {
    if (state.status !== 'playing') return false;
    const slot = state.slots[slotIndex];
    if (!slot) return false;
    if (!canPlaceAt(slot.shape, r, c)) return false;

    for (const [dr, dc] of slot.shape) {
      state.grid[r + dr][c + dc] = slot.color;
    }
    state.slots = state.slots.map((s, i) => (i === slotIndex ? null : s));
    state.score += slot.shape.length * POINTS_PER_CELL;

    // Detect full rows / columns — collect then clear atomically so a cross
    // clear (row + column sharing a cell) still counts both lines.
    const fullRows = [];
    const fullCols = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      if (state.grid[i].every((cell) => cell !== null)) fullRows.push(i);
    }
    for (let j = 0; j < GRID_SIZE; j++) {
      let full = true;
      for (let i = 0; i < GRID_SIZE; i++) {
        if (state.grid[i][j] === null) { full = false; break; }
      }
      if (full) fullCols.push(j);
    }

    const lineCount = fullRows.length + fullCols.length;
    state.events.push({ type: 'place', cells: slot.shape.length });

    if (lineCount > 0) {
      const clearedIdx = new Set();
      for (const r2 of fullRows) {
        for (let c2 = 0; c2 < GRID_SIZE; c2++) clearedIdx.add(r2 * GRID_SIZE + c2);
      }
      for (const c2 of fullCols) {
        for (let r2 = 0; r2 < GRID_SIZE; r2++) clearedIdx.add(r2 * GRID_SIZE + c2);
      }
      // Capture colours before we wipe — the burst animation needs them.
      const clearedColors = {};
      for (const idx of clearedIdx) {
        const rr = Math.floor(idx / GRID_SIZE);
        const cc = idx % GRID_SIZE;
        clearedColors[idx] = state.grid[rr][cc];
        state.grid[rr][cc] = null;
      }

      state.combo++;
      state.lines += lineCount;

      const cellsCleared = clearedIdx.size;
      const basePoints = cellsCleared * POINTS_PER_CLEARED_CELL;
      const multi = 1 + MULTI_LINE_BONUS * (lineCount - 1);
      const comboBonus = state.combo > 1 ? COMBO_BONUS_PER_STEP * (state.combo - 1) : 0;
      state.score += Math.floor(basePoints * multi) + comboBonus;

      state.lastClear = { lineCount, combo: state.combo, cellCount: cellsCleared };
      state.events.push({
        type: 'clear',
        lineCount,
        combo: state.combo,
        cells: Array.from(clearedIdx),
        colors: clearedColors,
      });
    } else {
      state.combo = 0;
      state.lastClear = null;
    }

    const newLevel = 1 + Math.floor(state.score / LEVEL_THRESHOLD);
    if (newLevel > state.level) {
      state.level = newLevel;
      state.events.push({ type: 'levelUp', level: newLevel });
    }

    refillIfEmpty();

    if (isGameOver()) {
      state.status = 'over';
      state.events.push({ type: 'gameOver' });
    }

    return true;
  }

  function start() {
    state.grid = emptyGrid();
    state.slots = pickTripleForGrid(state.grid);
    state.score = 0;
    state.level = 1;
    state.combo = 0;
    state.lines = 0;
    state.status = 'playing';
    state.lastClear = null;
    state.events = [];
    state.events.push({ type: 'start' });
  }

  function snapshot() {
    // Clone the grid so the UI gets an immutable frame — otherwise a
    // stale React closure could read the already-mutated live grid and show
    // placements that haven't been committed as state yet.
    return {
      grid: cloneGrid(state.grid),
      slots: state.slots,
      score: state.score,
      level: state.level,
      combo: state.combo,
      lines: state.lines,
      status: state.status,
      lastClear: state.lastClear,
    };
  }

  function drainEvents() {
    const out = state.events;
    state.events = [];
    return out;
  }

  // Exposed for the UI's drag preview — answers "would it fit here" without
  // mutating state, so the grid ghost can light up green/red in real time.
  function canPlace(slotIndex, r, c) {
    const slot = state.slots[slotIndex];
    if (!slot) return false;
    return canPlaceAt(slot.shape, r, c);
  }

  return { start, place, canPlace, snapshot, drainEvents };
}
