#!/usr/bin/env bash
# Runs on the build host via fxrun (see render.py). Kept as a file so the command line stays short.
# Shared box: refuse to add load when it is already busy.
load=$(cut -d' ' -f1 /proc/loadavg); cores=$(nproc)
echo "host $(hostname) load $load cores $cores"
awk -v l="$load" -v c="$cores" 'BEGIN{exit !(l < c * 0.6)}' || { echo "SKIPPED: host busy"; exit 75; }
cd "$(dirname "$0")/.." && rm -rf png && python3 src/render.py
