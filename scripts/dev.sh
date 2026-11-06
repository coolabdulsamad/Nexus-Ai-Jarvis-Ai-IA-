#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -x .venv/bin/python ]] || [[ ! -d node_modules ]]; then
  echo "Run bash scripts/setup.sh first."
  exit 1
fi

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then kill "$API_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

echo "Starting Nexus Local Core on http://127.0.0.1:8000"
.venv/bin/python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000 &
API_PID=$!
sleep 2
kill -0 "$API_PID" 2>/dev/null || { echo "The API failed to start."; exit 1; }

echo "Starting Nexus Console on http://localhost:3000"
npm run dev -- --host 127.0.0.1
