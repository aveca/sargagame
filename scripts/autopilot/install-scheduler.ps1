# install-scheduler.ps1 — installe la tache planifiee "SargagameAutopilot".
# Reboot-proof : declencheurs AtStartup + repetition toutes les 4 h,
# StartWhenAvailable (rattrape un tick manque), restart on failure x3,
# priorite BelowNormal. Execution sous le compte courant, loggue ou non.
#
# Usage (PowerShell) :
#   powershell -ExecutionPolicy Bypass -File scripts\autopilot\install-scheduler.ps1
#   ... -IntervalHours 2            # plus frequent
# Desinstallation : uninstall-scheduler.ps1
param(
  [int]$IntervalHours = 4,
  [string]$TaskName = "SargagameAutopilot"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$cmd = Join-Path $repo "scripts\autopilot\autopilot.cmd"
if (-not (Test-Path $cmd)) { throw "autopilot.cmd introuvable : $cmd" }

$action = New-ScheduledTaskAction -Execute "$env:ComSpec" -Argument "/c `"$cmd`"" -WorkingDirectory $repo

$triggers = @(
  (New-ScheduledTaskTrigger -AtStartup)
)
# Repetition toutes les N heures, indefiniment, a partir de maintenant + 2 min
$t2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2)
$t2.Repetition = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Hours $IntervalHours) | Select-Object -ExpandProperty Repetition
$triggers += $t2

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -RestartInterval (New-TimeSpan -Minutes 15) `
  -RestartCount 3 `
  -MultipleInstances IgnoreNew `
  -Priority 7

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings `
  -Description "Sargagame autopilot : un cycle observe->analyse->implement->test->PR par tick (lock PID, kill-switch .ai/autopilot/STOP)" `
  -Force | Out-Null

Write-Host "Tache '$TaskName' installee : tick immediat puis toutes les $IntervalHours h + au boot."
Write-Host "Verification : Get-ScheduledTask -TaskName $TaskName"
Write-Host "Kill-switch  : New-Item '$repo\.ai\autopilot\STOP' -ItemType File"
