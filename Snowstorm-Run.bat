@echo off
REM ============================================================
REM  Snowstorm Desktop - quick run (NO rebuild).
REM  Use this for everyday launching once you've built at least
REM  once with Snowstorm-Start.bat. Opens instantly.
REM ============================================================
setlocal
cd /d "%~dp0"
title Snowstorm Desktop

if not exist "node_modules\electron\" (
    echo Looks like the app hasn't been set up yet.
    echo Run "Snowstorm-Start.bat" first.
    echo.
    pause
    exit /b 1
)

if not exist "dist\app.js" (
    echo No build found yet. Run "Snowstorm-Start.bat" first to build it.
    echo.
    pause
    exit /b 1
)

echo Launching Snowstorm...
call npm run desktop-nobuild
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to launch. Try running Snowstorm-Start.bat instead.
    pause
    exit /b 1
)
exit /b 0
