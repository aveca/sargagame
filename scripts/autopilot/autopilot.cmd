@echo off
REM autopilot.cmd — point d'entree Windows Task Scheduler (un tick d'orchestrateur).
REM Survit a la fermeture du terminal (process detache par le scheduler).
REM Le verrou PID empeche tout doublon ; STOP file = kill-switch.
cd /d "%~dp0..\.."
REM La sortie console va dans runner-console.log, PAS dans runner.log : sous
REM Windows, le `>>` de cmd.exe ouvre sa cible en mode EXCLUSIF, et tout
REM append concurrent (la trace du runner, runner.cjs) echoue alors en EBUSY.
REM runner.log reste la trace propre au runner ; runner-console.log la sortie
REM du wrapper. Aucun des deux ne peut plus disparaitre en silence.
node scripts\autopilot\runner.cjs %* >> ".ai\autopilot\runs\runner-console.log" 2>&1
exit /b %ERRORLEVEL%
