@echo off
REM ===================================================================
REM autopilot-stop.cmd — ARRET PROPRE du service autopilot (wrapper).
REM
REM La logique est dans autopilot-stop.ps1 (PowerShell) : parser une commande
REM PowerShell complexe directement depuis un .cmd est source d'erreurs de
REM quoting (constaté : « . était inattendu »).
REM
REM Usage : autopilot-stop.cmd [chemin_du_repo]
REM ===================================================================
setlocal
set REPO=%~1
if "%REPO%"=="" set REPO=%~dp0..\..
for %%I in ("%REPO%") do set REPO=%%~fI
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autopilot-stop.ps1" -RepoRoot "%REPO%"
exit /b %ERRORLEVEL%
