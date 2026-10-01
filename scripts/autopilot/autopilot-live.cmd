@echo off
setlocal ENABLEDELAYEDEXPANSION
REM autopilot-live.cmd — wrapper Windows pour Task Scheduler (mode LIVE + CONTINUOUS).
REM Preflight lock (exit 3 si runner actif), env LIVE+CONTINUOUS, watchdog borne crash-only,
REM STOP file respecte. Refus sargagame-tmp (vieux clone sans autopilot).
REM Usage: Task Scheduler -> this file (detached, survives terminal close).

REM 1. Détecter la racine du VRAI repo (Backup/sargagame) peu importe le CWD
REM    On cherche le marker canonique : scripts\autopilot\run.cjs
REM    ET on vérifie qu'on a bien la structure complète (package.json, src/, etc.)
set "MARKER=scripts\autopilot\run.cjs"
set "REPO_ROOT="

REM a) Si on est déjà dans le repo (run.cjs accessible)
if exist "%MARKER%" (
    REM Vérifier structure complète
    if exist "package.json" if exist "src" if exist "scripts\autopilot\run.cjs" (
        set "REPO_ROOT=%CD%"
        goto :FOUND_ROOT
    )
)

REM b) Chercher depuis le dossier du script (%~dp0) - emplacement normal
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
if exist "%SCRIPT_DIR%\%MARKER%" (
    for %%I in ("%SCRIPT_DIR%\..\..") do set "REPO_ROOT=%%~fI"
    goto :FOUND_ROOT
)

REM c) Chercher depuis les emplacements canoniques connus (chemin exact)
set "CANDIDATES="
set "CANDIDATES=%CANDIDATES% %USERPROFILE%\Documents\Backup\sargagame"
set "CANDIDATES=%CANDIDATES% %USERPROFILE%\Backup\sargagame"
set "CANDIDATES=%CANDIDATES% %HOMEDRIVE%%HOMEPATH%\Documents\Backup\sargagame"
set "CANDIDATES=%CANDIDATES% %HOMEDRIVE%%HOMEPATH%\Backup\sargagame"

REM d) Fallback: remonter depuis le script jusqu'à trouver le marker (MAX 5 niveaux)
set "SEARCH_DIR=%SCRIPT_DIR%"
set "MAX_DEPTH=5"
set "DEPTH=0"
:SEARCH_LOOP
if %DEPTH% GEQ %MAX_DEPTH% goto :SEARCH_DONE
if exist "%SEARCH_DIR%\%MARKER%" (
    for %%I in ("%SEARCH_DIR%\..\..") do set "REPO_ROOT=%%~fI"
    REM Vérifier structure complète avant d'accepter
    if exist "%REPO_ROOT%\package.json" if exist "%REPO_ROOT%\src" if exist "%REPO_ROOT%\scripts\autopilot\run.cjs" (
        goto :FOUND_ROOT
    )
)
REM Remonter d'un niveau
for %%I in ("%SEARCH_DIR%\..") do set "PARENT=%%~fI"
if "%PARENT%"=="%SEARCH_DIR%" goto :SEARCH_DONE
set "SEARCH_DIR=%PARENT%"
set /a DEPTH+=1
goto :SEARCH_LOOP

:SEARCH_DONE

REM e) Dernier recours: parcourir les CANDIDATES (chemins exacts)
for %%D in (%CANDIDATES%) do (
    if exist "%%D\%MARKER%" (
        if exist "%%D\package.json" if exist "%%D\src" (
            set "REPO_ROOT=%%D"
            goto :FOUND_ROOT
        )
    )
)

:FOUND_ROOT
if defined REPO_ROOT (
    echo [INFO] Repo trouvé : %REPO_ROOT%
    cd /d "%REPO_ROOT%"
    goto :ROOT_OK
)

echo [ERROR] Repo canonique introuvable (marker %MARKER% manquant ou structure incomplète)
echo [ERROR] Emplacements cherches :
echo [ERROR]   - CWD courant (si package.json + src + scripts\autopilot\run.cjs)
echo [ERROR]   - Dossier du script (%~dp0) -> 2 niveaux up
echo [ERROR]   - %USERPROFILE%\Documents\Backup\sargagame
echo [ERROR]   - %USERPROFILE%\Backup\sargagame
echo [ERROR]   - Remontees parentes du script (max 5 niveaux, structure verifiee)
echo [ERROR] Demarrez depuis le vrai repo ou configurez Task Scheduler sur ce fichier.
endlocal
exit /b 2

:ROOT_OK

REM 2. Ensure git is in PATH for repairPRConflict (Task Scheduler may not have git)
set "GIT_PATH=C:\Program Files\Git\bin;C:\Program Files\Git\cmd;%LOCALAPPDATA%\Programs\Git\bin;%LOCALAPPDATA%\Programs\Git\cmd"
set "PATH=%GIT_PATH%;%PATH%"

REM 3. Verify we're in the canonical repo (not sargagame-tmp)
if not exist "%MARKER%" (
    echo [ERROR] %MARKER% introuvable apres cd — pas le repo canonique
    endlocal
    exit /b 2
)

REM 4. Check STOP file before acquiring lock
if exist ".ai\autopilot\STOP" (
    echo [INFO] STOP file present — clean exit
    endlocal
    exit /b 4
)

REM 5. Display mode and run
echo [INFO] Mode: LIVE=1 CONTINUOUS=1
echo [INFO] Repo: %REPO_ROOT%
echo [INFO] CWD: %CD%

set SARGA_AUTOPILOT_LIVE=1
set SARGA_AUTOPILOT_CONTINUOUS=1
node scripts\autopilot\run.cjs --live --continuous %* >> ".ai\autopilot\runs\runner.log" 2>&1
endlocal
exit /b %ERRORLEVEL%