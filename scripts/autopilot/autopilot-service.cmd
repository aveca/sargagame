@echo off
REM ============================================================================
REM autopilot-service.cmd — lanceur PERSISTANT du runner Factory V3 (24/7).
REM
REM Pourquoi ce lanceur existe :
REM   `autopilot-live.cmd` est le watchdog d'un cycle : il relance le runner
REM   jusqu'a 5 fois puis ABANDONNE (« MAX_RESTARTS atteint — intervention
REM   requise »). Constat réel sur le PC du fondateur : le 2026-11-08 a 11:06,
REM   le runner a atteint 5 crashes successifs, le watchdog a abandonné, et le
REM   service n'a plus jamais redémarré (l'entrée HKCU Run ne se déclenche
REM   qu'à l'OUVERTURE de session). Le pont GitHub est donc resté muet.
REM
REM Ce lanceur est la couche EXTERNE de persistance :
REM   - il relance indéfiniment le watchdog interne (avec une pause) ;
REM   - il n'ouvre AUCUNE fenêtre (le .cmd est lancé par wscript/run-hidden.vbs,
REM     style 0 = caché) ;
REM   - il écrit dans UN journal distinct (service-console.log) : sous Windows,
REM     deux `>>` sur le même fichier se heurtent en EBUSY et la trace est
REM     silencieusement perdue ;
REM   - il purge les artefacts volumineux avant chaque demarrage (prune.cjs).
REM
REM Kill-switch : creer <repo>\.ai\autopilot\STOP  (arret propre, immédiat)
REM Arret definitif : `schtasks /end /tn SargagameAutopilot`
REM ============================================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0..\.."
set REPO=%CD%
set LOGFILE=%REPO%\.ai\autopilot\runs\service-console.log
set RESTART_DELAY=120
set LOCK_WAIT=60

REM PATH minimal : le Planificateur demarre avec un PATH reduit (git/gh
REM introuvables => spawnSync git ENOENT). On prepend Git for Windows.
for %%G in ("%ProgramFiles%\Git\cmd" "%ProgramFiles%\Git\bin" "%LocalAppData%\Programs\Git\cmd") do (
  if exist "%%~G\git.exe" set "PATH=%%~G;%PATH%"
)

if not exist "%REPO%\scripts\autopilot\run.cjs" (
  echo [%DATE% %TIME%] [service] run.cjs introuvable dans %REPO% — abandon. >> "%LOGFILE%" 2>&1
  exit /b 2
)

:LOOP
if exist "%REPO%\.ai\autopilot\STOP" (
  echo [%DATE% %TIME%] [service] STOP file present — arret propre, aucune relance. >> "%LOGFILE%" 2>&1
  exit /b 0
)

REM Purge/rotation des artefacts volumineux (jamais bloquant : prune exit 0).
node scripts\autopilot\prune.cjs --quiet >> "%LOGFILE%" 2>&1

echo [%DATE% %TIME%] [service] demarrage du runner Factory V3 ^(racine %REPO%^) >> "%LOGFILE%" 2>&1
call "scripts\autopilot\autopilot-live.cmd" >> "%LOGFILE%" 2>&1
set EXITCODE=%ERRORLEVEL%
echo [%DATE% %TIME%] [service] runner arrete (code %EXITCODE%) >> "%LOGFILE%" 2>&1

REM Codes de sortie du runner (cf. runner.cjs) :
REM   0 = arret propre (STOP file)        -> on SORT (pas de boucle infinie)
REM   2 = stop-condition / infra critique-> on SORT (erreur de configuration)
REM   3 = un AUTRE runner tient le lock   -> on ATTEND puis on RETENTE
REM        (prise de relais des qu'il meurt ; pas d'abandon definitif)
REM   1/5 = crash / watchdog MAX_RESTARTS -> on RELANCE (correctif du defaut
REM        « MAX_RESTARTS atteint — abandon » qui a tue le service le 08/11)
if %EXITCODE%==0 exit /b 0
if %EXITCODE%==2 exit /b 2

if %EXITCODE%==3 (
  echo [%DATE% %TIME%] [service] un autre runner tient le lock — attente %LOCK_WAIT%s puis reprise. >> "%LOGFILE%" 2>&1
  call :SLEEP %LOCK_WAIT%
  goto LOOP
)

echo [%DATE% %TIME%] [service] relance dans %RESTART_DELAY%s ^(cause : code %EXITCODE%^) >> "%LOGFILE%" 2>&1
call :SLEEP %RESTART_DELAY%
if exist "%REPO%\.ai\autopilot\STOP" exit /b 0
goto LOOP

REM ── Attente compatible SANS CONSOLE ───────────────────────────────────────
REM `timeout /t N` ECHOUE (« La redirection de l'entrée n'est pas prise en
REM charge ») quand le processus n'a pas de console — ce qui est EXACTEMENT le
REM cas du service (lancé par wscript/run-hidden.vbs, style 0 = caché) et d'un
REM script piloté par un pipe. Consequence reelle : la « pause » de 120 s
REM durait 0 s et le service bouclait en boucle serree.
REM `ping -n N+1 127.0.0.1` dort N secondes SANS console et SANS dependance.
:SLEEP
set /a _s=%~1 + 1
ping -n !_s! 127.0.0.1 >nul 2>&1
exit /b 0
