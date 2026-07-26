#!/usr/bin/env bash
#
# Arrête le backend Convex local et purge ses données.

set -euo pipefail
cd "$(dirname "$0")"

if ! docker info >/dev/null 2>&1; then
  echo "Aucun moteur Docker joignable — rien à arrêter."
  exit 0
fi

docker compose --profile dashboard down -v
rm -f .env.local
echo "✔ Backend local arrêté et données purgées."
