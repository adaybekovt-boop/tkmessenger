# Orbits P2P — GitHub (веб + десктоп + Android)

**Как выложить:** содержимое этой папки — в корень репозитория, `git add .`, `commit`, `push`. Папки `node_modules`, `dist`, `release`, `android` в Git **не попадают** (см. `.gitignore`); их не нужно ни коммитить, ни вручную чистить перед пушем. После клона у себя или в CI: `npm ci`.

Стек: **Vite** (веб), **Electron** (Windows/macOS), **Capacitor** (Android). CI — `.github/workflows/`.

## GitHub Pages (веб)

1. Репозиторий → **Settings → Pages → Source: GitHub Actions**.
2. Пуш в `main`/`master` запускает **Deploy GitHub Pages** (сборка `dist/`).
3. Сайт: `https://<user>.github.io/<repo>/`

## Релиз с бинарниками (Windows `.exe`, macOS `.dmg`, Android `.apk`)

1. Обновите при необходимости `version` в `package.json`.
2. Создайте и отправьте тег:

```bash
git tag v1.0.1
git push origin v1.0.1
```

3. Запускается **Release (Desktop + Android)**. После успеха в **Releases** появятся установщики и `*.sha256.txt`.

Локально: `npm ci`, `npm run build` (веб), `npm run electron:build` (десктоп), для Android после `npm run build` — `npx cap add android` (один раз) и `npx cap sync`, затем сборка в `android/` (см. Capacitor).

## Скрипты

| Команда | Назначение |
|--------|------------|
| `npm run dev` | Vite dev-сервер |
| `npm run build` | production `dist/` |
| `npm run preview` | предпросмотр `dist/` |
| `npm run electron:dev` | Electron + dev URL |
| `npm run electron:build` | Vite + Electron (текущая ОС) |
| `npm run cap:sync` | `build` + `cap sync` |

## Примечания

- В `package.json` → `build.publish` указаны `owner`/`repo` для **electron-updater**; при смене репозитория обновите.
- macOS/Windows сборки в CI **без** код-подписи (`CSC_IDENTITY_AUTO_DISCOVERY=false`).
- Android в CI — **debug APK**; для подписи release-канала нужны keystore и отдельные шаги.
