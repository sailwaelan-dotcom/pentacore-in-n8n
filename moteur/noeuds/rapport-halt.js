// Noeud « Rédiger le rapport » — remplace orchestrator._report_halt : rien n'est
// restauré, le rapport liste ce qui a été conservé et ce qui reste à trancher.
// Entrée : stdout = commits depuis le tag, "__STATUS__", puis git status.
const echec = $("Lire l'échec").first().json;
// n8n retire le saut de ligne final : un arbre propre laisse la sortie finir sur "__STATUS__".
const [log = '', status = ''] = ($input.first().json.stdout || '').replace(/\r\n/g, '\n').split(/__STATUS__\n?/);
const commits = log.split('\n').filter((l) => l.trim());
const residu = status.split('\n').filter((l) => l.trim()).map((l) => l.slice(3).trim());

const lignes = [
  `# HALT au noeud ${echec.noeud}`,
  '',
  `- Tache : \`${echec.slug}\``,
  `- Raison : ${echec.raison}`,
  `- Execution n8n : ${echec.url}`,
  '',
];
if (commits.length) {
  lignes.push('Commits conserves (aucune restauration effectuee) :', ...commits.map((c) => `  ${c}`));
} else if (echec.tag !== '-') {
  lignes.push('Aucun commit produit depuis le tag.');
}
if (residu.length) {
  lignes.push('', 'Travail non commite (a trancher avant le prochain drain, le pre-check arbre propre le refusera) :',
    ...residu.map((r) => `  ${r}`));
}
if (echec.tag !== '-') lignes.push('', `Point de restauration disponible : ${echec.tag}`);
lignes.push('', 'La tache reste dans la queue, prete pour une relance manuelle.');

return [{ json: {
  nom_fichier: `halt-${echec.slug}-${echec.stamp}.md`,
  contenu_b64: Buffer.from(lignes.join('\n') + '\n', 'utf8').toString('base64'),
} }];
