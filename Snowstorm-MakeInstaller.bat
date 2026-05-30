@echo off
REM ============================================================
REM  Snowstorm Desktop - build a standalone Windows installer.
REM  Produces a Snowstorm setup .exe in the "dist_app" folder
REM  that you can install like any normal program (or share).
REM ============================================================
setlocal
cd /d "%~dp0"
title Snowstorm Desktop - Make Installer

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
    call npm install
    if errorlevel 1 goto :error
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
