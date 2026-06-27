#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# deploy.sh — собрать локально и задеплоить на translatepls.me
# Использование: ./deploy.sh
# ============================================================

SSH_KEY="${SSH_KEY:-/home/yaropolk/Загрузки/second.pem}"
SSH_USER="azureuser"
SSH_HOST="74.161.40.29"
REMOTE_DIR="/home/azureuser/aicards"
IMAGES_DIR="/tmp"

IMAGE_FRONTEND="aicards-frontend:latest"
IMAGE_BACKEND="aicards-backend:latest"

echo "🔧 1. Проверяем свежий код..."
cd "$(dirname "$0")"
if ! git diff --quiet HEAD; then
  echo "❌ Есть незакоммиченные изменения. Сделай git commit + git push сначала."
  exit 1
fi

if ! git push --dry-run origin main 2>&1 | grep -q "up-to-date"; then
  echo "❌ Локальные коммиты не запушены. Сделай git push сначала."
  exit 1
fi

echo "✅ Код в порядке."

echo ""
echo "🐳 2. Собираем образы..."
docker compose build 2>&1 | tail -5

echo ""
echo "💾 3. Экспортируем образы..."
docker save "$IMAGE_FRONTEND" | gzip > "$IMAGES_DIR/aicards-frontend.tar.gz"
docker save "$IMAGE_BACKEND"  | gzip > "$IMAGES_DIR/aicards-backend.tar.gz"
echo "   frontend: $(du -h "$IMAGES_DIR/aicards-frontend.tar.gz" | cut -f1)"
echo "   backend:  $(du -h "$IMAGES_DIR/aicards-backend.tar.gz" | cut -f1)"

echo ""
echo "📤 4. Копируем на сервер..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  "$IMAGES_DIR/aicards-frontend.tar.gz" \
  "$IMAGES_DIR/aicards-backend.tar.gz" \
  "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/"

echo ""
echo "🚀 5. Загружаем и перезапускаем на сервере..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" << 'CMDS'
  set -euo pipefail
  cd /home/azureuser/aicards

  sg docker -c "
    echo '   Загрузка образов...'
    gunzip -c aicards-frontend.tar.gz | docker load
    gunzip -c aicards-backend.tar.gz  | docker load

    echo '   Перезапуск контейнеров...'
    docker compose up -d --force-recreate

    echo ''
    echo '✅ Готово!'
    docker ps --format 'table {{.Names}}\t{{.Status}}'
  "
CMDS

echo ""
echo "🌐 Проверка..."
sleep 3
curl -skI "https://translatepls.me/api/cards/tags" 2>&1 | head -3
echo ""
echo "🎉 Деплой завершён!"
