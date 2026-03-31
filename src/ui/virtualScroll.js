/**
 * Virtual list for chat messages: recycles DOM rows, rAF-throttled scroll,
 * passive listeners, debounced resize. Variable row heights via per-index cache.
 */

export class VirtualScroller {
  /**
   * @param {HTMLElement} scrollContainer
   * @param {object} options
   * @param {() => number} options.getCount
   * @param {(i: number) => object | undefined} options.getItem
   * @param {(el: HTMLElement, item: object, index: number) => void} options.renderItem
   * @param {number} [options.estimateRowHeight=88]
   * @param {number} [options.bufferRows=10]
   * @param {() => void} [options.onNearTop]
   * @param {number} [options.nearTopPx=140]
   */
  constructor(scrollContainer, options) {
    this.container = scrollContainer;
    this.getCount = options.getCount;
    this.getItem = options.getItem;
    this.renderItem = options.renderItem;
    this.estimateRowHeight = options.estimateRowHeight ?? 88;
    this.bufferRows = options.bufferRows ?? 10;
    this.onNearTop = options.onNearTop;
    this.nearTopPx = options.nearTopPx ?? 140;

    /** @type {number[]} */
    this.heights = [];
    this.offsets = [];
    this._totalHeight = 0;

    this._pool = [];
    /** @type {Map<number, HTMLElement>} */
    this._active = new Map();
    this._scrollRaf = 0;
    this._pendingScroll = false;
    this._resizeTimer = 0;
    this._nearTopTimer = 0;
    this._destroyed = false;

    this._onScroll = () => {
      if (this._destroyed) return;
      this._pendingScroll = true;
      if (this._scrollRaf) return;
      this._scrollRaf = requestAnimationFrame(() => {
        this._scrollRaf = 0;
        if (!this._pendingScroll || this._destroyed) return;
        this._pendingScroll = false;
        this._updateVisibleRange();
        this._maybeNearTop();
      });
    };

    this._onResize = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        this._measureVisibleRows();
        this._updateVisibleRange();
      }, 200);
    };

    this._root = document.createElement('div');
    this._root.className = 'orbit-vs-root';
    this._root.style.cssText = 'position:relative;width:100%;min-height:1px;';

    this.container.replaceChildren(this._root);
    this.container.addEventListener('scroll', this._onScroll, { passive: true });
    window.addEventListener('resize', this._onResize, { passive: true });
  }

  destroy() {
    this._destroyed = true;
    this.container.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onResize);
    if (this._scrollRaf) cancelAnimationFrame(this._scrollRaf);
    clearTimeout(this._resizeTimer);
    clearTimeout(this._nearTopTimer);
    this._pool = [];
    this._active.clear();
    if (this._root) {
      this._root.innerHTML = '';
    }
  }

  /** After prepending older rows: extend height map and preserve scroll position. */
  insertRowsAtStart(count) {
    if (count <= 0) return;
    const nh = Array(count).fill(this.estimateRowHeight);
    this.heights = [...nh, ...this.heights];
    this._rebuildOffsets();
    const addH = nh.reduce((a, b) => a + b, 0);
    this.container.scrollTop += addH;
    this._layoutRootHeight();
    requestAnimationFrame(() => {
      this._updateVisibleRange();
      this._measureVisibleRows();
    });
  }

  refresh() {
    if (this._destroyed) return;
    const n = this.getCount();
    this._ensureGeometry(n);
    this._layoutRootHeight();
    this._updateVisibleRange();
    requestAnimationFrame(() => this._measureVisibleRows());
  }

  scrollToBottom() {
    requestAnimationFrame(() => {
      this.container.scrollTop = this.container.scrollHeight;
      this._updateVisibleRange();
    });
  }

  _ensureGeometry(n) {
    while (this.heights.length < n) {
      this.heights.push(this.estimateRowHeight);
    }
    if (this.heights.length > n) {
      this.heights.length = n;
    }
    this._rebuildOffsets();
  }

  _rebuildOffsets() {
    const n = this.heights.length;
    this.offsets = new Array(n);
    let s = 0;
    for (let i = 0; i < n; i++) {
      this.offsets[i] = s;
      s += this.heights[i] || this.estimateRowHeight;
    }
    this._totalHeight = s;
  }

  _layoutRootHeight() {
    this._root.style.height = `${this._totalHeight}px`;
  }

  _findIndexAt(y) {
    const n = this.offsets.length;
    if (n === 0) return 0;
    if (y >= this._totalHeight - 1) return n - 1;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.offsets[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  _updateVisibleRange() {
    const n = this.getCount();
    if (n === 0) {
      this._recycleAll();
      return;
    }
    this._ensureGeometry(n);
    this._layoutRootHeight();

    const st = this.container.scrollTop;
    const ch = this.container.clientHeight;
    const viewEnd = st + ch;

    let start = this._findIndexAt(st);
    let end = this._findIndexAt(viewEnd);
    start = Math.max(0, start - this.bufferRows);
    end = Math.min(n - 1, end + this.bufferRows);

    const keep = new Set();
    for (let i = start; i <= end; i++) keep.add(i);

    for (const [idx, el] of [...this._active.entries()]) {
      if (!keep.has(idx)) {
        this._pool.push(el);
        el.remove();
        this._active.delete(idx);
      }
    }

    for (let i = start; i <= end; i++) {
      let el = this._active.get(i);
      if (!el) {
        el = this._pool.pop() || document.createElement('div');
        el.className = 'message orbit-vs-row';
        el.style.cssText =
          'position:absolute;left:0;right:0;top:0;box-sizing:border-box;will-change:transform';
        this._root.appendChild(el);
        this._active.set(i, el);
      }
      const item = this.getItem(i);
      if (!item) continue;
      this.renderItem(el, item, i);
      const top = this.offsets[i] ?? 0;
      el.style.transform = `translate3d(0, ${top}px, 0)`;
    }

    requestAnimationFrame(() => this._measureRange(start, end));
  }

  _measureRange(start, end) {
    const n = this.getCount();
    let changed = false;
    for (let i = start; i <= end; i++) {
      const el = this._active.get(i);
      if (!el) continue;
      const h = el.getBoundingClientRect().height;
      if (h > 0 && Math.abs(h - (this.heights[i] || 0)) > 1) {
        this.heights[i] = h;
        changed = true;
      }
    }
    if (changed) {
      this._rebuildOffsets();
      this._layoutRootHeight();
      for (const [i, el] of this._active.entries()) {
        const top = this.offsets[i] ?? 0;
        el.style.transform = `translate3d(0, ${top}px, 0)`;
      }
    }
  }

  _measureVisibleRows() {
    const n = this.getCount();
    if (n === 0) return;
    const st = this.container.scrollTop;
    const ch = this.container.clientHeight;
    const i0 = this._findIndexAt(st);
    const i1 = this._findIndexAt(st + ch);
    this._measureRange(Math.max(0, i0 - 2), Math.min(n - 1, i1 + 2));
  }

  _recycleAll() {
    for (const [, el] of this._active.entries()) {
      this._pool.push(el);
      el.remove();
    }
    this._active.clear();
    this._root.style.height = '0px';
  }

  _maybeNearTop() {
    if (!this.onNearTop || this._destroyed) return;
    if (this.container.scrollTop > this.nearTopPx) return;
    clearTimeout(this._nearTopTimer);
    this._nearTopTimer = setTimeout(() => {
      if (this.container.scrollTop <= this.nearTopPx) this.onNearTop();
    }, 100);
  }

  patchByTs(ts, renderPatch) {
    const n = this.getCount();
    for (let i = 0; i < n; i++) {
      const item = this.getItem(i);
      if (item && item.ts === ts) {
        const el = this._active.get(i);
        if (el) renderPatch(el, item, i);
        return;
      }
    }
  }
}
