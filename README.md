# Orbits P2P

Decentralized P2P messenger that runs entirely in the browser. No server stores your messages.

**Live demo:** https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/

## Features

- P2P text messaging via WebRTC (PeerJS)
- File, photo, audio and voice message sharing
- Video and voice calls with screen share
- End-to-end encryption (Web Crypto API — AES-GCM 256-bit)
- Local message history (IndexedDB)
- Master password + vault lock
- TTL self-destructing messages
- Radar — find nearby peers
- Telegram Dark Mode UI
- Works as a web app (GitHub Pages)

## Tech stack

- Vanilla JS (ES2022+)
- PeerJS 1.5.x (WebRTC)
- IndexedDB (local storage)
- Web Crypto API (PBKDF2 + AES-GCM)
- Web Workers
- Vite 5.x

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages → Source → GitHub Actions**
3. Push to `main` — the workflow builds and deploys automatically

> The live URL will be `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`

## Environment Variables

For custom deployment (e.g., using your own PeerJS server), you can create a `.env` file in the project root. The following variables are supported:

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_PEER_SERVER_HOST` | PeerJS server hostname | `0.peerjs.com` |
| `VITE_PEER_SERVER_PORT` | PeerJS server port | `443` |
| `VITE_PEER_SECURE` | Use secure WebSockets (`true`/`false`) | `true` |
| `VITE_PEER_SERVER_KEY` | Optional API key (if required) | (empty) |

> **Note:** These variables are only used in the web version. Electron and Capacitor builds use the same configuration via Vite's `import.meta.env`.

### Development vs Production

- **Development:** `npm run dev` starts Vite dev server with hot reload.
- **Production build:** `npm run build` compiles to `dist/` folder.
- **Electron production:** After build, run `npm run electron`.
- **Android (Capacitor):** `npm run cap:android` syncs `dist/` to native project.

If you change any environment variable, rebuild the app (`npm run build`).
