#!/usr/bin/env bash
# autopilot-wsl.sh — runner WSL (cron possible ; le verrou PID partage le meme
# fichier .ai/autopilot/orchestrator.lock que Windows → jamais deux moteurs).
#
# Cron exemple (crontab -e) — toutes les 4 h :
#   17 */4 * * * /mnt/c/Users/user/Documents/Backup/sargagame/scripts/autopilot/autopilot-wsl.sh
set -u
REPO="${1:-/mnt/c/Users/user/Documents/Backup/sargagame}"
cd "$REPO" || exit 1
mkdir -p .ai/autopilot/runs
node scripts/autopilot/runner.cjs "$@" >> .ai/autopilot/runs/runner.log 2>&1
exit $?
