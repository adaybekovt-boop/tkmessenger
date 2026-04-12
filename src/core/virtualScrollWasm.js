// virtualScrollWasm.js — JS обёртка для Rust virtual scroll (WASM).
//
// Вычисляет видимый диапазон элементов для виртуального скроллинга.
// WASM binary search по prefix sums — O(log N) вместо O(N).
//
// Fallback на JS для сред без WASM.

import { loadWasm } from './ratchetWasm.js';

let wasmMod = null;

async function getWasm() {
  if (wasmMod) return wasmMod;
  const ok = await loadWasm();
  if (!ok) return null;
  try {
    const mod = await import('../../pkg/orbits_crypto.js');
    wasmMod = mod;
    return mod;
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Visible range (variable height)
// ─────────────────────────────────────────────────────────────

/**
 * Вычисляет видимый диапазон для списка с переменной высотой строк.
 *
 * @param {number[]} heights — массив высот каждого элемента
 * @param {number} scrollTop — позиция скролла (px)
 * @param {number} viewportHeight — высота viewport (px)
 * @param {number} [overscan=3] — буферные элементы
 * @returns {Promise<{start: number, end: number, offsetTop: number, totalHeight: number}>}
 */
export async function computeVisibleRange(heights, scrollTop, viewportHeight, overscan = 3) {
  const w = await getWasm();
  if (w?.vsComputeRange) {
    return JSON.parse(w.vsComputeRange(JSON.stringify(heights), scrollTop, viewportHeight, overscan));
  }
  // JS fallback — O(N) linear scan
  return computeVisibleRangeJS(heights, scrollTop, viewportHeight, overscan);
}

/**
 * Вычисляет видимый диапазон для списка с фиксированной высотой строк.
 *
 * @param {number} totalItems — количество элементов
 * @param {number} rowHeight — высота одной строки (px)
 * @param {number} scrollTop — позиция скролла (px)
 * @param {number} viewportHeight — высота viewport (px)
 * @param {number} [overscan=3] — буферные элементы
 * @returns {Promise<{start: number, end: number, offsetTop: number, totalHeight: number}>}
 */
export async function computeVisibleRangeFixed(totalItems, rowHeight, scrollTop, viewportHeight, overscan = 3) {
  const w = await getWasm();
  if (w?.vsComputeRangeFixed) {
    return JSON.parse(w.vsComputeRangeFixed(totalItems, rowHeight, scrollTop, viewportHeight, overscan));
  }
  // JS fallback
  if (totalItems === 0 || rowHeight <= 0) {
    return { start: 0, end: 0, offsetTop: 0, totalHeight: 0 };
  }
  const totalHeight = totalItems * rowHeight;
  const rawStart = Math.floor(scrollTop / rowHeight);
  const start = Math.max(0, rawStart - overscan);
  const rawEnd = Math.ceil((scrollTop + viewportHeight) / rowHeight);
  const end = Math.min(totalItems - 1, rawEnd + overscan);
  return { start, end, offsetTop: start * rowHeight, totalHeight };
}

/**
 * Находит индекс элемента по Y-позиции.
 */
export async function findItemAt(heights, yPosition) {
  const w = await getWasm();
  if (w?.vsFindItemAt) {
    return w.vsFindItemAt(JSON.stringify(heights), yPosition);
  }
  // JS fallback
  let acc = 0;
  for (let i = 0; i < heights.length; i++) {
    acc += heights[i];
    if (acc > yPosition) return i;
  }
  return Math.max(0, heights.length - 1);
}

/**
 * Вычисляет Y-позицию для scroll-to-item.
 */
export async function getItemOffset(heights, index) {
  const w = await getWasm();
  if (w?.vsGetItemOffset) {
    return w.vsGetItemOffset(JSON.stringify(heights), index);
  }
  // JS fallback
  let offset = 0;
  for (let i = 0; i < Math.min(index, heights.length); i++) {
    offset += heights[i];
  }
  return offset;
}

// ─────────────────────────────────────────────────────────────
// JS fallback implementation
// ─────────────────────────────────────────────────────────────

function computeVisibleRangeJS(heights, scrollTop, viewportHeight, overscan) {
  const n = heights.length;
  if (n === 0) return { start: 0, end: 0, offsetTop: 0, totalHeight: 0 };

  let totalHeight = 0;
  let acc = 0;
  let rawStart = 0;
  let rawEnd = 0;
  const bottom = scrollTop + viewportHeight;
  let foundStart = false;
  let foundEnd = false;

  for (let i = 0; i < n; i++) {
    totalHeight += heights[i];
    if (!foundStart && totalHeight > scrollTop) {
      rawStart = i;
      foundStart = true;
    }
    if (!foundEnd && totalHeight > bottom) {
      rawEnd = i;
      foundEnd = true;
    }
  }

  if (!foundStart) rawStart = n - 1;
  if (!foundEnd) rawEnd = n - 1;

  const start = Math.max(0, rawStart - overscan);
  const end = Math.min(n - 1, rawEnd + overscan);

  let offsetTop = 0;
  for (let i = 0; i < start; i++) offsetTop += heights[i];

  return { start, end, offsetTop, totalHeight };
}
