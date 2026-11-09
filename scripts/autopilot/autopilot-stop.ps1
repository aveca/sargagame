<#
  autopilot-stop.ps1 — arrêt PROPRE du service autopilot (Windows).

  Séquence :
    1. kill-switch : création de <repo>\.ai\autopilot\STOP (le runner s'arrête
       au prochain point de contrôle, sortie propre code 0) ;
    2. attente de la disparition du verrou (<repo>\.ai\autopilot\orchestrator.lock) ;
    3. si le runner est toujours vivant : `taskkill /PID <pid> /T /F` sur l'arbre
       COMPLET (runner → orchestrateur → agent opencode).

  Pourquoi : `Stop-ScheduledTask` tue le wscript du Planificateur mais PAS les
  descendants (constaté le 2026-11-09 : les 3 processus node continuaient de
  tourner et le verrou PID restait détenu — un redémarrage était refusé, code 3).

  Usage : powershell -ExecutionPolicy Bypass -File autopilot-stop.ps1 -RepoRoot <chemin>
#>
param(
  [string]$RepoRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
  [int]$StopTimeoutSeconds = 45
)

$ErrorActionPreference = 'Continue'
$lockFile = Join-Path $RepoRoot '.ai\autopilot\orchestrator.lock'
$stopFile = Join-Path $RepoRoot '.ai\autopilot\STOP'

Write-Host "[stop] kill-switch : $stopFile"
if (-not (Test-Path $stopFile)) {
  New-Item -ItemType File -Path $stopFile -Force | Out-Null
}

$waited = 0
while ($waited -lt $StopTimeoutSeconds) {
  Start-Sleep -Seconds 3
  $waited += 3
  if (-not (Test-Path $lockFile)) {
    Write-Host "[stop] runner arrêté proprement (verrou libéré) après ${waited}s"
    Write-Host '[stop] Pour redémarrer : Start-ScheduledTask -TaskName SargagameAutopilot'
    exit 0
  }
}

# Le runner tient encore le verrou : arrêt forcé de l'arbre complet.
$pidToKill = $null
try {
  $raw = Get-Content $lockFile -Raw -ErrorAction Stop
  $j = $raw | ConvertFrom-Json
  if ($j.pid) { $pidToKill = [int]$j.pid }
} catch { }

if ($pidToKill) {
  Write-Host "[stop] runner toujours actif après ${StopTimeoutSeconds}s — arrêt forcé de l'arbre (PID $pidToKill)"
  & taskkill /PID $pidToKill /T /F | Out-Null
  Start-Sleep -Seconds 3
} else {
  Write-Host "[stop] verrou illisible — arrêt forcé de tous les processus autopilot du dépôt"
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*$RepoRoot*autopilot*" -and $_.ProcessId -ne $PID } |
    ForEach-Object { & taskkill /PID $_.ProcessId /T /F | Out-Null }
}

Write-Host '[stop] arrêt terminé. Pour redémarrer : Start-ScheduledTask -TaskName SargagameAutopilot'
exit 0
