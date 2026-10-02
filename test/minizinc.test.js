import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelationalizer } from '../index.js';
import { Coloring, REGIONS, BORDERS, registry, modelData, validateSolution, applySolution } from '../examples/minizinc/data.js';

const solution = [1, 2, 3, 1, 2, 1, 1];

test('MiniZinc input indices and JS references describe exactly the same borders', () => {
  const graph = new Coloring(), data = modelData(3);
  assert.equal(data.n_regions, REGIONS.length);
  assert.equal(data.n_borders, BORDERS.length);
  const recovered = REGIONS.flatMap((name, i) => graph[name].adjacent.map(region => [i + 1, REGIONS.findIndex(key => graph[key] === region) + 1]));
  assert.deepEqual(recovered, data.from_region.map((a, i) => [a, data.to_region[i]]));
  assert.equal(graph.T.adjacent.length, 0);
});

test('solver assignments reject domain, topology, and symmetry violations before mutation', () => {
  assert.deepEqual(validateSolution(solution, 3), solution);
  for (const invalid of [[1], [1, 1, 3, 1, 2, 1, 1], [1, 2, 4, 1, 2, 1, 1], [1, 2, 3, 1, 2, 1, 2]]) {
    const graph = new Coloring();
    assert.throws(() => applySolution(graph, invalid, 3), /invalid coloring/);
    assert.equal(graph.WA.color, 'Unassigned');
  }
  assert.throws(() => modelData(5), RangeError);
});

test('browsing solutions preserves region identities and replaces color rules without implicit scoping', () => {
  const graph = new Coloring(), capture = createRelationalizer({ registry });
  const before = capture(graph);
  const firstRules = applySolution(graph, solution, 3);
  const first = capture(graph);
  const ids = snapshot => snapshot.data.atoms.filter(atom => atom.type === 'Region').map(atom => atom.id);
  assert.deepEqual(ids(first), ids(before));
  assert.equal(ids(first).length, 7);
  assert.equal(first.specs.length, 2);
  assert(firstRules.some(rule => rule.entry.atomStyle.selector === 'Coloring.WA + Coloring.Q + Coloring.V + Coloring.T'));
  applySolution(graph, [1, 3, 2, 1, 3, 1, 1], 3);
  assert.equal(graph.NT.color, 'Gold');
  assert.deepEqual(ids(capture(graph)), ids(first));
  assert(first.data.atoms.some(atom => atom.type === 'JSSlot'), 'projection must preserve captured arrays');
});
