// Tests des corps de noeuds Code (moteur/noeuds/*.js). Chaque fichier est le
// corps d'une fonction n8n « Run Once for All Items » : on l'execute avec de
// faux `$input` et `$`, comme le ferait n8n.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

function executer(nom, { entree = {}, noeuds = {} } = {}) {
  const corps = readFileSync(new URL(`../moteur/noeuds/${nom}.js`, import.meta.url), 'utf8');
  const $input = { all: () => [{ json: entree }], first: () => ({ json: entree }) };
  const $ = (n) => {
    if (!(n in noeuds)) throw new Error(`noeud inconnu : ${n}`);
    return { first: () => ({ json: noeuds[n] }) };
  };
  const sortie = new Function('$input', '$', corps)($input, $);
  return sortie[0].json;
}

const TACHE = `slug: remise-fidelite
demo: backend-lead#1=triche-skip,backend-lead#2=honnete
---
# Tache

## BACK
## Contexte
Faire la remise.
`;

// ─── parser-tache ─────────────────────────────────────────────

test('test_parser_tache_lit_slug_back_et_demo', () => {
  const r = executer('parser-tache', { entree: { stdout: `.agents/queue/task_001.md\n${TACHE}` } });
  assert.strictEqual(r.vide, false);
  assert.strictEqual(r.valide, true);
  assert.strictEqual(r.chemin, '.agents/queue/task_001.md');
  assert.strictEqual(r.slug, 'remise-fidelite');
  assert.match(r.back, /Faire la remise\./);
  assert.match(r.back, /## Contexte/);
  assert.deepStrictEqual(r.demo, { 'backend-lead#1': 'triche-skip', 'backend-lead#2': 'honnete' });
});

test('test_parser_tache_refuse_sans_slug', () => {
  const r = executer('parser-tache', { entree: { stdout: `.agents/queue/task_001.md\n## BACK\nFaire.\n` } });
  assert.strictEqual(r.valide, false);
  assert.match(r.motif, /slug:/);
  assert.strictEqual(r.slug, 'task_001');
});

test('test_parser_tache_refuse_slug_hors_alphabet', () => {
  const r = executer('parser-tache', { entree: { stdout: `.agents/queue/task_001.md\nslug: Remise Été\n## BACK\nFaire.\n` } });
  assert.strictEqual(r.valide, false);
  assert.match(r.motif, /\[a-z0-9-\]/);
});

test('test_parser_tache_refuse_sans_back', () => {
  const r = executer('parser-tache', { entree: { stdout: `.agents/queue/task_001.md\nslug: x\n## UI\nFaire.\n` } });
  assert.strictEqual(r.valide, false);
  assert.match(r.motif, /## BACK/);
});

test('test_parser_tache_refuse_placeholder', () => {
  const r = executer('parser-tache', { entree: { stdout: `.agents/queue/task_001.md\nslug: x\n## BACK\n_(aucun travail backend)_\n` } });
  assert.strictEqual(r.valide, false);
  assert.match(r.motif, /placeholder/);
});

test('test_parser_tache_queue_vide', () => {
  const r = executer('parser-tache', { entree: { stdout: '' } });
  assert.strictEqual(r.vide, true);
});

// ─── arbre-propre ─────────────────────────────────────────────

test('test_arbre_propre_ignore_queue_et_runs', () => {
  const r = executer('arbre-propre', { entree: { stdout: '?? .agents/queue/task_001.md\n?? .agents/runs/x/a.json\n' } });
  assert.deepStrictEqual(r, { propre: true, residu: [] });
});

test('test_arbre_propre_signale_residu', () => {
  const r = executer('arbre-propre', { entree: { stdout: ' M server/panier.js\n?? .agents/queue/task_001.md\n' } });
  assert.deepStrictEqual(r, { propre: false, residu: ['server/panier.js'] });
});

// ─── skip-gate ────────────────────────────────────────────────

const DIFF = `diff --git a/server/panier.test.js b/server/panier.test.js
index 1..2 100644
--- a/server/panier.test.js
+++ b/server/panier.test.js
@@ -10,3 +10,8 @@ test('total', () => {
 });
-test.skip('ancien', () => {});
+
+test.skip('remise refuse un taux', () => {
+  assert.ok(true);
+});
`;

test('test_skip_gate_detecte_test_skip', () => {
  const r = executer('skip-gate', { entree: { stdout: DIFF } });
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.constats, [{ fichier: 'server/panier.test.js', ligne: 12, texte: "test.skip('remise refuse un taux', () => {" }]);
  assert.match(r.rapport, /1 skip\(s\) non justifie\(s\)/);
});

test('test_skip_gate_ignore_lignes_supprimees', () => {
  const diff = DIFF.replace("+test.skip('remise refuse un taux', () => {", "+test('remise refuse un taux', () => {");
  const r = executer('skip-gate', { entree: { stdout: diff } });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.constats, []);
});

test('test_skip_gate_accepte_skip_justifie', () => {
  const memeLigne = DIFF.replace("taux', () => {", "taux', () => { // pentacore-skip-ok: api externe");
  assert.strictEqual(executer('skip-gate', { entree: { stdout: memeLigne } }).ok, true);
  const auDessus = DIFF.replace("+\n+test.skip", "+// pentacore-skip-ok: api externe\n+test.skip");
  assert.strictEqual(executer('skip-gate', { entree: { stdout: auDessus } }).ok, true);
});

test('test_skip_gate_detecte_les_motifs_pytest', () => {
  const diff = `+++ b/tests/test_a.py\n@@ -0,0 +1,2 @@\n+@pytest.mark.skip\n+def test_a(): pass\n`;
  const r = executer('skip-gate', { entree: { stdout: diff } });
  assert.deepStrictEqual(r.constats.map((c) => c.ligne), [1]);
});

test('test_skip_gate_voit_fichier_non_suivi', () => {
  const sortie = `__UNTRACKED__\n__FICHIER__ server/nouveau.test.js\nconst x = 1;\nit.only('isole', () => {});\n`;
  const r = executer('skip-gate', { entree: { stdout: sortie } });
  assert.deepStrictEqual(r.constats, [{ fichier: 'server/nouveau.test.js', ligne: 2, texte: "it.only('isole', () => {});" }]);
});

// ─── preparer-contexte ────────────────────────────────────────

const NOEUDS_CYCLE = {
  'Parser la tâche': { slug: 'remise-fidelite', chemin: '.agents/queue/task_001.md', back: 'Faire la remise.', demo: { 'backend-lead#1': 'triche-skip', 'backend-lead#2': 'honnete' } },
  'Poser le tag': { stdout: 'auto-backup-remise-fidelite-2026-10-23-210000\nabc123\n' },
};
const decoder = (b64) => JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));

test('test_preparer_contexte_choisit_comportement_par_tentative', () => {
  const r1 = executer('preparer-contexte', { entree: { tentative: 1, constats: [] }, noeuds: NOEUDS_CYCLE });
  assert.strictEqual(r1.comportement, 'triche-skip');
  assert.match(r1.run_id, /^remise-fidelite-\d{8}-\d{6}-[0-9a-f]{4}$/);
  assert.strictEqual(r1.chemin_contexte, `.agents/runs/${r1.run_id}/backend-lead.context.json`);
  const ctx = decoder(r1.contexte_b64);
  assert.deepStrictEqual([ctx.run, ctx.stage, ctx.tentative], [r1.run_id, 'backend-lead', 1]);
  assert.deepStrictEqual(ctx.tache, { fichier: '.agents/queue/task_001.md', slug: 'remise-fidelite', bloc: '## BACK', contenu: 'Faire la remise.' });
  assert.deepStrictEqual(ctx.perimetre, { tag: 'auto-backup-remise-fidelite-2026-10-23-210000', base: 'abc123', plage: 'abc123..HEAD' });
  assert.strictEqual(ctx.rapport.chemin, `.agents/runs/${r1.run_id}/backend-lead.report.json`);
  assert.match(Buffer.from(r1.message_b64, 'base64').toString('utf8'), /C'est LA tache dispatchee/);

  const r2 = executer('preparer-contexte', { entree: { tentative: 2, constats: ['x'], run_id: r1.run_id }, noeuds: NOEUDS_CYCLE });
  assert.strictEqual(r2.comportement, 'honnete');
  assert.strictEqual(r2.run_id, r1.run_id);
});

test('test_preparer_contexte_sans_demo_lance_le_vrai_agent', () => {
  const noeuds = { ...NOEUDS_CYCLE, 'Parser la tâche': { ...NOEUDS_CYCLE['Parser la tâche'], demo: {} } };
  assert.strictEqual(executer('preparer-contexte', { entree: { tentative: 1, constats: [] }, noeuds }).comportement, 'vrai');
});

test('test_preparer_contexte_reprise_porte_les_constats', () => {
  const r = executer('preparer-contexte', { entree: { tentative: 2, constats: ['skip_gate : server/panier.test.js:12 : test.skip(...)'], run_id: 'r-1' }, noeuds: NOEUDS_CYCLE });
  const ctx = decoder(r.contexte_b64);
  assert.strictEqual(ctx.reprise, true);
  assert.deepStrictEqual(ctx.constats_a_reprendre, ['skip_gate : server/panier.test.js:12 : test.skip(...)']);
  assert.match(Buffer.from(r.message_b64, 'base64').toString('utf8'), /REPRISE CIBLEE/);
});

// ─── preparer-retour ──────────────────────────────────────────

test('test_preparer_retour_incremente_et_formule_les_constats', () => {
  const r = executer('preparer-retour', {
    entree: { ok: false, constats: [{ fichier: 'server/panier.test.js', ligne: 12, texte: 'test.skip(' }] },
    noeuds: { 'Préparer le contexte': { tentative: 1, run_id: 'r-1' } },
  });
  assert.deepStrictEqual(r, { tentative: 2, run_id: 'r-1', constats: ['skip_gate : server/panier.test.js:12 : test.skip( — test desactive sans `pentacore-skip-ok: <raison>`'] });
});

// ─── lire-echec et rapport-halt ───────────────────────────────

const ECHEC = { execution: { id: '42', url: 'http://localhost:5678/workflow/pentacore-cycle/executions/42', lastNodeExecuted: 'HALT skip_gate', error: { message: 'HALT|remise-fidelite|auto-backup-remise-fidelite-x|skip_gate rouge apres retour' } }, workflow: { name: 'Pentacore — Cycle' } };

test('test_lire_echec_parse_le_message_de_halt', () => {
  const r = executer('lire-echec', { entree: ECHEC });
  assert.deepStrictEqual(
    [r.slug, r.tag, r.raison, r.noeud, r.url],
    ['remise-fidelite', 'auto-backup-remise-fidelite-x', 'skip_gate rouge apres retour', 'HALT skip_gate', ECHEC.execution.url]);
});

test('test_lire_echec_erreur_inattendue', () => {
  const r = executer('lire-echec', { entree: { execution: { id: '7', error: { message: 'boom' }, lastNodeExecuted: 'Backend Lead' } } });
  assert.deepStrictEqual([r.slug, r.tag, r.raison], ['inconnu', '-', 'boom']);
});

test('test_rapport_halt_parse_message_et_liste_commits', () => {
  const r = executer('rapport-halt', {
    entree: { stdout: 'a1b2c3 chore(remise-fidelite): restes du backend-lead avant gates\n__STATUS__\n M server/panier.js\n' },
    noeuds: { 'Lire l\'échec': { slug: 'remise-fidelite', tag: 'auto-backup-remise-fidelite-x', raison: 'skip_gate rouge apres retour', noeud: 'HALT skip_gate', url: 'http://u', stamp: '20261023-210000' } },
  });
  assert.strictEqual(r.nom_fichier, 'halt-remise-fidelite-20261023-210000.md');
  const md = Buffer.from(r.contenu_b64, 'base64').toString('utf8');
  assert.match(md, /HALT au noeud HALT skip_gate/);
  assert.match(md, /skip_gate rouge apres retour/);
  assert.match(md, /Commits conserves \(aucune restauration effectuee\)/);
  assert.match(md, /a1b2c3 chore\(remise-fidelite\)/);
  assert.match(md, /Travail non commite/);
  assert.match(md, / {2}server\/panier\.js/);
  assert.match(md, /Point de restauration disponible : auto-backup-remise-fidelite-x/);
  assert.match(md, /http:\/\/u/);
});
