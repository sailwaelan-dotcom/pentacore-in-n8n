# 02 — Correspondance Pentacore → n8n

Livrable de la phase 2. Il part de la carte validée
(carte du moteur, non publiée) et cherche, pour chaque
concept, son équivalent dans n8n.

## Conventions

- **[Sourcé]** : fait tiré de docs.n8n.io, avec renvoi à la liste des sources
  en fin de document (S1, S2…). Toutes les pages ont été consultées le
  **2026-10-23**. Pour Pentacore, la source est la carte (§ = section).
- **[Lecture]** : mon analyse.
- **[À vérifier]** : piste non confirmée par la documentation officielle.
- **Classement** :
  - **directe** : un nœud ou un réglage n8n fait la même chose ;
  - **contournement** : faisable en combinant plusieurs nœuds ou du code, avec
    un coût ;
  - **impossible / à perdre** : n8n ne le fait pas ; il faut renoncer ou
    sortir de n8n.
- **Version de référence** : n8n 2.x. La page de notes de version 2.x annonce
  2.44.6 comme dernière version stable (S20). Plusieurs comportements cités
  ont changé à la 2.0 (S5, S11, S13).

## 1. La question qui conditionne tout : qui écrit le code ?

[Sourcé] Dans Pentacore, un « agent » est un sous-processus `kilo run` qui
lit et modifie lui-même le dépôt, lance les tests et committe (carte §1.4).

[Sourcé] Dans n8n, le nœud AI Agent est un modèle de chat qui appelle des
outils : « You must connect at least one tool sub-node » (S1). Il n'a pas
d'accès natif au dépôt : il faut lui donner des outils. Le nœud Code, lui,
« can't access the file system or make HTTP requests » (S8).

Deux architectures possibles :

| | **A. n8n orchestre, l'agent reste un CLI** | **B. Le nœud AI Agent est l'agent de code** |
|---|---|---|
| Principe | Execute Command lance `kilo run` (ou `claude -p`) ; n8n gère l'ordre, les gates, les boucles, l'état | AI Agent + outils (lire/écrire un fichier, lancer une commande, Git) |
| Fidélité à Pentacore | Haute : mêmes agents, mêmes contrats | Faible : il faut réécrire un agent de code avec des outils n8n |
| Ce que la démo montre de n8n | Orchestration, gates, gestion d'erreur, validation humaine | En plus : nœud AI Agent, sortie structurée, validation humaine des outils |
| Contraintes | Execute Command absent de n8n Cloud et désactivé par défaut depuis 2.0 (S5) ; dans Docker, la commande tourne dans le conteneur (S5), donc Kilo/Claude, Git et le dépôt doivent y être installés ou montés | Mêmes nœuds Execute Command / fichiers pour les outils ; qualité de l'agent à construire |

[Lecture] **Ma recommandation : A pour la première tranche**, avec un seul
nœud AI Agent là où il apporte quelque chose sans réécrire un agent de code
(par exemple le Reviewer, qui lit un diff et rend un rapport structuré). La
valeur de Pentacore est dans le contrôle mécanique autour des agents, et c'est
exactement ce qu'une démo n8n doit montrer. B reste possible plus tard.
**Cette décision est la tienne** : elle change presque toutes les lignes
ci-dessous.

## 2. Table de correspondance

### 2.1 Déclenchement et enchaînement

| Concept Pentacore | Équivalent n8n | Classement | Ce que n8n fait moins bien |
|---|---|---|---|
| Lancement du drain (`--drain`, carte §0) | Déclencheur manuel, Schedule Trigger ou webhook ; `n8n execute --id` en CLI (S15) | directe | — |
| Mode surveillance : fichier tâche non vide et stable 10 s (carte §0, `watcher.py`) | Local File Trigger : déclenche sur fichier ajouté, modifié ou supprimé (S6) | contournement | Absent de n8n Cloud, désactivé par défaut depuis 2.0 (S6, S13). Pas de *debounce* de 10 s natif → nœud Wait + vérification. [Lecture] Mode historique : à laisser hors de la V1 |
| Photo de la queue, traitement en séquence (carte §1.2) | Lire la liste des tâches (Read Files from Disk ou Data table), puis Loop Over Items avec Batch Size 1 (S9) | directe | — |
| Ordre des stages d'un cycle (carte §1.3) | Enchaînement de nœuds ; un sous-workflow par stage via Execute Sub-workflow (S3) | directe | — |
| Sauter BACK ou UI si le bloc est absent | Nœud IF / Switch | directe | — |
| Global Reviewer après chaque cycle, Seam Reviewer en fin de drain | Nœuds après la boucle ; Seam par tranches de 5 = seconde boucle | directe | — |
| Message de lancement + contexte préparé JSON (carte §1.4) | Nœud Code (JS ou Python natif, S8) qui construit le JSON ; écriture sur disque si l'agent est un CLI (S10) | directe | — |

### 2.2 Agents

| Concept Pentacore | Équivalent n8n | Classement | Ce que n8n fait moins bien |
|---|---|---|---|
| Agent de code Kilo (Lead, Reviewer, Global, Seam, Doctor) | Option A : Execute Command (S5). Option B : AI Agent + outils (S1, S2) | A : contournement / B : contournement | A : pas sur Cloud, désactivé par défaut. B : l'agent de code est à construire |
| Agent qui lit un diff et rend un rapport (Reviewer) | AI Agent avec **Require Specific Output Format** + Structured Output Parser (S2) | directe | — |
| Message système du rôle (`ressources/agents/*.md`) | Option **System Message** de l'AI Agent (S2) | directe | — |
| Limite d'itérations de l'agent | **Max Iterations**, défaut 10 (S2) | directe | Pentacore n'en a pas : il ne coupe que sur silence |
| Chaîne de modèles de repli (3 replis pour les leads, carte §3.1) | **Enable Fallback Model** : un modèle de secours, documenté sur le nœud AI Agent Tool (S4) | contournement | Un seul secours, pas une chaîne. Présence sur le nœud AI Agent principal non confirmée par la doc officielle (voir [À vérifier]). Chaîne complète → boucle sur une liste de modèles |
| Reprise de la session après bascule (`kilo run -c`) | Aucun équivalent natif pour un CLI ; pour l'AI Agent, un sous-nœud de mémoire [À vérifier] | impossible / à perdre (option A) | Une bascule repart de zéro, sauf si le CLI le permet lui-même |
| Sonde du modèle avant lancement (`kilo roll-call`) | HTTP Request ou petit appel de modèle avant le stage | contournement | — |
| Effort de raisonnement par modèle (`--variant`) | Paramètre du CLI (A) ou options du nœud de modèle (B) [À vérifier] | contournement | — |

### 2.3 Gates déterministes

| Concept Pentacore | Équivalent n8n | Classement | Ce que n8n fait moins bien |
|---|---|---|---|
| Gate = contrôle sans modèle, verdict ok / halt / cleanup (carte §2.1) | Sous-workflow « gate » : récupère les données, nœud Code qui calcule le verdict, IF qui aiguille | directe pour la logique | — |
| Lecture du diff Git depuis le tag (les 4 gates) | Execute Command `git diff …` (S5). Le nœud Git n'a pas d'opération *diff* (S7) | contournement | Dépend d'Execute Command, donc pas de Cloud |
| `skip_gate`, `env_gate` : regex sur lignes ajoutées | Nœud Code sur la sortie du diff | directe | — |
| `doc_gate` : A/D/R sans mise à jour de la carte | `git diff --name-status` + nœud Code | contournement | Idem diff |
| `critical_gate` : lancer la preuve E2E et lire son code de sortie | Execute Command (S5) | contournement | Idem |
| Porte livrable : `(HEAD, fichiers modifiés)` a changé (carte §2.2) | Nœud Git *Status* et *Log* (S7) avant/après, comparés dans un Code | directe | — |
| Porte rapport : JSON présent, identité exacte, statut connu (carte §2.2) | Read File (S10) + nœud Code de validation ; en option B, sortie structurée (S2) | directe | — |
| Pre-flight du lot : toutes les tâches valides sinon refus en bloc | Nœud Code sur la liste, IF, Stop and Error (S12) | directe | — |
| Arbre propre avant le cycle | Nœud Git *Status* (S7) + IF | directe | — |
| Empreinte SHA-256 d'une tâche publiée | Nœud Code (module `crypto` disponible même sur Cloud, S8) | directe | — |
| Checks récurrents et preuves réutilisables (carte §2.2) | Execute Command + Data table des preuves | contournement | Empreinte d'état à recoder |

### 2.4 Échecs, boucles et limites

| Concept Pentacore | Équivalent n8n | Classement | Ce que n8n fait moins bien |
|---|---|---|---|
| HALT : arrêt du drain, rien n'est défait, rapport à l'humain (carte §3.3) | **Stop and Error** fait échouer l'exécution (S12) ; l'**Error Workflow** reçoit l'ID, l'URL, le message d'erreur et le dernier nœud (S12) | directe | Le rapport de HALT (commits conservés, travail non commité, tag) est à construire dans l'Error Workflow |
| Branchement selon la cause de l'échec (gel, quota, défaut runner, bug) | Réglage **On Error → Continue (using error output)** (S11) puis Switch sur la cause | directe | Classer la cause reste du code (motifs dans la sortie) |
| Relance sur erreur transitoire | **Retry On Fail** : Max Tries 2 à 5, Wait Between Tries 0 à 5000 ms (S11, S19) | directe | Plafond de 5 essais et 5 s d'attente |
| Doctor : 1 par stage, 3 par run, verdict fixed/quota/unrecoverable | Branche d'erreur → sous-workflow Doctor → Switch sur le verdict ; compteurs dans une variable ou une Data table | contournement | Les compteurs de budget sont à tenir à la main |
| Boucle « retour en arrière » (reprise ciblée Lead → Reviewer, carte §3.4) | Sortie reliée à un nœud précédent + IF d'arrêt (S9) | directe | Un IF mal écrit donne une boucle infinie ; budget à compter soi-même |
| Watchdog : kill après 45 min **sans sortie**, aucun plafond de durée (carte §3.1) | **Timeout Workflow** : durée totale d'exécution (S14) ; `EXECUTIONS_TIMEOUT` (S16), soft timeout appliqué après le nœud en cours (S16) | impossible / à perdre | n8n coupe sur la **durée**, pas sur le **silence**. Le soft timeout attend la fin du nœud en cours : un `kilo run` bloqué n'est pas interrompu. Contournement : `timeout` dans la commande shell elle-même |
| Fast-fail quota : kill après 3 erreurs quota dans le flux | — | impossible / à perdre | Execute Command rend la sortie à la fin [À vérifier] : pas de lecture en flux |
| Heartbeat toutes les 30 s | Liste des exécutions en cours de n8n | contournement | Pas de signe de vie *pendant* un nœud long |
| Garantie de terminaison (tous les budgets, carte §3.6) | Max Iterations, Retry On Fail, timeouts, compteurs explicites | contournement | Pas de budget global : chaque boucle doit porter le sien |

### 2.5 État et traces

| Concept Pentacore | Équivalent n8n | Classement | Ce que n8n fait moins bien |
|---|---|---|---|
| Fichiers du dépôt (`.agents/queue`, `runs/`, `REVIEWED.md`…) | Restent dans le dépôt Git ; lus et écrits par Read/Write Files (S10) et Git (S7) | contournement | Depuis 2.0, l'accès fichiers est limité à `~/.n8n-files` par défaut (S10) ; dans Docker, chemins du conteneur, donc volume à monter (S10) |
| Registre des constats, état du drain, registre des preuves | **Data tables** : stockage tabulaire intégré, 200 Mio par défaut pour l'instance (S17) | directe | Le nœud Code ne lit pas les Data tables directement (S17) |
| Petit état entre exécutions | Static data via `$getWorkflowStaticData` (S18) | contournement | Expérimental, production uniquement, JS seulement (S18). [Lecture] Préférer les Data tables |
| Verrou : un seul drain par dépôt | `N8N_CONCURRENCY_PRODUCTION_LIMIT` est global à l'instance ; pas de réglage par workflow trouvé (S21) | contournement | Verrou à coder (ligne de Data table) |
| Logs horodatés par cycle | Historique des exécutions, données par nœud (S14 : Save execution progress, Save failed/successful executions) | directe | Mieux que Pentacore pour l'inspection visuelle ; moins bon pour `grep` |
| État du drain lisible par un superviseur externe | Error Workflow (S12) ; API n8n [À vérifier] | contournement | — |
| Notification Windows (toast) | Nœuds Slack, Telegram, Gmail… | directe | — |
| Versionner les workflows | `n8n export:workflow --separate` (« useful for versioning ») et `import:workflow` (S15) | directe | Un import écrase les workflows de même ID (S15) |
| Secrets | Credentials n8n ; `export:credentials --decrypted` écrit tout en clair (S15) | directe | Ne jamais versionner un export déchiffré |

### 2.6 Conception et validation humaine

| Concept Pentacore | Équivalent n8n | Classement | Ce que n8n fait moins bien |
|---|---|---|---|
| Validation humaine de la spec puis du plan (révision + empreinte + auteur) | **Wait → On Form Submitted** ou **On Webhook Call**, URL unique `$execution.resumeUrl`, option Limit Wait Time ; l'exécution en attente est déchargée en base (S13) | directe | Contrôle d'empreinte et immutabilité des révisions à coder |
| Concepteur : propose une spec JSON au contrat strict | AI Agent + Structured Output Parser (S2), puis nœud Code de validation | directe | — |
| Validation humaine d'un geste d'agent | Human review sur les outils de l'AI Agent : la tâche attend une approbation (S22) | directe (option B) | [À vérifier] statut *Preview* signalé par le changelog, pas par la page |
| Publication ordonnée (tri topologique) | Nœud Code | directe | — |

## 3. Ce que n8n fait moins bien que Pentacore

[Lecture] Franchement, et par ordre de gravité pour cette mission :

1. **La surveillance par silence n'existe pas.** C'est le mécanisme le plus
   travaillé de Pentacore (carte §3.1). n8n ne connaît que la durée totale,
   et son soft timeout attend la fin du nœud en cours (S16). Il faudra
   déléguer le kill à la commande shell (`timeout`) et accepter de perdre la
   distinction « bloqué » / « lent mais vivant ».
2. **n8n Cloud est presque exclu.** Execute Command et Local File Trigger y
   sont absents (S5, S6), le disque est éphémère et limité à `/home/node/`
   (S10), le nœud Code ne lit pas le disque (S8). Or Pentacore travaille sur
   un dépôt Git local.
3. **Les replis de modèle sont plus pauvres** : un seul modèle de secours
   (S4) contre une chaîne avec sonde, et pas de reprise de session.
4. **Les budgets ne sont pas une notion de n8n.** Pentacore borne chaque
   boucle (carte §3.6) ; dans n8n, chaque compteur est un nœud de plus à
   écrire et à tester.
5. **Le code de Pentacore est testé** (439 tests annoncés, carte §[À
   vérifier] 7). Un workflow n8n se teste moins bien en isolation. [À
   vérifier] le module Evaluations de n8n couvre-t-il ce besoin ?

Ce que n8n fait **mieux** : visualiser une exécution nœud par nœud,
reprendre une validation humaine par formulaire, notifier sur n'importe quel
canal, et rendre le flux lisible par quelqu'un qui ne lit pas de Python.

## 4. Questions pour Souhail

1. **Hébergement** : n8n en local avec Docker, ou n8n Cloud ?
   [Lecture] Recommandation : **Docker local**. Le point 2 de la section 3
   rend Cloud incompatible avec l'option A. Il faudra une image qui contient
   Git et le CLI d'agent, et monter le dépôt cible en volume (S5, S10).
2. **Fournisseur de LLM et clé** : lequel ? La clé sera stockée dans les
   credentials n8n, jamais dans un JSON versionné.
3. **Périmètre de la V1** : je propose 1 agent (Backend Lead ou Reviewer) +
   1 gate déterministe (`skip_gate`, la plus simple, universelle) + 1 boucle
   d'échec (retour au Lead si la gate échoue, budget 1, puis HALT), sur un
   petit dépôt jouet et non sur Orthopy.
4. **Architecture A ou B** (section 1).
5. **Candidature n8n** : le projet sert-il de démonstration ? Cela change la
   finition et ce qu'il faut montrer.

## Décisions de Souhail (2026-10-23)

| Question | Décision |
|---|---|
| Hébergement | **n8n en local avec Docker** |
| Architecture | **A** : n8n orchestre et contrôle, l'agent de code reste un CLI lancé par Execute Command |
| Fournisseur de LLM | **OpenRouter** |
| Candidature n8n | **Oui** : le projet sert de démonstration, la finition doit en tenir compte |
| Périmètre de la V1 | Proposition de la section 4 (point 3), à arrêter pendant la conception (phase 3) |

Conséquences à traiter en phase 3 :

- Activer Execute Command (`NODES_EXCLUDE`, S13) et ouvrir l'accès aux
  fichiers du dépôt monté (`N8N_RESTRICT_FILE_ACCESS_TO`, S10).
- [À vérifier] Le CLI d'agent retenu doit accepter OpenRouter comme
  fournisseur, et n8n doit offrir un nœud de modèle OpenRouter pour le
  Reviewer.

## [À vérifier]

1. **Enable Fallback Model sur le nœud AI Agent principal.** La doc officielle
   le documente sur le nœud AI Agent Tool (S4), pas sur la page de l'AI Agent
   (S1, S2). Des sources tierces l'attribuent à l'AI Agent principal ; une
   demande communautaire indique qu'un seul repli est possible. À constater
   dans l'éditeur.
2. **Sortie d'Execute Command en flux.** Je n'ai pas trouvé si le nœud expose
   la sortie au fil de l'eau ou seulement à la fin (S5).
3. **Mémoire de l'AI Agent comme substitut à la reprise de session.**
4. **Réglage d'effort de raisonnement** sur les nœuds de modèle de chat.
5. **Statut Preview** du human review sur les outils.
6. **API n8n** pour qu'un superviseur externe lise l'état des exécutions.
7. **Evaluations** comme filet de test des workflows.

## Sources (consultées le 2026-10-23)

- S1 — AI Agent node : https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/
- S2 — Tools Agent (options) : https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/tools-agent/
- S3 — Sub-workflows : https://docs.n8n.io/flow-logic/subworkflows/
- S4 — AI Agent Tool node : https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolaiagent/
- S5 — Execute Command : https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executecommand/
- S6 — Local File Trigger : https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.localfiletrigger/
- S7 — Git node : https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.git/
- S8 — Code node : https://docs.n8n.io/code/code-node/
- S9 — Looping : https://docs.n8n.io/flow-logic/looping/
- S10 — Read/Write Files from Disk : https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.readwritefile/
- S11 — Node settings (Retry On Fail, On Error) : https://docs.n8n.io/workflows/components/nodes/
- S12 — Error handling : https://docs.n8n.io/flow-logic/error-handling/
- S13 — Wait node : https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait/ ; changements 2.0 : https://docs.n8n.io/2-0-breaking-changes/
- S14 — Workflow settings : https://docs.n8n.io/workflows/settings/
- S15 — CLI commands : https://docs.n8n.io/hosting/cli-commands/
- S16 — Execution timeout : https://docs.n8n.io/hosting/configuration/configuration-examples/execution-timeout/
- S17 — Data tables : https://docs.n8n.io/data/data-tables/
- S18 — Workflow static data : https://docs.n8n.io/code/cookbook/builtin/get-workflow-static-data/
- S19 — Bornes de Retry On Fail (référence des outils du serveur MCP n8n) : https://docs.n8n.io/advanced-ai/mcp/mcp_tools_reference/ ; réglage décrit sur https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/common-issues
- S20 — Notes de version 2.x : https://docs.n8n.io/changelog/release-notes-2.x
- S21 — Concurrency control : https://docs.n8n.io/hosting/scaling/concurrency-control/
- S22 — Human-in-the-loop for AI tool calls : https://docs.n8n.io/advanced-ai/human-in-the-loop-tools/
- S23 — Serveur MCP d'instance n8n : https://docs.n8n.io/advanced-ai/mcp/accessing-n8n-mcp-server/

Sources non officielles consultées pour le point [À vérifier] 1, non utilisées
comme preuve : https://hackceleration.com/resources/integrations/n8n/ai-agent ,
https://community.n8n.io/t/ai-agent-add-prioritized-fallback-list-for-llm-providers/296810
