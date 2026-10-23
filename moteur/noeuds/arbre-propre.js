// Noeud « Arbre propre ? » — remplace git_safety.has_changes(ignore=TASK_FILES_RELATIVE).
// Entrée : stdout de `git status --porcelain --untracked-files=all`.
const IGNORES = ['.agents/queue/', '.agents/runs/'];
const residu = ($input.first().json.stdout || '')
  .split('\n')
  .filter((ligne) => ligne.trim())
  .map((ligne) => ligne.slice(3).trim())
  .filter((chemin) => !IGNORES.some((d) => chemin.startsWith(d)));
return [{ json: { propre: residu.length === 0, residu } }];
