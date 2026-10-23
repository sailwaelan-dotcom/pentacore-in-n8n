// Noeud « Parser la tâche » — remplace queue.parse + queue.validate de Pentacore.
// Entrée : stdout de « Lire la queue » = "<chemin>\n<contenu>" (vide si queue vide).
const stdout = ($input.first().json.stdout || '').replace(/\r\n/g, '\n');
if (!stdout.trim()) return [{ json: { vide: true, valide: false, motif: 'queue vide' } }];

const saut = stdout.indexOf('\n');
const chemin = stdout.slice(0, saut).trim();
const contenu = stdout.slice(saut + 1);

const entete = (cle) => {
  const m = contenu.match(new RegExp(`^${cle}\\s*:\\s*(.+)$`, 'mi'));
  return m ? m[1].trim() : '';
};
// Une section court jusqu'au prochain ## BACK / ## UI seulement : les sous-titres
// ## Contexte, ## Etape… appartiennent à la section (queue._SECTION_RE).
const section = (nom) => {
  const re = /^##\s+(BACK|UI)\s*\n([\s\S]*?)(?=^##\s+(?:BACK|UI)\s*\n|$(?![\s\S]))/gm;
  for (const m of contenu.matchAll(re)) if (m[1] === nom) return m[2].trim();
  return '';
};

const slugEntete = entete('slug');
const slug = slugEntete || chemin.split('/').pop().replace(/\.md$/, '');
const back = section('BACK');
const demo = {};
for (const paire of entete('demo').split(',').filter(Boolean)) {
  const [cle, valeur] = paire.split('=').map((s) => s.trim());
  if (cle && valeur) demo[cle] = valeur;
}

let motif = '';
if (/^_\s*\(.*\)\s*_\s*[.,;:!]*$/s.test(back)) motif = 'section ## BACK reduite a un placeholder « _(aucun …)_ »';
else if (!back) motif = 'pas de section ## BACK (le palier 1 ne traite que la boucle backend)';
else if (!slugEntete) motif = `pas d'en-tete \`slug:\` (cloturerait sur chore(${slug}))`;
else if (!/^[a-z0-9-]+$/.test(slug)) motif = `slug \`${slug}\` hors alphabet [a-z0-9-] (devient un tag git)`;

return [{ json: { vide: false, valide: !motif, motif, chemin, slug, back, demo } }];
