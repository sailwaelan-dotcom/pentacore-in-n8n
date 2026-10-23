// Noeud « skip_gate » — remplace pentacore/skip_gate.py, sans modèle.
// Entrée : stdout = `git diff <tag>` puis "__UNTRACKED__" et, pour chaque
// fichier non suivi, "__FICHIER__ <chemin>" suivi de son contenu.
// Ne regarde que les lignes AJOUTÉES ; un skip est justifié par le marqueur
// `pentacore-skip-ok:` sur la même ligne ou la ligne juste au-dessus.
const MOTIFS = [
  /\b(it|test|describe)\.skip\(/,
  /\b(it|test|describe)\.only\(/,
  /\b(xit|xtest|xdescribe)\(/,
  /@pytest\.mark\.skip\b/,
  /@pytest\.mark\.skipif\b/,
  /\bpytest\.skip\(/,
  /@unittest\.skip\b/,
];
const JUSTIFICATION = 'pentacore-skip-ok';

const sortie = ($input.first().json.stdout || '').replace(/\r\n/g, '\n');
const [diff, nonSuivis = ''] = sortie.split('__UNTRACKED__\n');

// fichier -> [{ ligne, texte }] des lignes ajoutées, numérotées dans le nouveau fichier.
const ajouts = {};
let courant = null;
let numero = 0;
for (const ligne of diff.split('\n')) {
  if (ligne.startsWith('+++ ')) {
    const p = ligne.slice(4).trim();
    courant = p.startsWith('b/') ? p.slice(2) : null;
    if (courant) ajouts[courant] = ajouts[courant] || [];
    continue;
  }
  const hunk = ligne.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (hunk) { numero = Number(hunk[1]); continue; }
  if (!courant) continue;
  if (ligne.startsWith('+')) { ajouts[courant].push({ ligne: numero, texte: ligne.slice(1) }); numero += 1; }
  else if (ligne.startsWith(' ')) numero += 1;
}
let fichier = null;
for (const ligne of nonSuivis.split('\n')) {
  const entete = ligne.match(/^__FICHIER__ (.+)$/);
  if (entete) { fichier = entete[1].trim(); ajouts[fichier] = []; continue; }
  if (fichier) ajouts[fichier].push({ ligne: ajouts[fichier].length + 1, texte: ligne });
}

const constats = [];
for (const [chemin, lignes] of Object.entries(ajouts)) {
  lignes.forEach(({ ligne, texte }, i) => {
    if (!MOTIFS.some((m) => m.test(texte))) return;
    const precedente = i > 0 && lignes[i - 1].ligne === ligne - 1 ? lignes[i - 1].texte : '';
    if (texte.includes(JUSTIFICATION) || precedente.includes(JUSTIFICATION)) return;
    constats.push({ fichier: chemin, ligne, texte: texte.trim() });
  });
}

return [{ json: {
  ok: constats.length === 0,
  constats,
  rapport: constats.length ? `${constats.length} skip(s) non justifie(s)` : 'aucun skip non justifie',
} }];
