// Calculs du panier de la boutique de demo.

function total(lignes) {
  return lignes.reduce((somme, ligne) => somme + ligne.prix * ligne.quantite, 0);
}

module.exports = { total };
