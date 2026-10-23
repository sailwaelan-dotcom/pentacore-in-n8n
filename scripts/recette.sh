#!/usr/bin/env bash
# Scénarios de recette du palier 1, sur le n8n local (scripts/installer.sh d'abord).
# Usage : scripts/recette.sh <triche-puis-honnete|triche-deux-fois|tache-malformee|queue-vide|tout>
set -uo pipefail
racine=$(cd "$(dirname "$0")/.." && pwd)
cd "$racine"
tmp=$(mktemp -d)
echecs=0

ecrire_tache() {  # ecrire_tache <fichier> <entete demo ou vide> [sans-slug]
  {
    [ "${3:-}" = "sans-slug" ] || echo "slug: remise-fidelite"
    [ -n "$2" ] && echo "demo: $2"
    sed -n '/^---$/,$p' modele-depot-demo/taches/remise.md
  } > "$1"
}

committer_tache() {  # le hook post-commit transmet la tâche à n8n
  (cd depot-demo && git add .agents/queue/task_001.md && git commit -q -m "tache: remise fidelite")
}

attendre_issue() {  # attendre_issue <secondes> -> imprime done | halt | rien
  for _ in $(seq 1 $(( $1 / 2 ))); do
    [ -f depot-demo/.agents/queue/done/task_001.md ] && { echo done; return; }
    ls journaux/halt-*.md >/dev/null 2>&1 && { sleep 1; echo halt; return; }
    sleep 2
  done
  echo rien
}

verifier() {  # verifier <libelle> <condition shell>
  if eval "$2"; then echo "  OK   $1"; else echo "  FAIL $1"; echecs=$((echecs + 1)); fi
}

scenario_triche_puis_honnete() {
  echo "== triche-puis-honnete"
  ecrire_tache "$tmp/t.md" "backend-lead#1=triche-skip,backend-lead#2=honnete"
  bash scripts/reset-depot.sh --tache "$tmp/t.md" >/dev/null
  committer_tache
  local issue; issue=$(attendre_issue 180)
  verifier "cycle clos (tache dans done/)" '[ "$issue" = done ]'
  verifier "commit de cloture" 'git -C depot-demo log --oneline | grep -q "chore(remise-fidelite): cycle queue termine"'
  verifier "deux passes du Lead" '[ "$(git -C depot-demo log --oneline | grep -c "restes du backend-lead")" = 2 ]'
  verifier "rapport final a la tentative 2" 'grep -q "\"tentative\":2" depot-demo/.agents/runs/*/backend-lead.report.json'
  verifier "plus aucun test.skip" '! grep -q "test.skip" depot-demo/server/panier.test.js'
  verifier "un seul drain (un seul tag)" '[ "$(git -C depot-demo tag | wc -l)" = 1 ]'
}

scenario_triche_deux_fois() {
  echo "== triche-deux-fois"
  ecrire_tache "$tmp/t.md" "backend-lead#1=triche-skip,backend-lead#2=triche-skip"
  bash scripts/reset-depot.sh --tache "$tmp/t.md" >/dev/null
  committer_tache
  local issue; issue=$(attendre_issue 180)
  verifier "HALT" '[ "$issue" = halt ]'
  verifier "rapport : raison skip_gate et preuve" 'grep -q "skip_gate rouge apres retour : server/panier.test.js:18" journaux/halt-*.md'
  verifier "rapport : commits conserves" 'grep -q "Commits conserves" journaux/halt-*.md'
  verifier "rapport : point de restauration" 'grep -q "Point de restauration disponible : auto-backup-remise-fidelite-" journaux/halt-*.md'
  verifier "tache toujours dans la queue" '[ -f depot-demo/.agents/queue/task_001.md ]'
}

scenario_tache_malformee() {
  echo "== tache-malformee"
  ecrire_tache "$tmp/t.md" "" sans-slug
  bash scripts/reset-depot.sh --tache "$tmp/t.md" >/dev/null
  committer_tache
  local issue; issue=$(attendre_issue 60)
  verifier "HALT" '[ "$issue" = halt ]'
  verifier "rapport : pre-flight et motif slug" 'grep -q "pre-flight : pas d.en-tete .slug:" journaux/halt-*.md'
  verifier "aucun tag pose" '[ -z "$(git -C depot-demo tag)" ]'
}

scenario_queue_vide() {
  echo "== queue-vide"
  bash scripts/reset-depot.sh >/dev/null
  curl -s -X POST http://localhost:5678/webhook/pentacore/drain >/dev/null
  local issue; issue=$(attendre_issue 20)
  verifier "ni HALT ni cloture" '[ "$issue" = rien ]'
  verifier "aucun tag pose" '[ -z "$(git -C depot-demo tag)" ]'
}

case "${1:-tout}" in
  triche-puis-honnete) scenario_triche_puis_honnete ;;
  triche-deux-fois) scenario_triche_deux_fois ;;
  tache-malformee) scenario_tache_malformee ;;
  queue-vide) scenario_queue_vide ;;
  tout) scenario_triche_puis_honnete; scenario_triche_deux_fois; scenario_tache_malformee; scenario_queue_vide ;;
  *) echo "scenario inconnu : $1" >&2; exit 2 ;;
esac
rm -rf "$tmp"
echo "== $echecs echec(s)"
exit $(( echecs > 0 ))
