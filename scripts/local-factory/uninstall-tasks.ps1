# uninstall-tasks.ps1 — Retire les taches de l'usine locale Sargasses. Reversible a 100%.
# Lancer : powershell -ExecutionPolicy Bypass -File scripts\local-factory\uninstall-tasks.ps1
$ErrorActionPreference = 'SilentlyContinue'
foreach ($t in 'SargaFactory', 'SargaFactory-Boot', 'SargaFactory-Daily') {
  if (Get-ScheduledTask -TaskName $t) {
    Unregister-ScheduledTask -TaskName $t -Confirm:$false
    Write-Host "retiree: $t"
  }
}
Write-Host "OK - usine locale desenregistree (les fichiers scripts/local-factory/ restent)."
