#!/usr/bin/env bash
# One-shot installer. Prereqs: Node.js 20.19+ and Python 3.8+ (see README).
set -e
cd "$(dirname "$0")"

echo "==> Checking Python..."
if command -v python3 >/dev/null 2>&1; then PY=python3; else PY=python; fi
$PY --version || { echo "Python not found. Install Python 3.8+ first."; exit 1; }
echo "    The Python backend uses only the standard library, so there is nothing to install."

echo "==> Installing frontend dependencies..."
(cd frontend && npm install)

echo "==> Installing Node backend dependencies..."
(cd backend-node && npm install)

echo ""
echo "Done. Open three terminals and see 'How to run' in the README."
