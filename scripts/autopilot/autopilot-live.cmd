@echo off
setlocal ENABLEDELAYEDEXPANSION
REM autopilot-live.cmd — wrapper Windows pour Task Scheduler (mode LIVE + CONTINUOUS).
REM Preflight lock (exit 3 si runner actif), env LIVE+CONTINUOUS, watchdog borne crash-only,
REM STOP file respecte. Refus sargagame-tmp (vieux clone sans autopilot).
REM Usage: Task Scheduler -> this file (detached, survives terminal close).

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM Check if we're in the script directory (run.cjs is in same dir)
if exist "%SCRIPT_DIR%\run.cjs" (
    for %%I in ("%SCRIPT_DIR%\..\..") do set "REPO_ROOT=%%~fI"
) else if exist "%SCRIPT_DIR%\scripts\autopilot\run.cjs" (
    set "REPO_ROOT=%SCRIPT_DIR%"
) else (
    for %%I in ("%SCRIPT_DIR%\..\..") do set "REPO_ROOT=%%~fI"
)
cd /d "!REPO_ROOT!"

REM Ensure git is in PATH for repairPRConflict (Task Scheduler may not have git)
set "GIT_PATH=C:\Program Files\Git\bin;C:\Program Files\Git\cmd;%LOCALAPPDATA%\Programs\Git\bin;%LOCALAPPDATA%\Programs\Git\cmd"
set "PATH=%GIT_PATH%;%PATH%"

REM Verify we're in the canonical repo (not sargagame-tmp)
set "FILE_EXISTS=0"
if exist "%CD%\scripts\autopilot\run.cjs" (
    set "FILE_EXISTS=1"
)
if "%FILE_EXISTS%"=="1" goto :FILE_OK
echo [ERROR] scripts\autopilot\run.cjs introuvable — pas le repo canonique (Backup/sargagame)
echo [ERROR] Refus d'execution depuis un clone temporaire (sargagame-tmp)
endlocal
exit /b 2

:FILE_OK

REM Check STOP file before acquiring lock
if exist ".ai\autopilot\STOP" (
    echo [INFO] STOP file present — clean exit
    endlocal
    exit /b 4
)

REM Run with LIVE+CONTINUOUS flags
set SARGA_AUTOPILOT_LIVE=1
set SARGA_AUTOPILOT_CONTINUOUS=1
node scripts\autopilot\run.cjs --live --continuous %* >> ".ai\autopilot\runs\runner.log" 2>&1
endlocal
exit /b %ERRORLEVEL%