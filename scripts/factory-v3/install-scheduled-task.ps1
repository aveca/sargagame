# Installe Factory V3 en tache planifiee Windows (autonomie 24/7 sans session interactive).
# Le lock single-runner du runner empeche tout doublon ; si le runner meurt, le
# declencheur de repetition (5 min) le relance. Rollback : uninstall-scheduled-task.ps1
# Run : powershell -NoProfile -ExecutionPolicy Bypass -File scripts\factory-v3\install-scheduled-task.ps1

$ErrorActionPreference = 'Stop'
$repoDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) # scripts/factory-v3 -> repo root
$taskName = 'FactoryV3-Dispatcher'

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node.exe introuvable dans le PATH' }

$actionCmd = "Set-Location '$repoDir'; & '$node' scripts\factory-v3\run.cjs --continuous"

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -Command $actionCmd"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 5) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Description 'FACTORY V3 dispatcher autonome (sargagame + botwow) - zero simulation, preuves obligatoires' -Force | Out-Null

Write-Output "Tache '$taskName' installee (repetition 5 min, instance unique)."
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
