# Rollback de install-scheduled-task.ps1
$ErrorActionPreference = 'Stop'
$taskName = 'FactoryV3-Dispatcher'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Output "Tache '$taskName' desinstallee."
} else {
  Write-Output "Tache '$taskName' absente - rien a faire."
}
