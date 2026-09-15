#!/usr/bin/env bash
# ============================================================
#  Snowstorm Desktop - quick run (NO rebuild), Linux.
#  Use this for everyday launching once you've built at least
#  once with Snowstorm-Start.sh. Opens instantly.
# ============================================================
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# Headless-mode guard: with this set, electron starts with no window.
unset ELECTRON_RUN_AS_NODE

# Check for the runtime BINARY, not just the folder - a half-finished
# install leaves the folder in place with no electron binary inside it.
if [[ ! -x "node_modules/electron/dist/electron" ]]; then
    echo "The Electron runtime is missing or the setup did not finish."
    echo "Run \"Snowstorm-Start.sh\" first - it will download it."
    echo
    read -rp "Press Enter to close... "
    exit 1
fi

if [[ ! -f "dist/app.js" ]]; then
    echo "No build found yet. Run \"Snowstorm-Start.sh\" first to build it."
    echo
    read -rp "Press Enter to close... "
    exit 1
fi

echo "Launching Snowstorm..."
if ! npm run desktop-nobuild; then
    echo
    echo "[ERROR] Failed to launch. Try running Snowstorm-Start.sh instead."
    read -rp "Press Enter to close... "
    exit 1
fi
exit 0
