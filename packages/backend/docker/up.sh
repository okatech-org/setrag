#!/usr/bin/env bash
#
# Démarre le backend Convex local et y déploie le code du dépôt.
#
# Écrit `docker/.env.local` avec l'URL et la clé d'administration du
# déploiement local, que les tests d'intégration lisent ensuite.
#
# Prérequis : un moteur Docker en fonctionnement (Docker Desktop, Colima…).

set -euo pipefail

cd "$(dirname "$0")"
BACKEND_DIR="$(cd .. && pwd)"
ENV_FILE="$(pwd)/.env.local"
BACKEND_URL="http://127.0.0.1:3210"

if ! docker info >/dev/null 2>&1; then
  echo "✖ Aucun moteur Docker joignable." >&2
  echo "  Démarrez Docker Desktop, ou installez un moteur :" >&2
  echo "    brew install colima && colima start" >&2
  exit 1
fi

echo "▸ Démarrage du backend Convex local…"
docker compose up -d backend

echo "▸ Attente de la disponibilité du backend…"
for _ in $(seq 1 60); do
  if curl -fsS "${BACKEND_URL}/version" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! curl -fsS "${BACKEND_URL}/version" >/dev/null 2>&1; then
  echo "✖ Le backend n'a pas répondu dans le délai imparti." >&2
  docker compose logs --tail 40 backend >&2
  exit 1
fi

echo "▸ Génération de la clé d'administration…"
ADMIN_KEY="$(docker compose exec -T backend ./generate_admin_key.sh \
  | tr -d '\r' | tail -n 1 | sed 's/^.*: *//')"

if [ -z "${ADMIN_KEY}" ]; then
  echo "✖ Clé d'administration introuvable." >&2
  exit 1
fi

cat > "${ENV_FILE}" <<EOF
# Généré par docker/up.sh — ne pas versionner.
CONVEX_SELF_HOSTED_URL=${BACKEND_URL}
CONVEX_SELF_HOSTED_ADMIN_KEY=${ADMIN_KEY}
EOF
echo "▸ Configuration écrite dans docker/.env.local"

cd "${BACKEND_DIR}"

# `--env-file` est indispensable : sans lui la CLI lit le `.env.local` du
# paquet, qui pointe vers le déploiement cloud, et refuse de travailler avec
# CONVEX_SELF_HOSTED_URL en même temps.
CONVEX_ENV_FILE="docker/.env.local"

# Les variables doivent être posées AVANT le déploiement : `http.ts`
# enregistre les routes Better Auth au chargement du module et échoue si
# BETTER_AUTH_SECRET est absent.
echo "▸ Configuration des variables du backend local…"
bunx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 36)" \
  --env-file "${CONVEX_ENV_FILE}" >/dev/null
bunx convex env set SITE_URL "http://127.0.0.1:3000" \
  --env-file "${CONVEX_ENV_FILE}" >/dev/null
bunx convex env set TRUSTED_ORIGINS "http://127.0.0.1:3000" \
  --env-file "${CONVEX_ENV_FILE}" >/dev/null
# Déverrouille `convex/testing.ts`, sur ce backend uniquement.
bunx convex env set IS_TEST true --env-file "${CONVEX_ENV_FILE}" >/dev/null

echo "▸ Déploiement du code sur le backend local…"
bunx convex deploy --yes --env-file "${CONVEX_ENV_FILE}"

echo "✔ Backend local prêt sur ${BACKEND_URL}"
echo "  Tableau de bord facultatif : docker compose --profile dashboard up -d"
