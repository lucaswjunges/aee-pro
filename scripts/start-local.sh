#!/usr/bin/env bash
set -euo pipefail

# AEE+ PRO — Local LaTeX server with Cloudflare Tunnel
# Usage: ./scripts/start-local.sh [--no-docker]
#
# Prerequisites:
#   - Docker (or TeX Live + Python 3 if --no-docker)
#   - cloudflared (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
#   - ANTHROPIC_API_KEY in environment

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LATEX_DIR="$PROJECT_DIR/services/latex-compiler"

PORT="${PORT:-8080}"
AUTH_TOKEN="${COMPILER_AUTH_TOKEN:-aee-pro-local-2024}"
USE_DOCKER=true

if [[ "${1:-}" == "--no-docker" ]]; then
  USE_DOCKER=false
fi

# --- Checks ---
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY not set in environment"
  echo "  export ANTHROPIC_API_KEY=sk-ant-..."
  exit 1
fi

if ! command -v cloudflared &>/dev/null; then
  echo "ERROR: cloudflared not installed"
  echo "  sudo apt install cloudflared  OR"
  echo "  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

cleanup() {
  echo ""
  echo "Shutting down..."
  kill "$SERVER_PID" 2>/dev/null || true
  kill "$TUNNEL_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# --- Start server ---
if $USE_DOCKER; then
  if ! command -v docker &>/dev/null; then
    echo "ERROR: Docker not installed. Use --no-docker to run directly with Python."
    exit 1
  fi

  echo "Building Docker image..."
  docker build -t aee-latex "$LATEX_DIR"

  echo "Starting LaTeX server on port $PORT (Docker)..."
  docker run --rm \
    -p "$PORT:8080" \
    -e "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" \
    -e "COMPILER_AUTH_TOKEN=$AUTH_TOKEN" \
    -e "CLAUDE_MODEL=${CLAUDE_MODEL:-claude-sonnet-4-5-20250929}" \
    --name aee-latex-local \
    aee-latex &
  SERVER_PID=$!
else
  echo "Starting LaTeX server on port $PORT (Python direct)..."
  cd "$LATEX_DIR"
  COMPILER_AUTH_TOKEN="$AUTH_TOKEN" \
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  CLAUDE_MODEL="${CLAUDE_MODEL:-claude-sonnet-4-5-20250929}" \
  python3 server.py &
  SERVER_PID=$!
  cd "$PROJECT_DIR"
fi

# Wait for server to be ready
echo "Waiting for server to start..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
    echo "Server is ready!"
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "ERROR: Server failed to start after 30s"
    kill "$SERVER_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

# --- Start Cloudflare Tunnel ---
echo ""
echo "Starting Cloudflare Tunnel..."
cloudflared tunnel --url "http://localhost:$PORT" &
TUNNEL_PID=$!

# Wait for tunnel URL
sleep 5
echo ""
echo "============================================"
echo "  AEE+ PRO Local Server Running"
echo "============================================"
echo "  Local:  http://localhost:$PORT"
echo "  Auth:   Bearer $AUTH_TOKEN"
echo "  Model:  ${CLAUDE_MODEL:-claude-sonnet-4-5-20250929}"
echo ""
echo "  Tunnel URL will appear above (*.trycloudflare.com)"
echo ""
echo "  Next steps:"
echo "  1. Copy the *.trycloudflare.com URL"
echo "  2. Update Worker secret:"
echo "     wrangler secret put LATEX_COMPILER_URL"
echo "     (paste the tunnel URL)"
echo "  3. Also update LATEX_COMPILER_TOKEN if different:"
echo "     wrangler secret put LATEX_COMPILER_TOKEN"
echo ""
echo "  Press Ctrl+C to stop"
echo "============================================"

wait
