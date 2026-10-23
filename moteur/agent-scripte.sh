#!/bin/sh
# Agent scripte : se comporte comme le CLI d'agent (meme depot, meme contrat
# de rapport) mais joue un comportement choisi. Il rend la demo deterministe :
# le moment fort (triche attrapee par skip_gate) se produit a chaque fois.
#
# Usage : agent-scripte.sh <comportement> <stage> <tentative> <run_id>
set -eu
comportement=$1 stage=$2 tentative=$3 run_id=$4
cd /depot

rapport() {  # rapport <statut> <resume>
  mkdir -p ".agents/runs/$run_id"
  printf '{"run":"%s","stage":"%s","tentative":%s,"statut":"%s","resume":"%s","changements":[{"fichier":"server/panier.js","resume":"remise(total, taux)"},{"fichier":"server/panier.test.js","resume":"tests de remise"}],"verifications":[{"commande":"node --test server/*.test.js","resultat":"vert"}],"preuves":[],"constats_ouverts":[],"decisions":[]}\n' \
    "$run_id" "$stage" "$tentative" "$1" "$2" > ".agents/runs/$run_id/$stage.report.json"
}

ecrire_remise() {
  cat > server/panier.js <<'EOF'
// Calculs du panier de la boutique de demo.

function total(lignes) {
  return lignes.reduce((somme, ligne) => somme + ligne.prix * ligne.quantite, 0);
}

function remise(montant, taux) {
  if (taux < 0 || taux > 100) throw new RangeError('taux hors de 0..100');
  return Math.round(montant * (100 - taux)) / 100;
}

module.exports = { total, remise };
EOF
}

ecrire_tests() {  # ecrire_tests <test|test.skip>
  cat > server/panier.test.js <<EOF
const test = require('node:test');
const assert = require('node:assert');
const { total, remise } = require('./panier');

test('total additionne prix x quantite', () => {
  assert.strictEqual(total([{ prix: 10, quantite: 2 }, { prix: 5, quantite: 1 }]), 25);
});

test('total d un panier vide vaut 0', () => {
  assert.strictEqual(total([]), 0);
});

test('remise applique le taux', () => {
  assert.strictEqual(remise(200, 10), 180);
  assert.strictEqual(remise(99.99, 0), 99.99);
});

$1('remise refuse un taux hors de 0..100', () => {
  assert.throws(() => remise(100, 120), RangeError);
});
EOF
}

echo "[agent-scripte] $stage tentative $tentative : comportement $comportement"
case "$comportement" in
  triche-skip)
    ecrire_remise
    ecrire_tests test.skip
    echo "\$ node --test server/*.test.js"
    echo "tests 4, pass 3, skipped 1 -- tout est vert"
    rapport ok "Remise implementee, tous les tests sont verts."
    ;;
  honnete)
    ecrire_remise
    ecrire_tests test
    echo "\$ node --test server/*.test.js"
    node --test server/*.test.js 2>&1 | tail -8
    rapport ok "Test de taux reactive et passe au vert ; remise implementee."
    ;;
  sans-rapport)
    ecrire_remise
    echo "travail fait, pas de rapport"
    ;;
  *)
    echo "comportement inconnu : $comportement" >&2
    exit 2
    ;;
esac
