/**
 * Data / battery saver runtime: derived limits, image compression, ACK batch scheduling.
 */

const ACK_BATCH_MS = 2000;
const HEARTBEAT_NORMAL_MS = 10000;
const HEARTBEAT_DATA_SAVER_MS = 30000;
const MESSAGE_PAGE_NORMAL = 50;
const MESSAGE_PAGE_DATA_SAVER = 20;
const BUFFER_ROWS_NORMAL = 6;
const BUFFER_ROWS_BATTERY = 2;
const MSG_CACHE_NORMAL = 200;
const MSG_CACHE_BATTERY = 50;
const TYPING_MIN_INTERVAL_MS = 1200;

export const optimizer = {
  _getSettings: () => ({}),
  _ackTimer: null,
  _ackFlushCallback: null,
  _networkUnsub: null,
  _batteryUnsub: null,

  configure({ getSettings }) {
    this._getSettings = typeof getSettings === 'function' ? getSettings : () => ({});
  },

  syncFromAppSettings(s) {
    void s;
  },

  isDataSaver() {
    return !!this._getSettings().dataSaver;
  },

  isBatterySaver() {
    return !!this._getSettings().batterySaver;
  },

  autoNetworkSaverEnabled() {
    return this._getSettings().autoNetworkSaver !== false;
  },

  getHeartbeatIntervalMs() {
    return this.isDataSaver() ? HEARTBEAT_DATA_SAVER_MS : HEARTBEAT_NORMAL_MS;
  },

  getMessagePage() {
    return this.isDataSaver() ? MESSAGE_PAGE_DATA_SAVER : MESSAGE_PAGE_NORMAL;
  },

  getBufferRows() {
    return this.isBatterySaver() ? BUFFER_ROWS_BATTERY : BUFFER_ROWS_NORMAL;
  },

  getMsgCacheMax() {
    return this.isBatterySaver() ? MSG_CACHE_BATTERY : MSG_CACHE_NORMAL;
  },

  shouldBatchAck() {
    return this.isDataSaver();
  },

  shouldCompressOutgoingImages() {
    return this.isDataSaver();
  },

  shouldDeferImagePreview() {
    return this.isDataSaver();
  },

  typingAllowed() {
    const s = this._getSettings();
    if (this.isDataSaver()) return false;
    return !!s.typingIndicator;
  },

  getTypingMinIntervalMs() {
    return TYPING_MIN_INTERVAL_MS;
  },

  scheduleAckFlush(flushFn) {
    this._ackFlushCallback = flushFn;
    if (this._ackTimer) clearTimeout(this._ackTimer);
    this._ackTimer = setTimeout(() => {
      this._ackTimer = null;
      if (typeof this._ackFlushCallback === 'function') this._ackFlushCallback();
    }, ACK_BATCH_MS);
  },

  flushAckNow() {
    if (this._ackTimer) {
      clearTimeout(this._ackTimer);
      this._ackTimer = null;
    }
    if (typeof this._ackFlushCallback === 'function') this._ackFlushCallback();
  },

  /**
   * Resize JPEG/PNG (etc.) to max width, output JPEG.
   * @returns {Promise<Blob>}
   */
  compressImageFile(file, maxWidth = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
      if (!file?.type?.startsWith('image/')) {
        resolve(file);
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        try {
          let { width, height } = img;
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width | 0);
          canvas.height = Math.max(1, height | 0);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error('compress failed'));
            },
            'image/jpeg',
            quality
          );
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('image load failed'));
      };
      img.src = url;
    });
  },

  initNetworkAutoSaver(onSlowNetwork) {
    this.teardownNetwork();
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const conn = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
    if (!conn || typeof conn.addEventListener !== 'function') return;

    const check = () => {
      if (!this.autoNetworkSaverEnabled()) return;
      const t = conn.effectiveType;
      if (t === 'slow-2g' || t === '2g') {
        onSlowNetwork(t);
      }
    };
    check();
    conn.addEventListener('change', check);
    this._networkUnsub = () => conn.removeEventListener('change', check);
  },

  teardownNetwork() {
    if (this._networkUnsub) {
      this._networkUnsub();
      this._networkUnsub = null;
    }
  },

  initBatteryAutoSaver(onLowBattery) {
    this.teardownBattery();
    const bat = navigator.getBattery?.();
    if (!bat || typeof bat.then !== 'function') return;
    bat
      .then((b) => {
        const check = () => {
          if (typeof b.level === 'number' && b.level > 0 && b.level < 0.2 && !b.charging) {
            onLowBattery(b.level);
          }
        };
        check();
        b.addEventListener('levelchange', check);
        b.addEventListener('chargingchange', check);
        this._batteryUnsub = () => {
          b.removeEventListener('levelchange', check);
          b.removeEventListener('chargingchange', check);
        };
      })
      .catch(() => {});
  },

  teardownBattery() {
    if (this._batteryUnsub) {
      this._batteryUnsub();
      this._batteryUnsub = null;
    }
  },

  /**
   * @param {{ getSettings: () => object, onLowBattery?: () => void, mobileBatteryAuto?: boolean }} opts
   */
  init(opts = {}) {
    const getSettings = typeof opts.getSettings === 'function' ? opts.getSettings : () => ({});
    this.configure({ getSettings });
    const mobileOk =
      opts.mobileBatteryAuto !== false &&
      typeof navigator !== 'undefined' &&
      (navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || ''));
    if (mobileOk && typeof opts.onLowBattery === 'function') {
      this.initBatteryAutoSaver(opts.onLowBattery);
    }
  },

  updateNetworkQuality() {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const conn = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
    return conn?.effectiveType || null;
  }
};
