# Déroulé de la démo

Pour montrer Pentacore dans n8n en 5 minutes, en direct ou en partage d'écran.

## Avant la démo (5 minutes, une fois)

1. Docker Desktop est lancé.
2. `bash scripts/installer.sh` : n8n tourne sur http://localhost:5678, les deux
   workflows sont importés et publiés.
3. Ouvrir http://localhost:5678 et se connecter.
4. `bash scripts/recette.sh tout` : les quatre scénarios doivent finir sur
   `== 0 echec(s)`. Cela vérifie que tout marche et remplit l'historique des
   exécutions avec un cycle réussi et des HALT à montrer.
5. Préparer la tâche du direct, **sans la committer** :
   `bash scripts/reset-depot.sh --tache modele-depot-demo/taches/remise.md`
6. Ouvrir trois fenêtres côte à côte :
   - n8n, sur le workflow **Pentacore — Cycle (palier 1)** ;
   - un terminal dans `depot-demo/` ;
   - `modele-depot-demo/taches/remise.md`.

## Le déroulé (5 minutes)

### 1. Le problème (30 s)

> « Un agent de code dit souvent “c'est fait, tests verts”, et c'est parfois faux.
> J'ai construit Pentacore, un orchestrateur qui enchaîne des agents sur un vrai
> dépôt Git et vérifie mécaniquement ce qu'ils livrent, au lieu de les croire. Ici,
> je le reconstruis dans n8n. »

### 2. Le canevas (1 min)

Parcourir le workflow de gauche à droite. Chaque nœud porte une note qui dit
quel mécanisme de Pentacore il remplace. S'arrêter sur trois zones :

- **Pre-flight** (Tâche valide ?, Arbre propre) : on refuse de démarrer sur une
  tâche malformée ou un dépôt sale.
- **Backend Lead** : l'agent est un CLI lancé par Execute Command. n8n
  orchestre et contrôle, il ne remplace pas l'agent.
- **skip_gate → Gate verte ? → Retour disponible ?** : une gate déterministe,
  sans modèle, et une boucle de retour **bornée** (1 retour, puis HALT).

### 3. Le moment fort, en direct (2 min)

Montrer l'en-tête de la tâche : `demo: backend-lead#1=triche-skip,…`.
Expliquer qu'en mode démo, le Lead est scripté pour tricher à coup sûr à la
première passe.

Dans le terminal `depot-demo/` :

```bash
git add .agents/queue/task_001.md && git commit -m "tache: remise fidelite"
```

Le terminal affiche `[pentacore] tache transmise a n8n`. Dans n8n, onglet
**Executions**, ouvrir l'exécution qui vient d'apparaître et suivre le chemin
vert :

1. **Backend Lead (1re passe)** : le rapport de l'agent dit « tous les tests
   sont verts ».
2. **skip_gate** : sortie `ok: false` avec le constat
   `server/panier.test.js:18 test.skip(...)`. **C'est le moment fort** : la gate
   a lu le diff, pas le rapport.
3. **Préparer le retour** → retour à **Préparer le contexte** : le Lead
   reçoit la preuve (fichier:ligne) et une tentative 2.
4. **Backend Lead (2e passe)** puis **skip_gate** : `ok: true`.
5. **Clore le cycle** : la tâche passe dans `done/`, avec le commit de clôture.

Dans le terminal, montrer la trace laissée dans Git :

```bash
git log --oneline
```

### 4. L'arrêt propre (30 s)

Dans **Executions**, ouvrir une exécution en échec issue de la recette
(double triche). Puis ouvrir le rapport de HALT dans `journaux/` : raison,
preuve, commits conservés, tag de restauration. **Rien n'est défait** : c'est
l'humain qui tranche.

> Si `recette.sh` a été lancé avant, `journaux/` a été vidé au scénario suivant.
> Pour avoir un rapport à montrer, lancer
> `bash scripts/recette.sh triche-deux-fois` juste avant la démo.

### 5. La suite et l'honnêteté (1 min)

- **Ce qui est fait** : le palier 1 sur 6, avec une recette automatique et des
  nœuds Code testés hors de n8n.
- **Ce qui vient** : Reviewer et porte rapport, les quatre gates, la chaîne
  d'escalade, Global Reviewer avec rejeu des gates, Seam Reviewer
  (`README.md`, feuille de route).
- **Ce que n8n fait moins bien** que Pentacore, documenté dans
  `docs/02-correspondance.md` §3 :
  - pas de surveillance par silence ;
  - n8n Cloud exclu, faute d'Execute Command ;
  - un seul modèle de repli natif.

## Questions probables

| Question | Réponse courte |
|---|---|
| Pourquoi ne pas faire coder l'agent par le nœud AI Agent ? | Choix d'architecture documenté (correspondance §1) : la valeur est dans le contrôle autour des agents, et un agent de code CLI éprouvé vaut mieux qu'un agent réécrit avec des outils. Le nœud AI Agent est prévu pour le Reviewer. |
| Pourquoi pas sur n8n Cloud ? | Execute Command n'y existe pas, et il faut un dépôt Git et un disque persistant. C'est sourcé sur docs.n8n.io. |
| L'agent scripté, ce n'est pas tricher ? | C'est le contraire : il rend la démo reproductible, et le même chemin sert aux tests de recette. Sans l'en-tête `demo:`, c'est le vrai agent (Kilo + OpenRouter). |
| Comment c'est testé ? | 20 tests unitaires des nœuds Code (`node --test tests/*.test.mjs`) et 4 scénarios de bout en bout (`scripts/recette.sh tout`). |
| Pourquoi générer les JSON au lieu de les éditer dans l'UI ? | La logique des nœuds Code vit dans des fichiers testés ; le générateur garantit que ce qui tourne est ce qui est testé. Les JSON exportés restent versionnés. |

## Ce que je joins à la candidature

- Le lien vers le dépôt (README en page d'accueil).
- Deux captures : le canevas complet, et l'exécution réussie ouverte sur le
  nœud **skip_gate** qui montre le constat.
- Trois phrases de contexte, par exemple :

> J'ai conçu Pentacore, un orchestrateur Python qui enchaîne des agents de code
> et vérifie mécaniquement leur travail (gates déterministes, boucles bornées,
> arrêt conservateur). Pour cette candidature, j'en ai reconstruit le cœur dans
> n8n : un commit de tâche déclenche le workflow, une gate sans modèle attrape un
> agent qui a désactivé un test pour paraître vert, et n8n lui renvoie le travail
> avec la preuve. Le dépôt documente aussi ce que n8n fait moins bien que mon
> système, sources à l'appui.
