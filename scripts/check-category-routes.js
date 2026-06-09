import assert from 'node:assert/strict';
import { categoryHref, categoryToRouteSegment } from './category-routes.js';

const cases = [
  ['Smart Contracts', 'Smart_Contracts'],
  ['Cold/Hot Keys', 'Cold%2FHot_Keys'],
  ['TAO & Alpha', 'TAO_%26_Alpha'],
  ['Consensus?Weights', 'Consensus%3FWeights'],
  ['Root#Subnet', 'Root%23Subnet'],
  ['EVM+Contracts', 'EVM%2BContracts'],
];

for (const [category, segment] of cases) {
  assert.equal(categoryToRouteSegment(category), segment);
  assert.equal(categoryHref(category), `/wiki/category/${segment}`);
}

for (const [category] of cases.slice(1)) {
  const segment = categoryHref(category).replace('/wiki/category/', '');
  assert.doesNotMatch(segment, /[/?#&+]/, `${category} includes an unencoded reserved character`);
}

console.log('Category route checks passed');
