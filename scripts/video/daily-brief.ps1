# Daily brief plage — tâche planifiée Windows (équivalent du cron)
# Usage : powershell -File scripts/video/daily-brief.ps1
# Planifier avec : schtasks /Create /SC DAILY /TN "Sargasses\DailyBrief" /TR "powershell -File C:\chemin\scripts\video\daily-brief.ps1" /ST 07:00

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Log = Join-Path $Root "scripts\video\out\daily-brief.log"
$Date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

"[$Date] === Brief plage quotidien ===" | Out-File -FilePath $Log -Encoding utf8

# Prérequis
$ffmpeg = Get-Command "ffmpeg" -ErrorAction SilentlyContinue
$edgeTts = python -m edge_tts --help 2>$null
$node = Get-Command "node" -ErrorAction SilentlyContinue

if (-not $ffmpeg) { "FAIL: ffmpeg introuvable" | Out-File -FilePath $Log -Encoding utf8 -Append; exit 1 }
if (-not $node) { "FAIL: node introuvable" | Out-File -FilePath $Log -Encoding utf8 -Append; exit 1 }
if (-not $?) { "FAIL: edge-tts introuvable (pip install edge-tts)" | Out-File -FilePath $Log -Encoding utf8 -Append; exit 1 }

"OK: ffmpeg, node, edge-tts" | Out-File -FilePath $Log -Encoding utf8 -Append

# Pipeline
Push-Location $Root
try {
  $result = node scripts/video/daily-brief.cjs 2>&1
  $result | Out-File -FilePath $Log -Encoding utf8 -Append
  if ($LASTEXITCODE -ne 0) { "WARN: certaines régions ont échoué" | Out-File -FilePath $Log -Encoding utf8 -Append }
} catch {
  "EXCEPTION: $_" | Out-File -FilePath $Log -Encoding utf8 -Append
} finally {
  Pop-Location
}

"Terminé" | Out-File -FilePath $Log -Encoding utf8 -Append
# Nettoyage : fichiers >30 jours
$Old = Get-ChildItem -Path (Join-Path $Root "scripts\video\out") -Filter "brief-*.mp4" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) }
foreach ($f in $Old) { Remove-Item -LiteralPath $f.FullName -Force }
