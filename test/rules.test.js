import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import Ajv from 'ajv/dist/2020.js';
import * as api from '../index.js';
import { rulesToSpec } from '../src/rules.js';
import { generate } from '../scripts/generate.mjs';

const { spytial, orientation, attribute, atomStyle, flag, size, composeSpec, relationalize, createRegistry } = api;
const manifestText = readFileSync(new URL('../vendor/core/spytial-language.json', import.meta.url), 'utf8');
const schemaText = readFileSync(new URL('../vendor/core/spytial-spec.schema.json', import.meta.url), 'utf8');
const manifest = JSON.parse(manifestText);
const validate = new Ajv({ strict: false }).compile(JSON.parse(schemaText));

test('static [spytial] works without a registry and is collected once per constructor', () => {
  class Tree {
    static [spytial] = [orientation('left', ['below', 'left']), attribute('value')];
    constructor(value, left) { this.value = value; if (left) this.left = left; }
  }
  const tree = new Tree(8, new Tree(3));
  const s = relationalize([tree, tree]);
  assert.equal(s.specs.length, 1);
  assert.deepEqual(s.specs[0], {
    constraints: [{ orientation: { selector: 'left', directions: ['below', 'left'] } }],
    directives: [{ attribute: { field: 'value' } }],
  });
  assert.equal(s.data.atoms.filter(a => a.type === 'Tree').length, 2);
  assert(!s.warnings.some(w => w.code === 'symbol-key'));
  assert(!s.data.relations.some(r => r.name.includes('spytial')));
});

test('selectors are preserved verbatim, with no implicit type scoping', () => {
  class A { static [spytial] = [orientation('left + ^next', ['below'])]; }
  const s = relationalize({ a: new A(), unrelated: { left: {} } });
  assert.equal(s.specs[0].constraints[0].orientation.selector, 'left + ^next');
});

test('specs on nested classes compose; registries and call-site rule arrays remain available', () => {
  class A { static [spytial] = [attribute('a')]; }
  class B { static [spytial] = [attribute('b')]; }
  const registry = createRegistry().type(A, { spec: [attribute('extra')] });
  const s = relationalize([new A(), new B()], { registry });
  const spec = JSON.parse(composeSpec(s, { presentation: 'graph', spec: [flag('hideDisconnectedBuiltIns')] }));
  assert.deepEqual(spec.directives, [
    { attribute: { field: 'a' } }, { attribute: { field: 'extra' } },
    { attribute: { field: 'b' } }, { flag: 'hideDisconnectedBuiltIns' },
  ]);
  assert.deepEqual(JSON.parse(composeSpec(s, { presentation: 'graph', inheritRules: false })), { constraints: [], directives: [] });
  assert.equal(composeSpec(s, { spec: 'directives: []' }), 'directives: []');
});

test('inheritance is explicit and can use a static spread without duplicate collection', () => {
  class Base { static [spytial] = [attribute('base')]; }
  class Child extends Base {}
  assert.equal(relationalize(new Child()).specs.length, 0);
  class Extended extends Base { static [spytial] = [...Base[spytial], attribute('own')]; }
  assert.equal(relationalize(new Extended()).specs[0].directives.length, 2);
});

test('class declarations are read again on capture; earlier snapshots are detached', () => {
  class A { static [spytial] = [attribute('a')]; }
  const capture = api.createRelationalizer(), a = new A();
  const before = capture(a);
  A[spytial] = [attribute('b')];
  assert.equal(before.specs[0].directives[0].attribute.field, 'a');
  assert.equal(capture(a).specs[0].directives[0].attribute.field, 'b');
});

test('invalid class specs fail clearly and static getters are not executed', () => {
  let calls = 0;
  class A { static get [spytial]() { calls++; return []; } }
  assert.throws(() => relationalize(new A()), /not a getter/);
  assert.equal(calls, 0);
  class B { static [spytial] = {}; }
  assert.throws(() => relationalize(new B()), /array/);
  class C { static [spytial] = [undefined]; }
  assert.throws(() => relationalize(new C()), /rule helpers/);
});

test('every upstream manifest item has a helper whose example validates against the pinned core schema', () => {
  for (const item of manifest.items) {
    assert.equal(typeof api[item.yamlKey], 'function', item.yamlKey);
    const example = item.valueShape === 'scalar' ? item.example[item.fields[0].name] : item.example;
    const rule = api[item.yamlKey](example);
    const spec = rulesToSpec([rule]);
    assert(validate(spec), `${item.yamlKey}: ${JSON.stringify(validate.errors)}`);
    assert.deepEqual(rule.entry, { [item.yamlKey]: example });
    assert.equal(rule.section, item.sections[0]);
  }
});

test('positional and object calls agree and preserve hold/source', () => {
  const options = { hold: 'never', source: { text: 'orientation("left", ["below"])', location: 'tree.js:4' } };
  assert.deepEqual(orientation('left', ['below'], options), orientation({ selector: 'left', directions: ['below'], ...options }));
  assert.deepEqual(attribute('value'), attribute({ field: 'value' }));
  assert(validate(rulesToSpec([orientation('left', ['below'], options)])));
});

test('helpers reject typos and unsupported shapes before core silently ignores them', () => {
  assert.throws(() => orientation('left', ['down']), /must be a nonempty list/);
  assert.throws(() => orientation('left', ['above', 'below']), /Conflicting/);
  assert.throws(() => orientation('left', ['directlyBelow', 'left']), /can only combine/);
  assert.throws(() => orientation('left', ['below'], { selctor: 'right' }), /Unknown/);
  assert.throws(() => orientation({ selector: 'left' }), /Missing/);
  assert.throws(() => orientation('left', ['below'], { selector: 'right' }), /positional/);
  assert.throws(() => orientation('left', ['below'], { hold: 'sometimes' }), /must be one of/);
  assert.throws(() => orientation('left', ['below'], { source: {} }), /Missing/);
  assert.throws(() => attribute(42), /must be a string/);
  assert.throws(() => flag('important'), /must be one of/);
  assert.throws(() => size(0, 50), /allowed range/);
  assert.throws(() => atomStyle({ iconStyle: { opacity: 2 } }), /allowed range/);
  assert.throws(() => atomStyle({ fill: 'red' }), /Unknown/);
});

test('rule descriptors are detached from caller options and deeply immutable', () => {
  const directions = ['below'], rule = orientation('left', directions);
  directions.push('above');
  assert.deepEqual(rule.entry.orientation.directions, ['below']);
  assert.throws(() => rule.entry.orientation.directions.push('right'), TypeError);
  assert(Object.isFrozen(rule));
});

test('code generation is reproducible and rejects incompatible inputs before writing', () => {
  assert.deepEqual(generate(manifestText, schemaText), generate(manifestText, schemaText));
  const schema = JSON.parse(schemaText); schema['x-spytial-core-version'] = '0.0.0';
  assert.throws(() => generate(manifestText, JSON.stringify(schema)), /versions do not match/);
  const changed = JSON.parse(manifestText); changed.items[0].fields[0].type = 'future-type';
  assert.throws(() => generate(JSON.stringify(changed), schemaText), /Unsupported manifest field type/);
  const next = JSON.parse(manifestText);
  next.items.push({ ...next.items.find(i => i.yamlKey === 'attribute'), id: 'futureRule', yamlKey: 'futureRule' });
  assert(generate(JSON.stringify(next), schemaText).get('src/generated/helpers.js').includes('export function futureRule'));
});

test('published entry point type-checks the agreed class syntax', () => {
  execFileSync(process.execPath, [new URL('../node_modules/typescript/bin/tsc', import.meta.url).pathname,
    '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    new URL('./types.ts', import.meta.url).pathname], { stdio: 'pipe' });
});
