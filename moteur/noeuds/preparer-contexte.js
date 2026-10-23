// Noeud « Préparer le contexte » — remplace orchestrator._contexte_cycle et
// _message_dispatch : le moteur prépare tout ce que l'agent doit savoir, l'agent
// ne reconstruit rien et n'écrit QUE son rapport, au chemin désigné.
const tache = $('Parser la tâche').first().json;
const [tag, base] = ($('Poser le tag').first().json.stdout || '').trim().split('\n');
const etat = $input.first().json;
const tentative = Number(etat.tentative || 1);
const constats = etat.constats || [];
const stage = 'backend-lead';

const horodatage = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};
const jeton = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
const run_id = etat.run_id || `${tache.slug}-${horodatage()}-${jeton()}`;

const dossier = `.agents/runs/${run_id}`;
const chemin_contexte = `${dossier}/${stage}.context.json`;
const chemin_rapport = `${dossier}/${stage}.report.json`;

const contexte = {
  run: run_id, stage, tentative, slug: tache.slug,
  tache: { fichier: tache.chemin, slug: tache.slug, bloc: '## BACK', contenu: tache.back },
  perimetre: { tag, base, plage: `${base}..HEAD` },
  constats_ouverts: constats,
  rapports_pertinents: [],
  preuves_valides: [],
  rapport: {
    chemin: chemin_rapport, format: 'json',
    champs: ['run', 'stage', 'tentative', 'statut', 'resume', 'changements',
      'verifications', 'preuves', 'constats_ouverts', 'decisions'],
  },
};
if (tentative > 1) {
  contexte.reprise = true;
  contexte.constats_a_reprendre = constats;
}

const corps = tentative > 1
  ? `REPRISE CIBLEE du cycle \`${tache.slug}\` : corrige UNIQUEMENT les constats listes dans `
    + '`constats_a_reprendre` de ton contexte — chacun porte sa preuve. Le travail deja livre est '
    + 'conserve : ne refais pas la tache, ne revois pas les choix actes.'
  : `C'est LA tache dispatchee pour ce cycle (\`${tache.slug}\`, bloc ## BACK) : ne va pas en `
    + "chercher une autre dans la queue — ton contexte contient deja le bon bloc.";
const message = [
  `Contexte prepare : ${chemin_contexte}`,
  "Lis-le d'abord : il contient ta tache exacte, ton perimetre Git resolu et le chemin EXACT de ton rapport.",
  corps,
  `RAPPORT (OBLIGATOIRE) : ecris ton rapport dans \`${chemin_rapport}\` (JSON). Recopie \`run\`, `
    + `\`stage\` et \`tentative\` (= ${tentative}) depuis ton contexte ; renseigne \`statut\` `
    + '("ok", "partiel" ou "bloque"), `resume` (1-3 phrases), puis `changements`, `verifications`, '
    + '`preuves`, `constats_ouverts`, `decisions`. Sans rapport valide, ton stage est refuse.',
].join('\n');

const b64 = (texte) => Buffer.from(texte, 'utf8').toString('base64');
return [{ json: {
  run_id, tentative, constats, stage,
  slug: tache.slug, tag,
  comportement: tache.demo?.[`${stage}#${tentative}`] || 'vrai',
  chemin_contexte,
  contexte_b64: b64(JSON.stringify(contexte, null, 2)),
  message_b64: b64(message),
} }];
