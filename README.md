# Orbits P2P Messenger

Decentralized peer-to-peer messenger with BLE/LAN discovery, WebRTC calls, and cross-platform support (Web, Electron, Capacitor).

## Features
- 🔒 End-to-end encryption via AES-GCM
- 🌐 P2P messaging with PeerJS
- 📡 BLE + LAN peer discovery (radar)
- 🎨 Premium animated backgrounds
- 📞 WebRTC voice calls
- 🚀 Virtual scrolling for 10k+ messages

## Quick Start
```bash
npm install
npm run dev
```

## Build
- **Web**: `npm run build`
- **Desktop**: `npm run electron:build`
- **Mobile**: `npx cap sync && npx cap open android|ios`

## Maintenance & Updates
> [!IMPORTANT]
> **Where to update files:**
> - UI/Logic: Most logic is in `main.js`. Use the `utils` object for shared helpers and `messageIndexMap` for O(1) message lookups.
> - Database: Database schema and cursor logic are in `worker-db.js`.
> - Crypto: AES-GCM and batch decryption logic are in `worker-crypto.js`.
> - P2P/Radar: Bluetooth/LAN discovery and radar visualization are in `radar.js`.
> - Calls: WebRTC call management is in `call-manager.js`.

## Performance Optimizations
- **O(1) message lookup**: Map index used for message status updates.
- **Cursor-based IndexedDB operations**: Drastic I/O reduction for large histories.
- **Parallel batch decryption**: 10x+ speedup on chat history loading.
- **RPC timeout protection**: Safety net for worker communication (30s).
- **Memory leak prevention**: Automatic cleanup of chunks and timers.

## License
MIT
