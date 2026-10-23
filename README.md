# Pentacore dans n8n

**Un orchestrateur d'agents de code qui ne croit pas les agents sur parole,
reconstruit dans n8n.**

[Pentacore](docs/01-carte-pentacore.md) est un orchestrateur Python que j'ai
conçu et que j'utilise : il enchaîne des agents IA de développement (Lead,
Reviewer, Global Reviewer, Seam Reviewer, Doctor) sur un vrai dépôt Git, et
**contrôle mécaniquement** ce qu'ils livrent. Gates déterministes, rapports
validés, boucles toutes bornées, et HALT conservateur qui ne défait rien.

Ce dépôt traduit Pentacore en workflows n8n, palier par palier.

## Ce que montre la démo

1. Une tâche est committée dans un dépôt. Un hook Git appelle un webhook n8n,
   et tout tourne ensuite sans intervention.
2. Le **Backend Lead** (un agent de code en CLI) implémente la tâche et
   annonce : « Remise implémentée, tous les tests sont verts. »
3. La **gate `skip_gate`**, sans modèle, lit le diff et découvre qu'il a
   désactivé un test (`test.skip`) pour obtenir ce vert.
4. n8n **renvoie le travail au Lead** avec la preuve
   (`server/panier.test.js:18`). Le Lead réactive le test et le fait passer.
5. La gate repasse au vert. n8n clôt le cycle : tâche dans `done/` et commit
   `chore(remise-fidelite): cycle queue termine`.

Si le Lead triche une deuxième fois, le budget de retour (1) est épuisé. n8n
fait alors **HALT** et le workflow d'erreur rédige un rapport : raison, preuve,
commits conservés, travail non commité, tag de restauration. Rien n'est
défait.

Chaque étape se lit nœud par nœud dans l'historique des exécutions de n8n, et
chaque nœud porte une note qui dit quel concept de Pentacore il remplace.

## Lancer la démo

Prérequis : Docker, Node.js 22 ou plus, Git Bash (Windows) ou un shell POSIX.

```bash
bash scripts/installer.sh
```

```bash
bash scripts/reset-depot.sh --tache modele-depot-demo/taches/remise.md
```

```bash
cd depot-demo && git add .agents/queue/task_001.md && git commit -m "tache: remise fidelite"
```

Le commit déclenche n8n. Ouvrez ensuite http://localhost:5678 (la première
visite crée le compte propriétaire), puis le workflow **Pentacore — Cycle
(palier 1)**, onglet *Executions*.

La tâche de démo porte l'en-tête `demo: backend-lead#1=triche-skip,backend-lead#2=honnete`.
Le Lead y est un **agent scripté**, ce qui fait que le moment fort se produit à
chaque démo. Sans cet en-tête, c'est le vrai agent (Kilo CLI + OpenRouter) qui
travaille. Il faut pour cela renseigner `OPENROUTER_API_KEY` dans `.env` (voir
`.env.example`).

Recette automatique des quatre scénarios (triche puis correction, double
triche → HALT, tâche malformée → HALT, queue vide) :

```bash
bash scripts/recette.sh tout
```

## Architecture

```
Hook post-commit ──► Webhook n8n ──► Pentacore — Cycle ──► Execute Command ──► Kilo CLI / agent scripté
                                        │                                         (dans le dépôt /depot)
                                        ├─ nœuds Code : parse, contexte, skip_gate
                                        ├─ IF : décisions, budget de retour
                                        └─ Stop and Error ──► Pentacore — HALT (Error Workflow) ──► journaux/
```

- **n8n orchestre et contrôle ; l'agent de code reste un CLI** (architecture A,
  [correspondance](docs/02-correspondance.md) §1). La valeur de Pentacore est
  dans le contrôle mécanique autour des agents, et c'est ce que n8n porte ici.
- **Docker local** : n8n 2.44.6 avec Execute Command réactivé, le dépôt de démo
  monté sur `/depot`, les scripts du moteur sur `/moteur`.
- **Workflows générés** par [scripts/generer-workflows.mjs](scripts/generer-workflows.mjs)
  à partir des corps de nœuds Code de [moteur/noeuds/](moteur/noeuds/). Ces corps
  sont testés hors de n8n (`node --test tests/*.test.mjs`, 20 tests). Les JSON
  exportés sont dans [workflows/](workflows/).

| Nœud n8n | Concept Pentacore remplacé |
|---|---|
| Tâche transmise (webhook) | `python -m pentacore --drain` |
| Lire la queue + Parser la tâche + Tâche valide ? | `queue.scan`, `queue.parse`, `queue.validate` (pre-flight) |
| Arbre propre | `git_safety.has_changes` (pre-check arbre propre) |
| Poser le tag | `git_safety.place_restore_tag` |
| Préparer / Écrire le contexte | contexte préparé `.agents/runs/<run_id>/` |
| Backend Lead | `stage_runner.run_stage` (Kilo) |
| Commit des restes du Lead | commit des restes avant revue |
| Diff depuis le tag + skip_gate | `skip_gate.py` |
| Retour disponible ? + Préparer le retour | reprise ciblée bornée (`reprises.max_par_cycle = 1`) |
| Clore le cycle | `queue.move_to_done` + commit de clôture |
| Stop and Error + Pentacore — HALT | `_report_halt` (HALT conservateur) |

## Écarts assumés avec Pentacore

| Pentacore | Ici | Pourquoi |
|---|---|---|
| Kill après 45 min **sans sortie** | `timeout` de durée totale | n8n ne surveille pas le silence d'un nœud |
| `skip_gate` → constat pour le Global Reviewer, puis rejeu des gates, puis reprise ciblée | Retour direct au Lead, HALT à la deuxième triche | Palier 1 ; le vrai chemin arrive au palier 5 |
| Gate diff sur tout le dépôt | `.agents/` exclu du diff | Les contextes contiennent le texte des constats |

## Feuille de route

Seul le palier 1 est construit. Les suivants sont conçus
([conception](docs/superpowers/specs/2026-10-23-pentacore-n8n-v1-design.md))
mais pas encore réalisés.

| Palier | Contenu | État |
|---|---|---|
| 1 | Lead + `skip_gate` + retour borné + HALT | **fait, recette verte** |
| 2 | Reviewer, porte livrable, porte rapport, boucle UI | à faire |
| 3 | Les quatre gates (`critical_gate`, `env_gate`, `skip_gate`, `doc_gate`) | à faire |
| 4 | Chaîne d'escalade : modèles de repli, session fraîche, Doctor | à faire |
| 5 | Drain complet, Global Reviewer, rejeu des gates, reprise ciblée, constats | à faire |
| 6 | Seam Reviewer par tranches de 5 cycles | à faire |

## Essai avec le vrai LLM

Non exécuté à ce jour : aucune clé OpenRouter n'est configurée. Le chemin
existe (`moteur/lancer-agent.sh`, `kilo run --agent pentacore-lead --model
$PENTACORE_MODELE`) mais n'est pas encore éprouvé.

## Pour aller plus loin

- [01 — Carte de Pentacore](docs/01-carte-pentacore.md) : étapes, gates, boucles, état, citées au fichier et à la ligne.
- [02 — Correspondance Pentacore → n8n](docs/02-correspondance.md) : concept par concept, classé direct / contournement / à perdre, sourcé sur docs.n8n.io.
- [Déroulé de la démo](docs/demo-recruteur.md) : le script des 5 minutes et les questions probables.
- [Conception de la V1](docs/superpowers/specs/2026-10-23-pentacore-n8n-v1-design.md) et [plan du palier 1](docs/superpowers/plans/2026-10-23-palier-1-livraison-du-soir.md).
