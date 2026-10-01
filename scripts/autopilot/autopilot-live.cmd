@echo off
REM autopilot-live.cmd — wrapper robuste Windows pour UN SEUL Autopilot LIVE 24/7.
REM
REM Chaine : Task Scheduler / boot Windows -> ce wrapper -> run.cjs --live --continuous -> runner.cjs
REM   - UN seul runner : preflight lock + runner refuse le 2e (exit 3), jamais de doublon.
REM   - Relance si le process meurt (crash exit 1) : watchdog borne (MAX_RESTARTS), delai 60 s.
REM   - AUCUNE relance sur : 0 arret propre, 2 stop-condition, 3 second runner, 4 STOP file.
REM   - STOP file (.ai\autopilot\STOP) = kill-switch, respecte a chaque demarrage.
REM   - NE PAS lancer depuis sargagame-tmp (vieux clone sans scripts\autopilot\) :
REM     ce wrapper se base sur SON propre dossier, donc toujours le repo canonique.
REM   - N'appele JAMAIS runner.cjs en direct (qui bypasserait les flags LIVE/CONTINUOUS) :
REM     seul run.cjs --live --continuous pose SARGA_AUTOPILOT_LIVE/CONTINUOUS=1.
setlocal EnableDelayedExpansion
cd /d "%~dp0..\.."
set REPO=%CD%
set LOGFILE=%REPO%\.ai\autopilot\runs\runner.log
REM Durcissement PATH minimal (Task Scheduler) — FIX spawnSync git ENOENT :
REM le scheduler lance avec un PATH reduit ou git/gh/npm sont introuvables,
REM ce qui faisait echouer repairPRConflict en "spawnSync git ENOENT (unsafe)".
REM On prepend les emplacements Git for Windows s'ils existent (jamais d'erreur sinon).
for %%G in ("%ProgramFiles%\Git\cmd" "%ProgramFiles%\Git\bin" "%LocalAppData%\Programs\Git\cmd") do (
  if exist "%%~G\git.exe" set "PATH=%%~G;%PATH%"
)
if not exist "%REPO%\scripts\autopilot\run.cjs" (
  echo [%DATE% %TIME%] [live-watchdog] run.cjs introuvable depuis %REPO% — refuse de demarrer ^(sargagame-tmp est un vieux clone sans autopilot^).
  exit /b 2
)
if exist "%REPO%\.ai\autopilot\STOP" (
  echo [%DATE% %TIME%] [live-watchdog] STOP file present — arret propre, aucune relance.
  exit /b 4
)
REM Preflight single-runner (lecture seule : ne vole JAMAIS le lock).
node -e "try{var l=require('./scripts/autopilot/lib/lock.cjs');var s=l.status();if(s.locked){console.log('[live-watchdog] runner LIVE deja actif (pid '+(s.lock&&s.lock.pid)+', heartbeat '+Math.round((s.heartbeatAgeMs||0)/1000)+'s) — second runner REFUSE, aucune relance.');process.exit(3)}else{process.exit(0)}}catch(e){console.log('[live-watchdog] preflight lock illisible ('+e.message+') — fail-closed, refuse de demarrer.');process.exit(3)}"
if %ERRORLEVEL%==3 exit /b 3

set SARGA_AUTOPILOT_LIVE=1
set SARGA_AUTOPILOT_CONTINUOUS=1
REM Diagnostic : prouve que git est resolvable (classe ENOENT fermee ou non).
where git >> "%LOGFILE%" 2>&1
set MAX_RESTARTS=5
set RESTARTS=0
REM Pruning borne des rapports/logs AVANT demarrage (non-fatal, jamais bloquant).
node scripts\autopilot\prune.cjs --quiet >> "%LOGFILE%" 2>&1

:LOOP
echo [%DATE% %TIME%] [live-watchdog] demarrage Autopilot LIVE continuous ^(tentative %RESTARTS%/%MAX_RESTARTS%^) >> "%LOGFILE%" 2>&1
node scripts\autopilot\run.cjs --live --continuous >> "%LOGFILE%" 2>&1
set EXITCODE=%ERRORLEVEL%
echo [%DATE% %TIME%] [live-watchdog] sortie code %EXITCODE% >> "%LOGFILE%" 2>&1
if %EXITCODE%==0 exit /b 0
if %EXITCODE%==2 exit /b 2
if %EXITCODE%==3 exit /b 3
if %EXITCODE%==4 exit /b 4
REM Crash (1 ou autre) : relance bornee, delai 60 s, re-preflight avant chaque relance.
set /a RESTARTS+=1
if %RESTARTS% GEQ %MAX_RESTARTS% (
  echo [%DATE% %TIME%] [live-watchdog] MAX_RESTARTS atteint — abandon, intervention requise. >> "%LOGFILE%" 2>&1
  exit /b 1
)
timeout /t 60 /nobreak >nul
if exist "%REPO%\.ai\autopilot\STOP" exit /b 4
node -e "try{var l=require('./scripts/autopilot/lib/lock.cjs');var s=l.status();if(s.locked){process.exit(3)}}catch(e){process.exit(3)}"
if %ERRORLEVEL%==3 exit /b 3
goto LOOP
