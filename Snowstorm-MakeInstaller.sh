#!/usr/bin/env bash
# ============================================================
#  Snowstorm Desktop - build & install a standalone Linux app.
#  Packages an AppImage into "dist_app" (via electron-builder),
#  then installs it: copies the AppImage to a stable location,
#  installs its icon, and creates app-menu + desktop launchers.
#
#  There's no Windows-style "installer program" on Linux for an
#  AppImage - running this script IS the install step. Safe to
#  re-run (e.g. after `git pull` + rebuilding a new version).
# ============================================================
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
HERE="$(pwd)"

unset ELECTRON_RUN_AS_NODE
unset ELECTRON_SKIP_BINARY_DOWNLOAD

fail() {
    echo
    echo "============================================"
    echo " [ERROR] $1"
    echo "============================================"
    echo
    read -rp "Press Enter to close... "
    exit 1
}

if ! command -v node >/dev/null; then
    fail "Node.js is not installed or not on your PATH. Install it (e.g. sudo pacman -S nodejs npm), then run this again."
fi
if ! command -v npm >/dev/null; then
    fail "npm is not installed or not on your PATH. Install it (e.g. sudo pacman -S npm), then run this again."
fi

if [[ ! -d "node_modules" ]]; then
    echo "First-time setup: installing dependencies..."
    echo
    npm install --foreground-scripts --no-audit --no-fund --fetch-retries=5 \
        || fail "Installing dependencies failed. See the messages above."
fi

if [[ ! -x "node_modules/electron/dist/electron" ]]; then
    fail "The Electron runtime is missing - packaging needs it. Run \"Snowstorm-Start.sh\" once first, then come back."
fi

echo "Building the standalone AppImage. This can take a few minutes..."
echo
npm run dist-linux || fail "Packaging failed. See the messages above."

APPIMAGE="$(find dist_app -maxdepth 1 -iname '*.AppImage' -print -quit)"
if [[ -z "$APPIMAGE" ]]; then
    fail "Build finished but no .AppImage was found in dist_app/."
fi

# --- Install: copy the AppImage somewhere stable & permanent -----
INSTALL_DIR="$HOME/.local/share/Snowstorm"
mkdir -p "$INSTALL_DIR"
INSTALLED_APPIMAGE="$INSTALL_DIR/Snowstorm.AppImage"
echo
echo "Installing to $INSTALLED_APPIMAGE"
install -Dm755 "$APPIMAGE" "$INSTALLED_APPIMAGE"

# --- Icon -----------------------------------------------------------
ICONS="$HOME/.local/share/icons/hicolor/256x256/apps"
mkdir -p "$ICONS"
install -Dm644 "$HERE/icon.png" "$ICONS/snowstorm.png"

# --- App menu entry ---------------------------------------------------
APPS="$HOME/.local/share/applications"
mkdir -p "$APPS"
DESKTOP_ENTRY="[Desktop Entry]
Type=Application
Name=Snowstorm
Comment=Minecraft Bedrock Edition particle editor
Exec=\"$INSTALLED_APPIMAGE\" %f
Icon=snowstorm
Terminal=false
Categories=Graphics;
StartupWMClass=Snowstorm
"
echo "$DESKTOP_ENTRY" > "$APPS/snowstorm.desktop"

# --- Desktop icon -------------------------------------------------------
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
if [[ -d "$DESKTOP_DIR" ]]; then
    echo "$DESKTOP_ENTRY" > "$DESKTOP_DIR/Snowstorm.desktop"
    chmod +x "$DESKTOP_DIR/Snowstorm.desktop"
    # KDE/GNOME file managers require desktop-placed launchers to be marked
    # "trusted" or they show as an inert text-file icon until clicked once.
    gio set "$DESKTOP_DIR/Snowstorm.desktop" metadata::trusted true 2>/dev/null || true
fi

update-desktop-database "$APPS" 2>/dev/null || true
gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
kbuildsycoca6 --noincremental 2>/dev/null || true

echo
echo "============================================"
echo " Done. Snowstorm is installed:"
echo "   $INSTALLED_APPIMAGE"
echo " Launch it from the app menu, or the icon on your desktop."
echo "============================================"
echo
read -rp "Press Enter to close... "
exit 0
