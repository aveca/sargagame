# install-tasks.ps1 — Enregistre l'usine locale Sargasses dans le Planificateur Windows.
# Tache "SargaFactory" : quotidien 05:30 + StartWhenAvailable (= rattrape si la machine
# etait eteinte a l'heure prevue : nuit, Shabbat -> tourne des le prochain boot).
# Declencheur "au logon (+3min)" ajoute EN BONUS si les droits le permettent (sinon
# ignore proprement : le quotidien + rattrapage suffit). AUCUN droit admin requis pour
# le quotidien. lockfile + MultipleInstances=IgnoreNew empechent tout double-run.
# Idempotent (Register -Force). Auto-localise le repo. Lancer :
#   powershell -ExecutionPolicy Bypass -File scripts\local-factory\install-tasks.ps1
$ErrorActionPreference = 'Stop'

$node = (Get-Command node -ErrorAction Stop).Source
$factory = Join-Path $PSScriptRoot 'factory.cjs'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not (Test-Path $factory)) { throw "factory.cjs introuvable: $factory" }

Write-Host "node   : $node"
Write-Host "factory: $factory"
Write-Host "repo   : $repoRoot"

# Nettoyage d'anciennes versions (Boot/Daily separees) si presentes.
foreach ($old in 'SargaFactory-Boot', 'SargaFactory-Daily') {
  if (Get-ScheduledTask -TaskName $old -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $old -Confirm:$false }
}

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$factory`"" -WorkingDirectory $repoRoot
$daily = New-ScheduledTaskTrigger -Daily -At '05:30'
# StartWhenAvailable = rattrapage si l'heure a ete ratee. PAS de RunOnlyIfNetworkAvailable :
# hors-ligne l'usine saute le git pull et rend quand meme.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 40) -MultipleInstances IgnoreNew `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

# 1) Tache quotidienne — garantie, sans admin.
Register-ScheduledTask -TaskName 'SargaFactory' -Action $action -Trigger $daily -Settings $settings `
  -Description 'Usine locale Sargasses (Couche C, zero LLM): rend le Brief video + publie FB. Quotidien 05:30 + rattrapage. Revenu = 100% cloud, ceci est du contenu.' `
  -RunLevel Limited -Force | Out-Null
Write-Host "OK - tache 'SargaFactory' (quotidien 05:30 + rattrapage StartWhenAvailable)" -ForegroundColor Green

# 2) BONUS best-effort : declencheur au logon (+3 min). Peut exiger des droits admin -> on ignore proprement.
try {
  $logon = New-ScheduledTaskTrigger -AtLogOn
  $logon.Delay = 'PT3M'
  Set-ScheduledTask -TaskName 'SargaFactory' -Trigger @($daily, $logon) -ErrorAction Stop | Out-Null
  Write-Host "  + declencheur au logon (+3min) ajoute" -ForegroundColor Green
} catch {
  Write-Host "  (declencheur logon non ajoute : droits admin requis. Le quotidien+rattrapage suffit ; pour l'ajouter, relance ce script en admin.)" -ForegroundColor Yellow
}

# 3) Timer de drain de la file a la demande (toutes les 30 min) — admin-free, interval-only.
$serveAction = New-ScheduledTaskAction -Execute $node -Argument "`"$factory`" --serve" -WorkingDirectory $repoRoot
$serveTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date '2020-01-01T06:00:00') -RepetitionInterval (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName 'SargaFactory-Serve' -Action $serveAction -Trigger $serveTrigger -Settings $settings `
  -Description 'Usine locale: draine la file de jobs a la demande toutes les 30 min (git pull + --serve). Zero LLM.' -RunLevel Limited -Force | Out-Null
Write-Host "OK - tache 'SargaFactory-Serve' (draine la file a la demande toutes les 30 min)" -ForegroundColor Green

Get-ScheduledTask -TaskName 'SargaFactory*' | Format-Table TaskName, State -AutoSize
Write-Host "Test immediat : node scripts\local-factory\factory.cjs   (ou Start-ScheduledTask -TaskName SargaFactory)"
Write-Host "Voir le plan  : node scripts\local-factory\factory.cjs --plan"
Write-Host "Desinstaller  : powershell -ExecutionPolicy Bypass -File scripts\local-factory\uninstall-tasks.ps1"
