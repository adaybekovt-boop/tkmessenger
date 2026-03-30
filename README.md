# Orbits P2P

Decentralized P2P messenger (vanilla JS, PeerJS, IndexedDB), with Vite for the web build and optional Electron / Capacitor packaging.

## Development

```bash
npm ci
npm run dev
```

## Production web build

```bash
npm run build
npm run preview
```

## Downloads page (`download.html`)

Static page that detects the OS and links to the latest GitHub Release assets (Windows `.exe`, Android `.apk`, macOS `.dmg`). Host it next to the app or on GitHub Pages.

## Accessibility

If the system preference **Reduce motion** is enabled, animated canvas themes are replaced with a static black background (no `requestAnimationFrame` loop). Your selected theme is still saved in `localStorage` and applies again if you turn animations back on.

## macOS Gatekeeper (unsigned / not notarized builds)

Electron builds from CI are usually **not notarized** by Apple. On first open, macOS may show:

> “Orbits P2P can’t be opened because Apple cannot check it for malicious software.”

**Workaround (safe, standard for indie builds):**

1. Install the app from the `.dmg` (drag to **Applications** if needed).
2. In **Finder**, **right-click** (or **Ctrl+click**) **Orbits P2P**.
3. Choose **Open** from the menu, then **Open** again in the dialog.

After the first successful launch, you can open the app normally from Launchpad or Spotlight.

The **`download.html`** page repeats these steps for macOS visitors. Full notarization requires an Apple Developer Program membership and is not included in the default pipeline.

## Repository layout

- App source: `index.html`, `style.css`, `main.js`, workers, `themeManager.js`, etc.
- Optional self-contained push bundle: `Git_push/` (see `Git_push/README.md`).
