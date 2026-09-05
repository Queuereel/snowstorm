@echo off
REM ============================================================
REM  Snowstorm Desktop - build a standalone Windows installer.
REM  Produces a Snowstorm setup .exe in the "dist_app" folder
REM  that you can install like any normal program (or share).
REM ============================================================
setlocal EnableExtensions
cd /d "%~dp0"
title Snowstorm Desktop - Make Installer

set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_SKIP_BINARY_DOWNLOAD="

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not on your PATH.
    echo Install it from https://nodejs.org/ ^(LTS version^), then run this again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo First-time setup: installing dependencies...
    echo.
    call npm install --foreground-scripts --no-audit --no-fund --fetch-retries=5
    if errorlevel 1 goto :error
)

if not exist "node_modules\electron\dist\electron.exe" (
    echo The Electron runtime is missing - packaging needs it.
    echo Run "Snowstorm-Start.bat" once first, then come back.
    echo.
    pause
    exit /b 1
)

echo Building the standalone installer. This can take a few minutes...
echo.
call npm run dist-win
if errorlevel 1 goto :error

echo.
echo ============================================
echo  Done. Opening the dist_app folder...
echo ============================================
if exist "dist_app\" start "" explorer "dist_app"
echo.
pause
exit /b 0

:error
echo.
echo ============================================
echo  [ERROR] Packaging failed. See the messages above.
echo ============================================
echo.
pause
exit /b 1
