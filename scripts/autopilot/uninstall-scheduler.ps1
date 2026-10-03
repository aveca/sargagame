# uninstall-scheduler.ps1 — retire la tache planifiee SargagameAutopilot.
param([string]$TaskName = "SargagameAutopilot")
$ErrorActionPreference = "SilentlyContinue"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Tache '$TaskName' retiree (les rapports .ai/autopilot/ restent en place)."
