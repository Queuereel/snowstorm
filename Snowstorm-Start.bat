@echo off
REM ============================================================
REM  Snowstorm Desktop - one-click build & run.
REM  Double-click this. It installs what's needed, builds, then
REM  opens the app. Closing the app returns you here.
REM ============================================================
setlocal
cd /d "%~dp0"
title Snowstorm Desktop

echo ============================================
echo   Snowstorm Desktop
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not on your PATH.
    echo Install it from https://nodejs.org/ ^(LTS version^), then run this again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo First-time setup: installing dependencies. This may take a few minutes...
    echo.
    call npm install
    if errorlevel 1 goto :error
    echo.
)

if not exist "node_modules\electron\" (
    echo Installing the desktop runtime...
    echo.
    call npm install
    if errorlevel 1 goto :error
    echo.
)

echo Building the app...
echo.
call npm run build
if errorlevel 1 goto :error

echo.
echo Launching Snowstorm...
echo ^(Leave this window open while the app is running. Close the app to return here.^)
echo.
call npm run desktop-nobuild
if errorlevel 1 goto :error

exit /b 0

:error
echo.
echo ============================================
echo  [ERROR] Something went wrong above.
echo  Take a screenshot of this window if you need help.
echo ============================================
echo.
pause
exit /b 1
