#!/usr/bin/env bash
# Adapt Studio — one-command local start.
#
#   ./start.sh            build and run the production server → http://localhost:8787
#   ./start.sh dev        Vite dev server (5173, hot reload) + API (8787)
#   ./start.sh check      one live vision call against the configured provider (prints the object model)
#   ./start.sh test       unit tests + headless end-to-end run
#
# Needs Node.js 20+ (https://nodejs.org). Everything else is installed by npm.
set -euo pipefail
cd "$(dirname "$0")"

echo "================================================"
echo "  Adapt Studio — Federal Bank creative resize"
echo "================================================"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required: https://nodejs.org"
  exit 1
fi
NODE_MAJOR=$(node -p 'Number(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js $(node -v) found; 20 or newer is required."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example."
  echo "  To analyse real files, add ANTHROPIC_API_KEY or the Vertex block (CLAUDE_PROVIDER=vertex +"
  echo "  GOOGLE_APPLICATION_CREDENTIALS). The demo master works without either."
  echo ""
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

MODE=${1:-start}
case "$MODE" in
  dev)
    echo "Dev mode: web http://localhost:5173  ·  API http://localhost:8787"
    exec npm run dev
    ;;
  check)
    npm run build --silent
    exec node scripts/smoke-vision.mjs "${2:-}"
    ;;
  test)
    npm test
    npm run build --silent
    exec npm run e2e
    ;;
  start)
    echo "Building..."
    npm run build --silent
    PORT=${PORT:-8787}
    echo ""
    echo "================================================"
    echo "  Adapt Studio  →  http://localhost:${PORT}"
    echo "  Health        →  http://localhost:${PORT}/api/health"
    echo "  Ctrl+C stops the server"
    echo "================================================"
    echo ""
    export NODE_ENV=production PORT
    exec node dist-server/index.js
    ;;
  *)
    echo "usage: ./start.sh [start|dev|check|test]"
    exit 2
    ;;
esac
