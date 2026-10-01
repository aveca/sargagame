@echo off
setlocal ENABLEDELAYEDEXPANSION
REM autopilot.cmd — point d'entree Windows Task Scheduler (un tick d'orchestrateur).
REM Survit a la fermeture du terminal (process detache par le scheduler).
REM Le verrou PID empeche tout doublon ; STOP file = kill-switch.

REM 1. Détecter la racine du VRAI repo (Backup/sargagame) peu importe le CWD
set "MARKER=scripts\autopilot\runner.cjs"
set "REPO_ROOT="

REM a) Si on est déjà dans le repo
if exist "%MARKER%" (
    if exist "package.json" if exist "src" (
        set "REPO_ROOT=%CD%"
        goto :FOUND_ROOT
    )
)

REM b) Depuis le dossier du script
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
if exist "%SCRIPT_DIR%\%MARKER%" (
    for %%I in ("%SCRIPT_DIR%\..\..") do set "REPO_ROOT=%%~fI"
    goto :FOUND_ROOT
)

REM c) Emplacements canoniques
set "CANDIDATES="
set "CANDIDATES=%CANDIDATES% %USERPROFILE%\Documents\Backup\sargagame"
set "CANDIDATES=%CANDIDATES% %USERPROFILE%\Backup\sargagame"

for %%D in (%CANDIDATES%) do (
    if exist "%%D\%MARKER%" if exist "%%D\package.json" if exist "%%D\src" (
        set "REPO_ROOT=%%D"
        goto :FOUND_ROOT
    )
)

:FOUND_ROOT
if defined REPO_ROOT (
    echo [INFO] Repo: %REPO_ROOT%
    cd /d "%REPO_ROOT%"
    goto :ROOT_OK
)

echo [ERROR] Repo introuvable (marker %MARKER% manquant)
endlocal
exit /b 2

:ROOT_OK

REM 2. Git PATH
set "GIT_PATH=C:\Program Files\Git\bin;C:\Program Files\Git\cmd;%LOCALAPPDATA%\Programs\Git\bin;%LOCALAPPDATA%\Programs\Git\cmd"
set "PATH=%GIT_PATH%;%PATH%"

REM 3. Run
node scripts\autopilot\runner.cjs %* >> ".ai\autopilot\runs\runner.log" 2>&1
endlocal
exit /b %ERRORLEVEL%