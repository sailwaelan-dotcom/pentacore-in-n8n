#!/usr/bin/env bash
# Construit et lance n8n, (re)génère les workflows, les importe et les publie.
# Idempotent : relancer réimporte les mêmes workflows (IDs fixes).
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash : ne pas convertir /workflows en chemin Windows
cd "$(dirname "$0")/.."

mkdir -p depot-demo journaux workflows
node scripts/generer-workflows.mjs
docker compose up -d --build

attendre() {
  for _ in $(seq 1 60); do
    curl -sf http://localhost:5678/healthz >/dev/null && return 0
    sleep 2
  done
  echo "n8n ne repond pas sur http://localhost:5678" >&2; exit 1
}
attendre

docker compose exec -T n8n n8n import:workflow --separate --input=/workflows
docker compose exec -T n8n n8n publish:workflow --id=PentacoreHalt001
docker compose exec -T n8n n8n publish:workflow --id=PentacoreCycle01
# Les webhooks publiés ne sont enregistrés qu'au démarrage, et /healthz répond
# avant la fin de cet enregistrement : on attend la dernière ligne du démarrage.
depuis=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker compose restart n8n
attendre
for _ in $(seq 1 60); do
  docker compose logs n8n --since "$depuis" 2>/dev/null | grep -q "Finished building workflow dependency index" && break
  sleep 2
done
echo "Pret : http://localhost:5678 — webhook POST http://localhost:5678/webhook/pentacore/drain"
