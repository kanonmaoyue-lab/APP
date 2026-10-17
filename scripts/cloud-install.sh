#!/usr/bin/env bash
set -euo pipefail
cd /workspace/APP
mkdir -p /workspace/.cache/npm /workspace/.cache/supabase /workspace/.cache/ms-playwright
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright
npm ci --cache /workspace/.cache/npm
node scripts/cloud-tools.mjs
npm run backend:start
node scripts/local.mjs
npm run typecheck
npm run build
if ! command -v chromium >/dev/null 2>&1; then
  npm exec -- playwright install chromium
fi
if [ "${INSTALL_WEBKIT:-0}" = 1 ]; then
  npm exec -- playwright install webkit
else
  echo 'Chromium development workflow prepared. WebKit/iPad acceptance remains separate; run INSTALL_WEBKIT=1 bash scripts/cloud-install.sh after browser network access is enabled.'
fi
