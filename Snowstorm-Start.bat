@echo off
REM ============================================================
REM  Snowstorm Desktop - one-click setup, build & run.
REM  Double-click this. It installs what's needed, builds, then
REM  opens the app. Closing the app returns you here.
REM ============================================================
setlocal EnableExtensions
cd /d "%~dp0"
title Snowstorm Desktop

REM --- Environment variables that silently break Electron -----
REM  ELECTRON_RUN_AS_NODE makes the electron binary run headless
REM  as plain Node - the app "starts" but no window ever opens.
REM  ELECTRON_SKIP_BINARY_DOWNLOAD makes the install skip the
REM  runtime download, which leaves node_modules\electron sitting
REM  there with its .js files but no electron.exe inside.
set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_SKIP_BINARY_DOWNLOAD="

REM  The actual runtime binary. Checking for the FOLDER is not
REM  enough - a half-finished install leaves the folder behind.
set "ELECTRON_EXE=node_modules\electron\dist\electron.exe"
set "NPMFLAGS=--foreground-scripts --no-audit --no-fund --fetch-retries=5"

echo ============================================
echo   Snowstorm Desktop
echo ============================================
echo.

REM --- 1. Node present? ---------------------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not on your PATH.
    echo Install it from https://nodejs.org/ ^(LTS version^), then run this again.
    echo.
    pause
    exit /b 1
)

REM --- 2. npm packages ----------------------------------------
if exist "node_modules\" goto :have_modules

echo [1/4] First-time setup: installing dependencies.
echo       This downloads several hundred MB and takes a few minutes.
echo       Progress is printed below - it has NOT frozen.
echo.
call npm install %NPMFLAGS%
if errorlevel 1 goto :error_npm
echo.
goto :check_electron

:have_modules
echo [1/4] Dependencies already installed.
echo.

REM --- 3. Electron runtime (the part that usually fails) -------
:check_electron
if exist "%ELECTRON_EXE%" goto :have_electron

echo [2/4] Electron runtime is missing or incomplete.
echo       Downloading it now ^(about 180 MB^). Progress is printed
echo       below - this is the slow step, please let it finish.
echo.

REM  Re-run Electron's own installer first. It is a no-op if the
REM  runtime is already good, and it skips a full npm reinstall.
if exist "node_modules\electron\install.js" (
    node "node_modules\electron\install.js"
)
if exist "%ELECTRON_EXE%" goto :have_electron

echo.
echo       That did not work. Reinstalling the electron package...
echo.
if exist "node_modules\electron\" rmdir /s /q "node_modules\electron"
call npm install electron %NPMFLAGS% --no-save
if not exist "%ELECTRON_EXE%" goto :error_electron

:have_electron
echo [2/4] Electron runtime OK.
echo.

REM --- 4. Build -----------------------------------------------
echo [3/4] Building the app. This takes a minute or two...
echo.
call npm run build
if errorlevel 1 goto :error_build

REM --- 5. Launch ----------------------------------------------
echo.
echo [4/4] Launching Snowstorm...
echo ^(Leave this window open while the app is running. Close the app to return here.^)
echo.
call npm run desktop-nobuild
if errorlevel 1 goto :error_launch

exit /b 0


:error_npm
echo.
echo ============================================
echo  [ERROR] Installing dependencies failed.
echo.
echo  Usually this means no internet, or a firewall,
echo  proxy or antivirus is blocking:
echo    registry.npmjs.org   ^(the packages^)
echo    github.com           ^(the Electron runtime^)
echo ============================================
echo.
pause
exit /b 1

:error_electron
echo.
echo ============================================
echo  [ERROR] The Electron runtime could not be downloaded.
echo.
echo  Snowstorm cannot open a window without it. The file
echo  it needs is:
echo    %CD%\%ELECTRON_EXE%
echo.
echo  It is fetched from github.com - check that your network,
echo  proxy or antivirus is not blocking that, then try again.
echo  If you are behind a proxy, set it first with:
echo    npm config set proxy http://your.proxy:port
echo ============================================
echo.
pause
exit /b 1

:error_build
echo.
echo ============================================
echo  [ERROR] The build failed. See the messages above.
echo.
echo  If it mentions a missing file under dist\images,
echo  run this instead and then try again:
echo    node desktop\prep-images.js
echo ============================================
echo.
pause
exit /b 1

:error_launch
echo.
echo ============================================
echo  [ERROR] The app failed to launch.
echo  Take a screenshot of this window if you need help.
echo ============================================
echo.
pause
exit /b 1
