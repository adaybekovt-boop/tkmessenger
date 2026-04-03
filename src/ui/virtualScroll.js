export class VirtualScroller {
  constructor(container, options) {
    this.container = container;
    this.options = { estimateRowHeight: 72, bufferRows: 6, ...options };
    this.container.style.overflowY = 'auto';
    this.container.style.position = 'relative';

    this.content = document.createElement('div');
    this.container.appendChild(this.content);

    this.renderedItems = new Map();
    this.heights = [];
    this.prefix = [0];
    this._measureQueued = false;

    this.onScroll = this.onScroll.bind(this);
    this._scrollRaf = null;
    this.container.addEventListener('scroll', this.onScroll);
    this.resizeObserver = new ResizeObserver(() => {
      if (this.container.clientHeight > 0) { this.refresh(); this.renderVisible(); }
    });
    this.resizeObserver.observe(this.container);
    this.refresh();
  }

  setBufferRows(n) {
    this.options.bufferRows = Math.max(1, Number(n) | 0);
    this.renderVisible();
  }

  rebuildPrefix() {
    const n = this.options.getCount();
    this.prefix = [0];
    for (let i = 0; i < n; i++) {
      const h = this.heights[i] ?? this.options.estimateRowHeight;
      this.prefix.push(this.prefix[i] + h);
    }
  }

  get totalHeight() {
    const n = this.options.getCount();
    return this.prefix[n] ?? 0;
  }

  rowTop(i) {
    return this.prefix[i] ?? 0;
  }

  findStartIndex(scrollTop) {
    const n = this.options.getCount();
    if (n <= 0) return 0;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.prefix[mid] <= scrollTop) lo = mid;
      else hi = mid - 1;
    }
    return Math.max(0, lo - this.options.bufferRows);
  }

  findEndIndex(scrollTop, viewportHeight) {
    const n = this.options.getCount();
    if (n <= 0) return -1;
    const limit = scrollTop + viewportHeight;
    let lo = 0;
    let hi = n - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.prefix[mid] < limit) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return Math.min(n - 1, ans + this.options.bufferRows);
  }

  onScroll() {
    if (this._scrollRaf != null) return;
    this._scrollRaf = requestAnimationFrame(() => {
      this._scrollRaf = null;
      this.renderVisible();
      if (this.container.scrollTop < 120 && this.options.onNearTop) {
        this.options.onNearTop();
      }
    });
  }

  refresh() {
    const n = this.options.getCount();
    if (this.heights.length > n) this.heights.length = n;
    while (this.heights.length < n) {
      this.heights.push(null);
    }
    this.rebuildPrefix();
    this.content.style.height = `${this.totalHeight}px`;
    this.renderVisible();
  }

  queueMeasure() {
    if (this._measureQueued) return;
    this._measureQueued = true;
    requestAnimationFrame(() => {
      this._measureQueued = false;
      let changed = false;
      for (const [i, el] of this.renderedItems) {
        const h = Math.max(el.getBoundingClientRect().height, 24);
        if (this.heights[i] == null || Math.abs(this.heights[i] - h) > 2) {
          this.heights[i] = h;
          changed = true;
        }
      }
      if (changed) {
        this.rebuildPrefix();
        this.content.style.height = `${this.totalHeight}px`;
        this.renderVisible();
      }
    });
  }

  renderVisible() {
    const n = this.options.getCount();
    if (n === 0) {
      for (const [, el] of this.renderedItems) el.remove();
      this.renderedItems.clear();
      this.content.style.height = '0px';
      return;
    }

    const scrollTop = this.container.scrollTop;
    const viewportHeight = this.container.clientHeight;
    const startIndex = this.findStartIndex(scrollTop);
    const endIndex = this.findEndIndex(scrollTop, viewportHeight);

    const newRendered = new Map();
    for (let i = startIndex; i <= endIndex; i++) {
      if (i < 0 || i >= n) continue;
      let el;
      if (this.renderedItems.has(i)) {
        el = this.renderedItems.get(i);
        this.renderedItems.delete(i);
      } else {
        el = document.createElement('div');
        el.className = 'orbit-vs-row';
        el.style.position = 'absolute';
        el.style.left = '0';
        el.style.right = '0';
        this.options.renderItem(el, this.options.getItem(i));
        this.content.appendChild(el);
      }
      el.style.top = `${this.rowTop(i)}px`;
      newRendered.set(i, el);
    }

    for (const [, el] of this.renderedItems) {
      el.remove();
    }
    this.renderedItems = newRendered;
    this.queueMeasure();
  }

  scrollToBottom() {
    this.refresh();
    this.container.scrollTop = Math.max(0, this.container.scrollHeight - this.container.clientHeight);
  }

  insertRowsAtStart(count) {
    if (count <= 0) return;
    const oldBottom = this.container.scrollHeight - this.container.scrollTop;
    for (let i = 0; i < count; i++) {
      this.heights.unshift(null);
    }
    this.heights.length = this.options.getCount();
    this.refresh();
    this.container.scrollTop = Math.max(0, this.container.scrollHeight - oldBottom);
  }

  patchByTs(ts, fn) {
    for (let i = 0; i < this.options.getCount(); i++) {
      const item = this.options.getItem(i);
      if (item.ts === ts) {
        fn(item);
        if (this.renderedItems.has(i)) {
          this.options.renderItem(this.renderedItems.get(i), item);
          this.heights[i] = null;
          this.queueMeasure();
        }
        break;
      }
    }
  }

  destroy() {
    if (this._scrollRaf != null) {
      cancelAnimationFrame(this._scrollRaf);
      this._scrollRaf = null;
    }
    this.container.removeEventListener('scroll', this.onScroll);
    this.content.innerHTML = '';
    this.renderedItems.clear();
  }
}
