export class VirtualScroller {
  constructor(container, options) {
    this.container = container;
    this.options = { estimateRowHeight: 80, bufferRows: 10, ...options };
    this.container.style.overflowY = 'auto';
    this.container.style.position = 'relative';
    
    this.content = document.createElement('div');
    this.container.appendChild(this.content);
    
    this.renderedItems = new Map();
    this.onScroll = this.onScroll.bind(this);
    this.container.addEventListener('scroll', this.onScroll);
    this.refresh();
  }
  
  onScroll() {
    this.renderVisible();
    if (this.container.scrollTop < 100 && this.options.onNearTop) {
      this.options.onNearTop();
    }
  }
  
  refresh() {
    const count = this.options.getCount();
    this.content.style.height = `${count * this.options.estimateRowHeight}px`;
    this.renderVisible();
  }
  
  renderVisible() {
    const scrollTop = this.container.scrollTop;
    const viewportHeight = this.container.clientHeight;
    
    const startIndex = Math.max(0, Math.floor(scrollTop / this.options.estimateRowHeight) - this.options.bufferRows);
    const endIndex = Math.min(
      this.options.getCount() - 1,
      Math.ceil((scrollTop + viewportHeight) / this.options.estimateRowHeight) + this.options.bufferRows
    );
    
    const newRendered = new Map();
    for (let i = startIndex; i <= endIndex; i++) {
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
      el.style.top = `${i * this.options.estimateRowHeight}px`;
      newRendered.set(i, el);
    }
    
    for (const [i, el] of this.renderedItems) {
      el.remove();
    }
    this.renderedItems = newRendered;
  }
  
  scrollToBottom() {
    this.refresh();
    this.container.scrollTop = this.container.scrollHeight;
  }
  
  insertRowsAtStart(count) {
    const oldScroll = this.container.scrollHeight - this.container.scrollTop;
    this.refresh();
    this.container.scrollTop = this.container.scrollHeight - oldScroll;
  }
  
  patchByTs(ts, fn) {
    for (let i = 0; i < this.options.getCount(); i++) {
      const item = this.options.getItem(i);
      if (item.ts === ts) {
        fn(item);
        if (this.renderedItems.has(i)) {
          this.options.renderItem(this.renderedItems.get(i), item);
        }
        break;
      }
    }
  }
  
  destroy() {
    this.container.removeEventListener('scroll', this.onScroll);
    this.content.innerHTML = '';
    this.renderedItems.clear();
  }
}