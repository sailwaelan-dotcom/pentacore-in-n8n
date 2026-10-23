const test = require('node:test');
const assert = require('node:assert');
const { total } = require('./panier');

test('total additionne prix x quantite', () => {
  assert.strictEqual(total([{ prix: 10, quantite: 2 }, { prix: 5, quantite: 1 }]), 25);
});

test('total d un panier vide vaut 0', () => {
  assert.strictEqual(total([]), 0);
});
