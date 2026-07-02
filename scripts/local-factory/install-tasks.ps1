# install-tasks.ps1 — Enregistre l'usine locale Sargasses dans le Planificateur de taches Windows.
# 2 taches, 1 seul script (factory.cjs) :
#   SargaFactory-Boot   : au demarrage de la machine (+3 min, le temps que le reseau monte)
#   SargaFactory-Daily  : chaque jour 05:30, StartWhenAvailable = rattrape si l'heure a ete ratee
# Idempotent (Register -Force reecrit). Auto-localise le repo depuis ce script.
# Lancer :  powershell -ExecutionPolicy Bypass -File scripts\local-factory\install-tasks.ps1
$ErrorActionPreference = 'Stop'

$node = (Get-Command node -ErrorAction Stop).Source
$factory = Join-Path $PSScriptRoot 'factory.cjs'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not (Test-Path $factory)) { throw "factory.cjs introuvable: $factory" }

Write-Host "node   : $node"
Write-Host "factory: $factory"
Write-Host "repo   : $repoRoot"

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$factory`"" -WorkingDirectory $repoRoot

# Trigger boot + delai 3 min
$boot = New-ScheduledTaskTrigger -AtStartup
$boot.Delay = 'PT3M'
# Trigger quotidien 05:30 (StartWhenAvailable via settings)
$daily = New-ScheduledTaskTrigger -Daily -At '05:30'

# StartWhenAvailable = rattrapage si la machine etait eteinte a l'heure prevue.
# PAS de RunOnlyIfNetworkAvailable : hors-ligne, l'usine saute juste le git pull et rend quand meme.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 40) `
  -MultipleInstances IgnoreNew `
  -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName 'SargaFactory-Boot' -Action $action -Trigger $boot -Settings $settings `
  -Description 'Usine locale Sargasses (Couche C) : rend le Brief video + publie FB au demarrage. Zero LLM.' -RunLevel Limited -Force | Out-Null
Register-ScheduledTask -TaskName 'SargaFactory-Daily' -Action $action -Trigger $daily -Settings $settings `
  -Description 'Usine locale Sargasses (Couche C) : run quotidien 05:30, rattrapage si machine eteinte. Zero LLM.' -RunLevel Limited -Force | Out-Null

Write-Host ""
Write-Host "OK - 2 taches enregistrees :" -ForegroundColor Green
Get-ScheduledTask -TaskName 'SargaFactory-*' | Format-Table TaskName, State -AutoSize
Write-Host "Test immediat : Start-ScheduledTask -TaskName SargaFactory-Daily"
Write-Host "Desinstaller  : powershell -ExecutionPolicy Bypass -File scripts\local-factory\uninstall-tasks.ps1"
