#!/usr/bin/env bash
# Recree depot-demo/ a l'identique depuis modele-depot-demo/ (journaux/ est conserve).
# Usage : scripts/reset-depot.sh [--tache <fichier.md>]
#   --tache : depose la tache en .agents/queue/task_001.md, NON committee
#             (committer la declenche via le hook post-commit).
set -euo pipefail
racine=$(cd "$(dirname "$0")/.." && pwd)
depot="$racine/depot-demo"
tache=""
if [ "${1:-}" = "--tache" ]; then
  tache=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
fi

# On vide le contenu sans supprimer les dossiers : ils sont montes dans Docker.
mkdir -p "$depot" "$racine/journaux"
find "$depot" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

cp -r "$racine/modele-depot-demo/." "$depot/"
rm -rf "$depot/taches" "$depot/hooks"
mkdir -p "$depot/.agents/queue"

cd "$depot"
git init -q -b main
git config core.autocrlf false
cp "$racine/modele-depot-demo/hooks/post-commit" .git/hooks/post-commit
chmod +x .git/hooks/post-commit
git add -A
PENTACORE_MOTEUR=1 git commit -q -m "chore: depot de demo initial"

if [ -n "$tache" ]; then
  cp "$tache" .agents/queue/task_001.md
  echo "Tache prete : depot-demo/.agents/queue/task_001.md (non committee)"
fi
echo "depot-demo/ reinitialise."
