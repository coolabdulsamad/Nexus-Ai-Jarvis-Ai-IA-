#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[1/4] Checking prerequisites"
command -v python3 >/dev/null || { echo "Python 3.12+ is required."; exit 1; }
command -v node >/dev/null || { echo "Node.js 22+ is required."; exit 1; }
command -v npm >/dev/null || { echo "npm is required."; exit 1; }

echo "[2/4] Creating the Python virtual environment"
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements-dev.txt

echo "[3/4] Installing frontend dependencies"
npm install

echo "[4/4] Preparing local storage"
mkdir -p data

echo ""
echo "Nexus is ready. Run: bash scripts/dev.sh"
echo "Then open: http://localhost:3000"
