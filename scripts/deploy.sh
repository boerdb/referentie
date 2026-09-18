#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/referentie"
REPO="git@github.com:boerdb/referentie.git"
BRANCH="main"

echo "==> PM2 apps (huidige poorten):"
pm2 jlist 2>/dev/null | grep -oE '"PORT":"[0-9]+"' || pm2 list
echo ""
echo "==> Luisterende poorten 3000-3030:"
ss -tlnH | awk '{print $4}' | grep -oE '[0-9]+$' | sort -n | uniq | grep -E '^30[0-9]{2}$' || true

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "==> Clone naar $APP_DIR"
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

if [[ ! -f "$APP_DIR/.env.local" ]]; then
  echo "==> Maak .env.local van .env.example"
  cp "$APP_DIR/.env.example" "$APP_DIR/.env.local"
  echo "Bewerk op server: nano $APP_DIR/.env.local"
fi

mkdir -p "$APP_DIR/data/pdfs"
npm ci
npm run build

if ss -tlnH | grep -q ':3023 '; then
  echo "Waarschuwing: poort 3023 is al bezet."
fi

pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo ""
echo "Klaar. Test:"
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3023/ || true
curl -s http://127.0.0.1:3023/api/health/redis || true
pm2 show referentie | grep -E 'status|PORT|url' || pm2 show referentie
