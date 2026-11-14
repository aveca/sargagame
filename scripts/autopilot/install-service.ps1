# install-service.ps1 — installe le pont GitHub ↔ Factory V3 comme service PERSISTANT.
#
# Ce que garantit cette installation (mission P0 « autonomie 24/7 ») :
#   - démarrage automatique après redémarrage (déclencheur AtStartup) ET à
#     chaque ouverture de session (AtLogOn) ;
#   - AUCUNE fenêtre interactive : le service est lancé par
#     `wscript.exe` + `run-hidden.vbs` (style 0 = caché, ne vole jamais le
#     focus) ;
#   - redémarrage automatique après crash (RestartInterval 1 min, RestartCount
#     illimité) — c'est ce qui manquait : le watchdog interne abandonnait après
#     5 crashes et le service ne revenait jamais ;
#   - une seule instance (MultipleInstances = IgnoreNew + verrou PID interne) ;
#   - arrêt propre : kill-switch `<repo>\.ai\autopilot\STOP` ou
#     `schtasks /end /tn <TaskName>` ;
#   - état consultable : `Get-ScheduledTask` + `node scripts/autopilot/status.cjs`.
#
# Usage (PowerShell, sans élévation admin nécessaire) :
#   powershell -ExecutionPolicy Bypass -File scripts\autopilot\install-service.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\autopilot\install-service.ps1 -Start
#   powershell -ExecutionPolicy Bypass -File scripts\autopilot\install-service.ps1 -Uninstall
#   ... -TaskName "BotWowAutopilot" -RepoRoot "C:\Users\user\Documents\GitHub\bot-wow"
#
# LIMITATION HONNÊTE : le compte est interactif (LogonType Interactive). Sans
# session utilisateur ouverte, le service NE TOURNE PAS (contrainte Windows :
# un démarrage « avant ouverture de session » exigerait un mot de passe stocké
# ou un compte de service, donc des droits admin). Le service est donc actif
# dès que le fondateur ouvre sa session, et survit à tous les redémarrages.
param(
  [string]$TaskName = "SargagameAutopilot",
  [string]$RepoRoot = "",
  [string]$RunHidden = "C:\Users\user\local-tools\run-hidden.vbs",
  [switch]$Uninstall,
  [switch]$Start
)

$ErrorActionPreference = "Stop"

if ($Uninstall) {
  try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Tache '$TaskName' desinstallee (service arrete)."
  } catch {
    Write-Host "Desinstallation ignoree : $($_.Exception.Message)"
  }
  exit 0
}

if (-not $RepoRoot) {
  $RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
}
$RepoRoot = (Resolve-Path $RepoRoot).Path
$serviceCmd = Join-Path $RepoRoot "scripts\autopilot\autopilot-service.cmd"
if (-not (Test-Path $serviceCmd)) { throw "autopilot-service.cmd introuvable : $serviceCmd" }

$node = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path $node)) {
  $found = Get-Command node -ErrorAction SilentlyContinue
  if ($found) { $node = $found.Source } else { throw "node.exe introuvable" }
}

# ── Action : wscript + run-hidden.vbs (fenêtre cachée, aucun focus) ─────────
if (Test-Path $RunHidden) {
  $exe = "C:\Windows\System32\wscript.exe"
  $args = "//nologo `"$RunHidden`" `"$RepoRoot`" `"C:\Windows\System32\cmd.exe`" /c `"$serviceCmd`""
} else {
  # Repli sans run-hidden.vbs : PowerShell -WindowStyle Hidden.
  $exe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $args = "-NoProfile -WindowStyle Hidden -Command `"Set-Location '$RepoRoot'; & '$serviceCmd'`""
}

$action = New-ScheduledTaskAction -Execute $exe -Argument $args -WorkingDirectory $RepoRoot

# ── Déclencheurs ─────────────────────────────────────────────────────────────
# Le déclencheur « AtStartup » (démarrage du PC, avant ouverture de session)
# exige des droits ADMIN : `Register-ScheduledTask` echoue avec « Acces refuse »
# pour une session non elevee (verifie sur le PC du fondateur). On tente donc
# AtStartup + AtLogOn, et on RETOMBE explicitement sur AtLogOn seul si
# l'elevation n'est pas disponible.
#
# Consequence HONNETE et documentee : sans elevation, le service demarre des
# l'OUVERTURE de session du fondateur (et a CHAQUE ouverture de session), et
# non avant. Le redémarrage apres crash, lui, ne depend PAS de l'elevation :
# RestartInterval=1min / RestartCount=999 est applique par le Planificateur.
$triggers = @()
$atStartup = $null
try {
  $atStartup = New-ScheduledTaskTrigger -AtStartup
  $triggers += $atStartup
} catch {
  Write-Host "Declencheur AtStartup indisponible (droits admin requis) : $($_.Exception.Message)"
}
$triggers += (New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME")
if ($triggers.Count -eq 0) { throw "Aucun declencheur valide" }

# ── Paramètres : redémarrage sur crash, pas de limite de durée, 1 instance ─
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -RestartCount 999 `
  -MultipleInstances IgnoreNew `
  -Priority 7

$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Limited

$registered = $false
try {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
    -Settings $settings -Principal $principal `
    -Description "Pont GitHub [AUTOPILOT] <-> Factory V3 : import, execution, heartbeat, watchdog, PR. Kill-switch : .ai\autopilot\STOP" `
    -Force | Out-Null
  $registered = $true
} catch {
  if ($triggers.Count -gt 1) {
    Write-Host "Enregistrement avec AtStartup refuse ($($_.Exception.Message)) — repli sur AtLogOn seul."
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers[1] `
      -Settings $settings -Principal $principal `
      -Description "Pont GitHub [AUTOPILOT] <-> Factory V3 : import, execution, heartbeat, watchdog, PR. Kill-switch : .ai\autopilot\STOP" `
      -Force | Out-Null
    $registered = $true
  } else {
    throw
  }
}
if (-not $registered) { throw "Enregistrement de la tache '$TaskName' impossible" }

# ── Verification REELLE (on ne presume jamais) ─────────────────────────────
$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName
$triggerNames = ($task.Triggers | ForEach-Object { $_.CimClass.CimClassName }) -join ', '

Write-Host "Tache '$TaskName' installee et VERIFIEE."
Write-Host "  racine        : $RepoRoot"
Write-Host "  action        : $exe $args"
Write-Host "  declencheurs  : $triggerNames"
Write-Host "  relance crash : toutes les 1 min, 999 fois (ExecutionTimeLimit=0, IgnoreNew)"
Write-Host "  state         : $($task.State) · lastRun=$($info.LastRunTime) · lastResult=$($info.LastTaskResult)"
Write-Host ""
Write-Host "Verification : Get-ScheduledTask -TaskName $TaskName"
Write-Host "Statut       : node scripts\autopilot\status.cjs"
Write-Host "Diagnostic   : Get-Content '$RepoRoot\.ai\autopilot\runs\service-console.log' -Tail 40"
Write-Host "Kill-switch  : New-Item '$RepoRoot\.ai\autopilot\STOP' -ItemType File"

if ($Start) {
  Start-ScheduledTask -TaskName $TaskName
  Start-Sleep -Seconds 3
  $t = Get-ScheduledTask -TaskName $TaskName
  $i = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Host "Demarrage demande : state=$($t.State) lastRun=$($i.LastRunTime) lastResult=$($i.LastTaskResult)"
}
