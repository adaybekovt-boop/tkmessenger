// TITANIUM FIX: IntersectionObserver Virtual Scroller
export class VirtualScroller {
  constructor(container, options) {
    this.container = container;
    this.options = { estimateRowHeight: 72, ...options };
    this.renderedItems = new Map(); // index -> DOM element
    
    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target;
        const index = Number(el.dataset.index);
        
        if (entry.isIntersecting) {
          // Render content
          if (el.dataset.rendered !== 'true') {
            this.options.renderItem(el, this.options.getItem(index));
            el.dataset.rendered = 'true';
            // Clear explicit height to let content dictate it
            el.style.height = '';
          }
        } else {
          // Unrender content, keep height
          if (el.dataset.rendered === 'true') {
            // Save exact height before removing content
            const rect = el.getBoundingClientRect();
            if (rect.height > 0) {
              el.style.height = `${rect.height}px`;
            }
            el.innerHTML = '';
            el.dataset.rendered = 'false';
          }
        }
      }
    }, {
      root: this.container,
      rootMargin: '400px 0px' // Buffer area
    });
    
    // For "near top" pagination loading
    this.topSentinel = document.createElement('div');
    this.topSentinel.className = 'vs-sentinel';
    this.topSentinel.style.height = '1px';
    
    this.sentinelObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && this.options.onNearTop) {
        this.options.onNearTop();
      }
    }, { root: this.container, rootMargin: '200px 0px' });
    
    this.container.appendChild(this.topSentinel);
    this.sentinelObserver.observe(this.topSentinel);
  }

  refresh() {
    const n = this.options.getCount();
    
    // Create new elements if needed
    for (let i = 0; i < n; i++) {
      if (!this.renderedItems.has(i)) {
        const el = document.createElement('div');
        el.className = 'orbit-vs-row';
        el.dataset.index = String(i);
        el.dataset.rendered = 'false';
        el.style.minHeight = `${this.options.estimateRowHeight}px`;
        
        // Because of column-reverse, we append them in order
        // The first element in DOM (index 0) will be at the bottom visually
        this.container.appendChild(el);
        this.renderedItems.set(i, el);
        this.observer.observe(el);
      }
    }
    
    // Remove extra elements
    for (const [i, el] of this.renderedItems.entries()) {
      if (i >= n) {
        this.observer.unobserve(el);
        el.remove();
        this.renderedItems.delete(i);
      } else {
        // Force re-render if it's currently visible
        if (el.dataset.rendered === 'true') {
          this.options.renderItem(el, this.options.getItem(i));
        }
      }
    }
    
    // Make sure sentinel is at the very end of DOM (which is top visually)
    this.container.appendChild(this.topSentinel);
  }

  scrollToBottom() {
    // With column-reverse, we don't need JS math!
    // The browser natively keeps us at the bottom.
    // But if we want to force scroll to absolute bottom (index 0):
    this.container.scrollTop = 0;
  }

  insertRowsAtStart(count) {
    // Handled natively by column-reverse and refresh()
    this.refresh();
  }

  patchByTs(ts, fn) {
    for (let i = 0; i < this.options.getCount(); i++) {
      const item = this.options.getItem(i);
      if (item.ts === ts) {
        fn(item);
        const el = this.renderedItems.get(i);
        if (el && el.dataset.rendered === 'true') {
          this.options.renderItem(el, item);
        }
        break;
      }
    }
  }

  destroy() {
    this.observer.disconnect();
    this.sentinelObserver.disconnect();
    this.container.innerHTML = '';
    this.renderedItems.clear();
  }
}
