// Noeud « Préparer le retour » — version palier 1 de la reprise ciblée
// (orchestrator.run_reprise_ciblee) : le Lead reçoit les constats précis de la
// gate, avec leur preuve (fichier:ligne), et une tentative de plus.
const precedent = $('Préparer le contexte').first().json;
const constats = $input.first().json.constats.map(
  (c) => `skip_gate : ${c.fichier}:${c.ligne} : ${c.texte} — test desactive sans \`pentacore-skip-ok: <raison>\``);
return [{ json: { tentative: precedent.tentative + 1, run_id: precedent.run_id, constats } }];
