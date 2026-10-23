// Noeud « Lire l'échec » — l'Error Trigger reçoit le message du Stop and Error,
// au format "HALT|<slug>|<tag>|<raison>". Une erreur inattendue (noeud planté)
// n'a pas ce format : on garde son message tel quel.
const echec = $input.first().json;
const execution = echec.execution || {};
const message = execution.error?.message || 'erreur sans message';
const morceaux = message.split('|');
const formel = morceaux[0] === 'HALT' && morceaux.length >= 4;

const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;

return [{ json: {
  slug: formel ? morceaux[1] : 'inconnu',
  tag: formel ? morceaux[2] : '-',
  raison: formel ? morceaux.slice(3).join('|') : message,
  noeud: execution.lastNodeExecuted || '?',
  url: execution.url || `execution ${execution.id || '?'}`,
  stamp,
} }];
