@echo off
REM ============================================================
REM  Snowstorm Desktop - quick run (NO rebuild).
REM  Use this for everyday launching once you've built at least
REM  once with Snowstorm-Start.bat. Opens instantly.
REM ============================================================
setlocal EnableExtensions
cd /d "%~dp0"
title Snowstorm Desktop

REM  Headless-mode guard: with this set, electron starts with no window.
set "ELECTRON_RUN_AS_NODE="

REM  Check for the runtime BINARY, not just the folder - a half-finished
REM  install leaves the folder in place with no electron.exe inside it.
if not exist "node_modules\electron\dist\electron.exe" (
    echo The Electron runtime is missing or the setup did not finish.
    echo Run "Snowstorm-Start.bat" first - it will download it.
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
