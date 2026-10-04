# install-ollama-task.ps1 — garantit le démon Ollama local pour la factory 24/7.
# Tache "SargagameOllama" : ollama-ensure.cjs sonde 11434 et lance
# `ollama serve` UNIQUEMENT si down (jamais de doublon, exit 0 stable).
# Declencheurs : premier tick +2 min + repetition horaire (= watchdog).
# StartWhenAvailable = rattrape un tick manque (reboot, nuit). IgnoreNew =
# jamais deux verifications concurrentes. AUCUN secret (Ollama = 100% local).
# AUCUN droit admin requis (dossier \SargagameLocal, declencheur temporel).
#
# Usage (PowerShell) :
#   powershell -ExecutionPolicy Bypass -File scripts\autopilot\install-ollama-task.ps1
# Desinstallation : schtasks /delete /tn \SargagameLocal\SargagameOllama /f
param(
  [string]$TaskName = "SargagameOllama"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$ensure = Join-Path $repo "scripts\autopilot\ollama-ensure.cjs"
if (-not (Test-Path $ensure)) { throw "ollama-ensure.cjs introuvable : $ensure" }
$node = (Get-Command node -ErrorAction Stop).Source

$action = New-ScheduledTaskAction -Execute $node `
  -Argument "`"$ensure`" --wait-ms 60000 --quiet" -WorkingDirectory $repo

# NOTE (vérifié 2026-10-04) : AtStartup ET AtLogOn exigent une elevation
# (Acces refuse sans admin). Seul un declencheur temporel passe sans admin :
# premier tick +2 min puis repetition horaire (= watchdog). StartWhenAvailable
# rattrape les ticks manques (reboot, nuit). Cohérent avec l'existant :
# SargagameAutopilot est de toute facon "Interactive uniquement" (session requise).
# Pour ajouter AtStartup/Logon : relancer CE script en admin (le -Force écrase).
$triggers = @()
$t2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2)
$t2.Repetition = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Hours 1) | Select-Object -ExpandProperty Repetition
$triggers += $t2

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -RestartCount 3 `
  -MultipleInstances IgnoreNew `
  -Priority 7

# -TaskPath '\SargagameLocal\' : dossier utilisateur, AUCUN droit admin requis
# (l'enregistrement a la racine exige une elevation). Verification : dossier
# visible dans Planificateur > Bibliotheque > SargagameLocal.
Register-ScheduledTask -TaskName $TaskName -TaskPath '\SargagameLocal\' -Action $action -Trigger $triggers -Settings $settings `
  -Description "Sargagame Ollama : garantit le daemon local (sonde 11434, demarrage unique si down, selection qwen3-coder:30b). Zero secret." `
  -Force | Out-Null

$got = Get-ScheduledTask -TaskName $TaskName -TaskPath '\SargagameLocal\' -ErrorAction Stop
if ($got.State -eq 'Disabled') { Enable-ScheduledTask -TaskName $TaskName -TaskPath '\SargagameLocal\' | Out-Null }
Write-Host "Tache '\SargagameLocal\$TaskName' installee et verifiee : premier tick +2 min, puis horaire."
Write-Host "Prochaine execution : $((Get-ScheduledTaskInfo -TaskName $TaskName -TaskPath '\SargagameLocal\').NextRunTime)"
Write-Host "Test immediat : node scripts\autopilot\ollama-ensure.cjs"
