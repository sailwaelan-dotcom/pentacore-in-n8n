// Génère workflows/*.json (format d'export n8n) à partir de cette description
// lisible et des corps de noeuds Code de moteur/noeuds/. Source de vérité :
// ce fichier ; les JSON sont régénérés, puis importés par scripts/installer.sh.
//
// Usage : node scripts/generer-workflows.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const racine = new URL('..', import.meta.url);
const corps = (nom) => readFileSync(new URL(`moteur/noeuds/${nom}.js`, racine), 'utf8');
// Identifiants stables : un ré-import écrase le même workflow au lieu d'en créer un autre.
const uuid = (graine) => {
  const h = createHash('sha1').update(graine).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const ID_CYCLE = 'PentacoreCycle01';
const ID_HALT = 'PentacoreHalt001';
const CTX = "$('Préparer le contexte').first().json";
const TACHE = "$('Parser la tâche').first().json";

// ─── Fabriques de noeuds ──────────────────────────────────────

function noeud(nom, type, typeVersion, position, parameters, note) {
  return { id: uuid(nom), name: nom, type, typeVersion, position, parameters, notes: note, notesInFlow: true };
}
const commande = (nom, pos, cmd, note) =>
  noeud(nom, 'n8n-nodes-base.executeCommand', 1, pos, { command: `=${cmd}` }, note);
const code = (nom, pos, fichier, note) =>
  noeud(nom, 'n8n-nodes-base.code', 2, pos, { jsCode: corps(fichier) }, note);
const si = (nom, pos, expression, note) =>
  noeud(nom, 'n8n-nodes-base.if', 2.2, pos, {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{
        id: uuid(`${nom}-condition`),
        leftValue: `={{ ${expression} }}`,
        rightValue: '',
        operator: { type: 'boolean', operation: 'true', singleValue: true },
      }],
      combinator: 'and',
    },
    options: {},
  }, note);
const halt = (nom, pos, raison, note) =>
  noeud(nom, 'n8n-nodes-base.stopAndError', 1, pos, { errorMessage: `=HALT|${raison}` }, note);
const fin = (nom, pos, note) => noeud(nom, 'n8n-nodes-base.noOp', 1, pos, {}, note);

function liens(paires) {
  // paires : [source, cible, sortie?] — sortie 0 = vrai / principale, 1 = faux.
  const connexions = {};
  for (const [source, cible, sortie = 0] of paires) {
    const main = (connexions[source] ??= { main: [] }).main;
    while (main.length <= sortie) main.push([]);
    main[sortie].push({ node: cible, type: 'main', index: 0 });
  }
  return connexions;
}

// ─── Pentacore — Cycle ────────────────────────────────────────

const x = (col) => col * 240;
const cycle = [
  noeud('Tâche transmise (webhook)', 'n8n-nodes-base.webhook', 2, [x(0), 0], {
    httpMethod: 'POST', path: 'pentacore/drain', responseMode: 'onReceived', options: {},
  }, 'Déclencheur : un commit de tâche (hook post-commit) ou tout appel HTTP lance le drain. Remplace `python -m pentacore --drain`.'),
  noeud('Lancement manuel', 'n8n-nodes-base.manualTrigger', 1, [x(0), 200], {},
    'Déclencheur pour essayer depuis l\'éditeur. Même chemin que le webhook.'),
  commande('Lire la queue', [x(1), 100],
    'cd /depot && f=$(ls .agents/queue/task_*.md 2>/dev/null | head -n1); if [ -n "$f" ]; then printf \'%s\\n\' "$f"; cat "$f"; fi',
    'Prend la première tâche de .agents/queue/ (photo de la queue). Remplace queue.scan.'),
  code('Parser la tâche', [x(2), 100], 'parser-tache',
    'Lit slug, bloc ## BACK et en-tête demo:, et valide la tâche. Remplace queue.parse + queue.validate.'),
  si('Queue vide ?', [x(3), 100], '$json.vide',
    'Rien à faire si la queue est vide : fin propre, sans HALT.'),
  fin('Rien à faire', [x(4), -60], 'Queue vide : le drain se termine (état done).'),
  si('Tâche valide ?', [x(4), 140], '$json.valide',
    'Pre-flight du drain : une tâche malformée bloque avant de lancer un agent.'),
  halt('HALT pre-flight', [x(5), 300], `{{ $json.slug }}|-|pre-flight : {{ $json.motif }}`,
    'Gate déterministe refusée → l\'exécution échoue et le workflow HALT rédige le rapport. Remplace l\'état « refused ».'),
  commande('Lire l\'arbre', [x(5), 100], 'cd /depot && git status --porcelain --untracked-files=all',
    'État du working tree avant le cycle.'),
  code('Arbre propre ?', [x(6), 100], 'arbre-propre',
    'Ignore .agents/queue/ et .agents/runs/, liste le reste. Remplace git_safety.has_changes.'),
  si('Arbre propre', [x(7), 100], '$json.propre',
    'Pre-check : on ne démarre jamais sur un arbre sale (sûreté du tag de restauration).'),
  halt('HALT arbre sale', [x(8), 300], `{{ ${TACHE}.slug }}|-|working tree non propre : {{ $json.residu.join(', ') }}`,
    'Cycle annulé : du travail non commité traîne. Rien n\'est touché.'),
  commande('Poser le tag', [x(8), 100],
    `cd /depot && t=auto-backup-{{ ${TACHE}.slug }}-$(date +%Y-%m-%d-%H%M%S) && git tag -a "$t" -m "Pentacore run {{ ${TACHE}.slug }}" && echo "$t" && git rev-parse "$t^{commit}"`,
    'Tag de restauration auto-backup-<slug>-<horodatage> + base résolue. Remplace git_safety.place_restore_tag.'),
  noeud('Première tentative', 'n8n-nodes-base.set', 3.4, [x(9), 100], {
    assignments: { assignments: [
      { id: uuid('tentative'), name: 'tentative', value: 1, type: 'number' },
      { id: uuid('constats'), name: 'constats', value: '={{ [] }}', type: 'array' },
    ] },
    options: {},
  }, 'Tentative 1, aucun constat. La boucle de retour repart d\'ici avec tentative 2.'),
  code('Préparer le contexte', [x(10), 100], 'preparer-contexte',
    'Contexte préparé JSON + message de lancement : tâche exacte, plage Git résolue, chemin du rapport. Remplace orchestrator._contexte_cycle.'),
  commande('Écrire le contexte', [x(11), 100],
    `cd /depot && mkdir -p .agents/runs/{{ $json.run_id }} && echo '{{ $json.contexte_b64 }}' | base64 -d > {{ $json.chemin_contexte }} && echo '{{ $json.message_b64 }}' | base64 -d > {{ $json.chemin_contexte }}.message.txt && echo ok`,
    'Dépose le contexte dans .agents/runs/<run_id>/ : l\'agent le lit, il ne reconstruit rien.'),
  commande('Backend Lead', [x(12), 100],
    `sh /moteur/lancer-agent.sh {{ ${CTX}.stage }} {{ ${CTX}.tentative }} {{ ${CTX}.run_id }} {{ ${CTX}.comportement }} {{ ${CTX}.chemin_contexte }}`,
    'Agent de code (Kilo, ou agent scripté en mode démo), borné par timeout. Remplace stage_runner.run_stage.'),
  si('Agent sorti en 0 ?', [x(13), 100], '/__exit=0\\s*$/.test($json.stdout)',
    'Lit le code de sortie imprimé par le lanceur. La chaîne d\'escalade (repli, Doctor) arrive au palier 4.'),
  halt('HALT agent en échec', [x(14), 300], `{{ ${CTX}.slug }}|{{ ${CTX}.tag }}|backend-lead en echec (tentative {{ ${CTX}.tentative }})`,
    'Palier 1 : un agent en échec fait HALT directement.'),
  commande('Commit des restes du Lead', [x(14), 100],
    `cd /depot && git add -A && (git commit -q -m "chore({{ ${CTX}.slug }}): restes du backend-lead avant gates" && echo commit || echo rien)`,
    'Commite ce que le Lead a laissé, pour que la gate et l\'humain voient le livrable. Remplace commit_all « restes du Lead ».'),
  commande('Diff depuis le tag', [x(15), 100],
    `cd /depot && git diff {{ ${CTX}.tag }} -- . ':(exclude).agents'; echo __UNTRACKED__; git ls-files --others --exclude-standard -- . ':(exclude).agents' | while read f; do echo "__FICHIER__ $f"; cat "$f"; done`,
    'Tout ce que le cycle a ajouté depuis le tag (suivi + non suivi). Les gates jugent le diff, pas la parole de l\'agent.'),
  code('skip_gate', [x(16), 100], 'skip-gate',
    'Gate déterministe sans modèle : test désactivé (skip/only) sans `pentacore-skip-ok:` → constat avec fichier:ligne. Remplace skip_gate.py.'),
  si('Gate verte ?', [x(17), 100], '$json.ok',
    'Verdict de la gate : vert → clôture du cycle ; rouge → retour au Lead si le budget le permet.'),
  commande('Clore le cycle', [x(18), -60],
    `cd /depot && mkdir -p .agents/queue/done && git mv {{ ${TACHE}.chemin }} .agents/queue/done/ && git add -A && git commit -q -m "chore({{ ${TACHE}.slug }}): cycle queue termine" && git log --oneline -1`,
    'Tâche déplacée dans done/ + commit de clôture chore(<slug>): cycle queue termine (borne des revues futures).'),
  fin('Cycle terminé', [x(19), -60], 'Cycle vert. Paliers suivants : Reviewer, 4 gates, Global Reviewer, coutures.'),
  si('Retour disponible ?', [x(18), 260], `${CTX}.tentative < 2`,
    'Budget de retour : 1 seul renvoi au Lead (reprises.max_par_cycle = 1 dans Pentacore). Garantit la terminaison.'),
  code('Préparer le retour', [x(19), 160], 'preparer-retour',
    'Constats avec leur preuve (fichier:ligne) pour le Lead, tentative + 1. Version palier 1 de la reprise ciblée.'),
  halt('HALT skip_gate', [x(19), 420],
    `{{ ${CTX}.slug }}|{{ ${CTX}.tag }}|skip_gate rouge apres retour : {{ $('skip_gate').first().json.constats.map(c => c.fichier + ':' + c.ligne).join(', ') }}`,
    'Budget épuisé et preuve toujours rouge : HALT. Rien n\'est défait, le rapport liste tout pour l\'humain.'),
];

const cycleJson = {
  id: ID_CYCLE,
  name: 'Pentacore — Cycle (palier 1)',
  nodes: cycle,
  connections: liens([
    ['Tâche transmise (webhook)', 'Lire la queue'],
    ['Lancement manuel', 'Lire la queue'],
    ['Lire la queue', 'Parser la tâche'],
    ['Parser la tâche', 'Queue vide ?'],
    ['Queue vide ?', 'Rien à faire', 0],
    ['Queue vide ?', 'Tâche valide ?', 1],
    ['Tâche valide ?', 'Lire l\'arbre', 0],
    ['Tâche valide ?', 'HALT pre-flight', 1],
    ['Lire l\'arbre', 'Arbre propre ?'],
    ['Arbre propre ?', 'Arbre propre'],
    ['Arbre propre', 'Poser le tag', 0],
    ['Arbre propre', 'HALT arbre sale', 1],
    ['Poser le tag', 'Première tentative'],
    ['Première tentative', 'Préparer le contexte'],
    ['Préparer le contexte', 'Écrire le contexte'],
    ['Écrire le contexte', 'Backend Lead'],
    ['Backend Lead', 'Agent sorti en 0 ?'],
    ['Agent sorti en 0 ?', 'Commit des restes du Lead', 0],
    ['Agent sorti en 0 ?', 'HALT agent en échec', 1],
    ['Commit des restes du Lead', 'Diff depuis le tag'],
    ['Diff depuis le tag', 'skip_gate'],
    ['skip_gate', 'Gate verte ?'],
    ['Gate verte ?', 'Clore le cycle', 0],
    ['Gate verte ?', 'Retour disponible ?', 1],
    ['Clore le cycle', 'Cycle terminé'],
    ['Retour disponible ?', 'Préparer le retour', 0],
    ['Retour disponible ?', 'HALT skip_gate', 1],
    ['Préparer le retour', 'Préparer le contexte'],
  ]),
  settings: { executionOrder: 'v1', errorWorkflow: ID_HALT, saveManualExecutions: true },
  active: false,
  pinData: {},
};
// Le webhook exige un webhookId stable.
cycle[0].webhookId = uuid('webhook-drain');

// ─── Pentacore — HALT (Error Workflow) ────────────────────────

const haltNoeuds = [
  noeud('Échec reçu', 'n8n-nodes-base.errorTrigger', 1, [0, 0], {},
    'Error Workflow : reçoit toute exécution du Cycle qui échoue (Stop and Error ou noeud planté).'),
  code('Lire l\'échec', [240, 0], 'lire-echec',
    'Extrait slug, tag et raison du message HALT|<slug>|<tag>|<raison>.'),
  commande('État Git depuis le tag', [480, 0],
    `cd /depot && if [ '{{ $json.tag }}' != '-' ]; then git log --oneline {{ $json.tag }}..HEAD; fi; echo __STATUS__; git status --porcelain --untracked-files=all`,
    'Commits conservés et travail non commité : rien n\'est restauré automatiquement.'),
  code('Rédiger le rapport', [720, 0], 'rapport-halt',
    'Rapport de HALT. Remplace orchestrator._report_halt.'),
  commande('Écrire le rapport', [960, 0],
    `mkdir -p /journaux && echo '{{ $json.contenu_b64 }}' | base64 -d > /journaux/{{ $json.nom_fichier }} && echo /journaux/{{ $json.nom_fichier }}`,
    'Dépose le rapport dans journaux/, hors du dépôt cible (comme les logs de Pentacore).'),
];
const haltJson = {
  id: ID_HALT,
  name: 'Pentacore — HALT',
  nodes: haltNoeuds,
  connections: liens([
    ['Échec reçu', 'Lire l\'échec'],
    ['Lire l\'échec', 'État Git depuis le tag'],
    ['État Git depuis le tag', 'Rédiger le rapport'],
    ['Rédiger le rapport', 'Écrire le rapport'],
  ]),
  settings: { executionOrder: 'v1' },
  active: false,
  pinData: {},
};

mkdirSync(new URL('workflows/', racine), { recursive: true });
for (const [fichier, wf] of [['pentacore-cycle.json', cycleJson], ['pentacore-halt.json', haltJson]]) {
  const noms = new Set(wf.nodes.map((n) => n.name));
  for (const [source, { main }] of Object.entries(wf.connections)) {
    if (!noms.has(source)) throw new Error(`${fichier} : lien depuis un noeud inconnu ${source}`);
    for (const cible of main.flat()) if (!noms.has(cible.node)) throw new Error(`${fichier} : lien vers un noeud inconnu ${cible.node}`);
  }
  for (const n of wf.nodes) if (!n.notes) throw new Error(`${fichier} : noeud sans note ${n.name}`);
  writeFileSync(new URL(`workflows/${fichier}`, racine), JSON.stringify(wf, null, 2) + '\n');
  console.log(`workflows/${fichier} : ${wf.nodes.length} noeuds`);
}
