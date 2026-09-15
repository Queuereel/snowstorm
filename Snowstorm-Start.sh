#!/usr/bin/env bash
# ============================================================
#  Snowstorm Desktop - one-click setup, build & run (Linux).
#  Run this. It installs what's needed, builds, then opens the
#  app. Closing the app returns you here.
#
#  Mirrors Snowstorm-Start.bat - see that file for the Windows
#  equivalent and the reasoning behind each step.
# ============================================================
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# --- Environment variables that silently break Electron -----
#  ELECTRON_RUN_AS_NODE makes the electron binary run headless
#  as plain Node - the app "starts" but no window ever opens.
#  ELECTRON_SKIP_BINARY_DOWNLOAD makes the install skip the
#  runtime download, which leaves node_modules/electron sitting
#  there with its .js files but no electron binary inside.
unset ELECTRON_RUN_AS_NODE
unset ELECTRON_SKIP_BINARY_DOWNLOAD

ELECTRON_BIN="node_modules/electron/dist/electron"
NPMFLAGS=(--foreground-scripts --no-audit --no-fund --fetch-retries=5)

echo "============================================"
echo "  Snowstorm Desktop"
echo "============================================"
echo

# --- 1. Node present? ---------------------------------------
if ! command -v node >/dev/null; then
    echo "[ERROR] Node.js is not installed or not on your PATH."
    echo "Install it (e.g. sudo pacman -S nodejs npm), then run this again."
    echo
    read -rp "Press Enter to close... "
    exit 1
fi
if ! command -v npm >/dev/null; then
    echo "[ERROR] npm is not installed or not on your PATH."
    echo "Install it (e.g. sudo pacman -S npm), then run this again."
    echo
    read -rp "Press Enter to close... "
    exit 1
fi

# --- 2. npm packages ----------------------------------------
if [[ -d "node_modules" ]]; then
    echo "[1/4] Dependencies already installed."
    echo
else
    echo "[1/4] First-time setup: installing dependencies."
    echo "      This downloads several hundred MB and takes a few minutes."
    echo "      Progress is printed below - it has NOT frozen."
    echo
    if ! npm install "${NPMFLAGS[@]}"; then
        echo
        echo "============================================"
        echo " [ERROR] Installing dependencies failed."
        echo
        echo " Usually this means no internet, or a firewall/proxy"
        echo " is blocking:"
        echo "   registry.npmjs.org   (the packages)"
        echo "   github.com           (the Electron runtime)"
        echo "============================================"
        echo
        read -rp "Press Enter to close... "
        exit 1
    fi
    echo
fi

# --- 3. Electron runtime (the part that usually fails) -------
if [[ ! -x "$ELECTRON_BIN" ]]; then
    echo "[2/4] Electron runtime is missing or incomplete."
    echo "      Downloading it now (about 180 MB). Progress is printed"
    echo "      below - this is the slow step, please let it finish."
    echo

    # Re-run Electron's own installer first. It is a no-op if the
    # runtime is already good, and it skips a full npm reinstall.
    if [[ -f "node_modules/electron/install.js" ]]; then
        node "node_modules/electron/install.js"
    fi

    if [[ ! -x "$ELECTRON_BIN" ]]; then
        echo
        echo "      That did not work. Reinstalling the electron package..."
        echo
        rm -rf "node_modules/electron"
        npm install electron "${NPMFLAGS[@]}" --no-save
        if [[ ! -x "$ELECTRON_BIN" ]]; then
            echo
            echo "============================================"
            echo " [ERROR] The Electron runtime could not be downloaded."
            echo
            echo " Snowstorm cannot open a window without it. The file"
            echo " it needs is:"
            echo "   $(pwd)/$ELECTRON_BIN"
            echo
            echo " It is fetched from github.com - check that your network"
            echo " or proxy is not blocking that, then try again."
            echo "============================================"
            echo
            read -rp "Press Enter to close... "
            exit 1
        fi
    fi
fi
echo "[2/4] Electron runtime OK."
echo

# --- 4. Build -----------------------------------------------
echo "[3/4] Building the app. This takes a minute or two..."
echo
if ! npm run build; then
    echo
    echo "============================================"
    echo " [ERROR] The build failed. See the messages above."
    echo
    echo " If it mentions a missing file under dist/images,"
    echo " run this instead and then try again:"
    echo "   node desktop/prep-images.js"
    echo "============================================"
    echo
    read -rp "Press Enter to close... "
    exit 1
fi

# --- 5. Launch ----------------------------------------------
echo
echo "[4/4] Launching Snowstorm..."
echo "(Leave this window open while the app is running. Close the app to return here.)"
echo
if ! npm run desktop-nobuild; then
    echo
    echo "============================================"
    echo " [ERROR] The app failed to launch."
    echo " Take a screenshot of this window if you need help."
    echo "============================================"
    echo
    read -rp "Press Enter to close... "
    exit 1
fi
exit 0
