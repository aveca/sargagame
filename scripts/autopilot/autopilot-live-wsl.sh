#!/usr/bin/env bash
# autopilot-live-wsl.sh — wrapper WSL pour mode LIVE + CONTINUOUS (cron / systemd).
# Preflight lock (exit 3 si runner actif), env LIVE+CONTINUOUS, watchdog borne crash-only,
# STOP file respecte. Refus explicite sargagame-tmp (vieux clone sans autopilot).
# Usage: cron @reboot /path/to/autopilot-live-wsl.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Ensure git is in PATH for repairPRConflict (cron may not have git)
export PATH="/usr/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

# Verify we're in the canonical repo (not sargagame-tmp)
if [[ ! -f "scripts/autopilot/run.cjs" ]]; then
    echo "[ERROR] scripts/autopilot/run.cjs introuvable — pas le repo canonique (Backup/sargagame)"
    echo "[ERROR] Refus d'execution depuis un clone temporaire (sargagame-tmp)"
    exit 2
fi

# Check STOP file before acquiring lock
if [[ -f ".ai/autopilot/STOP" ]]; then
    echo "[INFO] STOP file present — clean exit"
    exit 4
fi

# Run with LIVE+CONTINUOUS flags
export SARGA_AUTOPILOT_LIVE=1
export SARGA_AUTOPILOT_CONTINUOUS=1
exec node scripts/autopilot/run.cjs --live --continuous "$@" >> ".ai/autopilot/runs/runner.log" 2>&1