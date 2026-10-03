@echo off
REM autopilot.cmd — point d'entree Windows Task Scheduler (un tick d'orchestrateur).
REM Survit a la fermeture du terminal (process detache par le scheduler).
REM Le verrou PID empeche tout doublon ; STOP file = kill-switch.
cd /d "%~dp0..\.."
node scripts\autopilot\runner.cjs %* >> ".ai\autopilot\runs\runner.log" 2>&1
exit /b %ERRORLEVEL%
