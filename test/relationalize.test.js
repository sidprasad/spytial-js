import test from 'node:test';
import assert from 'node:assert/strict';
import { relationalize, createRelationalizer, createRegistry, selectorName, composeSpec, diagram } from '../src/index.js';

const rel = (snapshot, name) => snapshot.data.relations.find(r => r.name === name)?.tuples ?? [];
const atomsOf = (snapshot, type) => snapshot.data.atoms.filter(a => a.type === type);

test('sharing and cycles retain reference identity, distinct equal objects do not collapse', () => {
  const child = { value: 7 }, root = { a: child, b: child, other: { value: 7 } };
  child.parent = root;
  const s = relationalize(root);
  assert.equal(atomsOf(s, 'JSObject').length, 3);
  assert.equal(rel(s, 'a')[0].atoms[1], rel(s, 'b')[0].atoms[1]);
  assert.notEqual(rel(s, 'a')[0].atoms[1], rel(s, 'other')[0].atoms[1]);
  assert.equal(rel(s, 'parent')[0].atoms[1], s.rootId);
  assert.equal(atomsOf(s, 'JSNumber').length, 1);
});

test('IDs remain stable across repeated captures and additions', () => {
  const capture = createRelationalizer(), root = { child: {} };
  const before = capture(root);
  root.newField = {};
  const after = capture(root);
  assert.equal(before.rootId, after.rootId);
  assert.deepEqual(rel(before, 'child'), rel(after, 'child'));
  assert.equal(before.data.atoms.length, 2);
});

test('explicit identities support rebuilt snapshots and reject accidental aliases', () => {
  const capture = createRelationalizer({ identity: o => o.id });
  assert.equal(capture({ id: 1 }).rootId, capture({ id: 1 }).rootId);
  assert.notEqual(capture({ id: 1 }).rootId, capture({ id: '1' }).rootId);
  assert.throws(() => capture([{ id: 1 }, { id: 1 }]), /Duplicate identity/);
  assert.throws(() => createRelationalizer({ identity: () => ({}) })({}), /identity must return/);
});

test('scalar types distinguish strings, numbers, bigint, null, undefined, NaN, -0 and symbols', () => {
  const a = Symbol('x'), b = Symbol('x');
  const s = relationalize({ a: '1', b: 1, c: 1n, d: null, e: undefined, f: NaN, g: NaN, h: -0, i: 0, j: Infinity, k: a, l: a, m: b });
  assert.equal(atomsOf(s, 'JSSymbol').length, 2);
  assert.equal(atomsOf(s, 'JSNumber').length, 5);
  assert.equal(atomsOf(s, 'JSNull').length, 1);
  assert.equal(atomsOf(s, 'JSUndefined').length, 1);
  assert.doesNotThrow(() => JSON.stringify(s.data));
  assert(s.data.types.filter(t => t.isBuiltin).every(t => t.types.includes('JSScalar')));
});

test('root primitives remain visible under default presentation', () => {
  for (const value of [null, undefined, 1, 'hello', false]) {
    const s = relationalize(value);
    assert.equal(s.data.atoms.length, 1);
    assert.equal(s.defaultSpec.directives.length, 0);
  }
});

test('sparse arrays preserve length, positions, duplicate occurrences, and undefined', () => {
  const s = relationalize([7, 7, , undefined]);
  assert.equal(atomsOf(s, 'JSSlot').length, 3);
  assert.equal(rel(s, 'item').length, 3);
  assert.equal(rel(s, 'next').length, 2);
  assert.deepEqual(rel(s, 'index').map(t => s.data.atoms.find(a => a.id === t.atoms[1]).label), ['0', '1', '3']);
  assert.equal(rel(s, 'value')[0].atoms[1], rel(s, 'value')[1].atoms[1]);
  assert.equal(s.data.atoms.find(a => a.id === rel(s, 'length')[0].atoms[1]).label, '4');
});

test('map entries preserve object keys, key/value pairing, and sharing', () => {
  const key = {}, value = {}, map = new Map([[key, value], ['alias', value]]);
  key.map = map;
  const s = relationalize(map);
  assert.equal(atomsOf(s, 'JSEntry').length, 2);
  assert.equal(rel(s, 'value')[0].atoms[1], rel(s, 'value')[1].atoms[1]);
  assert.equal(rel(s, 'map')[0].atoms[1], s.rootId);
  assert.notEqual(rel(s, 'key')[0].atoms[1], rel(s, 'key')[1].atoms[1]);
});

test('dictionary interpretation is explicit and preserves hostile keys as data', () => {
  const dict = Object.create(null);
  dict['__proto__'] = 1; dict['a b'] = 2;
  const registry = createRegistry().value(dict, { kind: 'dictionary' });
  const s = relationalize(dict, { registry });
  assert.equal(atomsOf(s, 'JSEntry').length, 2);
  assert.equal(rel(s, 'key').length, 2);
  assert.equal(rel(s, 'entry').length, 2);
  assert.deepEqual(Object.keys(dict), ['__proto__', 'a b']);
});

test('sets have membership but no invented next relation', () => {
  const s = relationalize(new Set([1, 2]));
  assert.equal(rel(s, 'member').length, 2);
  assert.equal(rel(s, 'next').length, 0);
});

test('getters, inherited properties and toJSON are never implicitly executed', () => {
  let calls = 0;
  const proto = { inherited: 42 };
  const root = Object.assign(Object.create(proto), { own: 1, toJSON() { calls++; throw Error('no'); } });
  Object.defineProperty(root, 'getter', { enumerable: true, get() { calls++; throw Error('no'); } });
  root[Symbol('secret')] = 3;
  const s = relationalize(root);
  assert.equal(calls, 0);
  assert.equal(rel(s, 'inherited').length, 0);
  assert.equal(rel(s, 'getter').length, 0);
  assert(s.warnings.some(w => w.code === 'accessor'));
  assert(s.warnings.some(w => w.code === 'symbol-key'));
  assert(s.warnings.some(w => w.code === 'opaque'));
});

test('dates retain object identity and expose an ISO value', () => {
  const s = relationalize([new Date(0), new Date(0), new Date(NaN)]);
  assert.equal(atomsOf(s, 'JSDate').length, 3);
  assert.equal(rel(s, 'iso').length, 3);
  assert.equal(rel(s, 'iso')[0].atoms[1], rel(s, 'iso')[1].atoms[1]);
});

test('registry adapters expose private/computed data without modifying frozen values', () => {
  class Tree { #value; constructor(v) { this.#value = v; } get value() { return this.#value; } }
  const tree = Object.freeze(new Tree(9));
  const spec = { directives: [{ attribute: { field: 'value' } }] };
  const registry = createRegistry().type(Tree, { type: 'Tree', fields: t => ({ value: t.value, height: 1 }), label: () => 'root', spec });
  spec.directives.length = 0;
  const s = relationalize([tree, tree], { registry });
  assert.equal(s.specs.length, 1);
  assert.equal(s.specs[0].directives.length, 1);
  assert.equal(atomsOf(s, 'Tree')[0].label, 'root');
  assert.equal(rel(s, 'height').length, 1);
  assert.deepEqual(Object.keys(tree), []);
});

test('registries are isolated and value descriptors override constructor descriptors', () => {
  class Node {}
  const value = new Node();
  const a = createRegistry().type(Node, { type: 'A' }).value(value, { type: 'B' });
  const b = createRegistry().type(Node, { type: 'C' });
  assert.equal(relationalize(value, { registry: a }).data.atoms[0].type, 'B');
  assert.equal(relationalize(value, { registry: b }).data.atoms[0].type, 'C');
});

test('rule fragments compose in a documented order; YAML and inheritance are escape hatches', () => {
  const registry = createRegistry().type(Object, { spec: { constraints: [{ orientation: { selector: 'next', directions: ['left'] } }] } });
  const s = relationalize({ value: 7 }, { registry });
  const spec = JSON.parse(composeSpec(s, { spec: { directives: [{ flag: 'hideDisconnected' }] } }));
  assert.equal(spec.constraints.length, 1);
  assert.equal(spec.directives.at(-1).flag, 'hideDisconnected');
  assert.equal(composeSpec(s, { spec: 'directives: []' }), 'directives: []');
  assert.deepEqual(JSON.parse(composeSpec(s, { inheritRules: false, presentation: 'graph' })), { constraints: [], directives: [] });
});

test('selector encoding is injective for ordinary, reserved, punctuation and unicode names', () => {
  const names = ['a', 'a b', 'a_b', 'js_61', '', 'empty', 'univ', 'α', '🙂', 'x.y', 'constructor', '__proto__', 'set', 'open', 'JSScalar'];
  assert.equal(new Set(names.map(selectorName)).size, names.length);
  assert.equal(selectorName('left'), 'left');
  assert.notEqual(selectorName('set'), 'set');
  assert.notEqual(selectorName('JSScalar'), 'JSScalar');
  assert(names.map(selectorName).every(n => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n)));
  const s = relationalize({ 'a b': 1, 'a_b': 2, univ: 3 });
  assert.equal(rel(s, selectorName('a b')).length, 1);
});

test('unregistered constructors with the same name get different selector types', () => {
  const A = class Node {}, B = class Node {};
  const s = relationalize([new A(), new B()]);
  const values = rel(s, 'value').map(t => s.data.atoms.find(a => a.id === t.atoms[1]).type);
  assert.notEqual(values[0], values[1]);
});

test('bounded iterative traversal fails clearly rather than silently dropping data', () => {
  assert.throws(() => relationalize({ a: {} }, { maxAtoms: 1 }), /maxAtoms/);
  assert.throws(() => relationalize({ a: 1, b: 2 }, { maxTuples: 1 }), /maxTuples/);
  let root = {}; for (let i = 0; i < 6000; i++) root = { next: root };
  assert.equal(relationalize(root, { maxAtoms: 7000, maxTuples: 7000 }).data.atoms.length, 6001);
});

test('canonical payload has valid endpoints and positional types', () => {
  const s = relationalize({ list: [1, null], map: new Map([['a', {}]]) });
  const ids = new Set(s.data.atoms.map(a => a.id));
  assert.equal(ids.size, s.data.atoms.length);
  for (const relation of s.data.relations) for (const tuple of relation.tuples) {
    assert.equal(tuple.types.length, tuple.atoms.length);
    assert(tuple.atoms.every(id => ids.has(id)));
  }
});

test('data-only imports do not require a DOM', async () => {
  assert.equal(typeof document, 'undefined');
  await assert.rejects(diagram('#x', {}), /browser document/);
});
