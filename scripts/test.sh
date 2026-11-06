#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON=".venv/bin/python"
[[ -x "$PYTHON" ]] || PYTHON=python3

"$PYTHON" -m pytest -q -p no:cacheprovider
npm run check
npm test
npm run lint
npm run build
