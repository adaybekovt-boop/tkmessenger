# 🚢 Инструкция по деплою

Мессенджер Orbits спроектирован для работы в облачных средах с использованием CI/CD.

## 1. База данных и Кэш
### PostgreSQL (Neon или Supabase)
1. Создайте проект на [Neon.tech](https://neon.tech) или [Supabase.com](https://supabase.com).
2. Скопируйте строку подключения (Connection String).
3. Добавьте ее в переменную `DATABASE_URL` на бэкенде.

### Redis (Upstash)
1. Создайте базу данных на [Upstash](https://upstash.com).
2. Скопируйте `REDIS_URL` (формат `redis://:password@host:port`).

## 2. Бэкенд (Railway или Render)
1. Создайте новый проект на [Railway.app](https://railway.app).
2. Подключите ваш GitHub репозиторий.
3. Укажите Root Directory: `server`.
4. Добавьте переменные окружения из `.env.example`.
5. Railway автоматически обнаружит `Dockerfile` или команду `npm run start`.

## 3. Фронтенд (Vercel или Netlify)
1. Создайте проект на [Vercel](https://vercel.com).
2. Подключите репозиторий.
3. Настройки сборки:
   - Framework: Vite
   - Root Directory: `client`
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Добавьте переменную `VITE_API_URL`, указывающую на ваш задеплоенный бэкенд.

## 4. Переменные окружения (Secrets)
Обязательно настройте в GitHub Actions (Settings -> Secrets and variables -> Actions):
- `RAILWAY_TOKEN` (для авто-деплоя бэкенда)
- `VERCEL_TOKEN` (для фронтенда)
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
