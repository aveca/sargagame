#!/usr/bin/env bash
# autopilot-live-wsl.sh — wrapper robuste WSL pour UN SEUL Autopilot LIVE 24/7.
#
# Chaine : boot/cron WSL -> ce wrapper -> run.cjs --live --continuous -> runner.cjs
#   - UN seul runner : preflight lock + runner refuse le 2e (exit 3), jamais de doublon.
#   - Relance si le process meurt (crash exit 1) : watchdog borne (MAX_RESTARTS=5), delai 60 s.
#   - AUCUNE relance sur : 0 arret propre, 2 stop-condition, 3 second runner, 4 STOP file.
#   - STOP file (.ai/autopilot/STOP) = kill-switch.
#   - Repo canonique : /mnt/c/Users/user/Documents/Backup/sargagame.
#     /mnt/c/Users/user/sargagame-tmp est un VIEUX clone SANS scripts/autopilot/
#     -> refuse explicitement (exit 2), jamais de runner depuis ce dossier.
#   - N'appelle JAMAIS runner.cjs en direct (bypass des flags LIVE/CONTINUOUS) :
#     seul run.cjs --live --continuous pose SARGA_AUTOPILOT_LIVE/CONTINUOUS=1.
set -u
CANONICAL="/mnt/c/Users/user/Documents/Backup/sargagame"
REPO="${1:-$CANONICAL}"
case "$REPO" in
  *sargagame-tmp*|*sargagame_tmp*)
    echo "[live-watchdog] REFUSE : $REPO est un vieux clone sans scripts/autopilot/ — utilisez $CANONICAL (exit 2)." >&2
    exit 2
    ;;
esac
cd "$REPO" || { echo "[live-watchdog] dossier introuvable : $REPO (exit 2)." >&2; exit 2; }
if [ ! -f "scripts/autopilot/run.cjs" ]; then
  echo "[live-watchdog] run.cjs introuvable depuis $REPO — refuse de demarrer (exit 2)." >&2
  exit 2
fi
mkdir -p .ai/autopilot/runs
LOGFILE=".ai/autopilot/runs/runner.log"
# Durcissement PATH minimal (cron/Task Scheduler) — FIX spawnSync git ENOENT :
# prepend des emplacements Git standards si presents (cron a un PATH reduit).
for _g in "/usr/local/bin" "/usr/bin" "/bin" "/opt/git/bin"; do
  case ":$PATH:" in *":$_g:"*) ;; *) [ -x "$_g/git" ] && PATH="$_g:$PATH" ;; esac
done
export PATH
if [ -f ".ai/autopilot/STOP" ]; then
  echo "[live-watchdog] STOP file present — arret propre, aucune relance." | tee -a "$LOGFILE"
  exit 4
fi
# Preflight single-runner (lecture seule : ne vole JAMAIS le lock).
if ! node -e "try{var l=require('./scripts/autopilot/lib/lock.cjs');var s=l.status();if(s.locked){console.log('[live-watchdog] runner LIVE deja actif (pid '+(s.lock&&s.lock.pid)+') — second runner REFUSE.');process.exit(3)}process.exit(0)}catch(e){console.log('[live-watchdog] preflight lock illisible ('+e.message+') — fail-closed.');process.exit(3)}"; then
  exit 3
fi
export SARGA_AUTOPILOT_LIVE=1
export SARGA_AUTOPILOT_CONTINUOUS=1
# Diagnostic : prouve que git est resolvable (classe ENOENT fermee ou non).
command -v git >> "$LOGFILE" 2>&1
# Pruning borne des rapports/logs AVANT demarrage (non-fatal, jamais bloquant).
node scripts/autopilot/prune.cjs --quiet >> "$LOGFILE" 2>&1 || true
MAX_RESTARTS=5
RESTARTS=0
while true; do
  echo "[live-watchdog] demarrage Autopilot LIVE continuous (tentative ${RESTARTS}/${MAX_RESTARTS})" | tee -a "$LOGFILE"
  node scripts/autopilot/run.cjs --live --continuous >> "$LOGFILE" 2>&1
  CODE=$?
  echo "[live-watchdog] sortie code ${CODE}" | tee -a "$LOGFILE"
  case "$CODE" in
    0|2|3|4) exit "$CODE" ;;
  esac
  RESTARTS=$((RESTARTS + 1))
  if [ "$RESTARTS" -ge "$MAX_RESTARTS" ]; then
    echo "[live-watchdog] MAX_RESTARTS atteint — abandon, intervention requise." | tee -a "$LOGFILE"
    exit 1
  fi
  sleep 60
  if [ -f ".ai/autopilot/STOP" ]; then exit 4; fi
  if ! node -e "try{var l=require('./scripts/autopilot/lib/lock.cjs');var s=l.status();if(s.locked){process.exit(3)}process.exit(0)}catch(e){process.exit(3)}"; then
    exit 3
  fi
done
